// Asistente de inicio: un cuestionario corto, paso a paso, que pregunta por
// todo lo que la app maneja (cuentas, tarjeta y cuotas, facturas, supermercado y
// gustos, préstamos, metas) y explica en cada paso para qué sirve. Recién al final carga todo
// junto, así la persona entiende cómo funciona antes de empezar a usarla.
// Lo que no tenga se deja vacío; todo se puede cambiar después.

import { msg, tr, LANGUAGES, getLanguage, saveLanguage } from "../../core/i18n.js";
import { html, setHTML } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, whenHistorySettled } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented } from "../components.js";
import { parseAmount, amountToInput, formatMoney, convert, CURRENCIES, CURRENCY_CODES, REGIONS, getRegion, zeroAmount, symbolOf } from "../../core/money.js";
import { MAX_AMOUNT, isISODate } from "../../core/sanitize.js";
import { addMonths, currentMonthKey, todayISO } from "../../core/dates.js";
import * as store from "../../core/store.js";
import { markSetupOffered } from "../../core/prefs.js";

/** Marca para reabrir el asistente después de cambiar de idioma (la app se recarga). */
export const REOPEN_KEY = "nekoFinanzas.reopenSetup";

const STEPS = ["basics", "currencies", "accounts", "card", "bills", "spending", "loans", "goals", "summary"];
const MAX_ROWS = 6;

const BILL_PRESETS = [
  { name: "Alquiler", icon: "🏠", categoryId: "exp-hogar", subcategoryId: "exp-hogar.alquiler" },
  { name: "Gastos comunes", icon: "🏢", categoryId: "exp-hogar", subcategoryId: "exp-hogar.expensas" },
  { name: "Luz", icon: "💡", categoryId: "exp-servicios", subcategoryId: "exp-servicios.luz" },
  { name: "Gas", icon: "🔥", categoryId: "exp-servicios", subcategoryId: "exp-servicios.gas" },
  { name: "Internet", icon: "🌐", categoryId: "exp-servicios", subcategoryId: "exp-servicios.internet" },
  { name: "Teléfono", icon: "📱", categoryId: "exp-servicios", subcategoryId: "exp-servicios.telefono" },
  { name: "Streaming", icon: "📺", categoryId: "exp-suscripciones", subcategoryId: "" },
];

/** Monto escrito por la persona: "" → 0; inválido o negativo → NaN. */
function num(text) {
  const t = String(text ?? "").trim();
  if (!t) return 0;
  const v = parseAmount(t);
  return Number.isFinite(v) && v >= 0 && v <= MAX_AMOUNT ? Math.round(v * 100) / 100 : NaN;
}

const filled = (...values) => values.some((v) => String(v ?? "").trim() !== "");

/**
 * Un tipo de cambio se pregunta en el sentido cómodo de leer: "1 USD = 1.350
 * ARS", o al revés ("1 USD = 150 JPY") cuando la moneda principal vale más.
 */
function rateView(code, main, rates) {
  const inMain = rates[code] / rates[main];
  return inMain >= 1 ? { from: code, to: main, value: inMain, inverse: false } : { from: main, to: code, value: 1 / inMain, inverse: true };
}

const savingsAccount = (code) => ({ on: false, name: code === "USD" ? "Dólares ahorrados" : msg`Ahorros en ${code}`, kind: "savings", icon: "🐷", color: "#d99a2b", amount: "", cur: code });

/** Cada moneda extra tiene su cuenta de ahorros para completar; si se saca la moneda, se va su cuenta. */
function syncAccounts(a) {
  a.extras = a.extras.filter((e) => e.code !== a.currency && CURRENCIES[e.code]);
  const keep = a.accounts.filter((acc) => !acc.cur || a.extras.some((e) => e.code === acc.cur));
  for (const e of a.extras) if (!keep.some((acc) => acc.cur === e.code)) keep.push(savingsAccount(e.code));
  a.accounts = keep;
  return a;
}

function initialAnswers(state, additive) {
  const main = state.settings.mainCurrency;
  // Con datos propios, las monedas que ya usa; de cero, se propone el dólar como moneda de ahorro.
  const extras = additive ? state.settings.currencies.filter((c) => c !== main) : main === "USD" ? [] : ["USD"];
  return syncAccounts({
    extras: extras.map((code) => ({ code, rate: "" })),
    currency: main,
    salary: "",
    accounts: [
      { on: false, name: "Efectivo", kind: "cash", icon: "💵", color: "#2ba66a", amount: "" },
      { on: false, name: "Banco", kind: "bank", icon: "🏦", color: "#08a7c8", amount: "" },
      { on: false, name: "Billetera virtual", kind: "wallet", icon: "📱", color: "#3a86d4", amount: "" },
    ],
    card: { on: false, name: "Tarjeta de crédito", debt: "", closingDay: 25, dueDay: 5, purchases: [{ what: "", per: "", left: "" }] },
    bills: BILL_PRESETS.map((p) => ({ ...p, on: false, amount: "", day: 10 })),
    groceries: "",
    treats: "",
    loans: [{ direction: "lent", person: "", amount: "", due: "" }],
    goals: [{ name: "", target: "", saved: "" }],
  });
}

// ---------------------------------------------------------------------------
// Piezas de formulario
// ---------------------------------------------------------------------------

const money = (name, value, currency, label) => html`<span class="amount-input">
  <span class="amount-currency amount-currency-static">${symbolOf(currency)}</span>
  <input name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="${zeroAmount()}" value="${value}" aria-label="${label}" />
</span>`;

const textInput = (name, label, value, placeholder) => html`<label class="field">
  <span class="field-label">${label}</span>
  <input name="${name}" type="text" value="${value}" maxlength="40" placeholder="${placeholder}" autocomplete="off" />
</label>`;

const moneyField = (name, label, value, currency) => html`<label class="field">
  <span class="field-label">${label}</span>
  ${money(name, value, currency, label)}
</label>`;

const daySelect = (name, label, value) => html`<label class="field">
  <span class="field-label">${label}</span>
  <select name="${name}">${Array.from({ length: 31 }, (_, i) => i + 1).map((d) => html`<option value="${d}" ${d === Number(value) ? "selected" : ""}>${d}</option>`)}</select>
</label>`;

const addButton = (what, label, count) =>
  count < MAX_ROWS ? html`<button type="button" class="btn btn-soft btn-sm" data-setup="${what}">${icon("plus", 16)} ${label}</button>` : "";

// ---------------------------------------------------------------------------
// Pasos: cada uno explica el concepto y pregunta lo justo
// ---------------------------------------------------------------------------

const RENDER = {
  basics: (a, additive) => html`
    <h3 class="setup-title">Empecemos por lo básico</h3>
    <p class="sheet-text">Son unas preguntas cortas sobre tu dinero. Lo que no tengas, déjalo vacío y sigue. Al final registro todo junto${additive ? " y se suma a lo que ya tienes" : ""}, y después lo puedes cambiar cuando quieras.</p>
    <div class="setup-locale">
      <label class="field">
        <span class="field-label">Idioma</span>
        <select name="setup-language">${Object.entries(LANGUAGES).map(([code, l]) => html`<option value="${code}" ${code === getLanguage() ? "selected" : ""}>${l.name}</option>`)}</select>
      </label>
      <label class="field">
        <span class="field-label">País</span>
        <select name="setup-region">${Object.values(REGIONS).map((r) => html`<option value="${r.code}" ${r.code === getRegion() ? "selected" : ""}>${r.name}</option>`)}</select>
      </label>
    </div>
    <label class="field">
      <span class="field-label">¿En qué moneda manejas tu dinero?</span>
      <select name="currency">${CURRENCY_CODES.map((code) => html`<option value="${code}" ${code === a.currency ? "selected" : ""}>${symbolOf(code)} · ${CURRENCIES[code].name}</option>`)}</select>
      <span class="field-hint">Los totales se van a mostrar en esta moneda. Si tu país no está en la lista, elige el más parecido y cambia la moneda.</span>
    </label>
    ${moneyField("salary", "¿Cuánto cobras por mes? (opcional)", a.salary, a.currency)}
    <p class="field-hint">Sirve para crear presupuestos en % de tus ingresos. No se suma a tu dinero: eso lo indicas en el paso siguiente.</p>`,

  currencies: (a, additive, state) => {
    const offered = [...new Set(["USD", "EUR", ...a.extras.map((e) => e.code)])].filter((code) => code !== a.currency);
    const rest = CURRENCY_CODES.filter((code) => code !== a.currency && !offered.includes(code));
    return html`
    <h3 class="setup-title">¿Usas otras monedas?</h3>
    <p class="sheet-text">Para ahorros, cobros o compras en otra moneda. Si manejas todo en una sola, desmarca las que no uses y sigue.</p>
    <div class="currency-toggles">
      ${offered.map(
        (code) => html`<label class="chip-check" title="${CURRENCIES[code].name}">
          <input type="checkbox" name="cur-on-${code}" ${a.extras.some((e) => e.code === code) ? "checked" : ""} />
          <span>${symbolOf(code)} ${code}</span>
        </label>`
      )}
    </div>
    <label class="field">
      <span class="field-label">Agregar otra moneda</span>
      <select name="cur-add">
        <option value="">Elegir…</option>
        ${rest.map((code) => html`<option value="${code}">${symbolOf(code)} · ${CURRENCIES[code].name}</option>`)}
      </select>
    </label>
    ${a.extras.length
      ? html`<div class="field">
          <span class="field-label">¿A cuánto está hoy?</span>
          <div class="rates-form">
            ${a.extras.map((e) => {
              const view = rateView(e.code, a.currency, state.rates);
              return html`<label class="rate-edit">
                <span class="rate-edit-left"><span class="cur-badge">${symbolOf(e.code)}</span><span>1 ${view.from} =</span></span>
                <span class="amount-input amount-input-sm">
                  <input name="cur-rate-${e.code}" type="text" inputmode="decimal" autocomplete="off" value="${e.rate}" placeholder="≈ ${amountToInput(Math.round(view.value * 100) / 100)}" aria-label="Valor de 1 ${view.from} en ${view.to}" />
                  <span class="amount-suffix">${view.to}</span>
                </span>
              </label>`;
            })}
          </div>
          <p class="field-hint">Escribe el valor que tú uses. Si lo dejas vacío, ponemos uno aproximado y lo corriges después en Más → Idioma y monedas.</p>
        </div>`
      : ""}`;
  },

  accounts: (a) => html`
    <h3 class="setup-title">¿Dónde tienes tu dinero hoy?</h3>
    <p class="sheet-text">Cada lugar es una <strong>cuenta</strong>. La suma de todas es tu dinero total, y cuando registres un gasto vas a elegir de cuál salió.</p>
    <div class="setup-list">
      ${a.accounts.map(
        (acc, i) => html`<div class="setup-item">
          <label class="setup-check"><input type="checkbox" class="switch" name="acc-on-${i}" ${acc.on ? "checked" : ""} /><span>${acc.icon} ${acc.name}</span></label>
          ${money(`acc-amount-${i}`, acc.amount, acc.cur || a.currency, msg`Cuánto tienes en ${acc.name}`)}
        </div>`
      )}
    </div>
    <p class="field-hint">Escribe cuánto hay en cada una (se marca sola). Después puedes agregar más cuentas o cambiarles el nombre en Más → Cuentas.</p>`,

  card: (a) => html`
    <h3 class="setup-title">¿Usas tarjeta de crédito?</h3>
    <p class="sheet-text">Lo que compras con tarjeta queda como <strong>deuda</strong> hasta que pagas el resumen. Las compras en cuotas se registran una por mes, y las que se acercan se descuentan de tu disponible.</p>
    <label class="toggle-field">
      <span><span class="toggle-label">Sí, tengo tarjeta</span></span>
      <input type="checkbox" class="switch" name="card-on" ${a.card.on ? "checked" : ""} />
    </label>
    <div data-card-box ${a.card.on ? "" : "hidden"}>
      ${textInput("card-name", "Nombre", a.card.name, "Ej.: Visa del banco")}
      ${moneyField("card-debt", "¿Cuánto debes hoy? (sin las cuotas que todavía no llegaron)", a.card.debt, a.currency)}
      <div class="field-row">
        ${daySelect("card-closing", "Cierra el día", a.card.closingDay)}
        ${daySelect("card-due", "Vence el día", a.card.dueDay)}
      </div>
      <p class="setup-subtitle">¿Estás pagando algo en cuotas?</p>
      ${a.card.purchases.map(
        (p, i) => html`<div class="setup-group">
          ${textInput(`pur-what-${i}`, "Qué compraste", p.what, "Ej.: Refrigerador")}
          <div class="field-row">
            ${moneyField(`pur-per-${i}`, "Cada cuota", p.per, a.currency)}
            <label class="field"><span class="field-label">Cuotas que faltan</span><input name="pur-left-${i}" type="text" inputmode="numeric" value="${p.left}" placeholder="${zeroAmount()}" autocomplete="off" /></label>
          </div>
        </div>`
      )}
      ${addButton("add-purchase", "Otra compra en cuotas", a.card.purchases.length)}
    </div>`,

  bills: (a) => html`
    <h3 class="setup-title">¿Qué pagas todos los meses?</h3>
    <p class="sheet-text">Son tus <strong>facturas</strong>. La app reserva el dinero de las que vencen pronto, así tu disponible ya las tiene descontadas, y te avisa cuándo vencen.</p>
    <div class="setup-list">
      ${a.bills.map(
        (b, i) => html`<div class="setup-item setup-item-bill">
          <label class="setup-check"><input type="checkbox" class="switch" name="bill-on-${i}" ${b.on ? "checked" : ""} /><span>${b.icon} ${b.name}</span></label>
          ${money(`bill-amount-${i}`, b.amount, a.currency, msg`Monto de ${b.name}`)}
          <label class="setup-day"><span>día</span><select name="bill-day-${i}" aria-label="Día del mes en que vence ${b.name}">${Array.from({ length: 31 }, (_, d) => d + 1).map((d) => html`<option value="${d}" ${d === Number(b.day) ? "selected" : ""}>${d}</option>`)}</select></label>
        </div>`
      )}
    </div>
    <p class="field-hint">Escribe el monto aproximado y el día del mes en que vence. Después puedes sumar otras en Facturas.</p>`,

  spending: (a) => html`
    <h3 class="setup-title">El supermercado y los gustos</h3>
    <p class="sheet-text">Hay gastos que no son facturas pero igual los tienes todos los meses. La app puede <strong>reservar</strong> ese dinero para que no lo cuentes como libre. Lo que no gastes a fin de mes, te ofrece pasarlo a tus ahorros.</p>
    ${moneyField("groceries", "¿Cuánto gastas por mes en el supermercado? (aprox.)", a.groceries, a.currency)}
    ${moneyField("treats", "¿Cuánto quieres para gustos por día? (un café, un helado)", a.treats, a.currency)}
    <p class="field-hint">Los gustos se acumulan: si un día no gastas, al otro tienes el doble. Cuentan los gastos de Comida y Entretenimiento; lo puedes cambiar en Presupuestos.</p>`,

  loans: (a) => html`
    <h3 class="setup-title">¿Le debes dinero a alguien, o te deben?</h3>
    <p class="sheet-text">Los <strong>préstamos</strong> no son gastos ni ingresos: la app lleva la cuenta de cuánto falta. Lo que debes con fecha se reserva de tu disponible cuando se acerca.</p>
    ${a.loans.map(
      (l, i) => html`<div class="setup-group">
        ${segmented(`loan-dir-${i}`, [{ value: "lent", label: "Me deben" }, { value: "borrowed", label: "Debo" }], l.direction)}
        <div class="field-row">
          ${textInput(`loan-person-${i}`, "¿Quién?", l.person, "Ej.: Caro")}
          ${moneyField(`loan-amount-${i}`, "¿Cuánto falta?", l.amount, a.currency)}
        </div>
        <label class="field"><span class="field-label">Fecha para devolver (opcional)</span><input name="loan-due-${i}" type="date" value="${l.due}" /></label>
      </div>`
    )}
    ${addButton("add-loan", "Otro préstamo", a.loans.length)}`,

  goals: (a) => html`
    <h3 class="setup-title">¿Estás ahorrando para algo?</h3>
    <p class="sheet-text">Una <strong>meta</strong> es dinero que apartas para algo. Sigue siendo tuyo, pero deja de contar como disponible para que no lo gastes sin querer.</p>
    ${a.goals.map(
      (g, i) => html`<div class="setup-group">
        ${textInput(`goal-name-${i}`, "¿Para qué?", g.name, "Ej.: Vacaciones")}
        <div class="field-row">
          ${moneyField(`goal-target-${i}`, "¿Cuánto quieres reunir?", g.target, a.currency)}
          ${moneyField(`goal-saved-${i}`, "¿Cuánto ya tienes?", g.saved, a.currency)}
        </div>
      </div>`
    )}
    ${addButton("add-goal", "Otra meta", a.goals.length)}
    <p class="field-hint">Lo que ya tienes ahorrado tiene que estar dentro del dinero que indicaste en tus cuentas.</p>`,

  summary: (a, additive, state) => {
    const lines = summaryLines(a, state);
    return html`
      <h3 class="setup-title">Listo, esto es lo que voy a registrar</h3>
      ${lines.length
        ? html`<ul class="setup-summary">${lines.map(([emoji, text]) => html`<li><span aria-hidden="true">${emoji}</span><span>${text}</span></li>`)}</ul>`
        : html`<p class="notice notice-info">${icon("info", 16)}No ingresaste nada todavía. Puedes volver atrás, o empezar con la app vacía e ir sumando poco a poco.</p>`}
      <p class="sheet-text">Con eso, el Inicio te va a mostrar tu <strong>saldo disponible</strong>: tu dinero total, menos lo reservado (facturas, cuotas, deudas, supermercado y gustos), menos lo apartado en metas.</p>
      <p class="field-hint">Después sigues con normalidad: registras cada gasto e ingreso con «Agregar transacción».</p>`;
  },
};

function summaryLines(a, state) {
  const m = (v, c = a.currency) => formatMoney(v, c, { reveal: true });
  const lines = [];
  const accounts = a.accounts.filter((x) => x.on);
  if (accounts.length) {
    const total = accounts.reduce((s, x) => s + convert(num(x.amount) || 0, x.cur || a.currency, a.currency, state.rates), 0);
    lines.push(["👛", msg`${accounts.length} cuenta${accounts.length === 1 ? "" : "s"}: ${accounts.map((x) => x.name).join(", ")} · ${m(total)} en total`]);
  }
  if (num(a.salary) > 0) lines.push(["💼", msg`Ingreso de referencia: ${m(num(a.salary))} por mes`]);
  if (a.card.on) {
    const purchases = validPurchases(a);
    lines.push(["💳", msg`${a.card.name.trim() || "Tarjeta de crédito"} · deuda de hoy ${m(num(a.card.debt) || 0)}${purchases.length ? msg` · ${purchases.length} compra${purchases.length === 1 ? "" : "s"} en cuotas` : ""}`]);
  }
  const bills = a.bills.filter((b) => b.on && num(b.amount) > 0);
  if (bills.length) lines.push(["🧾", msg`${bills.length} factura${bills.length === 1 ? "" : "s"}: ${bills.map((b) => b.name).join(", ")} · ${m(bills.reduce((s, b) => s + num(b.amount), 0))} por mes`]);
  if (num(a.groceries) > 0) lines.push(["🛒", msg`Supermercado: ${m(num(a.groceries))} reservados por mes`]);
  if (num(a.treats) > 0) lines.push(["☕", msg`Gustos: ${m(num(a.treats))} por día, acumulables`]);
  const loans = validLoans(a);
  const lent = loans.filter((l) => l.direction === "lent").reduce((s, l) => s + num(l.amount), 0);
  const borrowed = loans.filter((l) => l.direction === "borrowed").reduce((s, l) => s + num(l.amount), 0);
  if (loans.length) lines.push(["🤝", [lent > 0 && msg`Te deben ${m(lent)}`, borrowed > 0 && msg`debes ${m(borrowed)}`].filter(Boolean).join(" · ")]);
  const goals = validGoals(a);
  if (goals.length) lines.push(["🎯", msg`${goals.length} meta${goals.length === 1 ? "" : "s"}: ${goals.map((g) => g.name.trim()).join(", ")} · ${m(goals.reduce((s, g) => s + (num(g.saved) || 0), 0))} ya apartados`]);
  // Las otras monedas solo acompañan: si no se respondió nada más, el resumen sigue vacío.
  if (lines.length && a.extras.length) lines.unshift(["💱", msg`Otras monedas: ${a.extras.map((e) => e.code).join(", ")}`]);
  return lines;
}

const validPurchases = (a) => a.card.purchases.filter((p) => num(p.per) > 0 && Number(p.left) >= 1);
const validLoans = (a) => a.loans.filter((l) => l.person.trim() && num(l.amount) > 0);
const validGoals = (a) => a.goals.filter((g) => g.name.trim() && num(g.target) > 0);

// ---------------------------------------------------------------------------
// Leer y validar cada paso
// ---------------------------------------------------------------------------

/** Pasa lo escrito en pantalla a las respuestas. */
function collect(step, form, a) {
  const v = (name) => form.elements[name]?.value ?? "";
  const on = (name) => Boolean(form.elements[name]?.checked);
  if (step === "basics") {
    a.currency = v("currency") || a.currency;
    a.salary = v("salary");
    syncAccounts(a);
  } else if (step === "currencies") {
    a.extras.forEach((e) => (e.rate = v(`cur-rate-${e.code}`)));
    syncAccounts(a);
  } else if (step === "accounts") {
    a.accounts.forEach((acc, i) => Object.assign(acc, { on: on(`acc-on-${i}`), amount: v(`acc-amount-${i}`) }));
  } else if (step === "card") {
    Object.assign(a.card, { on: on("card-on"), name: v("card-name"), debt: v("card-debt"), closingDay: Number(v("card-closing")) || 25, dueDay: Number(v("card-due")) || 5 });
    a.card.purchases.forEach((p, i) => Object.assign(p, { what: v(`pur-what-${i}`), per: v(`pur-per-${i}`), left: v(`pur-left-${i}`).trim() }));
  } else if (step === "bills") {
    a.bills.forEach((b, i) => Object.assign(b, { on: on(`bill-on-${i}`), amount: v(`bill-amount-${i}`), day: Number(v(`bill-day-${i}`)) || 10 }));
  } else if (step === "spending") {
    a.groceries = v("groceries");
    a.treats = v("treats");
  } else if (step === "loans") {
    a.loans.forEach((l, i) => Object.assign(l, { direction: v(`loan-dir-${i}`) || "lent", person: v(`loan-person-${i}`), amount: v(`loan-amount-${i}`), due: v(`loan-due-${i}`) }));
  } else if (step === "goals") {
    a.goals.forEach((g, i) => Object.assign(g, { name: v(`goal-name-${i}`), target: v(`goal-target-${i}`), saved: v(`goal-saved-${i}`) }));
  }
}

/** Devuelve el problema del paso en palabras, o "" si está todo bien. */
function validate(step, a) {
  const bad = (text) => Number.isNaN(num(text));
  if (step === "basics" && bad(a.salary)) return "El sueldo no es un monto válido.";
  if (step === "currencies") {
    const wrong = a.extras.find((e) => e.rate.trim() && !(parseAmount(e.rate) > 0));
    if (wrong) return msg`El tipo de cambio de ${wrong.code} no es válido.`;
  }
  if (step === "accounts" && a.accounts.some((x) => x.on && bad(x.amount))) return "Revisa los montos de tus cuentas: alguno no es válido.";
  if (step === "card" && a.card.on) {
    if (bad(a.card.debt)) return "La deuda de la tarjeta no es un monto válido.";
    for (const p of a.card.purchases) {
      if (!filled(p.what, p.per, p.left)) continue;
      const left = Number(p.left);
      if (!(num(p.per) > 0)) return "Escribe cuánto pagas por cada cuota.";
      if (!Number.isInteger(left) || left < 1 || left > 60) return "Escribe cuántas cuotas faltan (un número entre 1 y 60).";
    }
  }
  if (step === "bills" && a.bills.some((b) => b.on && !(num(b.amount) > 0))) return "Escribe el monto de las facturas que marcaste (o desmárcalas).";
  if (step === "spending" && (bad(a.groceries) || bad(a.treats))) return "Revisa los montos: alguno no es válido.";
  if (step === "loans") {
    for (const l of a.loans) {
      if (!filled(l.person, l.amount, l.due)) continue;
      if (!l.person.trim()) return "Escribe el nombre de la persona.";
      if (!(num(l.amount) > 0)) return "Escribe cuánto falta devolver.";
      if (l.due && !isISODate(l.due)) return "La fecha para devolver no es válida.";
    }
  }
  if (step === "goals") {
    for (const g of a.goals) {
      if (!filled(g.name, g.target, g.saved)) continue;
      if (!g.name.trim()) return "Escribe un nombre para la meta.";
      if (!(num(g.target) > 0)) return "Escribe cuánto quieres reunir.";
      if (bad(g.saved)) return "Lo que ya tienes ahorrado no es un monto válido.";
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Guardar todo
// ---------------------------------------------------------------------------

/** Próxima fecha (hoy incluido) que cae ese día del mes. */
function nextDayOfMonth(day, today) {
  const thisMonth = addMonths(`${currentMonthKey()}-01`, 0, day);
  return thisMonth >= today ? thisMonth : addMonths(thisMonth, 1, day);
}

/** Crea todo lo respondido. Si la app estaba vacía, la primera cuenta reemplaza a "Mi dinero". */
export function applySetup(a) {
  const today = todayISO();
  const wasEmpty = store.isEmptyState();
  store.setMainCurrency(a.currency);
  // Otras monedas: quedan las elegidas, cada una con el tipo de cambio que escribió la persona.
  const extras = a.extras || [];
  for (const code of store.getState().settings.currencies) if (code !== a.currency && !extras.some((e) => e.code === code)) store.toggleCurrency(code, false);
  for (const e of extras) {
    store.toggleCurrency(e.code, true);
    const value = parseAmount(e.rate || "");
    if (value > 0) store.setRateInMain(e.code, rateView(e.code, a.currency, store.getState().rates).inverse ? 1 / value : value);
  }
  if (num(a.salary) > 0) store.updateSettings({ budgetReference: num(a.salary) });

  // Cuentas
  let replaceDefault = wasEmpty;
  const defaultAccount = () => store.getState().accounts.find((x) => x.id === store.defaultAccountId());
  for (const acc of a.accounts.filter((x) => x.on)) {
    const data = { name: acc.name, kind: acc.kind, icon: acc.icon, color: acc.color, currency: acc.cur || a.currency, opening: num(acc.amount) || 0 };
    if (replaceDefault) store.saveAccount({ ...defaultAccount(), ...data });
    else store.saveAccount(data);
    replaceDefault = false;
  }
  // Sin cuentas elegidas, la cuenta inicial queda en la moneda elegida.
  if (replaceDefault) store.saveAccount({ ...defaultAccount(), currency: a.currency });

  // Tarjeta y cuotas que faltan (la próxima cae el mes que viene)
  if (a.card.on) {
    const card = store.saveAccount({ name: a.card.name.trim() || "Tarjeta de crédito", kind: "credit", icon: "💳", color: "#7651e8", currency: a.currency, opening: -(num(a.card.debt) || 0), closingDay: a.card.closingDay, dueDay: a.card.dueDay });
    for (const p of validPurchases(a)) {
      const left = Math.min(60, Math.trunc(Number(p.left)));
      const data = { type: "expense", amount: Math.round(num(p.per) * left * 100) / 100, currency: a.currency, date: addMonths(today, 1), categoryId: "exp-otros", accountId: card.id, description: p.what.trim() || "Compra en cuotas" };
      if (left >= 2) store.addInstallmentPurchase(data, left);
      else store.addTransaction(data);
    }
  }

  // Facturas mensuales
  for (const b of a.bills.filter((x) => x.on && num(x.amount) > 0)) {
    const day = Math.min(31, Math.max(1, Math.trunc(b.day) || 10));
    store.addBill({ name: b.name, icon: b.icon, amount: num(b.amount), currency: a.currency, dueDate: nextDayOfMonth(day, today), dueDay: day, frequency: "monthly", recurring: true, categoryId: b.categoryId, subcategoryId: b.subcategoryId });
  }

  // Supermercado reservado por mes y gustos por día (presupuestos con el dinero reservado)
  if (num(a.groceries) > 0) {
    store.saveBudget({ name: "Supermercado", icon: "🛒", color: "#2ba66a", mode: "fixed", value: num(a.groceries), currency: a.currency, target: { kind: "categories", categoryIds: ["exp-super"] }, reserve: true });
  }
  if (num(a.treats) > 0) {
    store.saveBudget({ name: "Gustos", icon: "☕", color: "#d99a2b", mode: "daily", value: num(a.treats), currency: a.currency, target: { kind: "categories", categoryIds: ["exp-comida", "exp-entretenimiento"] }, reserve: true });
  }

  // Préstamos: solo se anotan (ese dinero ya está reflejada en lo que cargaste en tus cuentas)
  for (const l of validLoans(a)) {
    store.addLoan({ person: l.person, direction: l.direction, amount: num(l.amount), currency: a.currency, date: today, dueDate: isISODate(l.due) ? l.due : "", accountId: "" });
  }

  // Metas, con lo que ya tenían ahorrado
  for (const g of validGoals(a)) {
    const goal = store.addGoal({ name: g.name.trim().slice(0, 60), icon: "🎯", color: "#8a63d2", target: num(g.target), currency: a.currency, targetDate: "" });
    if (num(g.saved) > 0) store.moveGoalMoney(goal.id, num(g.saved), "Lo que ya tenía ahorrado");
  }
}

// ---------------------------------------------------------------------------
// La hoja
// ---------------------------------------------------------------------------

export function openSetupWizard() {
  markSetupOffered();
  const additive = !store.isEmptyState();
  const answers = initialAnswers(store.getState(), additive);
  let index = 0;

  openSheet({
    title: "Tu punto de partida",
    body: html`<form class="form setup" novalidate data-step="0">
      <div data-setup-body></div>
      <p class="notice notice-warn" data-setup-error hidden></p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-setup="back">Atrás</button>
        <button type="submit" class="btn btn-primary btn-grow" data-setup-next>Siguiente</button>
      </div>
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      const body = form.querySelector("[data-setup-body]");
      const errorBox = form.querySelector("[data-setup-error]");
      const step = () => STEPS[index];

      const show = () => {
        const last = index === STEPS.length - 1;
        form.dataset.step = String(index);
        setHTML(
          body,
          html`<p class="setup-progress">Paso ${index + 1} de ${STEPS.length}</p>
            <div class="ob-dots" aria-hidden="true">${STEPS.map((_, i) => html`<span class="ob-dot ${i === index ? "is-active" : ""}"></span>`)}</div>
            ${RENDER[step()](answers, additive, store.getState())}`
        );
        errorBox.hidden = true;
        form.querySelector("[data-setup=back]").textContent = tr(index === 0 ? "Después" : "Atrás");
        form.querySelector("[data-setup-next]").textContent = tr(last ? "Guardar todo" : "Siguiente");
        panel.querySelector(".sheet-body").scrollTop = 0;
      };

      const fail = (message) => {
        errorBox.textContent = tr(message);
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: "nearest" });
      };

      // Escribir un monto marca solo esa cuenta o factura.
      form.addEventListener("input", (event) => {
        const match = /^(acc|bill)-amount-(\d+)$/.exec(event.target.name || "");
        if (match && event.target.value.trim()) form.elements[`${match[1]}-on-${match[2]}`].checked = true;
      });
      form.addEventListener("change", (event) => {
        const { name, value } = event.target;
        if (name === "setup-language") {
          // Cambiar de idioma recarga la app: el asistente se vuelve a abrir solo.
          saveLanguage(value);
          try {
            sessionStorage.setItem(REOPEN_KEY, "1");
          } catch (error) {
            /* sin sessionStorage: se abre desde Configuración */
          }
          location.reload();
        } else if (name === "cur-add" || name.startsWith("cur-on-")) {
          // Marcar o agregar una moneda muestra su tipo de cambio; desmarcarla lo saca.
          collect(step(), form, answers);
          const code = name === "cur-add" ? value : name.slice(7);
          const has = answers.extras.some((e) => e.code === code);
          if (code && !has && (name === "cur-add" || event.target.checked)) answers.extras.push({ code, rate: "" });
          else if (name !== "cur-add" && !event.target.checked) answers.extras = answers.extras.filter((e) => e.code !== code);
          syncAccounts(answers);
          show();
        } else if (name === "setup-region" || name === "currency") {
          // El país propone su moneda y su forma de escribir los números; la moneda se puede cambiar aparte.
          collect(step(), form, answers);
          if (name === "setup-region") {
            store.setRegion(value);
            answers.currency = REGIONS[value]?.currency || answers.currency;
          }
          show();
        }
        if (event.target.name === "card-on") form.querySelector("[data-card-box]").hidden = !event.target.checked;
      });

      form.addEventListener("click", (event) => {
        const what = event.target.closest("[data-setup]")?.dataset.setup;
        if (!what) return;
        collect(step(), form, answers);
        if (what === "back") {
          if (index === 0) return close();
          index--;
        } else if (what === "add-purchase") answers.card.purchases.push({ what: "", per: "", left: "" });
        else if (what === "add-loan") answers.loans.push({ direction: "lent", person: "", amount: "", due: "" });
        else if (what === "add-goal") answers.goals.push({ name: "", target: "", saved: "" });
        show();
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        collect(step(), form, answers);
        const problem = validate(step(), answers);
        if (problem) return fail(problem);
        if (index < STEPS.length - 1) {
          index++;
          return show();
        }
        const backup = store.snapshot();
        applySetup(answers);
        close();
        toast("¡Listo! Ya está todo registrado. Ahora suma tus gastos con «Agregar transacción»", { duration: 7000, actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        whenHistorySettled(() => (location.hash = "#/inicio"));
      });

      show();
    },
  });
}
