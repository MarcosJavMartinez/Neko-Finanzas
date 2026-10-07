// Asistente de inicio: un cuestionario corto, paso a paso, que pregunta por
// todo lo que la app maneja (cuentas, tarjeta y cuotas, facturas, súper y
// gustos, préstamos, metas) y explica en cada paso para qué sirve. Recién al final carga todo
// junto, así la persona entiende cómo funciona antes de empezar a usarla.
// Lo que no tenga se deja vacío; todo se puede cambiar después.

import { html, setHTML } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, whenHistorySettled } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented } from "../components.js";
import { parseAmount, formatMoney, convert, CURRENCY_CODES, zeroAmount } from "../../core/money.js";
import { MAX_AMOUNT, isISODate } from "../../core/sanitize.js";
import { addMonths, currentMonthKey, todayISO } from "../../core/dates.js";
import * as store from "../../core/store.js";
import { markSetupOffered } from "../../core/prefs.js";

const STEPS = ["basics", "accounts", "card", "bills", "spending", "loans", "goals", "summary"];
const MAX_ROWS = 6;

const BILL_PRESETS = [
  { name: "Alquiler", icon: "🏠", categoryId: "exp-hogar", subcategoryId: "exp-hogar.alquiler" },
  { name: "Expensas", icon: "🏢", categoryId: "exp-hogar", subcategoryId: "exp-hogar.expensas" },
  { name: "Luz", icon: "💡", categoryId: "exp-servicios", subcategoryId: "exp-servicios.luz" },
  { name: "Gas", icon: "🔥", categoryId: "exp-servicios", subcategoryId: "exp-servicios.gas" },
  { name: "Internet", icon: "🌐", categoryId: "exp-servicios", subcategoryId: "exp-servicios.internet" },
  { name: "Celular", icon: "📱", categoryId: "exp-servicios", subcategoryId: "exp-servicios.telefono" },
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

function initialAnswers(state) {
  return {
    currency: state.settings.mainCurrency,
    salary: "",
    accounts: [
      { on: false, name: "Efectivo", kind: "cash", icon: "💵", color: "#2ba66a", amount: "" },
      { on: false, name: "Banco", kind: "bank", icon: "🏦", color: "#08a7c8", amount: "" },
      { on: false, name: "Billetera virtual", kind: "wallet", icon: "📱", color: "#3a86d4", amount: "" },
      { on: false, name: "Dólares ahorrados", kind: "savings", icon: "🐷", color: "#d99a2b", amount: "", usd: true },
    ],
    card: { on: false, name: "Tarjeta de crédito", debt: "", closingDay: 25, dueDay: 5, purchases: [{ what: "", per: "", left: "" }] },
    bills: BILL_PRESETS.map((p) => ({ ...p, on: false, amount: "", day: 10 })),
    groceries: "",
    treats: "",
    loans: [{ direction: "lent", person: "", amount: "", due: "" }],
    goals: [{ name: "", target: "", saved: "" }],
  };
}

// ---------------------------------------------------------------------------
// Piezas de formulario
// ---------------------------------------------------------------------------

const money = (name, value, currency, label) => html`<span class="amount-input">
  <span class="amount-currency amount-currency-static">${currency}</span>
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
    <p class="sheet-text">Son unas preguntas cortas sobre tu plata. Lo que no tengas, dejalo vacío y seguí. Al final cargo todo junto${additive ? " y se suma a lo que ya tenés" : ""}, y después lo podés cambiar cuando quieras.</p>
    <div class="field">
      <span class="field-label">¿En qué moneda manejás tu plata?</span>
      ${segmented("currency", CURRENCY_CODES.map((c) => ({ value: c, label: c })), a.currency, { size: "segmented-wrap" })}
      <p class="field-hint">Los totales se van a mostrar en esta moneda.</p>
    </div>
    ${moneyField("salary", "¿Cuánto cobrás por mes? (opcional)", a.salary, a.currency)}
    <p class="field-hint">Sirve para armar presupuestos en % de tus ingresos. No se suma a tu plata: eso lo cargás en el paso siguiente.</p>`,

  accounts: (a) => html`
    <h3 class="setup-title">¿Dónde tenés tu plata hoy?</h3>
    <p class="sheet-text">Cada lugar es una <strong>cuenta</strong>. La suma de todas es tu dinero total, y cuando cargues un gasto vas a elegir de cuál salió.</p>
    <div class="setup-list">
      ${a.accounts.map(
        (acc, i) => html`<div class="setup-item">
          <label class="setup-check"><input type="checkbox" class="switch" name="acc-on-${i}" ${acc.on ? "checked" : ""} /><span>${acc.icon} ${acc.name}</span></label>
          ${money(`acc-amount-${i}`, acc.amount, acc.usd ? "USD" : a.currency, `Cuánto tenés en ${acc.name}`)}
        </div>`
      )}
    </div>
    <p class="field-hint">Escribí cuánto hay en cada una (se marca sola). Después podés agregar más cuentas o cambiarles el nombre en Más → Cuentas.</p>`,

  card: (a) => html`
    <h3 class="setup-title">¿Usás tarjeta de crédito?</h3>
    <p class="sheet-text">Lo que comprás con tarjeta queda como <strong>deuda</strong> hasta que pagás el resumen. Las compras en cuotas se cargan una por mes, y las que se acercan se descuentan de tu disponible.</p>
    <label class="toggle-field">
      <span><span class="toggle-label">Sí, tengo tarjeta</span></span>
      <input type="checkbox" class="switch" name="card-on" ${a.card.on ? "checked" : ""} />
    </label>
    <div data-card-box ${a.card.on ? "" : "hidden"}>
      ${textInput("card-name", "Nombre", a.card.name, "Ej.: Visa del banco")}
      ${moneyField("card-debt", "¿Cuánto debés hoy? (sin las cuotas que todavía no llegaron)", a.card.debt, a.currency)}
      <div class="field-row">
        ${daySelect("card-closing", "Cierra el día", a.card.closingDay)}
        ${daySelect("card-due", "Vence el día", a.card.dueDay)}
      </div>
      <p class="setup-subtitle">¿Estás pagando algo en cuotas?</p>
      ${a.card.purchases.map(
        (p, i) => html`<div class="setup-group">
          ${textInput(`pur-what-${i}`, "Qué compraste", p.what, "Ej.: Heladera")}
          <div class="field-row">
            ${moneyField(`pur-per-${i}`, "Cada cuota", p.per, a.currency)}
            <label class="field"><span class="field-label">Cuotas que faltan</span><input name="pur-left-${i}" type="text" inputmode="numeric" value="${p.left}" placeholder="${zeroAmount()}" autocomplete="off" /></label>
          </div>
        </div>`
      )}
      ${addButton("add-purchase", "Otra compra en cuotas", a.card.purchases.length)}
    </div>`,

  bills: (a) => html`
    <h3 class="setup-title">¿Qué pagás todos los meses?</h3>
    <p class="sheet-text">Son tus <strong>facturas</strong>. La app reserva la plata de las que vencen pronto, así tu disponible ya las tiene descontadas, y te avisa cuándo vencen.</p>
    <div class="setup-list">
      ${a.bills.map(
        (b, i) => html`<div class="setup-item setup-item-bill">
          <label class="setup-check"><input type="checkbox" class="switch" name="bill-on-${i}" ${b.on ? "checked" : ""} /><span>${b.icon} ${b.name}</span></label>
          ${money(`bill-amount-${i}`, b.amount, a.currency, `Monto de ${b.name}`)}
          <label class="setup-day"><span>día</span><select name="bill-day-${i}" aria-label="Día del mes en que vence ${b.name}">${Array.from({ length: 31 }, (_, d) => d + 1).map((d) => html`<option value="${d}" ${d === Number(b.day) ? "selected" : ""}>${d}</option>`)}</select></label>
        </div>`
      )}
    </div>
    <p class="field-hint">Poné el monto aproximado y el día del mes en que vence. Después podés sumar otras en Facturas.</p>`,

  spending: (a) => html`
    <h3 class="setup-title">El súper y los gustos</h3>
    <p class="sheet-text">Hay gastos que no son facturas pero igual los tenés todos los meses. La app puede <strong>reservar</strong> esa plata para que no la cuentes como libre. Lo que no gastes a fin de mes, te ofrece pasarlo a tus ahorros.</p>
    ${moneyField("groceries", "¿Cuánto gastás por mes en el supermercado? (aprox.)", a.groceries, a.currency)}
    ${moneyField("treats", "¿Cuánto querés para gustos por día? (un café, un alfajor)", a.treats, a.currency)}
    <p class="field-hint">Los gustos se acumulan: si un día no gastás, al otro tenés el doble. Cuentan los gastos de Comida y Entretenimiento; lo podés cambiar en Presupuestos.</p>`,

  loans: (a) => html`
    <h3 class="setup-title">¿Le debés plata a alguien, o te deben?</h3>
    <p class="sheet-text">Los <strong>préstamos</strong> no son gastos ni ingresos: la app lleva la cuenta de cuánto falta. Lo que debés con fecha se reserva de tu disponible cuando se acerca.</p>
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
    <p class="sheet-text">Una <strong>meta</strong> es plata que apartás para algo. Sigue siendo tuya, pero deja de contar como disponible para que no la gastes sin querer.</p>
    ${a.goals.map(
      (g, i) => html`<div class="setup-group">
        ${textInput(`goal-name-${i}`, "¿Para qué?", g.name, "Ej.: Vacaciones")}
        <div class="field-row">
          ${moneyField(`goal-target-${i}`, "¿Cuánto querés juntar?", g.target, a.currency)}
          ${moneyField(`goal-saved-${i}`, "¿Cuánto ya tenés?", g.saved, a.currency)}
        </div>
      </div>`
    )}
    ${addButton("add-goal", "Otra meta", a.goals.length)}
    <p class="field-hint">Lo que ya tenés ahorrado tiene que estar dentro de la plata que cargaste en tus cuentas.</p>`,

  summary: (a, additive, state) => {
    const lines = summaryLines(a, state);
    return html`
      <h3 class="setup-title">Listo, esto es lo que voy a cargar</h3>
      ${lines.length
        ? html`<ul class="setup-summary">${lines.map(([emoji, text]) => html`<li><span aria-hidden="true">${emoji}</span><span>${text}</span></li>`)}</ul>`
        : html`<p class="notice notice-info">${icon("info", 16)}No cargaste nada todavía. Podés volver atrás, o empezar con la app vacía e ir sumando de a poco.</p>`}
      <p class="sheet-text">Con eso, el Inicio te va a mostrar tu <strong>saldo disponible</strong>: tu plata total, menos lo reservado (facturas, cuotas, deudas, súper y gustos), menos lo apartado en metas.</p>
      <p class="field-hint">Después seguís con normalidad: cargás cada gasto e ingreso con «Agregar transacción».</p>`;
  },
};

function summaryLines(a, state) {
  const m = (v, c = a.currency) => formatMoney(v, c, { reveal: true });
  const lines = [];
  const accounts = a.accounts.filter((x) => x.on);
  if (accounts.length) {
    const total = accounts.reduce((s, x) => s + convert(num(x.amount) || 0, x.usd ? "USD" : a.currency, a.currency, state.rates), 0);
    lines.push(["👛", `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"}: ${accounts.map((x) => x.name).join(", ")} · ${m(total)} en total`]);
  }
  if (num(a.salary) > 0) lines.push(["💼", `Ingreso de referencia: ${m(num(a.salary))} por mes`]);
  if (a.card.on) {
    const purchases = validPurchases(a);
    lines.push(["💳", `${a.card.name.trim() || "Tarjeta de crédito"} · deuda de hoy ${m(num(a.card.debt) || 0)}${purchases.length ? ` · ${purchases.length} compra${purchases.length === 1 ? "" : "s"} en cuotas` : ""}`]);
  }
  const bills = a.bills.filter((b) => b.on && num(b.amount) > 0);
  if (bills.length) lines.push(["🧾", `${bills.length} factura${bills.length === 1 ? "" : "s"}: ${bills.map((b) => b.name).join(", ")} · ${m(bills.reduce((s, b) => s + num(b.amount), 0))} por mes`]);
  if (num(a.groceries) > 0) lines.push(["🛒", `Supermercado: ${m(num(a.groceries))} reservados por mes`]);
  if (num(a.treats) > 0) lines.push(["☕", `Gustos: ${m(num(a.treats))} por día, acumulables`]);
  const loans = validLoans(a);
  const lent = loans.filter((l) => l.direction === "lent").reduce((s, l) => s + num(l.amount), 0);
  const borrowed = loans.filter((l) => l.direction === "borrowed").reduce((s, l) => s + num(l.amount), 0);
  if (loans.length) lines.push(["🤝", [lent > 0 && `Te deben ${m(lent)}`, borrowed > 0 && `debés ${m(borrowed)}`].filter(Boolean).join(" · ")]);
  const goals = validGoals(a);
  if (goals.length) lines.push(["🎯", `${goals.length} meta${goals.length === 1 ? "" : "s"}: ${goals.map((g) => g.name.trim()).join(", ")} · ${m(goals.reduce((s, g) => s + (num(g.saved) || 0), 0))} ya apartados`]);
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
  if (step === "accounts" && a.accounts.some((x) => x.on && bad(x.amount))) return "Revisá los montos de tus cuentas: alguno no es válido.";
  if (step === "card" && a.card.on) {
    if (bad(a.card.debt)) return "La deuda de la tarjeta no es un monto válido.";
    for (const p of a.card.purchases) {
      if (!filled(p.what, p.per, p.left)) continue;
      const left = Number(p.left);
      if (!(num(p.per) > 0)) return "Poné cuánto pagás por cada cuota.";
      if (!Number.isInteger(left) || left < 1 || left > 60) return "Poné cuántas cuotas faltan (un número entre 1 y 60).";
    }
  }
  if (step === "bills" && a.bills.some((b) => b.on && !(num(b.amount) > 0))) return "Poné el monto de las facturas que marcaste (o desmarcalas).";
  if (step === "spending" && (bad(a.groceries) || bad(a.treats))) return "Revisá los montos: alguno no es válido.";
  if (step === "loans") {
    for (const l of a.loans) {
      if (!filled(l.person, l.amount, l.due)) continue;
      if (!l.person.trim()) return "Poné el nombre de la persona.";
      if (!(num(l.amount) > 0)) return "Poné cuánto falta devolver.";
      if (l.due && !isISODate(l.due)) return "La fecha para devolver no es válida.";
    }
  }
  if (step === "goals") {
    for (const g of a.goals) {
      if (!filled(g.name, g.target, g.saved)) continue;
      if (!g.name.trim()) return "Poné un nombre para la meta.";
      if (!(num(g.target) > 0)) return "Poné cuánto querés juntar.";
      if (bad(g.saved)) return "Lo que ya tenés ahorrado no es un monto válido.";
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Cargar todo
// ---------------------------------------------------------------------------

/** Próxima fecha (hoy incluido) que cae ese día del mes. */
function nextDayOfMonth(day, today) {
  const thisMonth = addMonths(`${currentMonthKey()}-01`, 0, day);
  return thisMonth >= today ? thisMonth : addMonths(thisMonth, 1, day);
}

/** Crea todo lo respondido. Si la app estaba vacía, la primera cuenta reemplaza a "Mi plata". */
export function applySetup(a) {
  const today = todayISO();
  const wasEmpty = store.isEmptyState();
  store.setMainCurrency(a.currency);
  if (num(a.salary) > 0) store.updateSettings({ budgetReference: num(a.salary) });

  // Cuentas
  let replaceDefault = wasEmpty;
  const defaultAccount = () => store.getState().accounts.find((x) => x.id === store.defaultAccountId());
  for (const acc of a.accounts.filter((x) => x.on)) {
    const data = { name: acc.name, kind: acc.kind, icon: acc.icon, color: acc.color, currency: acc.usd ? "USD" : a.currency, opening: num(acc.amount) || 0 };
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

  // Súper reservado por mes y gustos por día (presupuestos con la plata reservada)
  if (num(a.groceries) > 0) {
    store.saveBudget({ name: "Supermercado", icon: "🛒", color: "#2ba66a", mode: "fixed", value: num(a.groceries), currency: a.currency, target: { kind: "categories", categoryIds: ["exp-super"] }, reserve: true });
  }
  if (num(a.treats) > 0) {
    store.saveBudget({ name: "Gustos", icon: "☕", color: "#d99a2b", mode: "daily", value: num(a.treats), currency: a.currency, target: { kind: "categories", categoryIds: ["exp-comida", "exp-entretenimiento"] }, reserve: true });
  }

  // Préstamos: solo se anotan (esa plata ya está reflejada en lo que cargaste en tus cuentas)
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
  const answers = initialAnswers(store.getState());
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
        form.querySelector("[data-setup=back]").textContent = index === 0 ? "Después" : "Atrás";
        form.querySelector("[data-setup-next]").textContent = last ? "Cargar todo" : "Siguiente";
        panel.querySelector(".sheet-body").scrollTop = 0;
      };

      const fail = (message) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
        errorBox.scrollIntoView({ block: "nearest" });
      };

      // Escribir un monto marca solo esa cuenta o factura.
      form.addEventListener("input", (event) => {
        const match = /^(acc|bill)-amount-(\d+)$/.exec(event.target.name || "");
        if (match && event.target.value.trim()) form.elements[`${match[1]}-on-${match[2]}`].checked = true;
      });
      form.addEventListener("change", (event) => {
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
        toast("¡Listo! Ya está todo cargado. Ahora sumá tus gastos con «Agregar transacción»", { duration: 7000, actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        whenHistorySettled(() => (location.hash = "#/inicio"));
      });

      show();
    },
  });
}
