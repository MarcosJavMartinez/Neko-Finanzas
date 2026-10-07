// Idiomas. Los textos de la app están escritos en español en el código, y ese
// mismo texto es la clave de cada traducción: `js/i18n/en.js` es un objeto
// { "Texto en español": "Text in English" }. En español no se traduce nada.
//
// Hay tres caminos, del más automático al más manual:
// - Los templates `html` se traducen solos: cada tramo de texto entre
//   etiquetas (y los atributos aria-label, title, placeholder y alt) se busca
//   en el diccionario, con los valores interpolados como {0}, {1}…
// - Un texto suelto que llega como valor ("Guardar", el nombre de un mes) se
//   traduce si está tal cual en el diccionario (`tr`).
// - Un texto armado con variables fuera de `html` lleva la etiqueta `msg`:
//   msg`Faltan ${n} días` → clave "Faltan {0} días".
//
// `tools/i18n.mjs` lista las claves que usa el código y las que le faltan a
// cada idioma.

export const LANGUAGES = {
  es: { name: "Español", locale: "es-AR" },
  en: { name: "English", locale: "en-US" },
};

const KEY = "nekoFinanzas.language";
let language = "es";
let dict = null;
let templates = new WeakMap();

/** Idioma del dispositivo si es uno de los nuestros; si no, inglés. */
export function detectLanguage() {
  const list = typeof navigator !== "undefined" ? navigator.languages || [navigator.language] : [];
  for (const tag of list) {
    const code = String(tag || "").slice(0, 2).toLowerCase();
    if (LANGUAGES[code]) return code;
  }
  return list.length ? "en" : "es";
}

export function savedLanguage() {
  try {
    const value = localStorage.getItem(KEY);
    return LANGUAGES[value] ? value : null;
  } catch (error) {
    return null;
  }
}

export const getLanguage = () => language;

/** País elegido (lo avisa money.js): afina el formato de las fechas dentro del idioma. */
let region = null;
export const setDateRegion = (code) => (region = code);

/** Locale para fechas y nombres de meses: el del idioma, con el país si coincide. */
export function dateLocale() {
  return region && region.slice(0, 2) === language ? region : LANGUAGES[language].locale;
}

/** Carga el diccionario del idioma (el guardado, o el del dispositivo) antes del primer render. */
export async function initLanguage() {
  await applyLanguage(savedLanguage() || detectLanguage());
  return language;
}

export async function applyLanguage(code) {
  const next = LANGUAGES[code] ? code : "es";
  let entries = null;
  if (next !== "es") {
    try {
      entries = (await import(`../i18n/${next}.js`)).default;
    } catch (error) {
      console.warn("[i18n] no se pudo cargar el idioma", next, error);
    }
  }
  language = entries || next === "es" ? next : "es";
  dict = entries ? new Map(Object.entries(entries)) : null;
  templates = new WeakMap();
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

export function saveLanguage(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch (error) {
    /* sin almacenamiento: vale hasta cerrar la app */
  }
}

/** Para las pruebas y la herramienta: usa un diccionario dado, sin cargar archivos. */
export function useDictionary(code, entries) {
  language = code;
  dict = entries ? new Map(Object.entries(entries)) : null;
  templates = new WeakMap();
}

/** Traduce un texto si está tal cual en el diccionario; si no, lo devuelve igual. */
export function tr(text) {
  if (!dict || typeof text !== "string") return text;
  return dict.get(text) ?? text;
}

const fill = (text, values) => text.replace(/\{(\d+)\}/g, (_, k) => String(tr(values[k])));

/** Texto con variables: msg`Faltan ${n} días`. */
export function msg(strings, ...values) {
  if (!dict) return strings.reduce((out, s, i) => out + String(values[i - 1]) + s);
  const key = strings.reduce((out, s, i) => `${out}{${i - 1}}${s}`);
  return fill(dict.get(key) ?? key, values);
}

// ---------- Templates html ----------

const OPEN = "";
const CLOSE = "";
const MARK = /(\d+)/g;
// Las etiquetas de formato quedan dentro del texto; cualquier otra lo corta.
const CUT = /<(?!\/?(?:strong|em|b|i|u|small)>|br\s*\/?>)[^>]*>/g;
const ATTR = /\b(aria-label|title|placeholder|alt)="([^"]*)"/g;
const HAS_WORD = /\p{L}{2}/u;

// Lo que rodea al texto y no se traduce: un ícono delante ("{0} Guardar" → la
// clave es "Guardar"), una etiqueta que se cierra, un agregado tras el punto final.
const HEAD = /^(?:\s|<\/[a-z]+>|\d+(?=\s*[\p{Lu}¿¡]))+/u;
const TAIL = /(?<=[.!?…])(?:\s*\d+)+$/u;

/** Traduce un tramo: los valores pasan a {0}, {1}… en orden de aparición. */
function translateRun(text, lookup) {
  const [, lead, core, tail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const head = core.match(HEAD)?.[0] ?? "";
  const end = core.slice(head.length).match(TAIL)?.[0] ?? "";
  const body = core.slice(head.length, core.length - end.length);
  if (!body || /=["']/.test(body)) return text; // vacío, o un pedazo de etiqueta (class="…")
  const ids = [];
  const key = body.replace(/\s+/g, " ").replace(MARK, (_, n) => {
    if (!ids.includes(n)) ids.push(n);
    return "{" + ids.indexOf(n) + "}";
  });
  if (!HAS_WORD.test(key.replace(/\{\d+\}|<[^>]*>|&\w+;/g, " "))) return text;
  const to = lookup(key);
  if (to == null) return text;
  return lead + head + to.replace(/\{(\d+)\}/g, (_, k) => (ids[k] === undefined ? "" : OPEN + ids[k] + CLOSE)) + end + tail;
}

/** Aplica `lookup` a cada tramo de texto y atributo traducible de un template. */
export function translateSource(strings, lookup) {
  const source = strings.reduce((out, s, i) => out + OPEN + (i - 1) + CLOSE + s);
  let out = "";
  let last = 0;
  for (const match of source.matchAll(CUT)) {
    out += translateRun(source.slice(last, match.index), lookup);
    out += match[0].replace(ATTR, (_, name, value) => `${name}="${translateRun(value, lookup)}"`);
    last = match.index + match[0].length;
  }
  return out + translateRun(source.slice(last), lookup);
}

/**
 * Para `html`: las partes fijas del template ya traducidas y el orden en que
 * van los valores (una traducción puede cambiarlos de lugar). `null` en
 * español: el template se usa como está.
 */
export function localizeTemplate(strings) {
  if (!dict) return null;
  let entry = templates.get(strings);
  if (!entry) {
    const source = translateSource(strings, (key) => dict.get(key));
    const parts = source.split(MARK);
    entry = { strings: parts.filter((_, i) => i % 2 === 0), order: parts.filter((_, i) => i % 2 === 1).map(Number) };
    templates.set(strings, entry);
  }
  return entry;
}
