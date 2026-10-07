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
  return [
    {
      title: "Lo de todos los días",
      items: [
        { action: "add-expense", icon: "arrowUp", tone: "expense", title: "Gasto", sub: "Algo que pagaste" },
        { action: "add-income", icon: "arrowDown", tone: "income", title: "Ingreso", sub: "Sueldo, un trabajo, una venta" },
        { action: "add-card-purchase", icon: "card", title: "Compra con tarjeta", sub: "En un pago o en cuotas" },
        { href: "#/facturas", icon: "receipt", tone: "bill", title: "Pago de una factura", sub: pendingBills ? "Elige cuál pagaste" : "Luz, internet, alquiler, suscripciones" },
      ],
    },
    {
      title: "Dinero que se mueve",
      items: [
        ...(accounts.length > 1 ? [{ action: "add-transfer", icon: "swap", title: "Pasar dinero entre cuentas", sub: "Del banco al efectivo, a la billetera…" }] : []),
        { href: "#/metas", icon: "target", tone: "goal", title: "Guardar en una meta", sub: state.goals.length ? "Elige la meta y cuánto" : "Crea tu primera meta" },
        { action: "add-extras", icon: "sparkle", title: "Extras del mes", sub: "Paga extra o aguinaldo, horas extra, comisión, propinas" },
      ],
    },
    {
      title: "Préstamos",
      items: [
        { action: "add-loan", direction: "lent", icon: "arrowUp", title: "Le presté a alguien", sub: "Para llevar la cuenta de lo que te deben" },
        { action: "add-loan", direction: "borrowed", icon: "arrowDown", title: "Me prestaron", sub: "Un amigo, un familiar" },
        { action: "add-credit-loan", icon: "coinStack", title: "Préstamo en cuotas", sub: "De un banco o una billetera" },
      ],
    },
  ];
}

/**
 * `run(action, dataset)` ejecuta una de las acciones globales de la app (las
 * mismas de los botones sueltos): aquí no se duplica ningún formulario.
 */
export function openAddChooser(run) {
  const groups = options(store.getState());
  openSheet({
    title: "¿Qué quieres anotar?",
    body: html`<div class="chooser">
      ${groups.map(
        (group) => html`<h3 class="more-heading">${group.title}</h3>
          <div class="more-grid chooser-group">
            ${group.items.map(
              (o) => html`<button type="button" class="more-item chooser-item" data-pick="${o.action || ""}" data-href="${o.href || ""}" data-direction="${o.direction || ""}">
                <span class="more-icon ${o.tone ? `tone-${o.tone}` : ""}">${icon(o.icon, 22)}</span>
                <span class="more-text"><span class="more-title">${o.title}</span><span class="more-sub">${o.sub}</span></span>
                ${icon("chevronRight", 18, "more-chevron")}
              </button>`
            )}
          </div>`
      )}
    </div>`,
    onMount(panel, close) {
      panel.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-pick]");
        if (!pick) return;
        close();
        // La hoja se cierra y recién entonces se abre lo elegido.
        whenHistorySettled(() => {
          if (pick.dataset.href) location.hash = pick.dataset.href;
          else run(pick.dataset.pick, { direction: pick.dataset.direction });
        });
      });
    },
  });
}
