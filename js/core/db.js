// Base IndexedDB de la app (una sola, compartida). IndexedDB tiene mucho más
// lugar que localStorage (≈5 MB, menos en iPhone) y no bloquea la pantalla.
//
// Almacenes:
//   data       → tus datos financieros ("current")
//   snapshots  → copias automáticas para recuperar algo (las últimas 7)
//   assets     → la imagen de fondo propia

const DB_NAME = "nekoFinanzas";
const DB_VERSION = 2;
const STORES = ["assets", "data", "snapshots"];
const OPEN_TIMEOUT = 4000;

let dbPromise = null;

/** Abre (una sola vez) la base. Rechaza si el navegador no la permite. */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("sin IndexedDB"));
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      return reject(error);
    }
    // Algunos navegadores (modo privado viejo) nunca responden: no esperamos para siempre.
    const timer = setTimeout(() => reject(new Error("IndexedDB no respondió")), OPEN_TIMEOUT);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // Otra pestaña con una versión más nueva de la app: soltamos la base.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      /* otra pestaña vieja tiene la base abierta: esperamos al timeout */
    };
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

/**
 * Corre `fn(store)` en una transacción y resuelve con el resultado del
 * pedido que devuelva, cuando la transacción terminó de verdad.
 */
export async function withStore(name, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    let request;
    try {
      request = fn(tx.objectStore(name));
    } catch (error) {
      tx.abort();
      return reject(error);
    }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transacción cancelada"));
  });
}
