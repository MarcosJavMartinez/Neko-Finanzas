// Reportes: el mes de un vistazo, en qué se fue el dinero y cómo viene
// evolucionando. Pocos gráficos, fáciles de leer.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { art, chartSize, emptyState, monthNav } from "../ui/components.js";
import { donutChart, barChart, lineChart } from "../ui/charts.js";
import { formatMoney } from "../core/money.js";
import { currentMonthKey, formatMonth, shiftMonthKey } from "../core/dates.js";
import { PALETTE } from "../data/defaults.js";
import { toast } from "../ui/toast.js";
import { shareMonthSummary } from "../ui/summaryImage.js";
import * as store from "../core/store.js";
import { balanceSummary, expensesByCategory, expensesBySubcategory, monthlySeries, monthlyTotals, percent } from "../core/finance.js";

const view = { month: currentMonthKey() };
const MAX_SLICES = 6;

export default {
  id: "reportes",
  tab: "mas",
  title: "Reportes",
  back: "#/mas",
  render(state) {
    const main = state.settings.mainCurrency;
    const m = (v, o) => formatMoney(v, main, o);
    const totals = monthlyTotals(state, view.month);
    const previous = monthlyTotals(state, shiftMonthKey(view.month, -1));
    const series = monthlySeries(state, 6, view.month);
    const byCategory = expensesByCategory(state, view.month);
    const isCurrent = view.month === currentMonthKey();
    const available = isCurrent ? balanceSummary(state).available : null;

    // Las categorías chicas se agrupan en "Otras" (nunca más de 7 colores).
    const top = byCategory.slice(0, MAX_SLICES);
    const rest = byCategory.slice(MAX_SLICES).reduce((s, x) => s + x.amount, 0);
    // Si dos categorías comparten color, la segunda toma el siguiente libre de
    // la paleta validada, para que ninguna porción se confunda con otra.
    const used = new Set();
    const sliceColor = (color) => {
      const pick = used.has(color) ? PALETTE.find((c) => !used.has(c)) || color : color;
      used.add(pick);
      return pick;
    };
    const slices = [
      ...top.map((x) => ({ label: `${x.category?.icon || ""} ${x.category?.name || "Sin categoría"}`, value: x.amount, color: sliceColor(x.category?.color || "#8b958e"), categoryId: x.categoryId })),
      ...(rest > 0 ? [{ label: "Otras", value: rest, color: "#9aa39d" }] : []),
    ];

    const change = previous.expense ? percent(totals.expense - previous.expense, previous.expense) : null;

    return html`
      ${monthNav(view.month, "report-month")}

      <section class="card report-summary reveal">
        <div class="report-tiles">
          <div class="stat stat-income"><span class="stat-label">${icon("arrowDown", 15)}Ingresos</span><span class="stat-value" data-pulse="income">${m(totals.income)}</span></div>
          <div class="stat stat-expense"><span class="stat-label">${icon("arrowUp", 15)}Gastos</span><span class="stat-value" data-pulse="expense">${m(totals.expense)}</span></div>
          <div class="stat stat-bill"><span class="stat-label">${icon("receipt", 15)}Facturas</span><span class="stat-value" data-pulse="bills">${m(totals.bills)}</span></div>
          <div class="stat stat-goal"><span class="stat-label">${icon("flag", 15)}A metas</span><span class="stat-value" data-pulse="goals">${m(totals.toGoals)}</span></div>
        </div>
        <div class="report-verdict ${totals.saved < 0 ? "is-negative" : ""}">
          <span>${totals.saved >= 0 ? "Ahorraste" : "Gastaste de más"}</span>
          <strong>${m(Math.abs(totals.saved))}</strong>
          ${totals.income > 0 ? html`<span class="muted-text">${Math.round(Math.abs(totals.savingsRate))}% de tus ingresos</span>` : ""}
        </div>
        ${available !== null ? html`<p class="fine-print">${icon("wallet", 14)} Disponible hoy: <strong>${m(available)}</strong></p>` : ""}
        ${change !== null
          ? html`<p class="fine-print">${icon(change > 0 ? "arrowUp" : "arrowDown", 14)} Gastaste ${Math.abs(Math.round(change))}% ${change > 0 ? "más" : "menos"} que en ${formatMonth(shiftMonthKey(view.month, -1)).split(" ")[0].toLowerCase()}.</p>`
          : ""}
        ${totals.income || totals.expense
          ? html`<button type="button" class="btn btn-soft btn-sm report-share" data-action="share-summary">${icon("share", 16)} Compartir resumen del mes</button>`
          : ""}
      </section>

      <section class="card report-donut reveal">
        <h2 class="section-title section-title-art">${art("ilus-grafico", 48)}¿En qué se fue el dinero?</h2>
        ${slices.length
          ? html`<div class="donut-wrap">
              ${donutChart(slices, { currency: main, centerLabel: "Gastos", centerValue: formatMoney(totals.expense, main) })}
              <ul class="cat-breakdown">
                ${slices.map((s) => {
                  const row = html`<span class="legend-swatch" style="--c:${s.color}"></span>
                    <span class="cb-name">${s.label}</span>
                    <span class="cb-pct">${Math.round(percent(s.value, totals.expense))}%</span>
                    <span class="cb-amount">${m(s.value)}</span>`;
                  // Si la categoría tiene gastos con subcategoría, se puede abrir el detalle.
                  const subs = s.categoryId ? expensesBySubcategory(state, view.month, s.categoryId) : [];
                  if (!subs.some((x) => x.sub)) return html`<li class="cb-row">${row}<span class="cb-toggle"></span></li>`;
                  return html`<li><details class="cb-details">
                    <summary class="cb-row">${row}<span class="cb-toggle">${icon("chevronRight", 16)}</span></summary>
                    <ul class="cb-subs">
                      ${subs.map(
                        (x) => html`<li>
                          <span class="cb-sub-name">${x.sub ? html`${x.sub.icon ? html`<span aria-hidden="true">${x.sub.icon}</span> ` : ""}${x.sub.name}` : html`<span class="muted-text">Sin subcategoría</span>`}</span>
                          <span class="cb-pct">${Math.round(percent(x.amount, s.value))}%</span>
                          <span class="cb-amount">${m(x.amount)}</span>
                        </li>`
                      )}
                    </ul>
                  </details></li>`;
                })}
              </ul>
            </div>`
          : emptyState({ art: "neko-grafico", title: "Sin gastos este mes", text: "Cuando registres gastos vas a ver cómo se reparten.", compact: true, mood: "sleepy" })}
      </section>

      <section class="card report-bars reveal">
        <h2 class="section-title">Ingresos y gastos</h2>
        <p class="section-sub">Últimos 6 meses</p>
        ${barChart(
          series.map((s) => ({ label: formatMonth(s.key, { short: true }), income: s.income, expense: s.expense, current: s.key === view.month })),
          { currency: main, ...chartSize("bars") }
        )}
      </section>

      <section class="card report-line reveal">
        <h2 class="section-title">Evolución de tu dinero</h2>
        <p class="section-sub">Dinero total a fin de cada mes</p>
        ${lineChart(series.map((s) => ({ label: formatMonth(s.key, { short: true }), value: s.balanceEnd })), { currency: main, ...chartSize("line") })}
      </section>

      <details class="card reveal table-toggle">
        <summary>${icon("list", 16)} Ver como tabla</summary>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>A metas</th><th>Total</th></tr></thead>
            <tbody>${series.map((s) => html`<tr><td>${formatMonth(s.key, { short: true })}</td><td>${m(s.income)}</td><td>${m(s.expense)}</td><td>${m(s.toGoals)}</td><td>${m(s.balanceEnd)}</td></tr>`)}</tbody>
          </table>
        </div>
      </details>
    `;
  },
  actions: {
    async "share-summary"(el) {
      el.disabled = true;
      el.classList.add("is-busy");
      try {
        const result = await shareMonthSummary(store.getState(), view.month);
        if (result === "downloaded") toast("Imagen del resumen descargada");
      } catch (error) {
        toast("No se pudo generar la imagen", { type: "error" });
      } finally {
        el.disabled = false;
        el.classList.remove("is-busy");
      }
    },
    "report-month"(el) {
      view.month = shiftMonthKey(view.month, Number(el.dataset.delta));
      return true;
    },
  },
};
