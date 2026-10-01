// Helpers de DOM y un mini sistema de templates seguro.
//
// `html` es un tagged template que escapa todo valor interpolado, salvo lo
// que ya viene marcado como HTML confiable (otro `html` o `raw`). Así los
// textos que escribe el usuario (nombres, descripciones) nunca se
// interpretan como HTML.

import { vibrationEnabled } from "../core/prefs.js";

class SafeHTML {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHTML(String(value));

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function renderValue(value) {
  if (value == null || value === false) return "";
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += renderValue(value) + strings[i + 1];
  });
  return new SafeHTML(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function setHTML(element, content) {
  element.innerHTML = String(content);
}

/** Vibración cortita al confirmar algo, donde el dispositivo lo soporte. */
export function haptic(ms = 10) {
  try {
    if (vibrationEnabled()) navigator.vibrate?.(ms);
  } catch (error) {
    /* sin soporte */
  }
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
