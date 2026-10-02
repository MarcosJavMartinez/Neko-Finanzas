// Cuentas: dónde está tu plata (efectivo, banco, billetera virtual, ahorro)
// y las transferencias entre ellas. La suma de todas es tu dinero total.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { txRow } from "../ui/components.js";
import { formatMoney } from "../core/money.js";
import { accountBalances, cardStatus } from "../core/finance.js";
import { formatDate } from "../core/dates.js";
import { ACCOUNT_KINDS } from "../data/defaults.js";

export function accountRow(state, entry) {
  const { account, balance, balanceMain } = entry;
  const main = state.settings.mainCurrency;
  if (account.kind === "credit") {
    // Tarjeta: se muestra lo que debés (en rojo), no un saldo negativo.
    const card = cardStatus(state, account);
    return html`<button type="button" class="row account-row" data-action="account-detail" data-id="${account.id}">
      <span class="cat-bubble cat-bubble-md" style="--c:${account.color}" aria-hidden="true">${account.icon}</span>
      <span class="row-main">
        <span class="row-title">${account.name}</span>
        <span class="row-meta">Tarjeta · vence el ${formatDate(card.due)}${card.upcoming.length ? ` · ${card.upcoming.length} en cuotas` : ""}</span>
      </span>
      <span class="account-amount">
        <span class="account-balance ${card.debt > 0 ? "is-negative" : ""}">${card.debt > 0 ? formatMoney(-card.debt, account.currency) : card.credit > 0 ? formatMoney(card.credit, account.currency) : "Sin deuda"}</span>
        ${card.debt > 0 ? html`<span class="approx">deuda de hoy</span>` : card.credit > 0 ? html`<span class="approx">a favor</span>` : ""}
      </span>
    </button>`;
  }
  return html`<button type="button" class="row account-row" data-action="account-detail" data-id="${account.id}">
    <span class="cat-bubble cat-bubble-md" style="--c:${account.color}" aria-hidden="true">${account.icon}</span>
    <span class="row-main">
      <span class="row-title">${account.name}</span>
      <span class="row-meta">${ACCOUNT_KINDS[account.kind]?.label || "Cuenta"} · ${account.currency}</span>
    </span>
    <span class="account-amount">
      <span class="account-balance ${balance < 0 ? "is-negative" : ""}">${formatMoney(balance, account.currency)}</span>
      ${account.currency !== main ? html`<span class="approx">≈ ${formatMoney(balanceMain, main)}</span>` : ""}
    </span>
  </button>`;
}

export default {
  id: "cuentas",
  tab: "mas",
  title: "Cuentas",
  back: "#/mas",
  render(state) {
    const main = state.settings.mainCurrency;
    const entries = accountBalances(state);
    const active = entries.filter((e) => !e.account.archived);
    const archived = entries.filter((e) => e.account.archived);
    const total = entries.reduce((s, e) => s + e.balanceMain, 0);
    const transfers = state.transactions
      .filter((t) => t.type === "transfer")
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    return html`
      <section class="summary-card summary-accounts reveal">
        <div>
          <p class="summary-label">Tu plata, sumando todas las cuentas</p>
          <p class="summary-amount" data-pulse="accounts-total">${formatMoney(total, main)}</p>
          <p class="summary-sub">${active.length} cuenta${active.length === 1 ? "" : "s"} activa${active.length === 1 ? "" : "s"}${archived.length ? ` · ${archived.length} archivada${archived.length === 1 ? "" : "s"}` : ""}</p>
        </div>
      </section>
      <div class="accounts-actions reveal">
        <button type="button" class="btn btn-primary btn-grow" data-action="add-transfer">${icon("swap", 18)} Mover plata</button>
        <button type="button" class="btn btn-soft" data-action="add-account">${icon("plus", 18)} Nueva cuenta</button>
      </div>
      <section class="card card-flush rows reveal">${active.map((e) => accountRow(state, e))}</section>
      ${archived.length
        ? html`<h2 class="section-title section-title-spaced">Archivadas</h2>
            <section class="card card-flush rows is-muted reveal">${archived.map((e) => accountRow(state, e))}</section>`
        : ""}
      ${transfers.length
        ? html`<section class="card reveal">
            <h2 class="section-title">Últimas transferencias</h2>
            <div class="tx-list">${transfers.map((t) => txRow(state, t, { withDate: true }))}</div>
          </section>`
        : ""}
      <p class="fine-print center">${icon("info", 14)} Mover plata entre cuentas no es un gasto: tu total no cambia.</p>
    `;
  },
};
