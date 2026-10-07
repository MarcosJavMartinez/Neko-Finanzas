// Instalar como app (PWA). En Chrome/Edge (Android y escritorio) el navegador
// ofrece un aviso que podemos abrir con un botón; en iPhone, iPad y Safari de
// Mac no existe ese aviso y hay que mostrar los pasos a mano, distintos según
// el navegador (mismo criterio que Neko Lista).

import { html } from "./dom.js";
import { openSheet } from "./sheet.js";

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  notify();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
});

export function onInstallChange(fn) {
  listeners.add(fn);
}

export const canPromptInstall = () => !!deferredPrompt;

/** Abre el aviso del navegador. Resuelve true si el usuario aceptó. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  notify();
  return choice?.outcome === "accepted";
}

export function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function installPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    if (/CriOS/i.test(ua)) return "ios-chrome";
    if (/FxiOS|EdgiOS/i.test(ua)) return "ios-other";
    return "ios-safari";
  }
  if (/Macintosh/i.test(ua) && !/Chrome\/|Edg\/|Firefox\//i.test(ua)) return "mac-safari";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Pasos a mano para cada plataforma sin aviso de instalación. */
export const INSTALL_STEPS = {
  "ios-safari": ["Toca el botón Compartir (el cuadrado con la flecha)", "Toca «Ver más»", "Toca «Añadir a pantalla de inicio»", "Toca «Añadir»"],
  "ios-chrome": ["Toca el botón Compartir", "Toca «Más»", "Toca «Agregar a pantalla de inicio»", "Toca «Agregar»"],
  "mac-safari": ["Haz clic en Compartir, en la barra de Safari", "Elige «Añadir al Dock»", "Confirma con «Añadir»"],
};

export const INSTALL_MESSAGES = {
  "ios-other": "Para instalar, abre este enlace en Safari.",
  android: "Toca el menú ⋮ del navegador y elige «Instalar app» o «Agregar a la pantalla principal».",
  desktop: "Este navegador no permite instalar apps. Abre este enlace con Chrome o Edge.",
};

/**
 * iPhone/iPad sin instalar: Safari borra los datos de una web que no se abre
 * en 7 días (instalada en la pantalla de inicio, no). Hay que avisarlo.
 */
export function needsIosInstall() {
  return installPlatform().startsWith("ios") && !isInstalled();
}

/** Hoja con los pasos para instalar en este dispositivo. */
export function openInstallHelp() {
  const platform = installPlatform();
  const steps = INSTALL_STEPS[platform];
  openSheet({
    title: "Instalar Neko Finanzas",
    body: html`${platform.startsWith("ios")
        ? html`<p class="sheet-text"><strong>Importante en iPhone:</strong> si no abres la app en 7 días, Safari puede borrar tus datos. Instalada en la pantalla de inicio, eso no pasa.</p>`
        : ""}
      ${steps
        ? html`<ol class="install-steps">${steps.map((step) => html`<li>${step}</li>`)}</ol>`
        : html`<p class="sheet-text">${INSTALL_MESSAGES[platform]}</p>`}
      <div class="form-actions"><button type="button" class="btn btn-primary btn-grow" data-sheet-close>Entendido</button></div>`,
  });
}
