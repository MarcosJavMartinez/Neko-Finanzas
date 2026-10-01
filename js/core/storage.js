// Persistencia local. Todo queda en este dispositivo (localStorage): nada se
// manda a ningún servidor. Está aislado acá para poder pasar a IndexedDB o
// sumar sincronización más adelante sin tocar el resto de la app.

const KEY = "nekoFinanzas.data.v1";

export const STORAGE_KEY = KEY;

export function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("[storage] No se pudieron leer los datos guardados", error);
    // Datos dañados: se guarda una copia antes de que la app los reemplace,
    // por si se pueden recuperar a mano.
    if (raw) {
      try {
        localStorage.setItem(`${KEY}.corrupto.${Date.now()}`, raw);
      } catch (copyError) {
        /* sin espacio para la copia */
      }
    }
    return null;
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.warn("[storage] No se pudieron guardar los datos", error);
    return false;
  }
}

export function clearData() {
  try {
    localStorage.removeItem(KEY);
  } catch (error) {
    /* sin acceso a localStorage: no hay nada que borrar */
  }
}

/** Pide al navegador que no borre los datos si se queda sin espacio. */
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
