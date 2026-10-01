// Persistencia local. Todo queda en este dispositivo: nada se manda a ningún
// servidor.
//
// Se guarda en IndexedDB (mucho más lugar que localStorage). La primera vez
// se pasan ahí los datos que estaban en localStorage. Si el navegador no
// permite IndexedDB, se sigue usando localStorage como antes.
//
// Guardar es asíncrono: saveData() toma una foto del estado en el momento y
// la escribe en orden; si falla, avisa con onWriteError(). flush() espera a
// que termine todo lo pendiente.

import { openDB, withStore } from "./db.js";

const KEY = "nekoFinanzas.data.v1"; // localStorage (versión anterior / respaldo)
const CURRENT = "current";
const MAX_SNAPSHOTS = 7;
const CHANNEL = "nekoFinanzas.data";

export const STORAGE_KEY = KEY;

let mode = "local"; // "idb" | "local"
let queue = Promise.resolve();
const errorListeners = new Set();
const remoteListeners = new Set();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
channel?.unref?.(); // en Node (pruebas) no debe mantener vivo el proceso
channel?.addEventListener("message", (event) => {
  if (event.data?.type === "saved") remoteListeners.forEach((fn) => fn());
});

export const storageMode = () => mode;

/** Avisa si un guardado falló (almacenamiento lleno o bloqueado). */
export function onWriteError(fn) {
  errorListeners.add(fn);
}

/** Otra pestaña guardó datos nuevos. */
export function onRemoteChange(fn) {
  remoteListeners.add(fn);
}

function parse(raw, onCorrupt) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("[storage] Datos dañados; se guarda una copia aparte", error);
    onCorrupt(raw);
    return null;
  }
}

function readLocal() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (error) {
    return null;
  }
  return parse(raw, (bad) => {
    try {
      localStorage.setItem(`${KEY}.corrupto.${Date.now()}`, bad);
    } catch (copyError) {
      /* sin espacio para la copia */
    }
  });
}

async function readIDB() {
  const raw = await withStore("data", "readonly", (s) => s.get(CURRENT));
  return parse(typeof raw === "string" ? raw : null, (bad) => {
    withStore("data", "readwrite", (s) => s.put(bad, `corrupto.${Date.now()}`)).catch(() => {});
  });
}

/**
 * Prepara el almacenamiento y devuelve los datos guardados (o null).
 * Pasa a IndexedDB lo que hubiera en localStorage, y recién lo borra de ahí
 * cuando comprobó que quedó bien guardado.
 */
export async function initStorage() {
  try {
    await openDB();
    mode = "idb";
  } catch (error) {
    console.warn("[storage] Sin IndexedDB, se usa localStorage", error);
    mode = "local";
    return readLocal();
  }
  try {
    const saved = await readIDB();
    if (saved) return saved;
    const legacy = readLocal();
    if (!legacy) return null;
    const raw = JSON.stringify(legacy);
    await withStore("data", "readwrite", (s) => s.put(raw, CURRENT));
    if ((await withStore("data", "readonly", (s) => s.get(CURRENT))) === raw) {
      try {
        localStorage.removeItem(KEY);
      } catch (error) {
        /* queda una copia de más, no pasa nada */
      }
    }
    return legacy;
  } catch (error) {
    // IndexedDB abrió pero falla al leer: mejor seguir con localStorage que perder datos.
    console.warn("[storage] IndexedDB falló, se usa localStorage", error);
    mode = "local";
    return readLocal();
  }
}

/** Lee lo guardado (para recargar cuando otra pestaña cambió algo). */
export async function loadData() {
  await queue;
  return mode === "idb" ? readIDB().catch(() => null) : readLocal();
}

function fail(error) {
  console.warn("[storage] No se pudieron guardar los datos", error);
  errorListeners.forEach((fn) => fn(error));
}

/** Guarda una foto del estado. Devuelve false si ya se sabe que falló. */
export function saveData(data) {
  let raw;
  try {
    raw = JSON.stringify(data);
  } catch (error) {
    fail(error);
    return false;
  }
  if (mode === "local") {
    try {
      localStorage.setItem(KEY, raw);
      channel?.postMessage({ type: "saved" });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }
  queue = queue
    .then(() => withStore("data", "readwrite", (s) => s.put(raw, CURRENT)))
    .then(() => channel?.postMessage({ type: "saved" }))
    .catch(fail);
  return true;
}

/** Espera a que terminen los guardados pendientes. */
export function flush() {
  return queue;
}

export async function clearData() {
  try {
    localStorage.removeItem(KEY);
  } catch (error) {
    /* nada que borrar */
  }
  if (mode !== "idb") return;
  await queue;
  await withStore("data", "readwrite", (s) => s.clear()).catch(() => {});
  await clearSnapshots();
}

// ---------------------------------------------------------------------------
// Copias automáticas (solo con IndexedDB)
// ---------------------------------------------------------------------------

/** Guarda una copia del estado. `reason`: "diaria", "antes de importar", … */
export async function saveSnapshot(data, reason) {
  if (mode !== "idb") return false;
  const at = new Date().toISOString();
  const snap = {
    id: `${at}-${Math.random().toString(36).slice(2, 6)}`,
    at,
    reason,
    counts: { transactions: data.transactions?.length || 0, bills: data.bills?.length || 0, goals: data.goals?.length || 0 },
    data: JSON.stringify(data),
  };
  try {
    await queue;
    await withStore("snapshots", "readwrite", (s) => s.put(snap, snap.id));
    const ids = (await withStore("snapshots", "readonly", (s) => s.getAllKeys())).sort();
    const extra = ids.slice(0, Math.max(0, ids.length - MAX_SNAPSHOTS));
    if (extra.length) await withStore("snapshots", "readwrite", (s) => extra.forEach((id) => s.delete(id)));
    return true;
  } catch (error) {
    console.warn("[storage] No se pudo guardar la copia automática", error);
    return false;
  }
}

/** Copias guardadas, de la más nueva a la más vieja (sin los datos). */
export async function listSnapshots() {
  if (mode !== "idb") return [];
  try {
    const all = await withStore("snapshots", "readonly", (s) => s.getAll());
    return all
      .filter((x) => x && typeof x.id === "string" && typeof x.at === "string")
      .map(({ id, at, reason, counts }) => ({ id, at, reason: String(reason || ""), counts: counts || {} }))
      .sort((a, b) => b.at.localeCompare(a.at));
  } catch (error) {
    return [];
  }
}

export async function loadSnapshot(id) {
  const snap = await withStore("snapshots", "readonly", (s) => s.get(id));
  return snap?.data ? JSON.parse(snap.data) : null;
}

export async function clearSnapshots() {
  if (mode !== "idb") return;
  await withStore("snapshots", "readwrite", (s) => s.clear()).catch(() => {});
}

/** Pide al navegador que no borre los datos si se queda sin espacio. */
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
