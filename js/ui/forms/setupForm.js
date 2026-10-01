// Asistente de inicio ("Empezar con lo mío"): moneda, cuánto dinero tenés hoy
// y, si querés, tu sueldo como ingreso de referencia para los presupuestos.
// Todo se puede cambiar después en Configuración → Cálculo del disponible.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet } from "../sheet.js";
import { toast } from "../toast.js";
import { amountField, readAmount, fieldError, clearErrors } from "./fields.js";
import { parseAmount } from "../../core/money.js";
import { MAX_AMOUNT } from "../../core/sanitize.js";
import * as store from "../../core/store.js";

export function openSetupWizard() {
  const s = store.getState().settings;
  openSheet({
    title: "Tu punto de partida",
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Dos datos y listo. Lo podés cambiar cuando quieras en Configuración.</p>
      ${amountField({ name: "opening", label: "¿Cuánta plata tenés hoy, sumando todo?", value: s.openingBalance || "", currency: s.mainCurrency })}
      <p class="field-hint">Efectivo, cuentas y billeteras virtuales. La moneda que elijas queda como principal.</p>
      <div class="field">
        <label class="field-label" for="f-salary">¿Cuánto cobrás por mes? <span class="optional">(opcional)</span></label>
        <div class="amount-input">
          <input id="f-salary" name="salary" type="text" inputmode="decimal" autocomplete="off" placeholder="0" />
        </div>
        <p class="field-hint">Se usa para los presupuestos en %. Cuando cobres, cargalo como ingreso y marcá "Repetir" para que la app te lo recuerde.</p>
        <p class="field-error" data-error-for="salary"></p>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-sheet-close>Después</button>
        <button type="submit" class="btn btn-primary btn-grow">${icon("check", 18)} Listo</button>
      </div>
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const opening = form.elements.opening.value.trim() ? readAmount(form, "opening") : 0;
        if (!Number.isFinite(opening)) return fieldError(form, "opening", "Ese monto no es válido");
        const salaryText = form.elements.salary.value.trim();
        const salary = salaryText ? parseAmount(salaryText) : 0;
        if (!Number.isFinite(salary) || salary < 0 || salary > MAX_AMOUNT) return fieldError(form, "salary", "Ese monto no es válido");
        const currency = form.elements.currency.value || s.mainCurrency;
        store.updateSettings({
          mainCurrency: currency,
          openingBalance: opening,
          openingCurrency: currency,
          ...(salary ? { budgetReference: Math.round(salary * 100) / 100 } : {}),
        });
        close();
        toast("¡Listo! Ahora cargá tu primer gasto con «Agregar transacción»");
      });
    },
  });
}
