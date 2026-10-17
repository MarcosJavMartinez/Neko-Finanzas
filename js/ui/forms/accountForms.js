// Cuentas (efectivo, banco, billetera virtual, ahorro) y transferencias
// entre ellas. Transferir no es gastar: el dinero cambia de lugar.

import { msg, tr } from "../../core/i18n.js";
import { html } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
import { toast } from "../toast.js";
import { art, currencyTiles, segmented, txRow } from "../components.js";
import { textField, emojiPicker, colorPicker, formActions, readForm, fieldError, clearErrors } from "./fields.js";
import * as store from "../../core/store.js";
import { todayISO, formatDate } from "../../core/dates.js";
import { isISODate, MAX_AMOUNT } from "../../core/sanitize.js";
import { formatMoney, amountToInput, parseAmount, convert, currencyChoices, zeroAmount, symbolOf } from "../../core/money.js";
import { accountBalance, cardStatus, findAccount, findCategory, transitStatus } from "../../core/finance.js";
import { ACCOUNT_KINDS, DEFAULT_CATEGORIES } from "../../data/defaults.js";

const ACCOUNT_ICONS = ["👛", "💵", "🏦", "📱", "💳", "🐷", "💰", "🪙", "🏧", "💶", "💴", "🧾", "🚌", "🚇"];

/** Nombre con ícono de una cuenta ("🏦 Cuenta sueldo"). */
export const accountLabel = (account) => (account ? `${account.icon} ${tr(account.name)}` : "Cuenta borrada");

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
      <span class="amount-currency amount-currency-static" data-currency-for="${name}">${symbolOf(currency)}</span>
      <input id="f-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="${zeroAmount()}" value="${value ? amountToInput(value) : ""}" />
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

export function openAccountForm({ account, kind: presetKind, currency: presetCurrency, onSaved } = {}) {
  const state = store.getState();
  const isEdit = Boolean(account);
  const startKind = Object.prototype.hasOwnProperty.call(ACCOUNT_KINDS, presetKind || "") ? presetKind : "bank";
  const current = account || { name: "", icon: ACCOUNT_KINDS[startKind].icon, color: "#08a7c8", currency: presetCurrency || state.settings.mainCurrency, kind: startKind, opening: 0, closingDay: 25, dueDay: 5 };
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
      <div data-transit-fields ${current.kind === "transit" ? "" : "hidden"}>
        ${fixedAmountField({ name: "fare", label: "Precio del pasaje", currency: current.currency, value: current.fare || "", hint: "Para calcular cuántos pasajes te quedan. Si cambia, lo editas aquí." })}
      </div>
      <div class="field">
        <span class="field-label">Moneda</span>
        ${used
          ? html`<p class="field-hint">${icon("lock", 14)} ${current.currency}: no se puede cambiar porque la cuenta ya tiene movimientos.</p>`
          : segmented("currency", currencyTiles(currencyChoices(current.currency)), current.currency, { size: "segmented-wrap" })}
      </div>
      <div data-opening-normal ${isCard ? "hidden" : ""}>
        ${fixedAmountField({ name: "opening", label: "Saldo al empezar", currency: current.currency, value: isCard ? 0 : Math.abs(current.opening || 0), hint: "Lo que tenía esta cuenta antes de registrar movimientos." })}
        <label class="toggle-field">
          <span><span class="toggle-label">Está en rojo</span><span class="field-hint">El saldo es negativo: es dinero que debes (descubierto).</span></span>
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
            <span><span class="toggle-label">Archivada</span><span class="field-hint">No aparece al registrar movimientos. Su saldo sigue contando en el total.</span></span>
            <input type="checkbox" name="archived" class="switch" ${current.archived ? "checked" : ""} />
          </label>`
        : ""}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear cuenta", deletable: isEdit && !used && state.accounts.length > 1 })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      // La moneda del saldo inicial sigue a la elegida.
      form.addEventListener("change", (event) => {
        if (event.target.name === "currency") form.querySelectorAll('[data-currency-for^="opening"], [data-currency-for="fare"]').forEach((el) => (el.textContent = symbolOf(event.target.value)));
        if (event.target.name === "kind") {
          const card = event.target.value === "credit";
          form.querySelector("[data-card-fields]").hidden = !card;
          form.querySelector("[data-opening-normal]").hidden = card;
          form.querySelector("[data-opening-card]").hidden = !card;
          form.querySelector("[data-transit-fields]").hidden = event.target.value !== "transit";
          // Tarjeta de transporte: cada ciudad tiene la suya, así que el nombre lo escribe la persona.
          form.elements.name.placeholder = tr(event.target.value === "transit" ? "Ej.: el nombre de tu tarjeta" : "Ej.: Cuenta sueldo, Efectivo, Billetera");
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
        if (!data.name.trim()) return fieldError(form, "name", "Escribe un nombre para la cuenta.");
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
          fare: data.kind === "transit" && form.elements.fare.value.trim() ? parseAmount(form.elements.fare.value) : 0,
        });
        close();
        toast(isEdit ? "Cuenta actualizada" : msg`Cuenta “${saved.name}” creada`);
        onSaved?.(saved);
      });
      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: msg`¿Eliminar “${account.name}”?`, text: "La cuenta no tiene movimientos, así que no se pierde nada.", confirmLabel: "Eliminar", danger: true });
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

export function openTransferForm({ tx, fromId, toId, amount: presetAmount, description: presetDescription, exchange = false } = {}) {
  const state = store.getState();
  const active = state.accounts.filter((a) => !a.archived);
  if (exchange && !tx) {
    // Cambiar divisas: de una cuenta a otra en distinta moneda (sin tarjetas).
    const plain = active.filter((a) => a.kind !== "credit");
    const main = state.settings.mainCurrency;
    const other = plain.find((a) => a.currency !== main);
    if (!other) {
      const code = state.settings.currencies.find((c) => c !== main);
      toast(code ? msg`Para cambiar divisas necesitas una cuenta en ${code}` : "Primero agrega otra moneda en Idioma y monedas", { type: "info" });
      return code ? openAccountForm({ kind: "cash", currency: code }) : (location.hash = "#/monedas");
    }
    fromId ||= other.id;
    toId ||= plain.find((a) => a.currency !== findAccount(state, fromId).currency)?.id;
    presetDescription ||= tr("Cambio de divisas");
  }
  if (!tx && active.length < 2) {
    toast("Necesitas al menos dos cuentas para mover dinero entre ellas", { type: "info" });
    return openAccountForm();
  }
  const isEdit = Boolean(tx);
  const from = tx?.accountId || fromId || store.defaultAccountId();
  const to = tx?.toAccountId || toId || active.find((a) => a.id !== from)?.id;

  openSheet({
    title: isEdit ? "Editar transferencia" : exchange ? "Cambiar divisas" : "Mover dinero",
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Pasar dinero de una cuenta a otra no es un gasto: tu total no cambia.</p>
      <div class="field-row field-row-transfer">
        ${accountSelect(state, { name: "fromId", label: "Desde", value: from })}
        <span class="transfer-arrow" aria-hidden="true">${icon("chevronRight", 20)}</span>
        ${accountSelect(state, { name: "toId", label: "Hacia", value: to })}
      </div>
      ${fixedAmountField({ name: "amount", label: "Monto", currency: findAccount(state, from)?.currency, value: tx?.amount || presetAmount })}
      <div data-to-amount hidden>
        ${fixedAmountField({ name: "toAmount", label: "Llega a la otra cuenta", currency: findAccount(state, to)?.currency, value: tx?.toAmount, hint: "Sugerido con tu tipo de cambio. Si cambiaste a otro valor, corrígelo." })}
      </div>
      <div class="field">
        <label class="field-label" for="f-date">Fecha</label>
        <input id="f-date" name="date" type="date" value="${tx?.date || todayISO()}" required />
        <p class="field-error" data-error-for="date"></p>
      </div>
      ${textField({ name: "description", label: "Descripción", value: tx?.description || presetDescription || "", placeholder: "Ej.: Retiro del cajero, compra de dólares" })}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Mover dinero", deletable: isEdit })}
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
        if (hint && differ) hint.textContent = msg`Sugerido con tu tipo de cambio (${formatMoney(convert(1, b.currency, a.currency, s.rates), a.currency, { reveal: true })} por ${b.currency}). Si cambiaste a otro valor, corrígelo.`;
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
        if (data.fromId === data.toId) return fieldError(form, "amount", "Elige dos cuentas distintas.");
        if (!(amount > 0)) return fieldError(form, "amount", "Ingresa un monto mayor a cero.");
        if (!isISODate(data.date)) return fieldError(form, "date", "Elige una fecha válida.");
        const toAmount = toBox.hidden ? amount : readMoney(form, "toAmount");
        if (!(toAmount > 0)) return fieldError(form, "toAmount", "Ingresa cuánto llega a la otra cuenta.");
        const values = { fromId: data.fromId, toId: data.toId, amount, toAmount, date: data.date, description: data.description };
        try {
          if (isEdit) store.updateTransfer(tx.id, values);
          else store.addTransfer(values);
        } catch (error) {
          return fieldError(form, "amount", error.message);
        }
        close();
        const s = store.getState();
        const a = findAccount(s, data.fromId);
        const b = findAccount(s, data.toId);
        // Entre la moneda principal y otra: si el cambio fue distinto del que tienes
        // cargado, se ofrece usarlo (la app no lo cambia sola).
        const main = s.settings.mainCurrency;
        const pair = a.currency !== b.currency && [a.currency, b.currency].includes(main);
        const code = pair && (a.currency === main ? b.currency : a.currency);
        const paid = pair && (a.currency === main ? amount / toAmount : toAmount / amount);
        const now = pair && convert(1, code, main, s.rates);
        if (!isEdit && pair && Math.abs(paid - now) / now > 0.005) {
          toast(msg`Cambiaste a ${formatMoney(paid, main, { reveal: true })} por ${code}. Tu tipo de cambio es ${formatMoney(now, main, { reveal: true })}.`, {
            type: "info",
            actionLabel: "Usar este valor",
            duration: 6000,
            onAction: () => {
              store.setRateInMain(code, Math.round(paid * 1e6) / 1e6);
              toast(msg`Tipo de cambio actualizado: ${formatMoney(paid, main, { reveal: true })} por ${code}`);
            },
          });
        } else {
          toast(isEdit ? "Transferencia actualizada" : msg`Moviste ${formatMoney(amount, a.currency)} a ${b.name}`);
        }
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
  const transit = account.kind === "transit" ? transitStatus(state, account) : null;
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
      ${transit ? transitBox(account, transit) : ""}
      <div class="account-detail-actions">
        ${transit
          ? html`<button type="button" class="btn btn-primary btn-sm" data-do="trip">${icon("check", 16)} Viajé</button>
              <button type="button" class="btn btn-soft btn-sm" data-do="load">${icon("plus", 16)} Cargar</button>
              <button type="button" class="btn btn-ghost btn-sm" data-do="fix">${icon("refresh", 16)} Corregir saldo</button>`
          : ""}
        ${transit ? "" : card
          ? html`<button type="button" class="btn btn-primary btn-sm" data-do="pay-card">${icon("check", 16)} Pagar tarjeta</button>`
          : html`<button type="button" class="btn btn-soft btn-sm" data-do="transfer">${icon("swap", 16)} Mover dinero</button>`}
        <button type="button" class="btn btn-ghost btn-sm" data-do="edit">${icon("edit", 16)} Editar</button>
      </div>
      ${card && card.upcoming.length
        ? html`<h3 class="section-title section-title-spaced">Cuotas por venir · ${formatMoney(card.upcomingTotal, account.currency)}</h3>
            <div class="rows rows-plain">
              ${card.upcoming.map(
                (g) => html`<div class="row installment-row">
                  <span class="row-main">
                    <span class="row-title">${g.title || findCategory(state, g.categoryId)?.name || "Compra"}</span>
                    <span class="row-meta">${g.of > 1 ? msg`Quedan ${g.remaining} de ${g.of} cuotas` : "Gasto programado"} · próxima el ${formatDate(g.next)}</span>
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
        // Pagar la tarjeta: mover dinero desde la cuenta principal a la tarjeta.
        if (what === "pay-card") openTransferForm({ fromId: store.defaultAccountId(), toId: accountId, amount: card.debt || undefined, description: msg`Pago de ${account.name}` });
        if (what === "edit") openAccountForm({ account: store.getState().accounts.find((a) => a.id === accountId) });
        if (what === "trip") openTripForm(accountId);
        if (what === "load") openTransitLoad(accountId);
        if (what === "fix") openTransitFix(accountId);
      });
    },
  });
}


// ---------------------------------------------------------------------------
// Tarjeta de transporte
// ---------------------------------------------------------------------------

/** "Te quedan 4 pasajes" (y "Te queda 1 pasaje"), con el aviso de cargar si son pocos. */
export function tripsLeftText(trips, low = false) {
  if (trips === 1) return tr(low ? "Te queda 1 pasaje: conviene cargar" : "Te queda 1 pasaje");
  return low ? msg`Te quedan ${trips} pasajes: conviene cargar` : msg`Te quedan ${trips} pasajes`;
}

/** Pasajes que quedan, y cuánto se cargó y gastó este mes. */
export function transitBox(account, status) {
  const m = (n) => formatMoney(n, account.currency);
  return html`<div class="transit-box ${status.low ? "is-low" : ""}">
    ${status.trips !== null
      ? html`<p class="transit-trips">${tripsLeftText(status.trips)}</p>
          <p class="transit-sub">${status.low ? "Te quedan pocos: conviene cargar." : msg`Con el pasaje a ${m(status.fare)}`}</p>`
      : html`<p class="transit-sub">Pon el precio del pasaje (en Editar) para ver cuántos te quedan.</p>`}
    <p class="transit-month">${msg`Este mes cargaste ${m(status.loaded)} y gastaste ${m(status.spent)}`}</p>
  </div>`;
}

/** Subcategoría "Transporte público" si sigue existiendo. */
function transitCategory(state) {
  const cat = state.categories.find((c) => c.id === "exp-transporte");
  const sub = cat?.subcategories?.find((x) => x.id === "exp-transporte.sube");
  return { categoryId: cat ? cat.id : "", subcategoryId: sub ? sub.id : "" };
}

/** "Viajé": uno o más pasajes, como gasto en Transporte desde la tarjeta. */
export function openTripForm(accountId) {
  const state = store.getState();
  const account = findAccount(state, accountId);
  if (!account) return;
  openSheet({
    title: msg`Viaje con ${account.name}`,
    body: html`<form class="form" novalidate>
      <div class="field">
        <span class="field-label">¿Cuántos viajes?</span>
        <div class="stepper">
          <button type="button" class="btn btn-ghost btn-sm" data-step="-1" aria-label="Uno menos">${icon("minus", 18)}</button>
          <input type="number" name="trips" min="1" max="50" value="1" inputmode="numeric" aria-label="Viajes" />
          <button type="button" class="btn btn-ghost btn-sm" data-step="1" aria-label="Uno más">${icon("plus", 18)}</button>
        </div>
      </div>
      ${fixedAmountField({ name: "fare", label: "Precio del pasaje", currency: account.currency, value: account.fare || "", hint: account.fare ? "" : "Se guarda como el precio de esta tarjeta." })}
      <p class="field-hint" data-trip-total></p>
      <div class="field">
        <label class="field-label" for="f-date">Fecha</label>
        <input id="f-date" name="date" type="date" value="${todayISO()}" required />
      </div>
      ${formActions({ submitLabel: "Anotar" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      const total = () => {
        const n = Math.max(1, Math.min(50, Math.round(Number(form.elements.trips.value) || 1)));
        const fare = readMoney(form, "fare");
        form.querySelector("[data-trip-total]").textContent = fare > 0 ? msg`Total: ${formatMoney(n * fare, account.currency)}` : "";
        return { n, fare };
      };
      form.addEventListener("click", (event) => {
        const step = event.target.closest("[data-step]");
        if (!step) return;
        form.elements.trips.value = Math.max(1, Math.min(50, (Number(form.elements.trips.value) || 1) + Number(step.dataset.step)));
        total();
      });
      form.addEventListener("input", total);
      total();
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const { n, fare } = total();
        if (!(fare > 0)) return fieldError(form, "fare", "Pon el precio del pasaje.");
        if (!isISODate(form.elements.date.value)) return fieldError(form, "date", "Elige una fecha válida.");
        const s = store.getState();
        if (!account.fare) store.saveAccount({ ...account, fare });
        store.addTransaction({
          type: "expense",
          amount: Math.round(n * fare * 100) / 100,
          currency: account.currency,
          accountId,
          date: form.elements.date.value,
          description: n === 1 ? tr("Viaje") : msg`${n} viajes`,
          ...transitCategory(s),
        });
        close();
        const left = transitStatus(store.getState(), findAccount(store.getState(), accountId));
        toast(left.trips !== null ? `${tr("Anotado.")} ${tripsLeftText(left.trips, left.low)}` : "Viaje anotado");
      });
    },
  });
}

/** "Cargar": mover dinero de otra cuenta a la tarjeta. */
export function openTransitLoad(accountId) {
  const state = store.getState();
  const from = state.accounts.find((a) => !a.archived && a.id !== accountId && a.kind !== "credit" && a.kind !== "transit" && a.currency === findAccount(state, accountId)?.currency);
  openTransferForm({ fromId: from?.id, toId: accountId, description: tr("Carga") });
}

/** "Corregir saldo": el saldo real de la tarjeta; lo que falta son viajes sin anotar. */
export function openTransitFix(accountId) {
  const state = store.getState();
  const account = findAccount(state, accountId);
  if (!account) return;
  const now = transitStatus(state, account).balance;
  openSheet({
    title: msg`Corregir saldo de ${account.name}`,
    body: html`<form class="form" novalidate>
      <p class="sheet-text">Mira el saldo real en la terminal, en la boletería o en la app de la tarjeta. Lo que falte se anota como viajes que no anotaste.</p>
      ${fixedAmountField({ name: "real", label: "Saldo real", currency: account.currency, value: "", hint: msg`La app tiene ${formatMoney(now, account.currency)}.` })}
      ${formActions({ submitLabel: "Corregir" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const text = form.elements.real.value.trim();
        const real = text.startsWith("-") ? -parseAmount(text.slice(1)) : parseAmount(text);
        if (!text || !Number.isFinite(real)) return fieldError(form, "real", "Escribe el saldo que muestra la tarjeta.");
        const diff = Math.round((real - now) * 100) / 100;
        close();
        if (diff === 0) return toast("El saldo ya coincide");
        if (diff > 0) {
          // Tiene más de lo que dice la app: fue una carga que no se anotó.
          toast("Tiene más de lo anotado: anota de dónde salió la carga", { type: "info" });
          const from = store.getState().accounts.find((a) => !a.archived && a.id !== accountId && a.kind !== "credit" && a.kind !== "transit" && a.currency === account.currency);
          return openTransferForm({ fromId: from?.id, toId: accountId, amount: diff, description: tr("Carga") });
        }
        store.addTransaction({ type: "expense", amount: -diff, currency: account.currency, accountId, date: todayISO(), description: tr("Viajes no anotados"), ...transitCategory(store.getState()) });
        toast(msg`Saldo corregido: ${formatMoney(-diff, account.currency)} en viajes no anotados`);
      });
    },
  });
}
