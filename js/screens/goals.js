// Metas de ahorro: lo apartado en total y el progreso de cada meta.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { art, goalCard, emptyState } from "../ui/components.js";
import { formatMoney } from "../core/money.js";
import { goalProgress, totalInGoals, toMain } from "../core/finance.js";

export default {
  id: "metas",
  tab: "metas",
  title: "Metas",
  render(state) {
    const main = state.settings.mainCurrency;
    const active = state.goals.filter((g) => !goalProgress(g).done);
    const done = state.goals.filter((g) => goalProgress(g).done);
    const saved = totalInGoals(state);
    const target = state.goals.reduce((s, g) => s + toMain(state, g.target, g.currency), 0);

    if (!state.goals.length) {
      return html`<div class="card">${emptyState({
        art: "neko-ahorrando",
        title: "Todavía no tienes metas",
        text: "Crea una y empieza a separar dinero para eso que quieres.",
        actionLabel: "Crear mi primera meta",
        action: "add-goal",
      })}</div>`;
    }

    return html`
      <section class="summary-card summary-goal has-art reveal">
        ${art("ilus-alcancia", 84, "summary-art")}
        <div class="summary-text">
          <p class="summary-label">Apartado en metas</p>
          <p class="summary-amount">${formatMoney(saved, main)}</p>
          <p class="summary-sub">de ${formatMoney(target, main)} entre ${state.goals.length} meta${state.goals.length === 1 ? "" : "s"}</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="add-goal">${icon("plus", 18)}Nueva meta</button>
      </section>
      ${active.length ? html`<div class="goal-list">${active.map((g) => goalCard(state, g))}</div>` : ""}
      ${done.length
        ? html`<h2 class="section-title section-title-spaced section-title-art">${art("neko-festejando", 56)}Cumplidas</h2><div class="goal-list">${done.map((g) => goalCard(state, g))}</div>`
        : ""}
      <p class="fine-print center">${icon("info", 14)} Apartar dinero para una meta no es un gasto: sigue en tu dinero total, pero no cuenta como disponible.</p>
    `;
  },
};
