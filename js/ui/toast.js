// Avisos breves al pie ("Gasto guardado", "Meta eliminada · Deshacer").

import { html, setHTML, haptic } from "./dom.js";
import { icon } from "./icons.js";

let current = null;

/**
 * `sticky: true` (para errores importantes): mientras se ve, los avisos que
 * no son de error no lo reemplazan.
 */
export function toast(message, { type = "success", actionLabel, onAction, duration = 3200, sticky = false } = {}) {
  if (current?.sticky && type !== "error") return current;
  current?.dismiss();
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  const iconName = type === "error" ? "alert" : type === "info" ? "info" : "check";
  setHTML(
    el,
    html`<span class="toast-icon">${icon(iconName, 18)}</span>
      <span class="toast-text">${message}</span>
      ${actionLabel ? html`<button type="button" class="toast-action">${actionLabel}</button>` : ""}`
  );
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  if (type === "success") haptic();

  let timer = setTimeout(dismiss, actionLabel ? duration + 2500 : duration);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 250);
    if (current?.el === el) current = null;
  }
  el.querySelector(".toast-action")?.addEventListener("click", () => {
    onAction?.();
    dismiss();
  });
  current = { el, dismiss, sticky };
  return current;
}
