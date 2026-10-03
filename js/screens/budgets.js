// Presupuestos del mes: cuánto se usó de cada uno, con avisos suaves.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { emptyState, monthNav, progressBar, statusChip } from "../ui/components.js";
import { stackBar } from "../ui/charts.js";
import { formatMoney } from "../core/money.js";
import { currentMonthKey, formatMonth, shiftMonthKey } from "../core/dates.js";
import { budgetsOverview } from "../core/finance.js";

const view = { month: currentMonthKey() };

const LEVEL_TEXT = {
  ok: "En orden",
  near: "Cerca del límite",
  over: "Superado",
  done: "¡Objetivo cumplido!",
};

export default {
  id: "presupuestos",
  tab: "mas",
  title: "Presupuestos",
  back: "#/mas",
  render(state) {
    const main = state.settings.mainCurrency;
    if (!state.budgets.length) {
      return html`<div class="card">${emptyState({
        title: "Sin presupuestos todavía",
        text: "Repartí tus ingresos, reservá lo del súper del mes o ponete un límite de gustos por día.",
        actionLabel: "Crear presupuesto",
        action: "add-budget",
      })}</div>`;
    }
    const overview = budgetsOverview(state, view.month);
    const baseText =
      overview.base.source === "income"
        ? `Sobre tus ingresos de ${formatMonth(view.month)}: ${formatMoney(overview.base.amount, main)}`
        : overview.base.source === "reference"
          ? `Todavía no hay ingresos este mes: se usa tu ingreso de referencia (${formatMoney(overview.base.amount, main)}).`
          : "Todavía no hay ingresos este mes: los presupuestos en % valen $0 hasta que cargues uno (o definí un ingreso de referencia en Configuración).";
    const unassigned = Math.max(0, 100 - overview.assignedPct);

    return html`
      ${monthNav(view.month, "budget-month")}
      <section class="card reveal">
        <div class="section-head"><h2 class="section-title">Cómo repartís tus ingresos</h2>
          <button type="button" class="section-link" data-action="add-budget">${icon("plus", 16)}Nuevo</button></div>
        ${stackBar([
          ...overview.items.map((i) => ({ label: i.budget.name, value: Math.max(0.0001, (i.limit / (overview.base.amount || 1)) * 100), color: i.budget.color, tip: formatMoney(i.limit, main) })),
          { label: "Sin asignar", value: unassigned, color: "var(--track-strong)", tip: `${Math.round(unassigned)}%` },
        ])}
        <ul class="legend legend-wrap">
          ${overview.items.map((i) => html`<li class="legend-item"><span class="legend-swatch" style="--c:${i.budget.color}"></span>${i.budget.name} <span class="muted-text">${i.budget.mode === "percent" ? `${i.budget.value}%` : i.budget.mode === "daily" ? `${formatMoney(i.budget.value, i.budget.currency)} por día` : formatMoney(i.budget.value, i.budget.currency)}</span></li>`)}
        </ul>
        <p class="fine-print">${icon("info", 14)} ${baseText}${overview.assignedPct > 100.5 ? html` <strong class="text-warn">Asignaste ${Math.round(overview.assignedPct)}%: más de lo que entra.</strong>` : ""}</p>
      </section>
      <div class="budget-list">
        ${overview.items.map((i) => {
          const isGoal = i.budget.target.kind === "goal";
          return html`<button type="button" class="card budget-card reveal level-${i.level}" data-action="edit-budget" data-id="${i.budget.id}">
            <span class="budget-top">
              <span class="cat-bubble cat-bubble-md" style="--c:${i.budget.color}">${i.budget.icon}</span>
              <span class="row-main">
                <span class="row-title">${i.budget.name}${i.budget.reserve ? html` <span class="tag tag-bill">${icon("lock", 12)}Reservado</span>` : ""}</span>
                <span class="row-meta">${isGoal ? "Ahorrado" : "Gastado"} ${formatMoney(i.spent, main)} de ${formatMoney(i.limit, main)}</span>
              </span>
              <span class="budget-pct">${Math.round(i.pct)}%</span>
            </span>
            ${progressBar(i.pct, { color: i.budget.color, level: i.level, label: i.budget.name })}
            <span class="budget-foot">${i.level !== "ok" ? statusChip(i.level, LEVEL_TEXT[i.level]) : ""}${i.level === "over"
              ? `Te pasaste ${formatMoney(-i.remaining, main)}. No pasa nada: tomalo como dato para el mes que viene.`
              : i.level === "done"
                ? "¡Separaste lo que te propusiste!"
                : isGoal
                  ? `Faltan ${formatMoney(i.remaining, main)} para el objetivo del mes`
                  : `Te quedan ${formatMoney(i.remaining, main)}`}</span>
          </button>`;
        })}
      </div>
    `;
  },
  actions: {
    "budget-month"(el) {
      view.month = shiftMonthKey(view.month, Number(el.dataset.delta));
      return true;
    },
  },
};
