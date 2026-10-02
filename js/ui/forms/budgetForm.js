// Presupuestos mensuales: por porcentaje de los ingresos o monto fijo, y
// aplicados a categorías de gasto, a una meta (ahorro) o "al resto".

import { html } from "../dom.js";
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
import { amountToInput } from "../../core/money.js";

const BUDGET_ICONS = ["🧾", "🛒", "🍔", "✈️", "👕", "🛟", "🎮", "🏠", "🚗", "💊", "🎁", "📚", "🐱", "💰", "🎯", "✨"];

export function openBudgetForm({ budget } = {}) {
  const state = store.getState();
  const isEdit = Boolean(budget);
  const current = budget || {
    name: "",
    icon: "🎯",
    color: "#4a63dd",
    mode: "percent",
    value: null,
    currency: state.settings.mainCurrency,
    target: { kind: "categories", categoryIds: [] },
  };
  const hasRest = state.budgets.some((b) => b.target.kind === "rest" && b.id !== budget?.id);

  openSheet({
    title: isEdit ? "Editar presupuesto" : "Nuevo presupuesto",
    body: html`<form class="form" novalidate>
      ${textField({ name: "name", label: "Nombre", value: current.name, required: true, placeholder: "Ej.: Salidas" })}
      <div class="field">
        <span class="field-label">¿Cómo lo querés definir?</span>
        ${segmented("mode", [{ value: "percent", label: "% de ingresos" }, { value: "fixed", label: "Monto fijo" }], current.mode)}
      </div>
      <div class="field field-amount">
        <label class="field-label" for="f-value">Valor</label>
        <div class="amount-input">
          <select name="currency" class="amount-currency" aria-label="Moneda" data-fixed-only ${current.mode === "fixed" ? "" : "hidden"}>${currencyOptions(current.currency)}</select>
          <input id="f-value" name="value" type="text" inputmode="decimal" autocomplete="off" placeholder="${current.mode === "percent" ? "25" : "0"}" value="${current.value ? amountToInput(current.value) : ""}" required />
          <span class="amount-suffix" data-percent-only ${current.mode === "percent" ? "" : "hidden"}>%</span>
        </div>
        <p class="field-error" data-error-for="value"></p>
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
      ${emojiPicker(current.icon, { choices: BUDGET_ICONS })}
      ${colorPicker(current.color)}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear presupuesto", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("change", (event) => {
        if (event.target.name === "mode") {
          const fixed = event.target.value === "fixed";
          form.querySelector("[data-fixed-only]").hidden = !fixed;
          form.querySelector("[data-percent-only]").hidden = fixed;
          form.elements.value.placeholder = fixed ? "0" : "25";
        }
        if (event.target.name === "kind") {
          form.querySelectorAll("[data-kind-panel]").forEach((p) => (p.hidden = p.dataset.kindPanel !== event.target.value));
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
