// Presupuestos mensuales: por porcentaje de los ingresos o monto fijo, y
// aplicados a categorías de gasto, a una meta (ahorro) o "al resto".

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
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
import { amountToInput, parseAmount, zeroAmount } from "../../core/money.js";

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
          : html`<p class="notice notice-info">Primero creá una meta para poder asignarle un presupuesto.</p>`}
      </div>
      <div data-kind-panel="rest" ${current.target.kind === "rest" ? "" : "hidden"}>
        <p class="field-hint">Incluye todos los gastos cuyas categorías no estén en otro presupuesto.</p>
      </div>
      <details class="more-options" ${advanced ? "open" : ""}>
        <summary>${icon("settings", 16)} Más opciones</summary>
        <div class="more-options-body">
          <div class="field">
            <span class="field-label">¿Cómo lo querés definir?</span>
            ${segmented("mode", [{ value: "fixed", label: "Por mes" }, { value: "percent", label: "% de ingresos" }, { value: "daily", label: "Por día" }], current.mode)}
            <p class="field-hint" data-daily-only ${current.mode === "daily" ? "" : "hidden"}>Para gustos (un café, un alfajor): un monto por día. Lo que no gastás un día se acumula para los siguientes.</p>
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
            <span><span class="toggle-label">Reservar esta plata</span><span class="field-hint">Lo que te falta gastar este mes se descuenta de tu disponible. Si a fin de mes sobra, te ofrecemos pasarlo a una meta. Usalo para gastos que no son facturas (súper, nafta, gustos).</span></span>
            <input type="checkbox" name="reserve" class="switch" ${current.reserve ? "checked" : ""} />
          </label>
          ${emojiPicker(current.icon, { choices: current.icon && !BUDGET_ICONS.includes(current.icon) ? [current.icon, ...BUDGET_ICONS] : BUDGET_ICONS })}
          ${colorPicker(current.color)}
        </div>
      </details>
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear presupuesto", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("change", (event) => {
        if (event.target.name === "mode") {
          const fixed = event.target.value !== "percent";
          form.querySelector("[data-fixed-only]").hidden = !fixed;
          form.querySelector("[data-percent-only]").hidden = fixed;
          form.querySelector("[data-daily-only]").hidden = event.target.value !== "daily";
          form.querySelector("[data-value-label]").textContent = VALUE_LABEL[event.target.value];
          const field = form.elements.value;
          field.placeholder = fixed ? zeroAmount() : "25";
          // El porcentaje se escribe tal cual; el monto, con centavos.
          const typed = parseAmount(field.value);
          if (fixed === field.hasAttribute("data-plain") && typed > 0) field.value = fixed ? amountToInput(typed) : String(typed).replace(".", ",");
          field.toggleAttribute("data-plain", !fixed);
          // Los gustos por día vienen con la plata reservada.
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
        if (!data.name.trim()) return fieldError(form, "name", "Poné un nombre para el presupuesto.");
        if (!(value > 0)) return fieldError(form, "value", "Ingresá un valor mayor a cero.");
        if (data.mode === "percent" && value > 100) return fieldError(form, "value", "El porcentaje no puede superar 100%.");
        let target;
        // "Por día" es para gastos chicos del día a día: no aplica a una meta.
        if (data.kind === "goal" && data.mode === "daily") return toast("Los presupuestos por día se aplican a categorías de gasto, no a una meta", { type: "error" });
        if (data.kind === "goal") {
          // Sin metas no hay a qué asignarlo: se avisa (el campo ni siquiera existe).
          if (!data.goalId) return store.getState().goals.length ? fieldError(form, "goalId", "Elegí una meta.") : toast("Primero creá una meta para asignarle un presupuesto", { type: "error" });
          target = { kind: "goal", goalId: data.goalId };
        } else if (data.kind === "rest") {
          target = { kind: "rest" };
        } else {
          const ids = [].concat(data.categoryIds || []);
          if (!ids.length) return fieldError(form, "categoryIds", "Elegí al menos una categoría.");
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
        const ok = await confirmDialog({ title: `¿Eliminar “${budget.name}”?`, text: "Tus movimientos no se modifican.", confirmLabel: "Eliminar", danger: true });
        if (!ok) return;
        const backup = store.snapshot();
        store.deleteBudget(budget.id);
        close();
        toast("Presupuesto eliminado", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}
