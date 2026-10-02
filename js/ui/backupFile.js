// Guardar el backup ocupando lo mínimo: siempre el mismo archivo, que se
// reemplaza, en vez de uno nuevo por cada backup.
//
// - Computadora con Chrome o Edge: se elige una vez dónde guardarlo y cada
//   backup pisa ese archivo (el navegador recuerda el permiso; a veces lo
//   vuelve a pedir).
// - Celular: los navegadores no dejan que una web reemplace archivos. Se abre
//   el menú de compartir para guardarlo donde quieras (Archivos, Drive…); si
//   elegís el mismo nombre, el sistema ofrece reemplazarlo.
// - Si nada de eso está disponible, se descarga con un nombre fijo.

import { withStore } from "../core/db.js";
import { downloadFile } from "./download.js";

export const BACKUP_NAME = "neko-finanzas-backup.json";
const HANDLE_KEY = "backupFile";

let memoryHandle = null; // por si el navegador no deja guardar el permiso
let knownName = ""; // nombre del archivo elegido, para mostrarlo sin esperar

/** Nombre del archivo de backup elegido ("" si no hay), sin esperar a la base. */
export const backupFileKnown = () => knownName;

/** Al abrir la app: recuerda qué archivo se había elegido. */
export async function initBackupFile() {
  knownName = canPickFile() ? (await savedHandle())?.name || "" : "";
}

export const canPickFile = () => typeof window.showSaveFilePicker === "function";

async function savedHandle() {
  if (memoryHandle) return memoryHandle;
  try {
    return (await withStore("assets", "readonly", (s) => s.get(HANDLE_KEY))) || null;
  } catch (error) {
    return null;
  }
}

async function rememberHandle(handle) {
  memoryHandle = handle;
  knownName = handle.name || "";
  try {
    await withStore("assets", "readwrite", (s) => s.put(handle, HANDLE_KEY));
  } catch (error) {
    /* queda recordado solo mientras la app esté abierta */
  }
}

/** Nombre del archivo elegido para los backups, o "" si todavía no hay. */
export async function backupFileName() {
  return (await savedHandle())?.name || "";
}

export async function forgetBackupFile() {
  memoryHandle = null;
  knownName = "";
  try {
    await withStore("assets", "readwrite", (s) => s.delete(HANDLE_KEY));
  } catch (error) {
    /* nada que olvidar */
  }
}

async function pickFile() {
  const handle = await window.showSaveFilePicker({
    suggestedName: BACKUP_NAME,
    types: [{ description: "Backup de Neko Finanzas", accept: { "application/json": [".json"] } }],
  });
  await rememberHandle(handle);
  return handle;
}

async function writeTo(handle, text) {
  if (handle.queryPermission && (await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("sin permiso");
  }
  const writable = await handle.createWritable(); // reemplaza el contenido anterior
  await writable.write(text);
  await writable.close();
}

/**
 * Guarda el backup. Devuelve cómo quedó:
 *   { how: "replaced", name }  se pisó el archivo elegido
 *   { how: "shared" }          se pasó al menú de compartir
 *   { how: "downloaded" }      se descargó
 *   { how: "cancelled" }       la persona canceló
 * `choose: true` obliga a elegir de nuevo el archivo.
 */
export async function saveBackup(text, { choose = false } = {}) {
  if (canPickFile()) {
    try {
      let handle = choose ? null : await savedHandle();
      if (handle) {
        try {
          await writeTo(handle, text);
          return { how: "replaced", name: handle.name };
        } catch (error) {
          // El archivo se movió o se negó el permiso: se vuelve a elegir.
          handle = null;
        }
      }
      handle = await pickFile();
      await writeTo(handle, text);
      return { how: "replaced", name: handle.name, first: true };
    } catch (error) {
      if (error?.name === "AbortError") return { how: "cancelled" };
      // Cualquier otra falla: se descarga como siempre.
    }
  } else {
    const file = new File([text], BACKUP_NAME, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Backup de Neko Finanzas" });
        return { how: "shared" };
      } catch (error) {
        if (error?.name === "AbortError") return { how: "cancelled" };
      }
    }
  }
  downloadFile(text, BACKUP_NAME, "application/json");
  return { how: "downloaded" };
}
