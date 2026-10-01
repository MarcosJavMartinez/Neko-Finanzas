// Facturas y servicios: alta/edición, detalle y registro de pago.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
import { toast } from "../toast.js";
import { approx, statusChip } from "../components.js";
import {
  amountField,
  categoryPicker,
  subcategoryPicker,
  textField,
  dateField,
  selectField,
  toggleField,
  emojiPicker,
  formActions,
  readForm,
  readAmount,
  fieldError,
  clearErrors,
} from "./fields.js";
import { bindCategoryPickers } from "./categoryForm.js";
import * as store from "../../core/store.js";
import { accountSelect } from "./accountForms.js";
import { getLastAccount, setLastAccount } from "../../core/prefs.js";
import { addDays, formatDate, formatDue, parseISO, todayISO, FREQUENCIES } from "../../core/dates.js";
import { isISODate } from "../../core/sanitize.js";
import { formatMoney } from "../../core/money.js";
import { billStatus, findCategory, findSubcategory } from "../../core/finance.js";

const FREQUENCY_OPTIONS = Object.entries(FREQUENCIES).map(([value, f]) => ({ value, label: f.label }));
const BILL_ICONS = ["🧾", "💡", "🔥", "💧", "🌐", "📱", "🏠", "🛡️", "📺", "🎵", "🤖", "🎮", "☁️", "🚗", "🏋️", "📚", "🐱", "💳"];

export function openBillForm({ bill } = {}) {
  const state = store.getState();
  const isEdit = Boolean(bill);
  const current = bill || {
    name: "",
    icon: "🧾",
    amount: null,
    currency: state.settings.mainCurrency,
    dueDate: addDays(todayISO(), 7),
    frequency: "monthly",
    recurring: true,
    categoryId: "exp-servicios",
    subcategoryId: "",
  };

  openSheet({
    title: isEdit ? "Editar factura" : "Nueva factura o servicio",
    body: html`<form class="form" novalidate>
      ${textField({ name: "name", label: "Nombre", value: current.name, required: true, placeholder: "Ej.: Internet, Netflix, Alquiler" })}
      ${amountField({ value: current.amount, currency: current.currency, autofocus: false, tone: "tone-bill" })}
      ${dateField({ name: "dueDate", label: isEdit ? "Próximo vencimiento" : "Fecha de vencimiento", value: current.dueDate })}
      ${toggleField({ name: "recurring", label: "Se repite", checked: current.recurring, hint: "Al pagarla, pasa sola al próximo vencimiento." })}
      <div class="frequency-field" ${current.recurring ? "" : "hidden"}>
        ${selectField({ name: "frequency", label: "Frecuencia", options: FREQUENCY_OPTIONS, value: current.frequency })}
      </div>
      <p class="notice notice-info repeat-hint" data-repeat-hint>${icon("calendar", 16)}<span>${repeatText(current.dueDate, current.recurring, current.frequency)}</span></p>
      ${categoryPicker(state, "expense", current.categoryId, { limit: 6 })}
      ${subcategoryPicker(findCategory(state, current.categoryId), current.subcategoryId)}
      ${emojiPicker(current.icon, { choices: BILL_ICONS })}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Agregar factura", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.elements.recurring.addEventListener("change", (e) => {
        form.querySelector(".frequency-field").hidden = !e.target.checked;
      });
      // Explica en palabras cuándo vence, y se actualiza mientras se edita.
      const updateHint = () => {
        form.querySelector("[data-repeat-hint] span").textContent = repeatText(
          form.elements.dueDate.value,
          form.elements.recurring.checked,
          form.elements.frequency.value
        );
      };
      for (const name of ["dueDate", "recurring", "frequency"]) form.elements[name].addEventListener("change", updateHint);
      form.elements.dueDate.addEventListener("input", updateHint);
      bindCategoryPickers(form, () => "expense");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const amount = readAmount(form);
        if (!data.name.trim()) return fieldError(form, "name", "Poné un nombre, por ejemplo “Internet”.");
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (!isISODate(data.dueDate)) return fieldError(form, "dueDate", "Elegí una fecha de vencimiento válida.");
        const values = {
          name: data.name.trim(),
          icon: data.icon || current.icon,
          amount,
          currency: data.currency,
          dueDate: data.dueDate,
          dueDay: parseISO(data.dueDate).getDate(),
          frequency: data.frequency,
          recurring: data.recurring,
          categoryId: data.categoryId || "exp-servicios",
          subcategoryId: "",
        };
        if (findSubcategory(findCategory(store.getState(), values.categoryId), data.subcategoryId)) values.subcategoryId = data.subcategoryId;
        if (isEdit) {
          // Si pasa de "pagada" (única vez) a recurrente o cambia la fecha, vuelve a pendiente.
          if (values.recurring || values.dueDate !== bill.dueDate) values.status = "pending";
          store.updateBill(bill.id, values);
          toast("Factura actualizada");
        } else {
          store.addBill(values);
          toast(`“${values.name}” agregada · se reservarán ${formatMoney(amount, values.currency)}`);
        }
        close();
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: `¿Eliminar “${bill.name}”?`,
          text: "Los pagos que ya registraste quedan como gastos en tus movimientos.",
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        const backup = store.snapshot();
        store.deleteBill(bill.id);
        close();
        toast("Factura eliminada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** Registrar el pago: permite ajustar monto y fecha (la boleta puede variar). */
export function openPayBill(billId) {
  const state = store.getState();
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  openSheet({
    title: `Pagar ${bill.name}`,
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Se va a registrar como <strong>gasto</strong> y dejará de estar reservado${bill.recurring ? `. El próximo vencimiento pasa a ${formatDate(FREQUENCIES[bill.frequency].next(bill.dueDate, bill.dueDay))}` : ""}.</p>
      ${amountField({ value: bill.amount, currency: bill.currency, label: "Monto pagado", autofocus: false, tone: "tone-expense" })}
      ${dateField({ name: "date", label: "Fecha de pago", value: todayISO() })}
      ${state.accounts.filter((a) => !a.archived).length > 1
        ? accountSelect(state, { label: "Pagada desde", value: state.accounts.find((a) => a.id === getLastAccount() && !a.archived)?.id || store.defaultAccountId() })
        : ""}
      ${formActions({ submitLabel: "Registrar pago" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá el monto que pagaste.");
        const date = isISODate(form.elements.date.value) ? form.elements.date.value : todayISO();
        const currency = form.elements.currency.value;
        const accountId = form.elements.accountId?.value;
        if (accountId) setLastAccount(accountId);
        const backup = store.snapshot();
        store.payBill(bill.id, { date, amount, currency, accountId });
        close();
        toast(`${bill.name} pagada · se registró el gasto`, { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

export function openBillDetail(billId) {
  const state = store.getState();
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  const today = todayISO();
  const status = billStatus(bill, today);
  const payments = [...bill.payments].reverse().slice(0, 6);
  const txById = new Map(state.transactions.map((t) => [t.id, t]));

  openSheet({
    title: bill.name,
    body: html`<div class="detail">
      <div class="detail-hero" style="--c:var(--bill)">
        <span class="cat-bubble cat-bubble-lg" style="--c:var(--bill)">${bill.icon || "🧾"}</span>
        <div>
          <p class="detail-amount">${formatMoney(bill.amount, bill.currency)}</p>
          ${approx(state, bill.amount, bill.currency)}
        </div>
        ${statusChip(status, status === "paid" ? "Pagada" : status === "overdue" ? "Vencida" : "Pendiente")}
      </div>
      <dl class="detail-list">
        <div><dt>${status === "paid" ? "Próximo vencimiento" : "Vencimiento"}</dt><dd>${formatDate(bill.dueDate, { withYear: true })} · ${formatDue(bill.dueDate, today)}</dd></div>
        <div><dt>Frecuencia</dt><dd>${bill.recurring ? FREQUENCIES[bill.frequency]?.label : "Única vez"}</dd></div>
        <div><dt>Categoría</dt><dd>${categoryLabel(state, bill)}</dd></div>
      </dl>
      <div class="detail-actions">
        ${status !== "paid" ? html`<button type="button" class="btn btn-primary btn-grow" data-do="pay">${icon("check", 18)}Marcar como pagada</button>` : ""}
        ${bill.payments.length ? html`<button type="button" class="btn btn-ghost" data-do="undo">${icon("undo", 18)}Deshacer último pago</button>` : ""}
        <button type="button" class="btn btn-ghost" data-do="edit">${icon("edit", 18)}Editar</button>
      </div>
      <h3 class="detail-subtitle">Pagos registrados</h3>
      ${payments.length
        ? html`<ul class="mini-list">${payments.map((p) => {
            const tx = txById.get(p.txId);
            return html`<li><span>${formatDate(p.paidAt, { withYear: true })}</span><span>${tx ? formatMoney(tx.amount, tx.currency) : "—"}</span></li>`;
          })}</ul>`
        : html`<p class="muted-text">Todavía no registraste pagos de esta factura.</p>`}
    </div>`,
    onMount(panel, close) {
      panel.addEventListener("click", async (event) => {
        const action = event.target.closest("[data-do]")?.dataset.do;
        if (!action) return;
        if (action === "pay") {
          close();
          openPayBill(bill.id);
        } else if (action === "edit") {
          close();
          openBillForm({ bill });
        } else if (action === "undo") {
          const ok = await confirmDialog({
            title: "¿Deshacer el último pago?",
            text: "Se borra el gasto registrado y la factura vuelve a quedar pendiente.",
            confirmLabel: "Deshacer pago",
          });
          if (!ok) return;
          store.undoLastPayment(bill.id);
          close();
          toast("Pago deshecho · la factura volvió a pendiente", { type: "info" });
        }
      });
    },
  });
}

function categoryLabel(state, item) {
  const category = findCategory(state, item.categoryId);
  const sub = findSubcategory(category, item.subcategoryId);
  return [category?.name || "—", sub?.name].filter(Boolean).join(" · ");
}

/** "Vence todos los meses el día 29" · "Vence cada semana, los miércoles" … */
function repeatText(dueDate, recurring, frequency) {
  if (!dueDate) return "Elegí la fecha de vencimiento.";
  const d = parseISO(dueDate);
  const day = d.getDate();
  const first = `La primera vez vence el ${formatDate(dueDate, { withYear: true })}.`;
  if (!recurring) return `Vence una sola vez, el ${formatDate(dueDate, { withYear: true })}.`;
  // "los lunes" … "los sábados", "los domingos"
  const weekdayName = d.toLocaleDateString("es-AR", { weekday: "long" });
  const weekday = weekdayName.endsWith("s") ? weekdayName : weekdayName + "s";
  const monthName = d.toLocaleDateString("es-AR", { month: "long" });
  const rule = {
    weekly: `Vence cada semana, los ${weekday}`,
    biweekly: `Vence cada 2 semanas, los ${weekday}`,
    monthly: `Vence todos los meses el día ${day}`,
    bimonthly: `Vence cada 2 meses, el día ${day}`,
    quarterly: `Vence cada 3 meses, el día ${day}`,
    semiannual: `Vence cada 6 meses, el día ${day}`,
    yearly: `Vence todos los años el ${day} de ${monthName}`,
  }[frequency] || `Vence el día ${day}`;
  // Día 29-31: en los meses más cortos vence el último día.
  const shortMonths = day > 28 && ["monthly", "bimonthly", "quarterly", "semiannual"].includes(frequency) ? " (o el último día, en los meses más cortos)" : "";
  return `${rule}${shortMonths}. ${first}`;
}
