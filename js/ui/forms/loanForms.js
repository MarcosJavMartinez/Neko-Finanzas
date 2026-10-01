// Préstamos: "le presté a Caro" / "me prestó Juan". Prestar o devolver plata
// no es un gasto ni un ingreso: la plata entra o sale de una cuenta, y la
// app lleva la cuenta de cuánto falta.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented, progressBar } from "../components.js";
import { amountField, textField, dateField, formActions, readForm, readAmount, fieldError, clearErrors } from "./fields.js";
import * as store from "../../core/store.js";
import { formatDate, formatDue, todayISO } from "../../core/dates.js";
import { isISODate } from "../../core/sanitize.js";
import { formatMoney } from "../../core/money.js";
import { findAccount, loanOutstanding, percent } from "../../core/finance.js";
import { getLastAccount } from "../../core/prefs.js";

/** Cuenta por la que pasó la plata, o "no pasó por mis cuentas". */
function accountChoice(state, value, label) {
  const options = state.accounts.filter((a) => !a.archived || a.id === value);
  return html`<div class="field">
    <label class="field-label" for="f-accountId">${label}</label>
    <select id="f-accountId" name="accountId">
      ${options.map((a) => html`<option value="${a.id}" ${a.id === value ? "selected" : ""}>${a.icon} ${a.name}</option>`)}
      <option value="" ${value === "" ? "selected" : ""}>No pasó por mis cuentas (solo anotarlo)</option>
    </select>
  </div>`;
}

const directionText = (loan) => (loan.direction === "lent" ? `Le prestaste a ${loan.person}` : `Te prestó ${loan.person}`);

export function openLoanForm({ loan, direction = "lent" } = {}) {
  const state = store.getState();
  const isEdit = Boolean(loan);
  const current = loan || { person: "", direction, amount: null, currency: state.settings.mainCurrency, date: todayISO(), dueDate: "", note: "" };
  const tx = loan?.txId && state.transactions.find((t) => t.id === loan.txId);
  const preferred = state.accounts.find((a) => a.id === getLastAccount() && !a.archived)?.id || store.defaultAccountId();
  const accountId = isEdit ? tx?.accountId || "" : preferred;

  openSheet({
    title: isEdit ? "Editar préstamo" : "Nuevo préstamo",
    body: html`<form class="form" novalidate>
      ${isEdit
        ? html`<p class="notice notice-info">${icon("info", 16)}${directionText(current)}.</p>`
        : segmented("direction", [{ value: "lent", label: "Le presté" }, { value: "borrowed", label: "Me prestaron" }], current.direction, { size: "segmented-lg" })}
      ${textField({ name: "person", label: "¿Quién?", value: current.person, required: true, maxlength: 40, placeholder: "Ej.: Caro, mi hermano, Juan" })}
      ${amountField({ value: current.amount, currency: current.currency, autofocus: false, tone: "tone-goal" })}
      ${accountChoice(state, accountId, current.direction === "lent" ? "¿De qué cuenta salió?" : "¿A qué cuenta entró?")}
      <div class="field-row">
        ${dateField({ name: "date", label: "Fecha", value: current.date })}
        ${dateField({ name: "dueDate", label: "Devolver antes del", value: current.dueDate, required: false })}
      </div>
      ${textField({ name: "note", label: "Nota", value: current.note, maxlength: 120, placeholder: "Ej.: para el auto, en 3 partes" })}
      <p class="field-hint" data-loan-hint>${current.direction === "lent" ? "No es un gasto: la plata vuelve cuando te la devuelvan." : "No es un ingreso: si ponés fecha para devolverla, la app la reserva de tu disponible cuando se acerque."}</p>
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Guardar préstamo", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("change", (event) => {
        if (event.target.name !== "direction") return;
        const lent = event.target.value === "lent";
        form.querySelector('label[for$="accountId"]').textContent = lent ? "¿De qué cuenta salió?" : "¿A qué cuenta entró?";
        form.querySelector("[data-loan-hint]").textContent = lent
          ? "No es un gasto: la plata vuelve cuando te la devuelvan."
          : "No es un ingreso: si ponés fecha para devolverla, la app la reserva de tu disponible cuando se acerque.";
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const amount = readAmount(form);
        if (!data.person.trim()) return fieldError(form, "person", "¿A quién le prestaste o quién te prestó?");
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (!isISODate(data.date)) return fieldError(form, "date", "Elegí una fecha válida.");
        if (data.dueDate && !isISODate(data.dueDate)) return fieldError(form, "dueDate", "Elegí una fecha válida.");
        const values = { person: data.person, amount, currency: data.currency, date: data.date, dueDate: data.dueDate || "", note: data.note, accountId: data.accountId };
        if (isEdit) {
          store.updateLoan(loan.id, values);
          toast("Préstamo actualizado");
        } else {
          const saved = store.addLoan({ ...values, direction: data.direction });
          toast(saved.direction === "lent" ? `Anotado: ${saved.person} te debe ${formatMoney(amount, values.currency)}` : `Anotado: le debés ${formatMoney(amount, values.currency)} a ${saved.person}`);
        }
        close();
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: `¿Borrar el préstamo con ${loan.person}?`,
          text: "Se borra también la plata que se registró en tus cuentas por este préstamo.",
          confirmLabel: "Borrar",
          danger: true,
        });
        if (!ok) return;
        const backup = store.snapshot();
        store.deleteLoan(loan.id);
        close();
        toast("Préstamo borrado", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** Registrar una devolución (por defecto, todo lo que falta). */
export function openLoanPayment(loanId) {
  const state = store.getState();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;
  const outstanding = loanOutstanding(loan);
  const lent = loan.direction === "lent";
  openSheet({
    title: lent ? `${loan.person} te devolvió` : `Le devolviste a ${loan.person}`,
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Falta${outstanding === 1 ? "" : "n"} <strong>${formatMoney(outstanding, loan.currency)}</strong>. Podés registrar una parte o todo.</p>
      ${amountField({ value: outstanding, currency: loan.currency, label: "Monto", autofocus: false, tone: "tone-goal" })}
      ${dateField({ name: "date", label: "Fecha", value: todayISO() })}
      ${accountChoice(state, state.accounts.find((a) => a.id === getLastAccount() && !a.archived)?.id || store.defaultAccountId(), lent ? "¿A qué cuenta entró?" : "¿De qué cuenta salió?")}
      ${formActions({ submitLabel: "Registrar" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      // La moneda es la del préstamo.
      form.querySelectorAll("input[name=currency]").forEach((el) => (el.disabled = el.value !== loan.currency));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (amount > outstanding + 0.005) return fieldError(form, "amount", `Es más de lo que falta (${formatMoney(outstanding, loan.currency)}).`);
        const date = isISODate(form.elements.date.value) ? form.elements.date.value : todayISO();
        const backup = store.snapshot();
        store.addLoanPayment(loan.id, { amount, date, accountId: form.elements.accountId.value });
        close();
        const left = loanOutstanding(store.getState().loans.find((l) => l.id === loan.id));
        toast(left > 0 ? `Registrado. Faltan ${formatMoney(left, loan.currency)}` : "¡Préstamo saldado! 🎉", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

export function openLoanDetail(loanId) {
  const state = store.getState();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;
  const outstanding = loanOutstanding(loan);
  const paid = loan.amount - outstanding;
  const tx = loan.txId && state.transactions.find((t) => t.id === loan.txId);
  const account = tx && findAccount(state, tx.accountId);
  const today = todayISO();
  openSheet({
    title: `🤝 ${loan.person}`,
    body: html`<div class="loan-detail">
      <p class="account-detail-label">${directionText(loan)} el ${formatDate(loan.date)}${account ? ` · ${account.icon} ${account.name}` : ""}</p>
      <p class="account-detail-balance">${outstanding > 0 ? formatMoney(outstanding, loan.currency) : "Saldado"}</p>
      <p class="fine-print">${outstanding > 0 ? `${loan.direction === "lent" ? "Te falta cobrar" : "Te falta devolver"} de ${formatMoney(loan.amount, loan.currency)}` : `${formatMoney(loan.amount, loan.currency)} devueltos`}${loan.dueDate && outstanding > 0 ? ` · ${formatDue(loan.dueDate, today)}` : ""}</p>
      ${progressBar(percent(paid, loan.amount), { color: "var(--goal)", label: "Parte devuelta" })}
      ${loan.note ? html`<p class="sheet-text">${loan.note}</p>` : ""}
      <div class="account-detail-actions">
        ${outstanding > 0 ? html`<button type="button" class="btn btn-primary btn-sm" data-do="pay">${icon("check", 16)} ${loan.direction === "lent" ? "Me devolvió" : "Devolví"}</button>` : ""}
        <button type="button" class="btn btn-ghost btn-sm" data-do="edit">${icon("edit", 16)} Editar</button>
      </div>
      <h3 class="section-title section-title-spaced">Devoluciones</h3>
      ${loan.payments.length
        ? html`<div class="rows rows-plain">
            ${[...loan.payments].reverse().map((p) => {
              const ptx = p.txId && state.transactions.find((t) => t.id === p.txId);
              const acc = ptx && findAccount(state, ptx.accountId);
              return html`<div class="row loan-payment">
                <span class="row-main">
                  <span class="row-title">${formatMoney(p.amount, loan.currency)}</span>
                  <span class="row-meta">${formatDate(p.date, { withYear: true })}${acc ? ` · ${acc.icon} ${acc.name}` : " · sin mover plata"}</span>
                </span>
                <button type="button" class="icon-btn" data-remove-payment="${p.id}" aria-label="Borrar esta devolución">${icon("trash", 18)}</button>
              </div>`;
            })}
          </div>`
        : html`<p class="muted-text">Todavía no hay devoluciones.</p>`}
    </div>`,
    onMount(panel, close) {
      panel.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-payment]");
        if (remove) {
          const backup = store.snapshot();
          store.deleteLoanPayment(loan.id, remove.dataset.removePayment);
          close();
          toast("Devolución borrada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
          return;
        }
        const what = event.target.closest("[data-do]")?.dataset.do;
        if (!what) return;
        close();
        if (what === "pay") openLoanPayment(loan.id);
        if (what === "edit") openLoanForm({ loan: store.getState().loans.find((l) => l.id === loan.id) });
      });
    },
  });
}
