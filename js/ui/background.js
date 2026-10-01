// Fondo de la app: color principal (paleta), color de fondo e imagen propia.
//
// La imagen propia se guarda en IndexedDB y no en localStorage: una foto
// ocupa cientos de KB y localStorage es chico (≈5 MB, menos en iPhone) y lo
// comparte con tus datos financieros. Así una foto nunca les quita lugar.

import { applyAppearance } from "./theme.js";
import { withStore } from "../core/db.js";

const KEYS = {
  palette: "nekoFinanzas.palette",
  customColor: "nekoFinanzas.customColor",
  bgColor: "nekoFinanzas.bgColor",
  bgImage: "nekoFinanzas.bgImage",
};
const HEX = /^#[0-9a-f]{6}$/i;
const STORE = "assets";
const IMAGE_ID = "background";
const MAX_SIDE = 1600;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const PALETTES = [
  { id: "cian", label: "Cian (Neko Finanzas)", color: "#08a7c8" },
  { id: "oceano", label: "Océano", color: "#1c7ed6" },
  { id: "verde", label: "Verde", color: "#2f9e44" },
  { id: "atardecer", label: "Atardecer", color: "#e8590c" },
  { id: "uva", label: "Uva", color: "#7048c2" },
  { id: "frambuesa", label: "Frambuesa", color: "#e64980" },
  { id: "grafito", label: "Grafito", color: "#495057" },
];

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) {
    /* sin localStorage: dura hasta recargar */
  }
}

// ---------------------------------------------------------------------------
// Color principal
// ---------------------------------------------------------------------------

export function getPalette() {
  const id = read(KEYS.palette);
  if (id === "custom" && HEX.test(read(KEYS.customColor) || "")) return "custom";
  return PALETTES.some((p) => p.id === id) ? id : "cian";
}

export function getCustomColor() {
  const color = read(KEYS.customColor);
  return HEX.test(color || "") ? color.toLowerCase() : "#08a7c8";
}

export function setPalette(id) {
  write(KEYS.palette, id === "cian" || !PALETTES.some((p) => p.id === id) ? null : id);
  applyAppearance();
}

export function setCustomColor(color) {
  if (!HEX.test(color)) return;
  write(KEYS.customColor, color.toLowerCase());
  write(KEYS.palette, "custom");
  applyAppearance();
}

// ---------------------------------------------------------------------------
// Fondo: "pattern" | "none" | "custom" (+ color de fondo opcional)
// ---------------------------------------------------------------------------

export function getBackground() {
  const choice = read(KEYS.bgImage);
  return choice === "none" || choice === "custom" ? choice : "pattern";
}

export function getBgColor() {
  const color = read(KEYS.bgColor);
  return HEX.test(color || "") ? color.toLowerCase() : null;
}

/** Un color de fondo tapa la imagen (como en Neko Lista): se usa uno u otro. */
export function setBgColor(color) {
  if (color && !HEX.test(color)) return;
  write(KEYS.bgColor, color ? color.toLowerCase() : null);
  if (color) write(KEYS.bgImage, "none");
  applyAppearance();
}

export async function setBackground(choice) {
  write(KEYS.bgImage, choice === "pattern" ? null : choice);
  write(KEYS.bgColor, null);
  applyAppearance();
  await showCustomImage();
}

// ---------------------------------------------------------------------------
// Imagen propia (IndexedDB)
// ---------------------------------------------------------------------------

/** Atajo al almacén de imágenes de la base compartida (js/core/db.js). */
function withAssets(mode, fn) {
  return withStore(STORE, mode, fn);
}

let currentUrl = null;

/** Muestra la imagen propia si es la elegida (o la saca si no). */
export async function showCustomImage() {
  const root = document.documentElement;
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  root.style.removeProperty("--custom-bg");
  if (getBackground() !== "custom") return;
  try {
    const blob = await withAssets("readonly", (store) => store.get(IMAGE_ID));
    if (!(blob instanceof Blob) || !blob.type.startsWith("image/")) throw new Error("sin imagen");
    currentUrl = URL.createObjectURL(blob);
    // blob: generado acá mismo; nada que venga de afuera entra al url().
    root.style.setProperty("--custom-bg", `url("${currentUrl}")`);
  } catch (error) {
    // Imagen perdida (datos del navegador borrados): se vuelve al patrón.
    write(KEYS.bgImage, null);
    applyAppearance();
  }
}

/**
 * Achica la foto (máx. 1600 px) y la vuelve a codificar como JPEG: pesa poco
 * y de paso descarta cualquier cosa rara que viniera dentro del archivo.
 */
async function normalizeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen"));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("No se pudo procesar la imagen");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Guarda una foto elegida por el usuario como fondo. */
export async function setCustomImage(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif|avif|heic|heif|bmp)$/i.test(file.type)) {
    throw new Error("Elegí una imagen (JPG, PNG o WebP).");
  }
  if (file.size > MAX_FILE_BYTES) throw new Error("La imagen es demasiado pesada (máximo 25 MB).");
  const blob = await normalizeImage(file);
  try {
    await withAssets("readwrite", (store) => store.put(blob, IMAGE_ID));
  } catch (error) {
    throw new Error("No se pudo guardar la imagen en este dispositivo.");
  }
  await setBackground("custom");
}

/** Borra la imagen propia (al elegir otro fondo no se borra, por si volvés). */
export async function removeCustomImage() {
  try {
    await withAssets("readwrite", (store) => store.delete(IMAGE_ID));
  } catch (error) {
    /* no había nada */
  }
  if (getBackground() === "custom") await setBackground("pattern");
}

export async function hasCustomImage() {
  try {
    return (await withAssets("readonly", (store) => store.count(IMAGE_ID))) > 0;
  } catch (error) {
    return false;
  }
}
