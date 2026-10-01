// Hoja inferior (bottom sheet) para formularios y detalles. En pantallas
// anchas se muestra como diálogo centrado. Maneja foco, Escape, cierre
// tocando el fondo y el botón "atrás" del celular.

import { html, setHTML } from "./dom.js";
import { icon } from "./icons.js";

let openCount = 0;
let sheetSeq = 0;

// ---------------------------------------------------------------------------
// Botón "atrás": cada hoja abierta agrega una entrada al historial, así el
// "atrás" del celular (o del navegador) cierra la hoja en vez de cambiar de
// pantalla por debajo.
//
// Al cerrar una hoja desde la interfaz se saca su entrada con history.back().
// Como eso es asíncrono, quien navegue justo después de cerrar una hoja tiene
// que usar whenHistorySettled(), para que ese "atrás" no deshaga la
// navegación.
// ---------------------------------------------------------------------------
const stack = [];
let pendingBacks = 0;
const afterSettled = [];

window.addEventListener("popstate", () => {
  if (pendingBacks > 0) {
    // Es el "atrás" que hicimos nosotros al cerrar una hoja desde la UI.
    pendingBacks--;
    if (!pendingBacks) afterSettled.splice(0).forEach((fn) => fn());
    return;
  }
  stack[stack.length - 1]?.close({ fromHistory: true });
});

/** Corre `fn` cuando ya se procesaron los "atrás" de las hojas cerradas. */
export function whenHistorySettled(fn) {
  if (pendingBacks > 0) afterSettled.push(fn);
  else fn();
}

/**
 * openSheet({ title, body, onMount }) → { el, close }
 * `onMount(panel, close)` corre cuando el contenido ya está en el DOM.
 */
export function openSheet({ title, body, onMount, onClose, wide = false }) {
  const previousFocus = document.activeElement;
  const sheetId = `sheet-${++sheetSeq}`;
  const root = document.createElement("div");
  root.className = "sheet-root";
  setHTML(
    root,
    html`<div class="sheet-backdrop" data-sheet-close></div>
    <section class="sheet ${wide ? "sheet-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${sheetId}-title">
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2 id="${sheetId}-title" class="sheet-title">${title}</h2>
        <button type="button" class="icon-btn" data-sheet-close aria-label="Cerrar">${icon("close", 20)}</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`
  );
  // Los campos usan ids fijos ("f-name", "f-amount"); con dos hojas abiertas
  // (p. ej. categoría + subcategoría) se repetían y la etiqueta de una
  // enfocaba el campo de la otra. Cada hoja les pone su propio prefijo.
  for (const el of root.querySelectorAll(".sheet-body [id]")) {
    const unique = `${sheetId}-${el.id}`;
    root.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).forEach((label) => (label.htmlFor = unique));
    el.id = unique;
  }
  document.body.appendChild(root);
  openCount++;
  document.body.classList.add("has-sheet");
  const panel = root.querySelector(".sheet");
  requestAnimationFrame(() => root.classList.add("is-open"));

  let closed = false;
  let pushed = false;
  const entry = { id: sheetId, close };
  stack.push(entry);
  // Si otra hoja se está cerrando (su "atrás" todavía no se procesó), se
  // espera a que termine para no desordenar el historial.
  whenHistorySettled(() => {
    if (closed) return;
    history.pushState({ nekoSheet: sheetId }, "");
    pushed = true;
  });

  function close({ fromHistory = false } = {}) {
    if (closed) return;
    closed = true;
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    // Cerrada desde la UI: se saca su entrada del historial.
    if (!fromHistory && pushed && history.state?.nekoSheet === sheetId) {
      pendingBacks++;
      history.back();
    }
    root.classList.remove("is-open");
    root.classList.add("is-closing");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => {
      root.remove();
      openCount--;
      if (!openCount) document.body.classList.remove("has-sheet");
      previousFocus?.focus?.({ preventScroll: true });
      onClose?.();
    }, 220);
  }

  function onKey(event) {
    if (event.key === "Escape" && stack[stack.length - 1] === entry) close();
    if (event.key === "Tab") trapFocus(event, panel);
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-sheet-close]")) close();
  });
  // Ya cerrándose: se ignoran envíos y toques repetidos (doble toque en
  // "Guardar" creaba el movimiento dos veces).
  const blockWhenClosed = (event) => {
    if (!closed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  root.addEventListener("submit", blockWhenClosed, true);
  root.addEventListener("click", blockWhenClosed, true);
  document.addEventListener("keydown", onKey);

  onMount?.(panel, close);
  const autofocus = panel.querySelector("[data-autofocus]");
  // En celulares no forzamos el foco en inputs (abriría el teclado encima de la hoja).
  if (autofocus && window.matchMedia("(pointer: fine)").matches) {
    autofocus.focus();
  } else {
    const heading = panel.querySelector(".sheet-title");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  return { el: panel, close };
}

function trapFocus(event, panel) {
  const focusables = [...panel.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Confirmación simple. Resuelve true/false. */
export function confirmDialog({ title, text, confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      body: html`<p class="sheet-text">${text}</p>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-sheet-close>Cancelar</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${confirmLabel}</button>
        </div>`,
      onMount(panel, close) {
        panel.querySelector("[data-confirm]").addEventListener("click", () => {
          answered = true;
          resolve(true);
          close();
        });
      },
      onClose() {
        if (!answered) resolve(false);
      },
    });
  });
}
