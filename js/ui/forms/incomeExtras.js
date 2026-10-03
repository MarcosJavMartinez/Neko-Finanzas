// Extras del mes: ingresos del trabajo que no son el sueldo fijo (aguinaldo,
// horas extra, comisión, bono, propinas). Son variables y no se repiten: se
// cargan en el mes en que se cobran, cada uno como un ingreso aparte dentro
// de su categoría, así se distingue cuánto fue sueldo y cuánto extra.

import { html } from "../dom.js";
import { openSheet } from "../sheet.js";
import { toast } from "../toast.js";
import { dateField, formActions, fieldError, clearErrors } from "./fields.js";
import { accountSelect } from "./accountForms.js";
import { segmented } from "../components.js";
import * as store from "../../core/store.js";
import { formatMonth, monthKey, todayISO } from "../../core/dates.js";
import { isISODate, MAX_AMOUNT } from "../../core/sanitize.js";
import { formatMoney, parseAmount, CURRENCY_CODES } from "../../core/money.js";
import { toMain } from "../../core/finance.js";
import { INCOME_EXTRAS } from "../../data/defaults.js";
import { getLastAccount, setLastAccount } from "../../core/prefs.js";

/** Extras con nombre propio ("Otro": viáticos, presentismo…). */
const OTHER = { key: "otros", name: "Otros extras", icon: "✨", categoryId: "inc-sueldo", subcategoryId: "inc-sueldo.otros" };

/** ¿Este ingreso es uno de los extras? (por subcategoría, o por categoría si no tiene). */
const isExtra = (tx, e) => tx.type === "income" && tx.categoryId === e.categoryId && (e.subcategoryId ? tx.subcategoryId === e.subcategoryId : true);

/** Lo ya cargado de cada extra en un mes, en la moneda principal. */
export function extrasOfMonth(state, key) {
  return [...INCOME_EXTRAS, OTHER].map((e) => ({
    ...e,
    total: state.transactions.filter((tx) => monthKey(tx.date) === key && isExtra(tx, e)).reduce((s, tx) => s + toMain(state, tx.amount, tx.currency), 0),
  }));
}

export function openIncomeExtras() {
  const state = store.getState();
  const main = state.settings.mainCurrency;
  const month = monthKey(todayISO());
  const loaded = extrasOfMonth(state, month);
  const loadedTotal = loaded.reduce((s, e) => s + e.total, 0);
  const several = state.accounts.filter((a) => !a.archived).length > 1;

  openSheet({
    title: "Extras del mes",
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Lo que cobraste además del sueldo. Son variables: cargá solo los que tuviste, cuando los tengas.${loadedTotal > 0 ? html` En ${formatMonth(month).split(" ")[0].toLowerCase()} ya llevás <strong>${formatMoney(loadedTotal, main)}</strong> en extras.` : ""}</p>
      <div class="field">
        <span class="field-label">Moneda</span>
        ${segmented("currency", CURRENCY_CODES.map((c) => ({ value: c, label: c })), main)}
      </div>
      <div class="setup-list">
        ${loaded.filter((e) => e.key !== OTHER.key).map(
          (e) => html`<label class="setup-item">
            <span class="setup-check extra-name"><span>${e.icon} ${e.name}</span>${e.total > 0 ? html`<span class="extra-loaded">ya cargaste ${formatMoney(e.total, main)}</span>` : ""}</span>
            <span class="amount-input"><input name="extra-${e.key}" type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="${e.name}" /></span>
          </label>`
        )}
        <div class="setup-item">
          <span class="amount-input"><input name="other-name" type="text" maxlength="40" autocomplete="off" placeholder="Otro (ej.: viáticos)" aria-label="Nombre de otro extra" /></span>
          <span class="amount-input"><input name="other-amount" data-other type="text" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Monto de otro extra" /></span>
        </div>
        ${loaded.find((e) => e.key === OTHER.key).total > 0 ? html`<span class="extra-loaded">otros extras: ya cargaste ${formatMoney(loaded.find((e) => e.key === OTHER.key).total, main)}</span>` : ""}
      </div>
      <p class="field-error" data-error-for="extras"></p>
      ${dateField({ name: "date", label: "Fecha de cobro", value: todayISO() })}
      ${several ? accountSelect(state, { label: "¿A qué cuenta entraron?", value: state.accounts.find((a) => a.id === getLastAccount() && !a.archived && a.kind !== "credit")?.id || store.defaultAccountId() }) : ""}
      <p class="field-hint">Cada extra queda como un ingreso aparte, dentro de Sueldo (o Propinas), sin repetirse.</p>
      ${formActions({ submitLabel: "Cargar extras" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const fail = (message) => {
          form.querySelector('[data-error-for="extras"]').textContent = message;
          form.querySelector('[data-error-for="extras"]').scrollIntoView({ block: "nearest" });
        };
        const read = (name, label) => {
          const text = form.elements[name].value.trim();
          if (!text) return 0;
          const value = parseAmount(text);
          if (!(value > 0) || value > MAX_AMOUNT) throw new Error(`El monto de “${label}” no es válido.`);
          return Math.round(value * 100) / 100;
        };
        const extras = [];
        try {
          for (const e of INCOME_EXTRAS) {
            const amount = read(`extra-${e.key}`, e.name);
            if (amount) extras.push({ name: e.name, amount, categoryId: e.categoryId, subcategoryId: e.subcategoryId });
          }
          const otherName = form.elements["other-name"].value.trim();
          const otherAmount = read("other-amount", otherName || "Otro");
          if (otherAmount) extras.push({ name: otherName || "Extra", amount: otherAmount, categoryId: OTHER.categoryId, subcategoryId: OTHER.subcategoryId });
          else if (otherName) throw new Error(`Poné el monto de “${otherName}”.`);
        } catch (error) {
          return fail(error.message);
        }
        if (!extras.length) return fail("Poné el monto de al menos un extra.");
        if (!isISODate(form.elements.date.value)) return fieldError(form, "date", "Elegí una fecha válida.");
        const accountId = form.elements.accountId?.value;
        if (accountId) setLastAccount(accountId);
        const currency = form.elements.currency.value || main;
        const backup = store.snapshot();
        store.addIncomeExtras(extras, { date: form.elements.date.value, accountId, currency });
        close();
        const total = extras.reduce((s, e) => s + e.amount, 0);
        toast(`${extras.length === 1 ? extras[0].name : `${extras.length} extras`} cargado${extras.length === 1 ? "" : "s"}: ${formatMoney(total, currency)}`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}
