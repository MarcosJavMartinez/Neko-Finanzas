// Presupuestos mensuales: por porcentaje de los ingresos o monto fijo, y
// aplicados a categorías de gasto, a una meta (ahorro) o "al resto".

import { budgetStatus } from "../../core/finance.js";
import { currentMonthKey, shiftMonthKey, formatMonth, midSentence } from "../../core/dates.js";
import { msg, tr } from "../../core/i18n.js";
import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog, whenHistorySettled } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented, currencyOptions } from "../components.js";
import {
  categoryPicker,
  textField,
  emojiPicker,
  colorPicker,
  formActions,
  readForm,
  readAmount,
  fieldError,
  clearErrors,
} from "./fields.js";
import * as store from "../../core/store.js";
import { amountToInput, parseAmount, zeroAmount, formatMoney, convert } from "../../core/money.js";

const BUDGET_ICONS = ["🧾", "🛒", "🍔", "✈️", "👕", "🛟", "🎮", "🏠", "🚗", "💊", "🎁", "📚", "🐱", "💰", "🎯", "✨"];

const VALUE_LABEL = { fixed: "¿Cuánto por mes?", percent: "¿Qué porcentaje de tus ingresos?", daily: "¿Cuánto por día?" };

/** Presupuesto sugerido para "gustos por día". */
const TREATS_PRESET = { name: "Gustos", icon: "☕", color: "#d99a2b", mode: "daily", reserve: true, target: { kind: "categories", categoryIds: ["exp-comida", "exp-entretenimiento"] } };

export function openBudgetForm({ budget, preset } = {}) {
  const state = store.getState();
  const isEdit = Boolean(budget);
  const current = budget || {
    name: "",
    icon: "🎯",
    color: "#4a63dd",
    mode: "fixed",
    value: null,
    currency: state.settings.mainCurrency,
    target: { kind: "categories", categoryIds: [] },
    reserve: false,
    ...(preset === "daily" ? TREATS_PRESET : {}),
  };
  const hasRest = state.budgets.some((b) => b.target.kind === "rest" && b.id !== budget?.id);
  // Lo simple a la vista (nombre, cuánto por mes y en qué); el resto queda en
  // "Más opciones", que se abre sola si el presupuesto ya usa algo de eso.
  const advanced = current.mode !== "fixed" || current.target.kind !== "categories" || current.reserve;

  openSheet({
    title: isEdit ? "Editar presupuesto" : "Nuevo presupuesto",
    body: html`<form class="form" novalidate>
      ${textField({ name: "name", label: "Nombre", value: current.name, required: true, placeholder: "Ej.: Salidas" })}
      <div class="field field-amount">
        <label class="field-label" for="f-value" data-value-label>${VALUE_LABEL[current.mode]}</label>
        <div class="amount-input">
          <select name="currency" class="amount-currency" aria-label="Moneda" data-fixed-only ${current.mode !== "percent" ? "" : "hidden"}>${currencyOptions(current.currency)}</select>
          <input id="f-value" name="value" type="text" inputmode="decimal" autocomplete="off" placeholder="${current.mode === "percent" ? "25" : zeroAmount()}" value="${current.value ? (current.mode === "percent" ? String(current.value).replace(".", ",") : amountToInput(current.value)) : ""}" ${current.mode === "percent" ? "data-plain" : ""} required />
          <span class="amount-suffix" data-percent-only ${current.mode === "percent" ? "" : "hidden"}>%</span>
        </div>
        <p class="field-error" data-error-for="value"></p>
      </div>
      <div data-kind-panel="categories" ${current.target.kind === "categories" ? "" : "hidden"}>
        ${categoryPicker(state, "expense", null, { name: "categoryIds", multiple: true, selectedIds: current.target.categoryIds || [] })}
      </div>
      <div data-kind-panel="goal" ${current.target.kind === "goal" ? "" : "hidden"}>
        ${state.goals.length
          ? html`<div class="field"><label class="field-label" for="f-goal">Meta</label><select id="f-goal" name="goalId">
              ${state.goals.map((g) => html`<option value="${g.id}" ${g.id === current.target.goalId ? "selected" : ""}>${g.icon} ${g.name}</option>`)}
            </select><p class="field-hint">Cuenta lo que deposites en la meta durante el mes.</p><p class="field-error" data-error-for="goalId"></p></div>`
          : html`<p class="notice notice-info">Primero crea una meta para poder asignarle un presupuesto.</p>`}
      </div>
      <div data-kind-panel="rest" ${current.target.kind === "rest" ? "" : "hidden"}>
        <p class="field-hint">Incluye todos los gastos cuyas categorías no estén en otro presupuesto.</p>
      </div>
      <details class="more-options" ${advanced ? "open" : ""}>
        <summary>${icon("settings", 16)} Más opciones</summary>
        <div class="more-options-body">
          <div class="field">
            <span class="field-label">¿Cómo lo quieres definir?</span>
            ${segmented("mode", [{ value: "fixed", label: "Por mes" }, { value: "percent", label: "% de ingresos" }, { value: "daily", label: "Por día" }], current.mode)}
            <p class="field-hint" data-daily-only ${current.mode === "daily" ? "" : "hidden"}>Para gustos (un café, un helado): un monto por día. Lo que no gastas un día se acumula para los siguientes.</p>
          </div>
          <div class="field">
            <span class="field-label">Se aplica a</span>
            ${segmented(
              "kind",
              [
                { value: "categories", label: "Categorías" },
                { value: "goal", label: "Una meta" },
                ...(hasRest ? [] : [{ value: "rest", label: "Todo lo demás" }]),
              ],
              current.target.kind
            )}
          </div>
          <label class="toggle-field" data-reserve-box ${current.target.kind === "goal" ? "hidden" : ""}>
            <span><span class="toggle-label">Reservar este dinero</span><span class="field-hint">Lo que te falta gastar este mes se descuenta de tu disponible. Si a fin de mes sobra, te ofrecemos pasarlo a una meta. Úsalo para gastos que no son facturas (supermercado, combustible, gustos).</span></span>
            <input type="checkbox" name="reserve" class="switch" ${current.reserve ? "checked" : ""} />
          </label>
          ${emojiPicker(current.icon, { choices: current.icon && !BUDGET_ICONS.includes(current.icon) ? [current.icon, ...BUDGET_ICONS] : BUDGET_ICONS })}
          ${colorPicker(current.color)}
        </div>
      </details>
      ${isEdit && budget.reserve && budget.target.kind !== "goal" ? pauseBox(budget) : ""}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear presupuesto", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.querySelector("[data-pause-box]")?.addEventListener("click", (event) => {
        const what = event.target.closest("[data-pause]")?.dataset.pause;
        if (!what) return;
        if (what === "open") {
          close();
          return whenHistorySettled(() => openPauseSheet(budget.id));
        }
        const backup = store.snapshot();
        store.pauseBudget(budget.id, "");
        close();
        toast("Listo, este mes vuelve a reservarse", { type: "info", actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
      form.addEventListener("change", (event) => {
        if (event.target.name === "mode") {
          const fixed = event.target.value !== "percent";
          form.querySelector("[data-fixed-only]").hidden = !fixed;
          form.querySelector("[data-percent-only]").hidden = fixed;
          form.querySelector("[data-daily-only]").hidden = event.target.value !== "daily";
          form.querySelector("[data-value-label]").textContent = tr(VALUE_LABEL[event.target.value]);
          const field = form.elements.value;
          field.placeholder = fixed ? zeroAmount() : "25";
          // El porcentaje se escribe tal cual; el monto, con centavos.
          const typed = parseAmount(field.value);
          if (fixed === field.hasAttribute("data-plain") && typed > 0) field.value = fixed ? amountToInput(typed) : String(typed).replace(".", ",");
          field.toggleAttribute("data-plain", !fixed);
          // Los gustos por día vienen con el dinero reservado.
          if (event.target.value === "daily") form.elements.reserve.checked = true;
        }
        if (event.target.name === "kind") {
          form.querySelectorAll("[data-kind-panel]").forEach((p) => (p.hidden = p.dataset.kindPanel !== event.target.value));
          form.querySelector("[data-reserve-box]").hidden = event.target.value === "goal";
        }
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const value = readAmount(form, "value");
        if (!data.name.trim()) return fieldError(form, "name", "Escribe un nombre para el presupuesto.");
        if (!(value > 0)) return fieldError(form, "value", "Ingresa un valor mayor a cero.");
        if (data.mode === "percent" && value > 100) return fieldError(form, "value", "El porcentaje no puede superar 100%.");
        let target;
        // "Por día" es para gastos chicos del día a día: no aplica a una meta.
        if (data.kind === "goal" && data.mode === "daily") return toast("Los presupuestos por día se aplican a categorías de gasto, no a una meta", { type: "error" });
        if (data.kind === "goal") {
          // Sin metas no hay a qué asignarlo: se avisa (el campo ni siquiera existe).
          if (!data.goalId) return store.getState().goals.length ? fieldError(form, "goalId", "Elige una meta.") : toast("Primero crea una meta para asignarle un presupuesto", { type: "error" });
          target = { kind: "goal", goalId: data.goalId };
        } else if (data.kind === "rest") {
          target = { kind: "rest" };
        } else {
          const ids = [].concat(data.categoryIds || []);
          if (!ids.length) return fieldError(form, "categoryIds", "Elige al menos una categoría.");
          target = { kind: "categories", categoryIds: ids };
        }
        store.saveBudget({
          ...(isEdit ? { id: budget.id } : {}),
          name: data.name.trim(),
          icon: data.icon || current.icon,
          color: data.color,
          mode: data.mode,
          value,
          currency: data.currency || current.currency,
          target,
          reserve: Boolean(data.reserve),
        });
        toast(isEdit ? "Presupuesto actualizado" : "Presupuesto creado");
        close();
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: msg`¿Eliminar “${budget.name}”?`, text: "Tus movimientos no se modifican.", confirmLabel: "Eliminar", danger: true });
        if (!ok) return;
        const backup = store.snapshot();
        store.deleteBudget(budget.id);
        close();
        toast("Presupuesto eliminado", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** Qué se eligió hacer este mes con lo que no se usa, en una frase. */
function pauseText(state, budget, next) {
  const p = budget.pause;
  const target = p.mode === "budget" && state.budgets.find((b) => b.id === p.targetId);
  return {
    same: msg`No lo usas este mes: queda guardado para lo mismo en ${next}.`,
    any: msg`No lo usas este mes: queda guardado para lo que haya que pagar en ${next}.`,
    goal: msg`No lo usas este mes: pasaste ${formatMoney(p.amount || 0, state.settings.mainCurrency)} a una meta.`,
    budget: target ? msg`No lo usas este mes: pasaste ${formatMoney(p.amount || 0, state.settings.mainCurrency)} a “${target.name}”.` : "No lo usas este mes.",
    release: "No lo usas este mes: lo que tenía reservado pasó a tu disponible.",
  }[p.mode];
}

/** "Este mes": qué hacer con lo que queda si este mes no se usa. */
function pauseBox(budget) {
  const state = store.getState();
  const month = currentMonthKey();
  const next = midSentence(formatMonth(shiftMonthKey(month, 1)).split(" ")[0]);
  const remaining = Math.max(0, budgetStatus(state, budget, month).remaining);
  const paused = budget.pause?.month === month;
  return html`<div class="pause-box" data-pause-box>
    <span class="field-label">Este mes</span>
    ${paused
      ? html`<p class="notice notice-info">${icon("info", 16)}<span>${pauseText(state, budget, next)}</span></p>
          ${budget.pause.mode === "goal" ? "" : html`<button type="button" class="btn btn-ghost btn-sm" data-pause="undo">${icon("undo", 16)} Volver a usarlo este mes</button>`}`
      : remaining > 0
        ? html`<p class="field-hint">${msg`Te quedan ${formatMoney(remaining, state.settings.mainCurrency)}. ¿No los vas a usar este mes? Decide para qué guardarlos.`}</p>
            <button type="button" class="btn btn-soft btn-sm" data-pause="open">${icon("lock", 16)} Este mes no lo uso…</button>`
        : html`<p class="field-hint">Este mes ya lo usaste entero.</p>`}
  </div>`;
}

/** Hoja: a dónde va lo que queda de un presupuesto que este mes no se usa. */
export function openPauseSheet(budgetId) {
  const state = store.getState();
  const budget = state.budgets.find((b) => b.id === budgetId);
  if (!budget) return;
  const main = state.settings.mainCurrency;
  const month = currentMonthKey();
  const next = midSentence(formatMonth(shiftMonthKey(month, 1)).split(" ")[0]);
  const remaining = Math.round(Math.max(0, budgetStatus(state, budget, month).remaining) * 100) / 100;
  const others = state.budgets.filter((b) => b.id !== budget.id && b.target.kind !== "goal");
  const option = (value, title, sub, extra = "") => html`<label class="pause-option">
      <input type="radio" name="mode" value="${value}" ${value === "same" ? "checked" : ""} />
      <span><strong>${title}</strong><span>${sub}</span>${extra}</span>
    </label>`;
  openSheet({
    title: msg`${budget.name}: este mes no lo uso`,
    body: html`<form class="form" novalidate>
      <p class="sheet-text">${msg`Te quedan ${formatMoney(remaining, main)}. Es tu dinero: elige para qué queda guardado.`}</p>
      <div class="pause-options">
        ${option("same", msg`Para ${budget.name} en ${next}`, "Sigue apartado y ya cuenta para ese mes.")}
        ${option("any", msg`Para lo que haya que pagar en ${next}`, "Sigue apartado y cubre cualquier cosa de ese mes (alquiler, facturas…).")}
        ${state.goals.length
          ? option("goal", "Pasarlo a una meta", "Queda ahorrado en la meta que elijas.", html`<select name="goalId" aria-label="Meta">${state.goals.map((g) => html`<option value="${g.id}">${g.icon} ${g.name}</option>`)}</select>`)
          : ""}
        ${others.length
          ? option("budget", "Pasarlo a otro presupuesto este mes", "Ese presupuesto tiene este dinero de más este mes.", html`<select name="budgetId" aria-label="Presupuesto">${others.map((b) => html`<option value="${b.id}">${b.icon} ${b.name}</option>`)}</select>`)
          : ""}
        ${option("release", "Liberarlo", "Pasa a tu disponible para usarlo en lo que quieras.")}
      </div>
      ${formActions({ submitLabel: "Listo" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const mode = form.querySelector("input[name=mode]:checked")?.value || "same";
        const backup = store.snapshot();
        const s = store.getState();
        if (mode === "goal") {
          const goal = s.goals.find((g) => g.id === form.elements.goalId.value);
          store.pauseBudget(budget.id, month, { mode, targetId: goal.id, amount: remaining, goalAmount: convert(remaining, main, goal.currency, s.rates), note: msg`De ${budget.name}` });
          toast(msg`${formatMoney(remaining, main)} pasaron a “${goal.name}”`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        } else if (mode === "budget") {
          const target = s.budgets.find((b) => b.id === form.elements.budgetId.value);
          store.pauseBudget(budget.id, month, { mode, targetId: target.id, amount: remaining });
          toast(msg`${formatMoney(remaining, main)} pasaron a “${target.name}” este mes`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        } else {
          store.pauseBudget(budget.id, month, { mode });
          toast(mode === "release" ? "Liberado: este mes pasa a tu disponible" : msg`Guardado para ${next}: sigue apartado y ya cuenta para ese mes`, { type: "info", actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        }
        close();
      });
    },
  });
}
