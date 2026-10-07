// Préstamos: "le presté a Caro" / "me prestó Juan". Prestar o devolver dinero
// no es un gasto ni un ingreso: el dinero entra o sale de una cuenta, y la
// app lleva la cuenta de cuánto falta.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog, whenHistorySettled } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented, progressBar } from "../components.js";
import { amountField, textField, dateField, formActions, readForm, readAmount, fieldError, clearErrors } from "./fields.js";
import * as store from "../../core/store.js";
import { addMonths, formatDate, formatDue, todayISO } from "../../core/dates.js";
import { isISODate } from "../../core/sanitize.js";
import { amountToInput, formatMoney, parseAmount, zeroAmount } from "../../core/money.js";
import { findAccount, loanOutstanding, loanPlanStatus, percent } from "../../core/finance.js";
import { getLastAccount } from "../../core/prefs.js";

/** Cuenta por la que pasó el dinero, o "no pasó por mis cuentas". */
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
      <p class="field-hint" data-loan-hint>${current.direction === "lent" ? "No es un gasto: el dinero vuelve cuando te lo devuelvan." : "No es un ingreso: si pones fecha para devolverlo, la app lo reserva de tu disponible cuando se acerque."}</p>
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Guardar préstamo", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      // Con devoluciones registradas la moneda queda fija: cambiarla les cambiaría el valor.
      if (isEdit && loan.payments.length) form.querySelectorAll("input[name=currency]").forEach((el) => (el.disabled = el.value !== loan.currency));
      form.addEventListener("change", (event) => {
        if (event.target.name !== "direction") return;
        const lent = event.target.value === "lent";
        form.querySelector('label[for$="accountId"]').textContent = lent ? "¿De qué cuenta salió?" : "¿A qué cuenta entró?";
        form.querySelector("[data-loan-hint]").textContent = lent
          ? "No es un gasto: el dinero vuelve cuando te lo devuelvan."
          : "No es un ingreso: si pones fecha para devolverlo, la app lo reserva de tu disponible cuando se acerque.";
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const amount = readAmount(form);
        if (!data.person.trim()) return fieldError(form, "person", "¿A quién le prestaste o quién te prestó?");
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresa un monto mayor a cero.");
        if (!isISODate(data.date)) return fieldError(form, "date", "Elige una fecha válida.");
        if (data.dueDate && !isISODate(data.dueDate)) return fieldError(form, "dueDate", "Elige una fecha válida.");
        const values = { person: data.person, amount, currency: data.currency, date: data.date, dueDate: data.dueDate || "", note: data.note, accountId: data.accountId };
        if (isEdit) {
          store.updateLoan(loan.id, values);
          toast("Préstamo actualizado");
        } else {
          const saved = store.addLoan({ ...values, direction: data.direction });
          toast(saved.direction === "lent" ? `Anotado: ${saved.person} te debe ${formatMoney(amount, values.currency)}` : `Anotado: le debes ${formatMoney(amount, values.currency)} a ${saved.person}`);
        }
        close();
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: `¿Borrar el préstamo con ${loan.person}?`,
          text: "Se borra también el dinero que se registró en tus cuentas por este préstamo.",
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
      <p class="sheet-text">Falta${outstanding === 1 ? "" : "n"} <strong>${formatMoney(outstanding, loan.currency)}</strong>. Puedes registrar una parte o todo.</p>
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
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresa un monto mayor a cero.");
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

/**
 * Préstamo en cuotas: de un banco o una billetera (Mercado Pago, etc.). Se
 * carga lo que te dieron, cuántas cuotas son, de cuánto y cuándo vence la
 * primera; la app programa las cuotas.
 */
export function openCreditLoanForm() {
  const state = store.getState();
  const today = todayISO();
  const accounts = state.accounts.filter((a) => !a.archived && a.kind !== "credit");
  const preferred = accounts.find((a) => a.id === getLastAccount())?.id || accounts[0]?.id || store.defaultAccountId();
  const counts = Array.from({ length: 59 }, (_, i) => i + 2);

  openSheet({
    title: "Préstamo en cuotas",
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Para un préstamo de un banco o una billetera que devuelves en cuotas fijas. Si te prestó una persona, usa "Me prestaron".</p>
      ${textField({ name: "person", label: "¿Quién te lo dio?", value: "", required: true, maxlength: 40, placeholder: "Ej.: tu banco o tu billetera digital" })}
      ${amountField({ value: null, currency: state.settings.mainCurrency, label: "¿Cuánto recibiste?", autofocus: false, tone: "tone-goal" })}
      <div class="field">
        <label class="field-label" for="f-accountId">¿A qué cuenta entró?</label>
        <select id="f-accountId" name="accountId">
          ${accounts.map((a) => html`<option value="${a.id}" ${a.id === preferred ? "selected" : ""}>${a.icon} ${a.name}</option>`)}
        </select>
        <p class="field-hint">Las cuotas se descuentan de esta misma cuenta.</p>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label" for="f-count">Cantidad de cuotas</label>
          <select id="f-count" name="count">${counts.map((n) => html`<option value="${n}" ${n === 6 ? "selected" : ""}>${n} cuotas</option>`)}</select>
        </div>
        <div class="field">
          <label class="field-label" for="f-installment">Valor de cada cuota</label>
          <div class="amount-input"><input id="f-installment" name="installment" type="text" inputmode="decimal" autocomplete="off" placeholder="${zeroAmount()}" /></div>
          <p class="field-error" data-error-for="installment"></p>
        </div>
      </div>
      ${dateField({ name: "firstDue", label: "La primera cuota vence el", value: addMonths(today, 1) })}
      <p class="notice notice-info" data-loan-total hidden>${icon("info", 16)}<span></span></p>
      <p class="field-hint">Lo que recibes no cuenta como ingreso. Cada cuota queda programada como gasto en su mes y se reserva de tu disponible cuando se acerca.</p>
      ${formActions({ submitLabel: "Guardar préstamo" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      const totalBox = form.querySelector("[data-loan-total]");
      const currency = () => form.querySelector("input[name=currency]:checked")?.value || state.settings.mainCurrency;
      // Cuánto se termina devolviendo, mientras se cargan los números.
      const sync = () => {
        const received = readAmount(form);
        const each = parseAmount(form.elements.installment.value);
        const count = Number(form.elements.count.value);
        const ready = received > 0 && each > 0;
        totalBox.hidden = !ready;
        if (!ready) return;
        const total = Math.round(each * count * 100) / 100;
        const extra = Math.round((total - received) * 100) / 100;
        totalBox.querySelector("span").textContent =
          extra > 0
            ? `En total devuelves ${formatMoney(total, currency(), { reveal: true })}: ${formatMoney(extra, currency(), { reveal: true })} más de lo que recibiste.`
            : `En total devuelves ${formatMoney(total, currency(), { reveal: true })}.`;
      };
      form.addEventListener("input", sync);
      form.addEventListener("change", sync);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const received = readAmount(form);
        const each = parseAmount(data.installment);
        const count = Number(data.count);
        if (!data.person.trim()) return fieldError(form, "person", "¿Quién te dio el préstamo?");
        if (!(received > 0)) return fieldError(form, "amount", "Ingresa cuánto recibiste.");
        if (!(each > 0)) return fieldError(form, "installment", "Ingresa el valor de la cuota.");
        if (!isISODate(data.firstDue)) return fieldError(form, "firstDue", "Elige una fecha válida.");
        if (data.firstDue < today) return fieldError(form, "firstDue", "La primera cuota tiene que vencer de hoy en adelante.");
        const saved = store.addCreditLoan({ lender: data.person, received, count, installment: each, firstDue: data.firstDue, currency: data.currency, accountId: data.accountId });
        close();
        toast(`Anotado: ${saved.plan.count} cuotas de ${formatMoney(saved.plan.amount, saved.currency)} a ${saved.person}`);
      });
    },
  });
}

/** Editar un préstamo en cuotas: quién lo dio y cómo siguen las cuotas que faltan. */
function openCreditLoanEdit(loanId) {
  const state = store.getState();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan?.plan) return;
  const today = todayISO();
  const plan = loanPlanStatus(state, loan, today);
  const minCount = Math.max(1, plan.paid);
  const counts = Array.from({ length: 60 - minCount + 1 }, (_, i) => i + minCount);
  openSheet({
    title: "Editar préstamo",
    body: html`<form class="form" novalidate>
      <p class="notice notice-info">${icon("info", 16)}<span>${plan.paid ? `Las ${plan.paid} cuota${plan.paid === 1 ? "" : "s"} que ya pasaron no cambian.` : "Todavía no venció ninguna cuota."} Lo que edites aquí se aplica a las que faltan.</span></p>
      ${textField({ name: "person", label: "¿Quién te lo dio?", value: loan.person, required: true, maxlength: 40 })}
      <div class="field-row">
        <div class="field">
          <label class="field-label" for="f-count">Cuotas en total</label>
          <select id="f-count" name="count">${counts.map((n) => html`<option value="${n}" ${n === plan.count ? "selected" : ""}>${n} cuota${n === 1 ? "" : "s"}</option>`)}</select>
        </div>
        <div class="field">
          <label class="field-label" for="f-installment">Valor de las que faltan</label>
          <div class="amount-input"><input id="f-installment" name="installment" type="text" inputmode="decimal" autocomplete="off" placeholder="${zeroAmount()}" value="${amountToInput(plan.amount)}" /></div>
          <p class="field-error" data-error-for="installment"></p>
        </div>
      </div>
      ${dateField({ name: "nextDue", label: "La próxima cuota vence el", value: plan.next || addMonths(today, 1) })}
      ${formActions({ submitLabel: "Guardar cambios" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const each = parseAmount(data.installment);
        if (!data.person.trim()) return fieldError(form, "person", "¿Quién te dio el préstamo?");
        if (!(each > 0)) return fieldError(form, "installment", "Ingresa el valor de la cuota.");
        if (!isISODate(data.nextDue) || data.nextDue <= today) return fieldError(form, "nextDue", "La próxima cuota tiene que vencer después de hoy.");
        const backup = store.snapshot();
        store.updateCreditLoan(loan.id, { lender: data.person, count: Number(data.count), installment: each, nextDue: data.nextDue });
        close();
        toast("Préstamo actualizado", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** Cancelar antes de tiempo: un solo pago reemplaza las cuotas que faltan. */
function openCreditLoanPayOff(loanId) {
  const state = store.getState();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan?.plan) return;
  const today = todayISO();
  const plan = loanPlanStatus(state, loan, today);
  const accountOfLoan = plan.installments[0]?.accountId;
  openSheet({
    title: "Cancelar el préstamo",
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Te faltan <strong>${plan.remaining} cuota${plan.remaining === 1 ? "" : "s"}</strong> por ${formatMoney(plan.left, loan.currency)}. Si lo pagaste todo de una vez, escribe cuánto te cobraron: suele ser menos, porque se descuentan intereses.</p>
      ${amountField({ value: plan.left, currency: loan.currency, label: "¿Cuánto pagaste para cancelarlo?", autofocus: false, tone: "tone-expense" })}
      ${dateField({ name: "date", label: "Fecha del pago", value: today })}
      <div class="field">
        <label class="field-label" for="f-accountId">¿De qué cuenta salió?</label>
        <select id="f-accountId" name="accountId">${state.accounts.filter((x) => !x.archived && x.kind !== "credit").map((x) => html`<option value="${x.id}" ${x.id === accountOfLoan ? "selected" : ""}>${x.icon} ${x.name}</option>`)}</select>
      </div>
      ${formActions({ submitLabel: "Registrar el pago" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.querySelectorAll("input[name=currency]").forEach((el) => (el.disabled = el.value !== loan.currency));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const amount = readAmount(form);
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresa cuánto pagaste.");
        const date = form.elements.date.value;
        if (!isISODate(date) || date > today) return fieldError(form, "date", "Elige una fecha de hoy o anterior.");
        const backup = store.snapshot();
        store.payOffCreditLoan(loan.id, { amount, date, accountId: form.elements.accountId?.value });
        close();
        toast("¡Préstamo cancelado! 🎉", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/** Detalle de un préstamo en cuotas: lo que falta y cada cuota. */
function openCreditLoanDetail(state, loan) {
  const today = todayISO();
  const plan = loanPlanStatus(state, loan, today);
  const done = plan.remaining === 0;
  openSheet({
    title: `🏦 ${loan.person}`,
    body: html`<div class="loan-detail">
      <p class="account-detail-label">Préstamo en cuotas · recibiste ${formatMoney(loan.amount, loan.currency)} el ${formatDate(loan.date)}</p>
      <p class="account-detail-balance">${done ? "Terminado de pagar" : formatMoney(plan.left, loan.currency)}</p>
      <p class="fine-print">${done ? `${plan.count} cuotas de ${formatMoney(plan.amount, loan.currency)}` : `Faltan ${plan.remaining} de ${plan.count} cuotas de ${formatMoney(plan.amount, loan.currency)} · la próxima vence el ${formatDate(plan.next)}`}</p>
      ${progressBar(percent(plan.paid, plan.count), { color: "var(--goal)", label: "Cuotas pagadas" })}
      <p class="sheet-text">En total devuelves ${formatMoney(plan.total, loan.currency)}${plan.interest > 0 ? html`: <strong>${formatMoney(plan.interest, loan.currency)}</strong> de interés` : ""}.</p>
      <h3 class="section-title section-title-spaced">Cuotas</h3>
      <div class="rows rows-plain">
        ${plan.installments.map(
          (t) => html`<div class="row loan-payment ${t.date <= today ? "is-done" : ""}">
            <span class="row-main">
              <span class="row-title">Cuota ${t.installment.n} de ${t.installment.of} · ${formatMoney(t.amount, loan.currency)}</span>
              <span class="row-meta">${t.date <= today ? `Pagada el ${formatDate(t.date, { withYear: true })}` : `Vence el ${formatDate(t.date, { withYear: true })}`}</span>
            </span>
            <span aria-hidden="true">${t.date <= today ? "✅" : ""}</span>
          </div>`
        )}
      </div>
      <p class="fine-print">${icon("info", 14)} Cada cuota se descuenta de tu cuenta el día que vence. Con "Editar" cambias las que faltan; una sola cuota se corrige desde Transacciones.</p>
      <div class="account-detail-actions">
        ${done ? "" : html`<button type="button" class="btn btn-primary btn-sm" data-do="payoff">${icon("check", 16)} Lo cancelé antes</button>`}
        <button type="button" class="btn btn-ghost btn-sm" data-do="edit">${icon("edit", 16)} Editar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-do="delete">${icon("trash", 16)} Borrar</button>
      </div>
    </div>`,
    onMount(panel, close) {
      panel.querySelector("[data-do=edit]").addEventListener("click", () => {
        close();
        whenHistorySettled(() => openCreditLoanEdit(loan.id));
      });
      panel.querySelector("[data-do=payoff]")?.addEventListener("click", () => {
        close();
        whenHistorySettled(() => openCreditLoanPayOff(loan.id));
      });
      panel.querySelector("[data-do=delete]").addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: `¿Borrar el préstamo de ${loan.person}?`,
          text: "Se borran el dinero recibido y todas sus cuotas, pagadas y por venir.",
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

export function openLoanDetail(loanId) {
  const state = store.getState();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;
  if (loan.plan) return openCreditLoanDetail(state, loan);
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
                  <span class="row-meta">${formatDate(p.date, { withYear: true })}${acc ? ` · ${acc.icon} ${acc.name}` : " · sin mover dinero"}</span>
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
