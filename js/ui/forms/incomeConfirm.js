// Registrar un ingreso que se repite (el sueldo de cada mes). Antes de
// guardar se puede ajustar el monto real (un cobro parcial, un descuento, un
// aumento) y sumar extras que vinieron con ese cobro: aguinaldo, horas
// extra, comisión, bono, propinas. Cada extra queda como un ingreso aparte.

import { html } from "../dom.js";
import { openSheet } from "../sheet.js";
import { toast } from "../toast.js";
import { amountField, dateField, formActions, readAmount, fieldError, clearErrors } from "./fields.js";
import { accountSelect } from "./accountForms.js";
import * as store from "../../core/store.js";
import { todayISO } from "../../core/dates.js";
import { isISODate, MAX_AMOUNT } from "../../core/sanitize.js";
import { formatMoney, parseAmount } from "../../core/money.js";
import { INCOME_EXTRAS } from "../../data/defaults.js";

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
      <div class="field">
        <span class="field-label">¿Cobraste algo más junto con esto? <span class="optional">(opcional)</span></span>
        <div class="setup-list">
          ${INCOME_EXTRAS.map(
            (e) => html`<label class="setup-item">
              <span class="setup-check">${e.icon} ${e.name}</span>
              <span class="amount-input"><input name="extra-${e.key}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="${e.name}" /></span>
            </label>`
          )}
        </div>
        <p class="field-hint">Cada extra queda como un ingreso aparte, así ves cuánto fue sueldo y cuánto extra.</p>
        <p class="field-error" data-error-for="extras"></p>
      </div>
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
        const extras = [];
        for (const e of INCOME_EXTRAS) {
          const text = form.elements[`extra-${e.key}`].value.trim();
          if (!text) continue;
          const value = parseAmount(text);
          if (!(value > 0) || value > MAX_AMOUNT) return fieldError(form, "extras", `El monto de “${e.name}” no es válido.`);
          extras.push({ ...e, amount: Math.round(value * 100) / 100 });
        }
        const backup = store.snapshot();
        const tx = store.confirmRecurring(templateId, {
          amount,
          currency: form.elements.currency.value,
          date: form.elements.date.value,
          accountId: form.elements.accountId?.value,
          keepAsUsual: form.elements.keepAsUsual.checked,
          extras,
        });
        close();
        const extraTotal = extras.reduce((s, e) => s + e.amount, 0);
        toast(`${name} registrado: ${formatMoney(tx.amount, tx.currency)}${extras.length ? ` + ${formatMoney(extraTotal, tx.currency)} en extras` : ""}`, {
          actionLabel: "Deshacer",
          onAction: () => store.restore(backup),
        });
      });
    },
  });
}
