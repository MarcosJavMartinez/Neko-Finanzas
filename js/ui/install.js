// Instalar como app (PWA). En Chrome/Edge (Android y escritorio) el navegador
// ofrece un aviso que podemos abrir con un botón; en iPhone, iPad y Safari de
// Mac no existe ese aviso y hay que mostrar los pasos a mano, distintos según
// el navegador (mismo criterio que Neko Lista).

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
  "ios-safari": ["Tocá el botón Compartir (el cuadrado con la flecha)", "Tocá «Ver más»", "Tocá «Añadir a pantalla de inicio»", "Tocá «Añadir»"],
  "ios-chrome": ["Tocá el botón Compartir", "Tocá «Más»", "Tocá «Agregar a pantalla de inicio»", "Tocá «Agregar»"],
  "mac-safari": ["Hacé clic en Compartir, en la barra de Safari", "Elegí «Añadir al Dock»", "Confirmá con «Añadir»"],
};

export const INSTALL_MESSAGES = {
  "ios-other": "Para instalar, abrí este link en Safari.",
  android: "Tocá el menú ⋮ del navegador y elegí «Instalar app» o «Agregar a la pantalla principal».",
  desktop: "Este navegador no permite instalar apps. Abrí este link con Chrome o Edge.",
};
