// Metas de ahorro: crear/editar, ver detalle y mover dinero (depositar o
// retirar). Depositar no es un gasto: el dinero sigue siendo del usuario,
// solo queda apartada y deja de contar como "disponible".

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
import { toast } from "../toast.js";
import { approx, progressBar } from "../components.js";
import {
  amountField,
  textField,
  dateField,
  emojiPicker,
  colorPicker,
  formActions,
  readForm,
  readAmount,
  fieldError,
  clearErrors,
} from "./fields.js";
import * as store from "../../core/store.js";
import { formatDate, todayISO } from "../../core/dates.js";
import { isISODate } from "../../core/sanitize.js";
import { amountToInput, formatMoney, convert, zeroAmount, symbolOf } from "../../core/money.js";
import { balanceSummary, goalMonthlyNeeded, goalProgress } from "../../core/finance.js";

const GOAL_ICONS = ["✈️", "🏖️", "🎮", "💻", "📱", "👕", "👟", "🛟", "🏠", "🚗", "🎓", "💍", "🎸", "📷", "🐱", "🎁", "🏋️", "🎯"];

export function openGoalForm({ goal } = {}) {
  const state = store.getState();
  const isEdit = Boolean(goal);
  const current = goal || { name: "", icon: "🎯", color: "#8a63d2", target: null, currency: state.settings.mainCurrency, targetDate: "" };

  openSheet({
    title: isEdit ? "Editar meta" : "Nueva meta",
    body: html`<form class="form" novalidate>
      ${textField({ name: "name", label: "¿Para qué estás ahorrando?", value: current.name, required: true, placeholder: "Ej.: Viaje a Europa" })}
      ${amountField({ name: "target", label: "Monto objetivo", value: current.target, currency: current.currency, autofocus: false, tone: "tone-goal" })}
      ${dateField({ name: "targetDate", label: "Fecha objetivo", value: current.targetDate, required: false })}
      ${emojiPicker(current.icon, { choices: GOAL_ICONS })}
      ${colorPicker(current.color)}
      ${isEdit ? html`<p class="field-hint">Para agregar o retirar dinero usa “Depositar” o “Retirar” en el detalle de la meta.</p>` : ""}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear meta", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const target = readAmount(form, "target");
        if (!data.name.trim()) return fieldError(form, "name", "Escribe un nombre para tu meta.");
        if (!(target > 0)) return fieldError(form, "target", "Ingresa cuánto quieres reunir.");
        const values = {
          name: data.name.trim(),
          icon: data.icon || current.icon,
          color: data.color,
          target,
          currency: data.currency,
          targetDate: isISODate(data.targetDate) ? data.targetDate : "",
        };
        if (isEdit) {
          // Si cambia la moneda, el historial se convierte para no perder lo acumulado.
          if (values.currency !== goal.currency) {
            const rates = store.getState().rates;
            values.movements = goal.movements.map((m) => ({ ...m, amount: Math.round(convert(m.amount, goal.currency, values.currency, rates) * 100) / 100 }));
          }
          store.updateGoal(goal.id, values);
          toast("Meta actualizada");
        } else {
          store.addGoal(values);
          toast(`Meta “${values.name}” creada ✨`);
        }
        close();
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const saved = goalProgress(goal).saved;
        const ok = await confirmDialog({
          title: `¿Eliminar “${goal.name}”?`,
          text: saved > 0
            ? `Los ${formatMoney(saved, goal.currency)} apartados vuelven a tu saldo disponible.`
            : "La meta no tiene dinero apartado.",
          confirmLabel: "Eliminar meta",
          danger: true,
        });
        if (!ok) return;
        const backup = store.snapshot();
        store.deleteGoal(goal.id);
        close();
        toast("Meta eliminada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** direction: "deposit" | "withdraw" */
export function openGoalMove(goalId, direction = "deposit") {
  const state = store.getState();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;
  const isDeposit = direction === "deposit";
  const { saved } = goalProgress(goal);
  const available = balanceSummary(state).available;
  const availableInGoal = convert(available, state.settings.mainCurrency, goal.currency, state.rates);

  openSheet({
    title: isDeposit ? `Depositar en ${goal.name}` : `Retirar de ${goal.name}`,
    body: html`<form class="form" novalidate>
      <p class="sheet-text">${isDeposit
        ? html`Este dinero queda <strong>apartado</strong> para tu meta: sigue siendo tuyo, pero deja de contar como disponible.`
        : html`Lo que retires vuelve a tu <strong>saldo disponible</strong>. Tienes ${formatMoney(saved, goal.currency)} en esta meta.`}</p>
      <div class="field field-amount tone-${isDeposit ? "goal" : "income"}">
        <label class="field-label" for="f-amount">Monto en ${goal.currency}</label>
        <div class="amount-input">
          <span class="amount-currency amount-currency-static">${symbolOf(goal.currency)}</span>
          <input id="f-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="${zeroAmount()}" data-autofocus required />
        </div>
        <p class="field-error" data-error-for="amount"></p>
        ${isDeposit ? html`<p class="field-hint">Disponible ahora: ${formatMoney(availableInGoal, goal.currency)}</p>` : ""}
      </div>
      <div class="quick-amounts">
        ${(isDeposit ? quickDeposits(goal) : [saved / 4, saved / 2, saved].map((v) => Math.floor(v))).filter((v) => v > 0).map(
          (v) => html`<button type="button" class="chip chip-action" data-quick="${v}">${formatMoney(v, goal.currency)}</button>`
        )}
      </div>
      ${textField({ name: "note", label: "Nota", placeholder: isDeposit ? "Ej.: Ahorro de septiembre" : "Ej.: Anticipo del viaje" })}
      <p class="notice notice-warn" data-warning hidden>${icon("alert", 16)}<span></span></p>
      ${formActions({ submitLabel: isDeposit ? "Depositar" : "Retirar" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      const warning = form.querySelector("[data-warning]");
      const checkWarning = () => {
        const amount = readAmount(form);
        const show = isDeposit && amount > availableInGoal;
        warning.hidden = !show;
        if (show) warning.querySelector("span").textContent = "Es más que tu saldo disponible. Puedes hacerlo igual, pero tu disponible quedaría en negativo.";
      };
      form.elements.amount.addEventListener("input", checkWarning);
      form.addEventListener("click", (event) => {
        const quick = event.target.closest("[data-quick]");
        if (!quick) return;
        form.elements.amount.value = amountToInput(Number(quick.dataset.quick));
        checkWarning();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresa un monto mayor a cero.");
        if (!isDeposit && amount > saved + 0.001) return fieldError(form, "amount", `No puedes retirar más de lo que tiene la meta (${formatMoney(saved, goal.currency)}).`);
        const backup = store.snapshot();
        store.moveGoalMoney(goal.id, isDeposit ? amount : -amount, form.elements.note.value.trim());
        close();
        const after = goalProgress(store.getState().goals.find((g) => g.id === goal.id));
        const message = isDeposit
          ? after.done
            ? `¡Llegaste a tu meta “${goal.name}”! 🎉`
            : `${formatMoney(amount, goal.currency)} apartados para “${goal.name}”`
          : `${formatMoney(amount, goal.currency)} volvieron a tu disponible`;
        toast(message, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

function quickDeposits(goal) {
  const { remaining } = goalProgress(goal);
  const step = goal.currency === "ARS" ? 10000 : 50;
  return [step, step * 5, remaining].map((v) => Math.round(v * 100) / 100).filter((v, i, list) => v > 0 && list.indexOf(v) === i && v <= remaining);
}

export function openGoalDetail(goalId) {
  const state = store.getState();
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return;
  const p = goalProgress(goal);
  const monthly = goalMonthlyNeeded(goal, todayISO());
  const movements = [...goal.movements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  openSheet({
    title: goal.name,
    body: html`<div class="detail">
      <div class="goal-detail-hero" style="--c:${goal.color}">
        <span class="cat-bubble cat-bubble-xl is-tinted" style="--c:${goal.color}">${goal.icon}</span>
        <p class="goal-detail-amount"><strong>${formatMoney(p.saved, goal.currency)}</strong> <span>/ ${formatMoney(goal.target, goal.currency)}</span></p>
        ${approx(state, p.saved, goal.currency)}
        ${progressBar(p.pct, { color: goal.color, level: p.done ? "done" : "ok", label: `Progreso de ${goal.name}` })}
        <p class="goal-detail-meta">${p.done
          ? "¡Meta cumplida! 🎉"
          : html`${Math.floor(p.pct)}% · faltan ${formatMoney(p.remaining, goal.currency)}${monthly ? html` · ${formatMoney(monthly, goal.currency)}/mes hasta el ${formatDate(goal.targetDate, { withYear: true })}` : ""}`}</p>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn btn-primary btn-grow" data-do="deposit">${icon("plus", 18)}Depositar</button>
        <button type="button" class="btn btn-ghost btn-grow" data-do="withdraw" ${p.saved > 0 ? "" : "disabled"}>${icon("minus", 18)}Retirar</button>
        <button type="button" class="icon-btn icon-btn-soft" data-do="edit" aria-label="Editar meta">${icon("edit", 18)}</button>
      </div>
      <h3 class="detail-subtitle">Historial</h3>
      ${movements.length
        ? html`<ul class="mini-list">${movements.map(
            (m) => html`<li>
              <span>${formatDate(m.date, { withYear: true })}${m.note ? html` · <span class="muted-text">${m.note}</span>` : ""}</span>
              <span class="mini-list-end">
                <span class="${m.amount > 0 ? "is-goal" : "is-income"}">${formatMoney(m.amount, goal.currency, { sign: true })}</span>
                <button type="button" class="icon-btn icon-btn-xs" data-do="del-move" data-id="${m.id}" aria-label="Borrar movimiento">${icon("close", 14)}</button>
              </span>
            </li>`
          )}</ul>`
        : html`<p class="muted-text">Todavía no depositaste en esta meta. ¡El primer paso es el más importante!</p>`}
    </div>`,
    onMount(panel, close) {
      panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-do]");
        if (!button) return;
        const action = button.dataset.do;
        if (action === "del-move") {
          const backup = store.snapshot();
          store.deleteGoalMovement(goal.id, button.dataset.id);
          close();
          toast("Movimiento borrado", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
          return;
        }
        close();
        if (action === "edit") openGoalForm({ goal });
        else openGoalMove(goal.id, action);
      });
    },
  });
}
