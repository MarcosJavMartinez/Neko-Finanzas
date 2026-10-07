// Transacciones: buscador y filtros en el header (como Neko Lista), selector
// de mes y todos los movimientos en UNA superficie blanca agrupados por día.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { txRow, emptyState, monthNav, segmented } from "../ui/components.js";
import { openSheet } from "../ui/sheet.js";
import { formatMoney } from "../core/money.js";
import { currentMonthKey, formatDayHeading, shiftMonthKey } from "../core/dates.js";
import { findCategory, findSubcategory, monthlyTotals, toMain, transactionsInMonth } from "../core/finance.js";
import { getState } from "../core/store.js";

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "income", label: "Ingresos" },
  { value: "expense", label: "Gastos" },
  { value: "bill", label: "Facturas" },
];

// Estado de la pantalla (no se guarda: vuelve a "este mes / todas").
const view = { month: currentMonthKey(), filter: "all", query: "", categoryId: "", accountId: "" };

function applyFilter(state, txs) {
  let list = txs;
  if (view.filter === "income") list = list.filter((t) => t.type === "income");
  if (view.filter === "expense") list = list.filter((t) => t.type === "expense" && !t.billId);
  if (view.filter === "bill") list = list.filter((t) => t.billId);
  if (view.filter === "transfer") list = list.filter((t) => t.type === "transfer");
  if (view.categoryId) list = list.filter((t) => t.categoryId === view.categoryId);
  if (view.accountId) list = list.filter((t) => t.accountId === view.accountId || t.toAccountId === view.accountId);
  const query = normalize(view.query);
  if (query) {
    const accountName = (id) => state.accounts.find((a) => a.id === id)?.name;
    list = list.filter((t) => {
      const category = findCategory(state, t.categoryId);
      const sub = findSubcategory(category, t.subcategoryId);
      return normalize([t.description, category?.name, sub?.name, accountName(t.accountId), accountName(t.toAccountId), t.type === "transfer" ? "transferencia" : t.type === "loan" ? "prestamo" : ""].join(" ")).includes(query);
    });
  }
  return list;
}

/** Sin mayúsculas ni tildes: "almacen" encuentra "Almacén". */
function normalize(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function openFilters() {
  const state = getState();
  const categories = state.categories;
  openSheet({
    title: "Filtrar movimientos",
    body: html`<form class="form" novalidate>
      <div class="field">
        <span class="field-label">Tipo</span>
        ${segmented("f-type", FILTERS, view.filter)}
      </div>
      ${state.accounts.length > 1
        ? html`<div class="field">
            <label class="field-label" for="f-acc">Cuenta</label>
            <select id="f-acc" name="f-acc">
              <option value="">Todas las cuentas</option>
              ${state.accounts.map((a) => html`<option value="${a.id}" ${a.id === view.accountId ? "selected" : ""}>${a.icon} ${a.name}</option>`)}
            </select>
          </div>`
        : ""}
      <div class="field">
        <label class="field-label" for="f-cat">Categoría</label>
        <select id="f-cat" name="f-cat">
          <option value="">Todas las categorías</option>
          ${["expense", "income"].map(
            (type) => html`<optgroup label="${type === "expense" ? "Gastos" : "Ingresos"}">
              ${categories.filter((c) => c.type === type).map((c) => html`<option value="${c.id}" ${c.id === view.categoryId ? "selected" : ""}>${c.icon} ${c.name}</option>`)}
            </optgroup>`
          )}
        </select>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-clear>Limpiar filtros</button>
        <button type="submit" class="btn btn-primary btn-grow">${icon("check", 18)}Aplicar</button>
      </div>
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        view.filter = form.elements["f-type"].value;
        view.categoryId = form.elements["f-cat"].value;
        view.accountId = form.elements["f-acc"]?.value || "";
        close();
        window.dispatchEvent(new Event("neko:rerender"));
      });
      form.querySelector("[data-clear]").addEventListener("click", () => {
        Object.assign(view, { filter: "all", categoryId: "", accountId: "", query: "" });
        close();
        window.dispatchEvent(new Event("neko:rerender"));
      });
    },
  });
}

export default {
  id: "transacciones",
  tab: "transacciones",
  title: "Transacciones",
  search: () => ({
    value: view.query,
    placeholder: "Buscar transacción...",
    input: "tx-search",
    filtersAction: "tx-filters",
    filtersOn: Boolean(view.categoryId || view.accountId),
  }),
  render(state) {
    const main = state.settings.mainCurrency;
    const totals = monthlyTotals(state, view.month);
    // Hasta qué mes se puede avanzar: este, o el último con algo programado.
    const lastMonth = state.transactions.reduce((max, t) => (t.date.slice(0, 7) > max ? t.date.slice(0, 7) : max), currentMonthKey());
    const txs = applyFilter(state, transactionsInMonth(state, view.month)).sort(
      (a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "") || b.createdAt.localeCompare(a.createdAt)
    );
    const groups = new Map();
    txs.forEach((tx) => groups.set(tx.date, [...(groups.get(tx.date) || []), tx]));
    const category = view.categoryId && findCategory(state, view.categoryId);
    const account = view.accountId && state.accounts.find((a) => a.id === view.accountId);
    const filtered = view.filter !== "all" || view.query || view.categoryId || view.accountId;
    const filters = state.accounts.length > 1 ? [...FILTERS, { value: "transfer", label: "Transferencias" }] : FILTERS;

    return html`
      <button type="button" class="btn btn-primary btn-block btn-add reveal" data-action="add-any">${icon("plus", 20)}Agregar</button>
      ${monthNav(view.month, "tx-month", lastMonth)}
      ${view.month > currentMonthKey() ? html`<p class="active-filter">${icon("calendar", 14)} Mes futuro: son movimientos programados, todavía no cuentan en tu saldo. <button type="button" class="chip chip-action" data-action="tx-today">Volver a este mes</button></p>` : ""}
      <div class="month-totals">
        <span class="mt mt-income">${icon("arrowDown", 14)}${formatMoney(totals.income, main)}</span>
        <span class="mt mt-expense">${icon("arrowUp", 14)}${formatMoney(totals.expense, main)}</span>
      </div>
      <div class="filter-chips" role="tablist" aria-label="Filtrar movimientos">
        ${filters.map(
          (f) => html`<button type="button" role="tab" class="chip chip-filter ${view.filter === f.value ? "is-active" : ""}" aria-selected="${view.filter === f.value}" data-action="tx-filter" data-value="${f.value}">${f.label}</button>`
        )}
      </div>
      ${category
        ? html`<p class="active-filter">Categoría: <strong>${category.icon} ${category.name}</strong> <button type="button" class="chip chip-action" data-action="tx-clear-category">${icon("close", 12)}Quitar</button></p>`
        : ""}
      ${account
        ? html`<p class="active-filter">Cuenta: <strong>${account.icon} ${account.name}</strong> <button type="button" class="chip chip-action" data-action="tx-clear-account">${icon("close", 12)}Quitar</button></p>`
        : ""}
      ${txs.length
        ? html`<section class="card tx-card reveal">
            <div class="tx-thead" aria-hidden="true"><span>Fecha</span><span>Descripción</span><span>Categoría</span><span>Cuenta</span><span>Monto</span></div>
            ${[...groups.entries()].map(([date, items]) => {
              // Las transferencias no suman ni restan: solo cambian de cuenta.
              const net = items.reduce((s, t) => s + (t.type === "transfer" || t.type === "loan" ? 0 : (t.type === "income" ? 1 : -1) * toMain(state, t.amount, t.currency)), 0);
              return html`<div class="day-group">
                <h3 class="day-head"><span>${formatDayHeading(date)}</span><span class="day-net">${formatMoney(net, main, { sign: true })}</span></h3>
                <div class="tx-list">${items.map((tx) => txRow(state, tx))}</div>
              </div>`;
            })}
          </section>`
        : html`<div class="card">${emptyState({
            art: filtered ? "neko-buscando" : "neko-anotando",
            title: filtered ? "No hay movimientos con estos filtros" : "Sin movimientos este mes",
            text: filtered ? "Probá con otra búsqueda, otro filtro o cambiá de mes." : "Registrá un ingreso o un gasto y va a aparecer acá.",
            actionLabel: filtered ? "" : "Agregar transacción",
            action: "add-expense",
            mood: "sleepy",
          })}</div>`}
    `;
  },
  actions: {
    "tx-month"(el) {
      view.month = shiftMonthKey(view.month, Number(el.dataset.delta));
      return true;
    },
    "tx-today"() {
      view.month = currentMonthKey();
      return true;
    },
    "tx-filter"(el) {
      view.filter = el.dataset.value;
      return true;
    },
    "tx-filters"() {
      openFilters();
    },
    "tx-clear-category"() {
      view.categoryId = "";
      return true;
    },
    "tx-clear-account"() {
      view.accountId = "";
      return true;
    },
  },
  inputs: {
    "tx-search"(el) {
      view.query = el.value;
      return true;
    },
  },
};
