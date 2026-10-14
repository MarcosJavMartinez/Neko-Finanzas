// Pasar los datos a otro dispositivo con un código, sin cuenta.
//
// Los datos se cifran aquí, en el dispositivo, antes de salir. El servidor
// (nekotools.site/transfer-finanzas.php) guarda solo un bloque ilegible por
// 15 minutos, lo entrega una vez y lo borra. El código completo tiene dos
// partes: las 6 primeras letras las da el servidor para encontrar el bloque;
// las 8 últimas son la clave y nunca se mandan.
//
//   AB12CD-EF34-GH56   (o el QR "NEKOFIN:AB12CDEF34GH56")

const DEFAULT_ENDPOINT = "https://nekotools.site/transfer-finanzas.php";
let endpoint = DEFAULT_ENDPOINT;
/** Solo para las pruebas: apuntar a un servidor local. */
export const setTransferEndpoint = (url) => (endpoint = url || DEFAULT_ENDPOINT);

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I/L, se confunden al tipear
const ID_LENGTH = 6;
const SECRET_LENGTH = 8;
const ITERATIONS = 250000;
export const QR_PREFIX = "NEKOFIN:";

/** Letras al azar del alfabeto, sin sesgo (se descartan los bytes que no entran parejo). */
function randomCode(length) {
  let out = "";
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

const toBase64 = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/**
 * De la clave del código salen dos cosas: la llave que cifra y una "prueba"
 * que el servidor compara antes de entregar el bloque, para que un código mal
 * escrito avise sin gastar el envío. La prueba no sirve para descifrar.
 */
async function deriveKey(secret, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, 384));
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { key, proof: toBase64(bits.slice(32)) };
}

/** Comprime con gzip si el navegador sabe; el primer byte dice si va comprimido. */
async function pack(text) {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return concat(new Uint8Array([0]), raw);
  const zipped = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  return concat(new Uint8Array([1]), zipped);
}

async function unpack(bytes) {
  const body = bytes.subarray(1);
  if (bytes[0] === 0) return new TextDecoder().decode(body);
  if (typeof DecompressionStream === "undefined") throw new TransferError("old_browser");
  return new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

export class TransferError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function call(url, options) {
  let response;
  try {
    response = await fetch(url, { cache: "no-store", ...options });
  } catch {
    throw new TransferError("offline");
  }
  let result = null;
  try {
    result = await response.json();
  } catch {
    // respuesta rara: se informa abajo
  }
  if (!response.ok || !result?.ok) throw new TransferError(result?.error || (response.status === 404 ? "not_found_or_expired" : "server"));
  return result;
}

/** "AB12CDEF34GH56" → "AB12CD-EF34-GH56". */
export const formatCode = (code) => `${code.slice(0, ID_LENGTH)}-${code.slice(ID_LENGTH, ID_LENGTH + 4)}-${code.slice(ID_LENGTH + 4)}`;

/** Lo que se escribió o se escaneó → el código limpio (o "" si no tiene la forma). */
export function parseCode(input) {
  const clean = String(input || "")
    .trim()
    .toUpperCase()
    .replace(QR_PREFIX, "")
    .replace(/[^A-Z0-9]/g, "");
  return clean.length === ID_LENGTH + SECRET_LENGTH && [...clean].every((c) => ALPHABET.includes(c)) ? clean : "";
}

/** Cifra y sube los datos. Devuelve el código completo y cuánto dura. */
export async function sendData(text) {
  const secret = randomCode(SECRET_LENGTH);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { key, proof } = await deriveKey(secret, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await pack(text)));
  const result = await call(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ v: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(data), proof }),
  });
  return { code: result.code + secret, ttlSeconds: Number(result.ttlSeconds) || 900 };
}

/** Si el código sigue esperando en el servidor (no lo consume). */
export async function isWaiting(code) {
  const result = await call(`${endpoint}?check=${encodeURIComponent(code.slice(0, ID_LENGTH))}`);
  return result.active !== false;
}

/**
 * Baja y descifra los datos de un código. Es de un solo uso. Primero pide la
 * sal (con ?check, que no consume) para poder calcular la prueba.
 */
export async function receiveData(code) {
  const id = encodeURIComponent(code.slice(0, ID_LENGTH));
  const info = await call(`${endpoint}?check=${id}`);
  if (info.active === false || !info.salt) throw new TransferError("not_found_or_expired");
  const { key, proof } = await deriveKey(code.slice(ID_LENGTH), fromBase64(info.salt));
  const result = await call(`${endpoint}?code=${id}&proof=${encodeURIComponent(proof)}`);
  const payload = result.payload || {};
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(payload.iv) }, key, fromBase64(payload.data)));
  } catch {
    throw new TransferError("wrong_key");
  }
  return unpack(plain);
}

/** Mensaje para la persona según lo que falló. */
export function transferErrorText(error) {
  switch (error?.code) {
    case "offline":
      return "No hay conexión a internet. Para pasar los datos los dos dispositivos necesitan internet.";
    case "not_found_or_expired":
      return "Ese código no existe, ya se usó o venció. Genera uno nuevo en el otro dispositivo.";
    case "wrong_key":
      return "El código no coincide. Revisa que esté completo y bien escrito.";
    case "too_many_requests":
      return "Demasiados intentos seguidos. Espera unos minutos y prueba de nuevo.";
    case "payload_too_large":
      return "Tus datos son demasiado grandes para pasarlos con un código. Usa un backup en archivo.";
    case "old_browser":
      return "Este navegador es muy viejo para recibir los datos. Actualízalo o usa un backup en archivo.";
    default:
      return "No se pudo conectar con el servidor. Prueba de nuevo en un rato.";
  }
}
