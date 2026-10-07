// Lo que sobró de un presupuesto reservado el mes pasado (por ejemplo, del
// súper): elegir a qué meta pasarlo. La app lo ofrece, no lo mueve sola.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, whenHistorySettled } from "../sheet.js";
import { toast } from "../toast.js";
import { formActions, fieldError, clearErrors } from "./fields.js";
import { openGoalForm } from "./goalForms.js";
import * as store from "../../core/store.js";
import { formatMonth } from "../../core/dates.js";
import { MAX_AMOUNT } from "../../core/sanitize.js";
import { amountToInput, formatMoney, parseAmount, symbolOf } from "../../core/money.js";
import { billCushion, budgetLeftovers, goalProgress } from "../../core/finance.js";

export function openLeftoverSheet(budgetId) {
  const state = store.getState();
  const leftover = budgetLeftovers(state).find((l) => l.budget.id === budgetId);
  if (!leftover) return;
  const main = state.settings.mainCurrency;
  const { budget, month, amount } = leftover;

  openSheet({
    title: `Sobrante de ${budget.name}`,
    body: state.goals.length
      ? html`<form class="form" novalidate>
          <p class="sheet-text">En ${formatMonth(month).toLowerCase()} te sobraron <strong>${formatMoney(amount, main)}</strong>. Pasalos a una meta y quedan apartados como ahorro.</p>
          <div class="field">
            <label class="field-label" for="f-goalId">¿A qué meta?</label>
            <select id="f-goalId" name="goalId">
              ${state.goals.map((g) => html`<option value="${g.id}">${g.icon} ${g.name} · faltan ${formatMoney(goalProgress(g).remaining, g.currency)}</option>`)}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="f-amount">¿Cuánto?</label>
            <div class="amount-input">
              <span class="amount-currency amount-currency-static">${symbolOf(main)}</span>
              <input id="f-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" value="${amountToInput(amount)}" />
            </div>
            <p class="field-hint">Si pasás menos, el resto queda en tu disponible.</p>
            <p class="field-error" data-error-for="amount"></p>
          </div>
          ${formActions({ submitLabel: "Pasar a la meta" })}
        </form>`
      : html`<p class="sheet-text">En ${formatMonth(month).toLowerCase()} te sobraron <strong>${formatMoney(amount, main)}</strong>. Para pasarlos a tus ahorros, primero creá una meta.</p>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" data-sheet-close>Ahora no</button>
            <button type="button" class="btn btn-primary btn-grow" data-new-goal>${icon("plus", 18)}Crear una meta</button>
          </div>`,
    onMount(panel, close) {
      panel.querySelector("[data-new-goal]")?.addEventListener("click", () => {
        close();
        whenHistorySettled(() => openGoalForm());
      });
      const form = panel.querySelector("form");
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const value = parseAmount(form.elements.amount.value);
        if (!(value > 0) || value > MAX_AMOUNT) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (value > amount + 0.005) return fieldError(form, "amount", `Es más de lo que sobró (${formatMoney(amount, main)}).`);
        const goal = store.getState().goals.find((g) => g.id === form.elements.goalId.value);
        const backup = store.snapshot();
        store.settleBudgetLeftover(budget.id, month, { goalId: goal.id, amount: Math.round(value * 100) / 100, note: `Sobrante de ${budget.name} (${formatMonth(month).toLowerCase()})` });
        close();
        toast(`${formatMoney(value, main)} pasaron a “${goal.name}”`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** Pasar a una meta lo guardado en el fondo de facturas (todo o una parte). */
export function openCushionSheet() {
  const state = store.getState();
  const main = state.settings.mainCurrency;
  const amount = billCushion(state).amount;
  if (!(amount > 0)) return;

  openSheet({
    title: "Fondo de facturas",
    body: state.goals.length
      ? html`<form class="form" novalidate>
          <p class="sheet-text">Tenés <strong>${formatMoney(amount, main)}</strong> guardados de facturas que vinieron por menos. Lo que pases a una meta deja de cubrir tus próximas facturas y queda apartado como ahorro.</p>
          <div class="field">
            <label class="field-label" for="f-goalId">¿A qué meta?</label>
            <select id="f-goalId" name="goalId">
              ${state.goals.map((g) => html`<option value="${g.id}">${g.icon} ${g.name} · faltan ${formatMoney(goalProgress(g).remaining, g.currency)}</option>`)}
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="f-amount">¿Cuánto?</label>
            <div class="amount-input">
              <span class="amount-currency amount-currency-static">${symbolOf(main)}</span>
              <input id="f-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" value="${amountToInput(amount)}" />
            </div>
            <p class="field-hint">Si pasás menos, el resto sigue en el fondo.</p>
            <p class="field-error" data-error-for="amount"></p>
          </div>
          ${formActions({ submitLabel: "Pasar a la meta" })}
        </form>`
      : html`<p class="sheet-text">Tenés <strong>${formatMoney(amount, main)}</strong> en el fondo. Para pasarlos a tus ahorros, primero creá una meta.</p>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" data-sheet-close>Ahora no</button>
            <button type="button" class="btn btn-primary btn-grow" data-new-goal>${icon("plus", 18)}Crear una meta</button>
          </div>`,
    onMount(panel, close) {
      panel.querySelector("[data-new-goal]")?.addEventListener("click", () => {
        close();
        whenHistorySettled(() => openGoalForm());
      });
      const form = panel.querySelector("form");
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const value = parseAmount(form.elements.amount.value);
        if (!(value > 0) || value > MAX_AMOUNT) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (value > amount + 0.005) return fieldError(form, "amount", `Es más de lo que hay en el fondo (${formatMoney(amount, main)}).`);
        const goal = store.getState().goals.find((g) => g.id === form.elements.goalId.value);
        const backup = store.snapshot();
        store.moveCushionToGoal(goal.id, Math.round(value * 100) / 100);
        close();
        toast(`${formatMoney(value, main)} del fondo pasaron a “${goal.name}”`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}
