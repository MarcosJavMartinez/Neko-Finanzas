// "Agregar": un solo botón para todo lo que se puede anotar. Primero se elige
// qué es (un gasto, un ingreso, una compra con tarjeta, un préstamo…) y
// recién ahí se abre el formulario que corresponde.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, whenHistorySettled } from "../sheet.js";
import * as store from "../../core/store.js";

/** Opciones según lo que la persona tiene cargado (cuentas, facturas, metas). */
function options(state) {
  const accounts = state.accounts.filter((a) => !a.archived);
  const pendingBills = state.bills.filter((b) => b.status === "pending" || b.recurring).length;
  // Lo de todos los días, a la vista. El gasto con tarjeta (en cuotas) se elige dentro de "Gasto".
  const main = [
    { action: "add-expense", icon: "arrowUp", tone: "expense", title: "Gasto", sub: "Algo que pagaste, también con tarjeta o en cuotas" },
    { action: "add-income", icon: "arrowDown", tone: "income", title: "Ingreso", sub: "Sueldo, un trabajo, una venta" },
    { href: "#/facturas", icon: "receipt", tone: "bill", title: "Pago de una factura", sub: pendingBills ? "Elige cuál pagaste" : "Luz, internet, alquiler, suscripciones" },
    ...(accounts.length > 1 ? [{ action: "add-transfer", icon: "swap", title: "Pasar dinero entre cuentas", sub: "Del banco al efectivo, a la billetera…" }] : []),
  ];
  const more = [
    ...(state.settings.currencies.length > 1 ? [{ action: "exchange-currency", icon: "coins", title: "Cambiar divisas", sub: "Por ejemplo, dólares a pesos, con el valor al que cambiaste" }] : []),
    { href: "#/metas", icon: "target", tone: "goal", title: "Guardar en una meta", sub: state.goals.length ? "Elige la meta y cuánto" : "Crea tu primera meta" },
    { action: "add-extras", icon: "sparkle", title: "Extras del mes", sub: "Paga extra o aguinaldo, horas extra, comisión, propinas" },
    { pickLoan: true, icon: "swap", title: "Un préstamo", sub: "Le prestaste, te prestaron o en cuotas de un banco o billetera" },
  ];
  return { main, more };
}

/** Los tres tipos de préstamo, en una segunda hoja. */
const LOANS = [
  { action: "add-loan", direction: "lent", icon: "arrowUp", title: "Le presté a alguien", sub: "Para llevar la cuenta de lo que te deben" },
  { action: "add-loan", direction: "borrowed", icon: "arrowDown", title: "Me prestaron", sub: "Un amigo, un familiar" },
  { action: "add-credit-loan", icon: "coinStack", title: "Préstamo en cuotas", sub: "De un banco o una billetera" },
];

const item = (o) => html`<button type="button" class="more-item chooser-item" data-pick="${o.action || ""}" data-href="${o.href || ""}" data-direction="${o.direction || ""}" data-loan="${o.pickLoan ? "1" : ""}">
  <span class="more-icon ${o.tone ? `tone-${o.tone}` : ""}">${icon(o.icon, 22)}</span>
  <span class="more-text"><span class="more-title">${o.title}</span><span class="more-sub">${o.sub}</span></span>
  ${icon("chevronRight", 18, "more-chevron")}
</button>`;

/** Elegir en una hoja y, ya cerrada, abrir lo elegido. */
function bindPicks(panel, close, run) {
  panel.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-pick]");
    if (!pick) return;
    close();
    whenHistorySettled(() => {
      if (pick.dataset.loan) openLoanChooser(run);
      else if (pick.dataset.href) location.hash = pick.dataset.href;
      else run(pick.dataset.pick, { direction: pick.dataset.direction });
    });
  });
}

function openLoanChooser(run) {
  openSheet({
    title: "¿Qué préstamo?",
    body: html`<div class="chooser"><div class="more-grid chooser-group">${LOANS.map(item)}</div></div>`,
    onMount(panel, close) {
      bindPicks(panel, close, run);
    },
  });
}

/**
 * `run(action, dataset)` ejecuta una de las acciones globales de la app (las
 * mismas de los botones sueltos): aquí no se duplica ningún formulario.
 */
export function openAddChooser(run) {
  const { main, more } = options(store.getState());
  openSheet({
    title: "¿Qué quieres anotar?",
    body: html`<div class="chooser">
      <div class="more-grid chooser-group">${main.map(item)}</div>
      <details class="chooser-more">
        <summary>${icon("plus", 16)} Más opciones</summary>
        <div class="more-grid chooser-group">${more.map(item)}</div>
      </details>
    </div>`,
    onMount(panel, close) {
      bindPicks(panel, close, run);
    },
  });
}
