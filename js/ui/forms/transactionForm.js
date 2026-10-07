// Registrar o editar un ingreso/gasto. Pensado para ser rápido: tipo,
// monto y categoría arriba; fecha y descripción con valores por defecto.

import { msg, tr } from "../../core/i18n.js";
import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented } from "../components.js";
import {
  amountField,
  categoryPicker,
  subcategoryPicker,
  textField,
  selectField,
  formActions,
  readForm,
  readAmount,
  fieldError,
  clearErrors,
  replaceCategoryPicker,
  replaceSubcategoryPicker,
} from "./fields.js";
import { bindCategoryPickers } from "./categoryForm.js";
import { accountSelect } from "./accountForms.js";
import { getLastAccount, setLastAccount } from "../../core/prefs.js";
import * as store from "../../core/store.js";
import { todayISO, FREQUENCIES } from "../../core/dates.js";
import { formatMoney, amountToInput, parseAmount } from "../../core/money.js";
import { FALLBACK_CATEGORY, INSTALLMENT_OPTIONS } from "../../data/defaults.js";
import { confirmDialog, whenHistorySettled } from "../sheet.js";
import { openIncomeExtras } from "./incomeExtras.js";
import { isISODate, MAX_AMOUNT } from "../../core/sanitize.js";
import { findCategory, findSubcategory } from "../../core/finance.js";

const RECURRENCE_OPTIONS = [
  { value: "", label: "No se repite" },
  ...["weekly", "biweekly", "monthly"].map((f) => ({ value: f, label: FREQUENCIES[f].label })),
];

export function openTransactionForm({ type = "expense", tx, accountId: presetAccount } = {}) {
  const state = store.getState();
  const isEdit = Boolean(tx);
  const current = tx || {
    type,
    amount: null,
    currency: state.settings.mainCurrency,
    date: todayISO(),
    time: "",
    categoryId: null,
    subcategoryId: "",
    description: "",
  };
  const bill = current.billId && state.bills.find((b) => b.id === current.billId);
  // Cuenta: la del movimiento, o la última usada, o la principal.
  const activeAccounts = state.accounts.filter((a) => !a.archived);
  const lastAccount = activeAccounts.find((a) => a.id === getLastAccount())?.id;
  const accountId = current.accountId || activeAccounts.find((a) => a.id === presetAccount)?.id || lastAccount || store.defaultAccountId();
  const showAccount = activeAccounts.length > 1 || (current.accountId && !activeAccounts.some((a) => a.id === current.accountId));
  const isCardAccount = (id) => state.accounts.find((a) => a.id === id)?.kind === "credit";
  const plan = current.installment;
  const planLoan = plan && (state.loans || []).find((l) => l.plan?.group === plan.group);

  openSheet({
    title: isEdit ? (current.type === "income" ? "Editar ingreso" : "Editar gasto") : "Nuevo movimiento",
    body: html`<form class="form" novalidate data-type="${current.type}">
      ${bill ? "" : segmented("type", [{ value: "income", label: "Ingreso", icon: "arrowDown" }, { value: "expense", label: "Gasto", icon: "arrowUp" }], current.type, { size: "segmented-lg" })}
      ${bill ? html`<p class="notice notice-info">${icon("receipt", 16)}Es el pago de la factura “${bill.name}”. Si lo borras, la factura vuelve a quedar pendiente.</p>` : ""}
      ${plan ? html`<p class="notice notice-info">${icon("calendar", 16)}Es la cuota ${plan.n} de ${plan.of} ${planLoan ? msg`del préstamo de ${planLoan.person}` : "de una compra en cuotas"}. Los cambios se aplican solo a esta cuota.</p>` : ""}
      ${amountField({ value: current.amount, currency: current.currency, autofocus: !isEdit, tone: `tone-${current.type}` })}
      ${showAccount ? accountSelect(state, { value: accountId, label: current.type === "income" ? "Cuenta" : "Cuenta o medio de pago" }) : ""}
      ${isEdit
        ? ""
        : html`<div class="field installments-field" ${current.type === "expense" && isCardAccount(accountId) ? "" : "hidden"}>
            <label class="field-label" for="f-installments">Cuotas</label>
            <select id="f-installments" name="installments">
              ${INSTALLMENT_OPTIONS.map((n) => html`<option value="${n}">${n === 1 ? "En un pago" : msg`${n} cuotas`}</option>`)}
            </select>
            <p class="field-hint" data-installments-hint>Cada cuota se registra en su mes: la primera en la fecha de la compra y las demás quedan programadas.</p>
          </div>`}
      ${categoryPicker(state, current.type, current.categoryId, { limit: 6 })}
      ${subcategoryPicker(findCategory(state, current.categoryId), current.subcategoryId)}
      <div class="field-row">
        <div class="field">
          <label class="field-label" for="f-date">Fecha</label>
          <input id="f-date" name="date" type="date" value="${current.date}" required />
        </div>
        <div class="field field-time">
          <label class="field-label" for="f-time">Hora <span class="optional">(opcional)</span></label>
          <input id="f-time" name="time" type="time" value="${current.time || ""}" />
        </div>
      </div>
      ${textField({ name: "description", label: "Descripción", value: current.description, placeholder: current.type === "income" ? "Ej.: Sueldo de septiembre" : "Ej.: Supermercado del sábado" })}
      <div class="recurrence-field" ${bill || plan ? "hidden" : ""}>
        ${selectField({ name: "recurrence", label: "Repetir", options: RECURRENCE_OPTIONS, value: current.recurrence?.freq || "" })}
        <p class="field-hint">Te vamos a recordar registrarlo cuando llegue la fecha; nunca se suma solo.</p>
        <div class="field" data-usual ${current.recurrence ? "" : "hidden"}>
          <label class="field-label" for="f-usualAmount">Monto habitual <span class="optional">(si esta vez fue distinto)</span></label>
          <div class="amount-input"><input id="f-usualAmount" name="usualAmount" type="text" inputmode="decimal" autocomplete="off" placeholder="Igual a este monto" value="${current.recurrence?.amount ? amountToInput(current.recurrence.amount) : ""}" /></div>
          <p class="field-hint">Si esta vez fue más o menos que lo normal (un sueldo por días trabajados, una cuota con descuento), escribe aquí el monto de siempre: el próximo recordatorio te va a proponer ese.</p>
          <p class="field-error" data-error-for="usualAmount"></p>
        </div>
      </div>
      ${isEdit ? "" : html`<p class="notice notice-info extras-link" data-extras-link ${current.type === "income" ? "" : "hidden"}>${icon("sparkle", 16)}<span>¿Es paga extra (aguinaldo), horas extra, comisión o propinas? <button type="button" class="inline-link" data-open-extras>Registra los extras del mes</button></span></p>`}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Guardar", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      let selectedType = current.type;

      form.addEventListener("change", (event) => {
        if (event.target.name === "recurrence") form.querySelector("[data-usual]").hidden = !event.target.value;
        if (event.target.name !== "type") return;
        selectedType = event.target.value;
        form.dataset.type = selectedType;
        form.querySelector(".field-amount").className = `field field-amount tone-${selectedType}`;
        const extrasLink = form.querySelector("[data-extras-link]");
        if (extrasLink) extrasLink.hidden = selectedType !== "income";
        syncInstallments();
        form.elements.description.placeholder = tr(selectedType === "income" ? "Ej.: Sueldo de septiembre" : "Ej.: Supermercado del sábado");
        replaceCategoryPicker(form, store.getState(), selectedType, null);
        replaceSubcategoryPicker(form, store.getState(), null);
      });

      // Cuotas: solo para gastos pagados con tarjeta de crédito.
      const installmentsBox = form.querySelector(".installments-field");
      function syncInstallments() {
        if (!installmentsBox) return;
        const show = selectedType === "expense" && isCardAccount(form.elements.accountId?.value || accountId);
        installmentsBox.hidden = !show;
        if (!show) form.elements.installments.value = "1";
        const n = Number(form.elements.installments.value);
        const amount = readAmount(form);
        const hint = installmentsBox.querySelector("[data-installments-hint]");
        hint.textContent = n > 1 && amount > 0
          ? msg`${n} cuotas de ≈ ${formatMoney(amount / n, form.elements.currency.value)}: la primera en la fecha de la compra y las demás quedan programadas, una por mes.`
          : "Cada cuota se registra en su mes: la primera en la fecha de la compra y las demás quedan programadas.";
      }
      form.addEventListener("change", (event) => {
        if (["accountId", "installments", "currency"].includes(event.target.name)) syncInstallments();
      });
      form.addEventListener("input", (event) => {
        if (event.target.name === "amount") syncInstallments();
      });

      form.querySelector("[data-open-extras]")?.addEventListener("click", () => {
        close();
        whenHistorySettled(() => openIncomeExtras());
      });

      bindCategoryPickers(form, () => selectedType);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresa un monto mayor a cero.");
        if (!isISODate(data.date)) return fieldError(form, "date", "Elige una fecha válida.");
        const values = {
          type: selectedType,
          amount,
          currency: data.currency,
          date: data.date,
          time: data.time || "",
          categoryId: data.categoryId || FALLBACK_CATEGORY[selectedType],
          subcategoryId: "",
          description: data.description.trim(),
          accountId: data.accountId || accountId,
        };
        setLastAccount(values.accountId);
        // Solo se guarda la subcategoría si pertenece a la categoría elegida.
        if (findSubcategory(findCategory(store.getState(), values.categoryId), data.subcategoryId)) values.subcategoryId = data.subcategoryId;
        if (data.recurrence && !bill && !plan) {
          const keepNext = current.recurrence?.freq === data.recurrence && current.date === data.date;
          values.recurrence = {
            freq: data.recurrence,
            nextDate: keepNext ? current.recurrence.nextDate : FREQUENCIES[data.recurrence].next(data.date),
          };
          // Monto habitual distinto del de esta vez (cobro parcial, descuento).
          if ((data.usualAmount || "").trim()) {
            const usual = parseAmount(data.usualAmount);
            if (!(usual > 0) || usual > MAX_AMOUNT) return fieldError(form, "usualAmount", "Ese monto no es válido.");
            if (Math.round(usual * 100) / 100 !== amount) values.recurrence.amount = Math.round(usual * 100) / 100;
          }
        } else {
          values.recurrence = undefined;
        }

        if (isEdit) {
          store.updateTransaction(tx.id, values);
          toast("Cambios guardados");
        } else {
          if (!values.recurrence) delete values.recurrence;
          const installments = Number(data.installments || 1);
          if (selectedType === "expense" && installments > 1 && isCardAccount(values.accountId)) {
            store.addInstallmentPurchase(values, installments);
            toast(msg`Compra en ${installments} cuotas de ≈ ${formatMoney(amount / installments, values.currency)} guardada`);
          } else {
            store.addTransaction(values);
            toast(msg`${selectedType === "income" ? "Ingreso" : "Gasto"} de ${formatMoney(amount, values.currency)} guardado`);
          }
        }
        close();
      });

      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const backup = store.snapshot();
        // Una cuota: se puede borrar sola o toda la compra.
        if (planLoan) {
          const all = await confirmDialog({
            title: msg`¿Borrar el préstamo de ${planLoan.person}?`,
            text: msg`Es la cuota ${plan.n} de ${plan.of}. Las cuotas no se borran una por una: se borra el préstamo entero, con el dinero recibido y todas sus cuotas.`,
            confirmLabel: "Borrar el préstamo",
            danger: true,
          });
          if (!all) return;
          store.deleteLoan(planLoan.id);
          close();
          toast("Préstamo borrado", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
          return;
        }
        if (plan) {
          const all = await confirmDialog({
            title: "¿Borrar toda la compra?",
            text: msg`Es la cuota ${plan.n} de ${plan.of}. Puedes borrar las ${plan.of} cuotas juntas, o cancelar y dejarla.`,
            confirmLabel: msg`Borrar las ${plan.of} cuotas`,
            danger: true,
          });
          if (!all) return;
          store.deleteInstallmentGroup(plan.group);
          close();
          toast("Compra en cuotas eliminada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
          return;
        }
        store.deleteTransaction(tx.id);
        close();
        toast(bill ? "Pago eliminado · la factura volvió a pendiente" : "Movimiento eliminado", {
          actionLabel: "Deshacer",
          onAction: () => store.restore(backup),
        });
      });
    },
  });
}
