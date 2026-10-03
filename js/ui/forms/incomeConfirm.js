// Registrar un ingreso que se repite (el sueldo de cada mes). Antes de
// guardar se puede ajustar el monto real (un cobro parcial, un descuento, un
// aumento). Los extras (aguinaldo, comisión, propinas…) son otra línea:
// variables y sin repetirse, se cargan en "Extras del mes".

import { html } from "../dom.js";
import { openSheet, whenHistorySettled } from "../sheet.js";
import { openIncomeExtras } from "./incomeExtras.js";
import { toast } from "../toast.js";
import { amountField, dateField, formActions, readAmount, fieldError, clearErrors } from "./fields.js";
import { accountSelect } from "./accountForms.js";
import * as store from "../../core/store.js";
import { todayISO } from "../../core/dates.js";
import { isISODate } from "../../core/sanitize.js";
import { formatMoney } from "../../core/money.js";

export function openIncomeConfirm(templateId) {
  const state = store.getState();
  const template = state.transactions.find((t) => t.id === templateId);
  if (!template?.recurrence) return;
  const usual = template.recurrence.amount || template.amount;
  const name = template.description || "tu ingreso";
  const several = state.accounts.filter((a) => !a.archived).length > 1;

  openSheet({
    title: `¿Cobraste “${name}”?`,
    body: html`<form class="form" novalidate>
      ${amountField({ value: usual, currency: template.currency, label: "¿Cuánto te depositaron?", autofocus: false, tone: "tone-income" })}
      <p class="field-hint">Si fue menos (días trabajados, descuentos) o más, poné el monto real. Lo habitual son ${formatMoney(usual, template.currency)}.</p>
      <label class="toggle-field">
        <span><span class="toggle-label">Desde ahora cobro este monto</span><span class="field-hint">Marcalo si te cambió el sueldo. Si no, el próximo recordatorio sigue con lo habitual.</span></span>
        <input type="checkbox" name="keepAsUsual" class="switch" />
      </label>
      ${dateField({ name: "date", label: "Fecha de cobro", value: todayISO() })}
      ${several ? accountSelect(state, { label: "¿A qué cuenta entró?", value: state.accounts.find((a) => a.id === template.accountId && !a.archived)?.id || store.defaultAccountId() }) : ""}
      <label class="toggle-field">
        <span><span class="toggle-label">También tuve extras este mes</span><span class="field-hint">Aguinaldo, horas extra, comisión, propinas… Se cargan aparte, después de registrar el sueldo.</span></span>
        <input type="checkbox" name="withExtras" class="switch" />
      </label>
      ${formActions({ submitLabel: "Registrar" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá el monto que cobraste.");
        if (!isISODate(form.elements.date.value)) return fieldError(form, "date", "Elegí una fecha válida.");
        const backup = store.snapshot();
        const tx = store.confirmRecurring(templateId, {
          amount,
          currency: form.elements.currency.value,
          date: form.elements.date.value,
          accountId: form.elements.accountId?.value,
          keepAsUsual: form.elements.keepAsUsual.checked,
        });
        const withExtras = form.elements.withExtras.checked;
        close();
        toast(`${name} registrado: ${formatMoney(tx.amount, tx.currency)}`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        // Los extras son otra cosa: variables y sin repetirse. Se cargan en su hoja.
        if (withExtras) whenHistorySettled(() => openIncomeExtras());
      });
    },
  });
}
