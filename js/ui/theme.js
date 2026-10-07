// Tema claro / oscuro / automático, color principal y fondo. boot.js tiene
// el motor (NekoAppearance.apply) y lo corre antes de pintar; aquí se vuelve
// a aplicar en vivo cuando cambia alguna preferencia o el modo del sistema.

import { getThemePref, setThemePref } from "../core/prefs.js";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/** Tema que se ve ahora: "light" o "dark". */
export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Reaplica tema, paleta y fondo según lo guardado. */
export function applyAppearance() {
  window.NekoAppearance?.apply();
}

/** Guarda la preferencia ("auto", "light" o "dark") y la aplica. */
export function setThemePreference(pref) {
  setThemePref(pref);
  applyAppearance();
}

/** Aplica la preferencia guardada sin volver a guardarla (cambio desde otra pestaña). */
export const applySavedTheme = applyAppearance;

/** Llama a `onChange` cuando el sistema cambia de modo y el tema es automático. */
export function watchSystemTheme(onChange) {
  systemDark.addEventListener?.("change", () => {
    if (getThemePref() !== "auto") return;
    applyAppearance();
    onChange();
  });
}
