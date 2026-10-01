// Registrar o editar un ingreso/gasto. Pensado para ser rápido: tipo,
// monto y categoría arriba; fecha y descripción con valores por defecto.

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
import { formatMoney } from "../../core/money.js";
import { FALLBACK_CATEGORY } from "../../data/defaults.js";
import { isISODate } from "../../core/sanitize.js";
import { findCategory, findSubcategory } from "../../core/finance.js";

const RECURRENCE_OPTIONS = [
  { value: "", label: "No se repite" },
  ...["weekly", "biweekly", "monthly"].map((f) => ({ value: f, label: FREQUENCIES[f].label })),
];

export function openTransactionForm({ type = "expense", tx } = {}) {
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
  const accountId = current.accountId || lastAccount || store.defaultAccountId();
  const showAccount = activeAccounts.length > 1 || (current.accountId && !activeAccounts.some((a) => a.id === current.accountId));

  openSheet({
    title: isEdit ? (current.type === "income" ? "Editar ingreso" : "Editar gasto") : "Nuevo movimiento",
    body: html`<form class="form" novalidate data-type="${current.type}">
      ${bill ? "" : segmented("type", [{ value: "income", label: "Ingreso", icon: "arrowDown" }, { value: "expense", label: "Gasto", icon: "arrowUp" }], current.type, { size: "segmented-lg" })}
      ${bill ? html`<p class="notice notice-info">${icon("receipt", 16)}Es el pago de la factura “${bill.name}”. Si lo borrás, la factura vuelve a quedar pendiente.</p>` : ""}
      ${amountField({ value: current.amount, currency: current.currency, autofocus: !isEdit, tone: `tone-${current.type}` })}
      ${showAccount ? accountSelect(state, { value: accountId, label: current.type === "income" ? "Cuenta" : "Cuenta o medio de pago" }) : ""}
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
      ${textField({ name: "description", label: "Descripción", value: current.description, placeholder: current.type === "income" ? "Ej.: Sueldo de septiembre" : "Ej.: Súper del sábado" })}
      <div class="recurrence-field" ${current.type === "income" ? "" : "hidden"}>
        ${selectField({ name: "recurrence", label: "Repetir", options: RECURRENCE_OPTIONS, value: current.recurrence?.freq || "" })}
        <p class="field-hint">Te vamos a recordar registrarlo cuando llegue la fecha; nunca se suma solo.</p>
      </div>
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Guardar", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      let selectedType = current.type;

      form.addEventListener("change", (event) => {
        if (event.target.name !== "type") return;
        selectedType = event.target.value;
        form.dataset.type = selectedType;
        form.querySelector(".field-amount").className = `field field-amount tone-${selectedType}`;
        form.querySelector(".recurrence-field").hidden = selectedType !== "income";
        form.elements.description.placeholder = selectedType === "income" ? "Ej.: Sueldo de septiembre" : "Ej.: Súper del sábado";
        replaceCategoryPicker(form, store.getState(), selectedType, null);
        replaceSubcategoryPicker(form, store.getState(), null);
      });

      bindCategoryPickers(form, () => selectedType);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (!isISODate(data.date)) return fieldError(form, "date", "Elegí una fecha válida.");
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
        if (selectedType === "income" && data.recurrence) {
          const keepNext = current.recurrence?.freq === data.recurrence && current.date === data.date;
          values.recurrence = {
            freq: data.recurrence,
            nextDate: keepNext ? current.recurrence.nextDate : FREQUENCIES[data.recurrence].next(data.date),
          };
        } else {
          values.recurrence = undefined;
        }

        if (isEdit) {
          store.updateTransaction(tx.id, values);
          toast("Cambios guardados");
        } else {
          if (!values.recurrence) delete values.recurrence;
          store.addTransaction(values);
          toast(`${selectedType === "income" ? "Ingreso" : "Gasto"} de ${formatMoney(amount, values.currency)} guardado`);
        }
        close();
      });

      form.querySelector("[data-form-delete]")?.addEventListener("click", () => {
        const backup = store.snapshot();
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
