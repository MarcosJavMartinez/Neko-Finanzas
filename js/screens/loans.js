// Préstamos: lo que te deben y lo que debés, con cuánto falta de cada uno.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { emptyState, progressBar } from "../ui/components.js";
import { formatMoney } from "../core/money.js";
import { formatDue, todayISO } from "../core/dates.js";
import { loansSummary, percent } from "../core/finance.js";

export function loanRow(item, today = todayISO()) {
  const { loan, outstanding } = item;
  const done = outstanding <= 0;
  const due = loan.dueDate && !done ? formatDue(loan.dueDate, today) : "";
  const overdue = loan.dueDate && !done && loan.dueDate < today;
  return html`<button type="button" class="row loan-row ${done ? "is-done" : ""}" data-action="loan-detail" data-id="${loan.id}">
    <span class="cat-bubble cat-bubble-md loan-bubble" aria-hidden="true">${done ? "✅" : "🤝"}</span>
    <span class="row-main">
      <span class="row-title">${loan.person}</span>
      <span class="row-meta ${overdue ? "is-overdue" : ""}">${done ? "Saldado" : [`de ${formatMoney(loan.amount, loan.currency)}`, due].filter(Boolean).join(" · ")}</span>
      ${done ? "" : progressBar(percent(loan.amount - outstanding, loan.amount), { color: "var(--goal)" })}
    </span>
    <span class="account-amount">
      <span class="account-balance">${done ? "" : formatMoney(outstanding, loan.currency)}</span>
    </span>
  </button>`;
}

export default {
  id: "prestamos",
  tab: "mas",
  title: "Préstamos",
  back: "#/mas",
  render(state) {
    const main = state.settings.mainCurrency;
    const today = todayISO();
    const summary = loansSummary(state);
    const byState = (a, b) => (a.outstanding > 0 ? 0 : 1) - (b.outstanding > 0 ? 0 : 1) || (a.loan.dueDate || "9999").localeCompare(b.loan.dueDate || "9999");
    const lent = summary.items.filter((i) => i.loan.direction === "lent").sort(byState);
    const borrowed = summary.items.filter((i) => i.loan.direction === "borrowed").sort(byState);

    if (!summary.items.length) {
      return html`<div class="card">${emptyState({
        art: "neko-anotando",
        title: "Sin préstamos anotados",
        text: "Anotá cuando le prestás plata a alguien o te prestan, y la app lleva la cuenta de cuánto falta.",
        actionLabel: "Anotar un préstamo",
        action: "add-loan",
        mood: "sleepy",
      })}</div>`;
    }

    return html`
      <section class="loan-totals reveal">
        <div class="loan-total loan-total-lent">
          <span class="loan-total-label">${icon("arrowDown", 15)} Te deben</span>
          <span class="loan-total-value">${formatMoney(summary.lent, main)}</span>
        </div>
        <div class="loan-total loan-total-borrowed">
          <span class="loan-total-label">${icon("arrowUp", 15)} Debés</span>
          <span class="loan-total-value">${formatMoney(summary.borrowed, main)}</span>
        </div>
      </section>
      <div class="accounts-actions reveal">
        <button type="button" class="btn btn-soft btn-grow" data-action="add-loan" data-direction="lent">${icon("plus", 18)} Le presté</button>
        <button type="button" class="btn btn-soft btn-grow" data-action="add-loan" data-direction="borrowed">${icon("plus", 18)} Me prestaron</button>
      </div>
      ${lent.length ? html`<h2 class="section-title section-title-spaced">Te deben</h2><section class="card card-flush rows reveal">${lent.map((i) => loanRow(i, today))}</section>` : ""}
      ${borrowed.length ? html`<h2 class="section-title section-title-spaced">Debés</h2><section class="card card-flush rows reveal">${borrowed.map((i) => loanRow(i, today))}</section>` : ""}
      <p class="fine-print center">${icon("info", 14)} Prestar o devolver plata no es un gasto ni un ingreso. Lo que debés con fecha de devolución se reserva de tu disponible cuando se acerca.</p>
    `;
  },
};
