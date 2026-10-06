// Cuentas (efectivo, banco, billetera virtual, ahorro) y transferencias
// entre ellas. Transferir no es gastar: la plata cambia de lugar.

import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
import { toast } from "../toast.js";
import { art, segmented, txRow } from "../components.js";
import { textField, emojiPicker, colorPicker, formActions, readForm, fieldError, clearErrors } from "./fields.js";
import * as store from "../../core/store.js";
import { todayISO, formatDate } from "../../core/dates.js";
import { isISODate, MAX_AMOUNT } from "../../core/sanitize.js";
import { formatMoney, amountToInput, parseAmount, convert, CURRENCY_CODES } from "../../core/money.js";
import { accountBalance, cardStatus, findAccount, findCategory } from "../../core/finance.js";
import { ACCOUNT_KINDS } from "../../data/defaults.js";

const ACCOUNT_ICONS = ["👛", "💵", "🏦", "📱", "💳", "🐷", "💰", "🪙", "🏧", "💶", "💴", "🧾"];

/** Nombre con ícono de una cuenta ("🏦 Cuenta sueldo"). */
export const accountLabel = (account) => (account ? `${account.icon} ${account.name}` : "Cuenta borrada");

/** Selector de cuenta para formularios (las archivadas no se ofrecen, salvo la elegida). */
export function accountSelect(state, { name = "accountId", label = "Cuenta", value, exclude = "" } = {}) {
  const options = state.accounts.filter((a) => a.id !== exclude && (!a.archived || a.id === value));
  return html`<div class="field">
    <label class="field-label" for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}">
      ${options.map((a) => html`<option value="${a.id}" ${a.id === value ? "selected" : ""}>${accountLabel(a)} · ${a.currency}</option>`)}
    </select>
  </div>`;
}

/** Monto en una moneda fija (la de la cuenta). */
function fixedAmountField({ name, label, currency, value, hint = "" }) {
  return html`<div class="field">
    <label class="field-label" for="f-${name}">${label}</label>
    <div class="amount-input">
      <span class="amount-currency amount-currency-static" data-currency-for="${name}">${currency}</span>
      <input id="f-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${value ? amountToInput(value) : ""}" />
    </div>
    ${hint ? html`<p class="field-hint" data-hint-for="${name}">${hint}</p>` : ""}
    <p class="field-error" data-error-for="${name}"></p>
  </div>`;
}

function readMoney(form, name) {
  const value = parseAmount(form.elements[name]?.value || "");
  return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT ? Math.round(value * 100) / 100 : NaN;
}

// ---------------------------------------------------------------------------
// Crear / editar cuenta
// ---------------------------------------------------------------------------

export function openAccountForm({ account, kind: presetKind } = {}) {
  const state = store.getState();
  const isEdit = Boolean(account);
  const startKind = Object.prototype.hasOwnProperty.call(ACCOUNT_KINDS, presetKind || "") ? presetKind : "bank";
  const current = account || { name: "", icon: ACCOUNT_KINDS[startKind].icon, color: "#08a7c8", currency: state.settings.mainCurrency, kind: startKind, opening: 0, closingDay: 25, dueDay: 5 };
  const used = isEdit ? store.countAccountUsage(account.id) : 0;
  const isCard = current.kind === "credit";
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const daySelect = (name, label, value) => html`<div class="field">
    <label class="field-label" for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}">${days.map((d) => html`<option value="${d}" ${d === value ? "selected" : ""}>${d}</option>`)}</select>
  </div>`;

  openSheet({
    title: isEdit ? "Editar cuenta" : "Nueva cuenta",
    body: html`<form class="form" novalidate>
      ${textField({ name: "name", label: "Nombre", value: current.name, required: true, placeholder: "Ej.: Cuenta sueldo, Efectivo, Billetera" })}
      <div class="field">
        <span class="field-label">Tipo</span>
        <div class="kind-picker" role="radiogroup" aria-label="Tipo de cuenta">
          ${Object.entries(ACCOUNT_KINDS).map(
            ([value, k]) => html`<label class="kind-option"><input type="radio" name="kind" value="${value}" ${value === current.kind ? "checked" : ""} /><span>${k.icon} ${k.label}</span></label>`
          )}
        </div>
      </div>
      <div class="field-row" data-card-fields ${isCard ? "" : "hidden"}>
        ${daySelect("closingDay", "Cierra el día", current.closingDay || 25)}
        ${daySelect("dueDay", "Vence el día", current.dueDay || 5)}
      </div>
      <div class="field">
        <span class="field-label">Moneda</span>
        ${used
          ? html`<p class="field-hint">${icon("lock", 14)} ${current.currency}: no se puede cambiar porque la cuenta ya tiene movimientos.</p>`
          : segmented("currency", CURRENCY_CODES.map((c) => ({ value: c, label: c })), current.currency)}
      </div>
      <div data-opening-normal ${isCard ? "hidden" : ""}>
        ${fixedAmountField({ name: "opening", label: "Saldo al empezar", currency: current.currency, value: isCard ? 0 : Math.abs(current.opening || 0), hint: "Lo que tenía esta cuenta antes de cargar movimientos." })}
        <label class="toggle-field">
          <span><span class="toggle-label">Está en rojo</span><span class="field-hint">El saldo es negativo: es plata que debés (descubierto).</span></span>
          <input type="checkbox" name="openingNegative" class="switch" ${!isCard && current.opening < 0 ? "checked" : ""} />
        </label>
      </div>
      <div data-opening-card ${isCard ? "" : "hidden"}>
        ${fixedAmountField({ name: "openingDebt", label: "Deuda al empezar", currency: current.currency, value: isCard && current.opening < 0 ? -current.opening : 0, hint: "Lo que ya debías en la tarjeta (sin las cuotas que todavía no llegaron)." })}
      </div>
      ${emojiPicker(current.icon, { choices: ACCOUNT_ICONS })}
      ${colorPicker(current.color)}
      ${isEdit
        ? html`<label class="toggle-field">
            <span><span class="toggle-label">Archivada</span><span class="field-hint">No aparece al cargar movimientos. Su saldo sigue contando en el total.</span></span>
            <input type="checkbox" name="archived" class="switch" ${current.archived ? "checked" : ""} />
          </label>`
        : ""}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear cuenta", deletable: isEdit && !used && state.accounts.length > 1 })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      // La moneda del saldo inicial sigue a la elegida.
      form.addEventListener("change", (event) => {
        if (event.target.name === "currency") form.querySelectorAll('[data-currency-for^="opening"]').forEach((el) => (el.textContent = event.target.value));
        if (event.target.name === "kind") {
          const card = event.target.value === "credit";
          form.querySelector("[data-card-fields]").hidden = !card;
          form.querySelector("[data-opening-normal]").hidden = card;
          form.querySelector("[data-opening-card]").hidden = !card;
          if (!isEdit) {
            const iconInput = form.querySelector(`input[name=icon][value="${ACCOUNT_KINDS[event.target.value].icon}"]`);
            if (iconInput) iconInput.checked = true;
          }
        }
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        if (!data.name.trim()) return fieldError(form, "name", "Poné un nombre para la cuenta.");
        const card = data.kind === "credit";
        const field = card ? "openingDebt" : "opening";
        const openingText = form.elements[field].value.trim();
        const typed = openingText ? parseAmount(openingText) : 0;
        if (!Number.isFinite(typed) || Math.abs(typed) > MAX_AMOUNT || (card && typed < 0)) return fieldError(form, field, "Ese monto no es válido.");
        // En una tarjeta, la deuda es saldo negativo.
        const opening = card || form.elements.openingNegative.checked ? -Math.abs(typed) : typed;
        const saved = store.saveAccount({
          id: account?.id,
          name: data.name,
          kind: data.kind,
          currency: data.currency || current.currency,
          opening,
          icon: data.icon,
          color: data.color,
          archived: Boolean(data.archived),
          closingDay: Number(data.closingDay),
          dueDay: Number(data.dueDay),
        });
        close();
        toast(isEdit ? "Cuenta actualizada" : `Cuenta “${saved.name}” creada`);
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: `¿Eliminar “${account.name}”?`, text: "La cuenta no tiene movimientos, así que no se pierde nada.", confirmLabel: "Eliminar", danger: true });
        if (!ok) return;
        try {
          const backup = store.snapshot();
          store.deleteAccount(account.id);
          close();
          toast("Cuenta eliminada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        } catch (error) {
          toast(error.message, { type: "error" });
        }
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Transferir entre cuentas
// ---------------------------------------------------------------------------

export function openTransferForm({ tx, fromId, toId, amount: presetAmount, description: presetDescription } = {}) {
  const state = store.getState();
  const active = state.accounts.filter((a) => !a.archived);
  if (!tx && active.length < 2) {
    toast("Necesitás al menos dos cuentas para mover plata entre ellas", { type: "info" });
    return openAccountForm();
  }
  const isEdit = Boolean(tx);
  const from = tx?.accountId || fromId || store.defaultAccountId();
  const to = tx?.toAccountId || toId || active.find((a) => a.id !== from)?.id;

  openSheet({
    title: isEdit ? "Editar transferencia" : "Mover plata",
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Pasar plata de una cuenta a otra no es un gasto: tu total no cambia.</p>
      <div class="field-row field-row-transfer">
        ${accountSelect(state, { name: "fromId", label: "Desde", value: from })}
        <span class="transfer-arrow" aria-hidden="true">${icon("chevronRight", 20)}</span>
        ${accountSelect(state, { name: "toId", label: "Hacia", value: to })}
      </div>
      ${fixedAmountField({ name: "amount", label: "Monto", currency: findAccount(state, from)?.currency, value: tx?.amount || presetAmount })}
      <div data-to-amount hidden>
        ${fixedAmountField({ name: "toAmount", label: "Llega a la otra cuenta", currency: findAccount(state, to)?.currency, value: tx?.toAmount, hint: "Sugerido con tu tipo de cambio. Si cambiaste a otro valor, corregilo." })}
      </div>
      <div class="field">
        <label class="field-label" for="f-date">Fecha</label>
        <input id="f-date" name="date" type="date" value="${tx?.date || todayISO()}" required />
        <p class="field-error" data-error-for="date"></p>
      </div>
      ${textField({ name: "description", label: "Descripción", value: tx?.description || presetDescription || "", placeholder: "Ej.: Retiro del cajero, compra de dólares" })}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Mover plata", deletable: isEdit })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      const toBox = form.querySelector("[data-to-amount]");
      let toEdited = isEdit;
      // Con monedas distintas se pide cuánto llega (sugerido con tu tipo de cambio).
      const sync = () => {
        const s = store.getState();
        const a = findAccount(s, form.elements.fromId.value);
        const b = findAccount(s, form.elements.toId.value);
        form.querySelector('[data-currency-for="amount"]').textContent = a?.currency || "";
        form.querySelector('[data-currency-for="toAmount"]').textContent = b?.currency || "";
        const differ = a && b && a.currency !== b.currency;
        toBox.hidden = !differ;
        const amount = readMoney(form, "amount");
        if (differ && !toEdited && amount > 0) form.elements.toAmount.value = amountToInput(Math.round(convert(amount, a.currency, b.currency, s.rates) * 100) / 100);
        const hint = form.querySelector('[data-hint-for="toAmount"]');
        if (hint && differ) hint.textContent = `Sugerido con tu tipo de cambio (${formatMoney(convert(1, b.currency, a.currency, s.rates), a.currency, { reveal: true })} por ${b.currency}). Si cambiaste a otro valor, corregilo.`;
      };
      form.addEventListener("input", (event) => {
        if (event.target.name === "toAmount") toEdited = true;
        if (event.target.name === "amount") sync();
      });
      form.addEventListener("change", (event) => {
        if (event.target.name === "fromId" || event.target.name === "toId") {
          toEdited = false;
          sync();
        }
      });
      sync();
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const amount = readMoney(form, "amount");
        if (data.fromId === data.toId) return fieldError(form, "amount", "Elegí dos cuentas distintas.");
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresá un monto mayor a cero.");
        if (!isISODate(data.date)) return fieldError(form, "date", "Elegí una fecha válida.");
        const toAmount = toBox.hidden ? amount : readMoney(form, "toAmount");
        if (!(toAmount > 0)) return fieldError(form, "toAmount", "Ingresá cuánto llega a la otra cuenta.");
        const values = { fromId: data.fromId, toId: data.toId, amount, toAmount, date: data.date, description: data.description };
        try {
          if (isEdit) store.updateTransfer(tx.id, values);
          else store.addTransfer(values);
        } catch (error) {
          return fieldError(form, "amount", error.message);
        }
        close();
        const s = store.getState();
        toast(isEdit ? "Transferencia actualizada" : `Moviste ${formatMoney(amount, findAccount(s, data.fromId).currency)} a ${findAccount(s, data.toId).name}`);
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", () => {
        const backup = store.snapshot();
        store.deleteTransaction(tx.id);
        close();
        toast("Transferencia eliminada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Detalle de una cuenta
// ---------------------------------------------------------------------------

export function openAccountDetail(accountId) {
  const state = store.getState();
  const account = findAccount(state, accountId);
  if (!account) return;
  const entry = accountBalance(state, accountId);
  const card = account.kind === "credit" ? cardStatus(state, account) : null;
  const recent = state.transactions
    .filter((t) => (t.accountId === accountId || t.toAccountId === accountId) && t.date <= todayISO())
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
  openSheet({
    title: accountLabel(account),
    body: html`<div class="account-detail">
      ${card ? art("ilus-tarjeta", 96, "account-detail-art") : ""}
      <p class="account-detail-label">${ACCOUNT_KINDS[account.kind]?.label || "Cuenta"}${account.archived ? " · archivada" : ""}</p>
      ${card
        ? html`<p class="account-detail-balance ${card.debt > 0 ? "is-negative" : ""}">${card.debt > 0 ? formatMoney(card.debt, account.currency) : card.credit > 0 ? formatMoney(card.credit, account.currency) : "Sin deuda"}</p>
            <p class="fine-print">${card.debt > 0 ? "Deuda de hoy · " : card.credit > 0 ? "Saldo a favor · " : ""}Cierra el ${formatDate(card.closing)} · vence el ${formatDate(card.due)}</p>`
        : html`<p class="account-detail-balance ${entry.balance < 0 ? "is-negative" : ""}">${formatMoney(entry.balance, account.currency)}</p>`}
      ${account.currency !== state.settings.mainCurrency ? html`<p class="fine-print">≈ ${formatMoney(entry.balanceMain, state.settings.mainCurrency)}</p>` : ""}
      <div class="account-detail-actions">
        ${card
          ? html`<button type="button" class="btn btn-primary btn-sm" data-do="pay-card">${icon("check", 16)} Pagar tarjeta</button>`
          : html`<button type="button" class="btn btn-soft btn-sm" data-do="transfer">${icon("swap", 16)} Mover plata</button>`}
        <button type="button" class="btn btn-ghost btn-sm" data-do="edit">${icon("edit", 16)} Editar</button>
      </div>
      ${card && card.upcoming.length
        ? html`<h3 class="section-title section-title-spaced">Cuotas por venir · ${formatMoney(card.upcomingTotal, account.currency)}</h3>
            <div class="rows rows-plain">
              ${card.upcoming.map(
                (g) => html`<div class="row installment-row">
                  <span class="row-main">
                    <span class="row-title">${g.title || findCategory(state, g.categoryId)?.name || "Compra"}</span>
                    <span class="row-meta">${g.of > 1 ? `Quedan ${g.remaining} de ${g.of} cuotas` : "Gasto programado"} · próxima el ${formatDate(g.next)}</span>
                  </span>
                  <span class="account-balance">${formatMoney(g.amount / g.remaining, g.currency)}${g.remaining > 1 ? html`<span class="muted-text">/mes</span>` : ""}</span>
                </div>`
              )}
            </div>
            <p class="fine-print">${icon("info", 14)} Cada cuota baja tu total cuando llega su fecha. Las que caen dentro de tu plazo de reserva ya están descontadas del disponible.</p>`
        : ""}
      <h3 class="section-title section-title-spaced">Últimos movimientos</h3>
      ${recent.length
        ? html`<div class="tx-list">${recent.map((t) => txRow(state, t, { withDate: true, hideAccount: true }))}</div>`
        : html`<p class="muted-text">Todavía no hay movimientos en esta cuenta.</p>`}
    </div>`,
    onMount(panel, close) {
      panel.addEventListener("click", (event) => {
        const what = event.target.closest("[data-do]")?.dataset.do;
        if (!what) return;
        close();
        if (what === "transfer") openTransferForm({ fromId: accountId });
        // Pagar la tarjeta: mover plata desde la cuenta principal a la tarjeta.
        if (what === "pay-card") openTransferForm({ fromId: store.defaultAccountId(), toId: accountId, amount: card.debt || undefined, description: `Pago de ${account.name}` });
        if (what === "edit") openAccountForm({ account: store.getState().accounts.find((a) => a.id === accountId) });
      });
    },
  });
}

