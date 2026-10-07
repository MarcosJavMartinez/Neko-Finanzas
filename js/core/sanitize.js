// Validación y limpieza de los datos guardados o importados.
//
// Todo lo que entra al estado (lo que había en el dispositivo, un backup
// importado) pasa por acá: se corrigen tipos, se descartan registros
// inválidos y se reparan referencias rotas. Así un archivo dañado o
// manipulado no puede romper la app ni inyectar estilos: por ejemplo, los
// colores solo pueden ser "#rrggbb" porque se usan dentro de atributos style.

import { CURRENCY_CODES, DEFAULT_REGION, REGIONS } from "./money.js";
import { FREQUENCIES } from "./dates.js";
import { ACCOUNT_KINDS, DEFAULT_CATEGORIES, FALLBACK_CATEGORY, createEmptyState, defaultAccount } from "../data/defaults.js";

export const MAX_AMOUNT = 1e12;
const MAX_TEXT = 120;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v) => (typeof v === "string" && v.length > 0 && v.length <= 80 ? v : "");
const bool = (v) => v === true;
const finite = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const positive = (v) => {
  const n = finite(v);
  return n > 0 && n <= MAX_AMOUNT ? Math.round(n * 100) / 100 : NaN;
};
const signed = (v) => {
  const n = finite(v);
  return Math.abs(n) <= MAX_AMOUNT ? Math.round(n * 100) / 100 : NaN;
};
const color = (v, fallback = "#8b958e") => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const currency = (v, fallback) => (CURRENCY_CODES.includes(v) ? v : fallback);
// Íconos: emoji cortos (un emoji con modificadores ocupa varios caracteres).
const emoji = (v, fallback) => (typeof v === "string" && v.length > 0 && v.length <= 16 && !/[<>"'&]/.test(v) ? v : fallback);

/** "YYYY-MM-DD" que además sea una fecha real. */
export function isISODate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return y >= 1900 && y <= 2200 && date.getMonth() === m - 1 && date.getDate() === d;
}
const date = (v) => (isISODate(v) ? v : "");
const dayOfMonth = (v, fallback) => {
  const n = Math.trunc(finite(v));
  return n >= 1 && n <= 31 ? n : fallback;
};
const time = (v) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "");

export function sanitizeState(input) {
  const base = createEmptyState();
  const data = isObj(input) ? input : {};

  // Monedas: ARS es el pivote y siempre vale 1.
  const rates = { ...base.rates };
  if (isObj(data.rates)) {
    for (const code of CURRENCY_CODES) {
      const n = positive(data.rates[code]);
      if (n) rates[code] = n;
    }
  }
  rates.ARS = 1;

  const s = isObj(data.settings) ? data.settings : {};
  // Datos de antes de que existieran las regiones: eran de Argentina (pesos,
  // dólares y euros). Sin datos (instalación nueva) vale lo detectado.
  const legacy = isObj(data.settings) && !REGIONS[s.region];
  const main = currency(s.mainCurrency, legacy ? "ARS" : base.settings.mainCurrency);
  const settings = {
    ...base.settings,
    region: REGIONS[s.region] ? s.region : legacy ? DEFAULT_REGION : base.settings.region,
    mainCurrency: main,
    currencies: Array.isArray(s.currencies) ? s.currencies.filter((c) => CURRENCY_CODES.includes(c)) : legacy ? ["ARS", "USD", "EUR"] : base.settings.currencies,
    reserveHorizon: s.reserveHorizon === "month" ? "month" : "30d",
    budgetReference: positive(s.budgetReference) || 0,
    billCushion: bool(s.billCushion),
    billCushionReleased: positive(s.billCushionReleased) || 0,
    isDemo: bool(s.isDemo),
    demoEdited: bool(s.demoEdited),
    createdAt: Number.isFinite(Date.parse(str(s.createdAt, 40))) ? str(s.createdAt, 40) : base.settings.createdAt,
  };
  if (isISODate(s.billCushionSince)) settings.billCushionSince = s.billCushionSince;

  // Categorías (las de respaldo "Otros" tienen que existir siempre).
  const seen = new Set();
  const categories = [];
  for (const c of arr(data.categories)) {
    if (!isObj(c) || !id(c.id) || seen.has(c.id) || (c.type !== "expense" && c.type !== "income")) continue;
    seen.add(c.id);
    const subSeen = new Set();
    categories.push({
      id: c.id,
      name: str(c.name, 40) || "Sin nombre",
      icon: emoji(c.icon, "🏷️"),
      color: color(c.color),
      type: c.type,
      builtin: bool(c.builtin),
      subcategories: arr(c.subcategories)
        .filter((sub) => isObj(sub) && id(sub.id) && !subSeen.has(sub.id) && subSeen.add(sub.id))
        .map((sub) => ({ id: sub.id, name: str(sub.name, 40) || "Sin nombre", icon: typeof sub.icon === "string" && sub.icon ? emoji(sub.icon, "") : "" })),
    });
  }
  for (const fallbackId of Object.values(FALLBACK_CATEGORY)) {
    if (!seen.has(fallbackId)) {
      const def = DEFAULT_CATEGORIES.find((c) => c.id === fallbackId);
      categories.push({ ...def, subcategories: [] });
      seen.add(fallbackId);
    }
  }
  const catById = new Map(categories.map((c) => [c.id, c]));
  // Una categoría inexistente o del tipo equivocado pasa a "Otros".
  const categoryFor = (catId, type) => {
    const cat = catById.get(catId);
    return cat && cat.type === type ? cat.id : FALLBACK_CATEGORY[type];
  };
  const subFor = (catId, subId) => (catById.get(catId)?.subcategories.some((sub) => sub.id === subId) ? subId : "");

  // Cuentas. Datos anteriores a las cuentas (sin "accounts"): el saldo
  // inicial de Configuración pasa a ser el de una primera cuenta, así el
  // dinero total no cambia.
  const accounts = [];
  const accIds = new Set();
  if (Array.isArray(data.accounts)) {
    for (const a of data.accounts) {
      if (!isObj(a) || !id(a.id) || accIds.has(a.id)) continue;
      accIds.add(a.id);
      const kind = Object.prototype.hasOwnProperty.call(ACCOUNT_KINDS, a.kind) ? a.kind : "cash";
      const opening = signed(a.opening);
      accounts.push({
        id: a.id,
        name: str(a.name, 40) || "Cuenta",
        icon: emoji(a.icon, ACCOUNT_KINDS[kind].icon),
        color: color(a.color, "#08a7c8"),
        currency: currency(a.currency, main),
        kind,
        opening: Number.isFinite(opening) ? opening : 0,
        archived: bool(a.archived),
        ...(kind === "credit" ? { closingDay: dayOfMonth(a.closingDay, 25), dueDay: dayOfMonth(a.dueDay, 5) } : {}),
      });
    }
  }
  if (!accounts.length) {
    const legacy = signed(s.openingBalance);
    const acc = defaultAccount(currency(s.openingCurrency, main), Number.isFinite(legacy) ? legacy : 0);
    accounts.push(acc);
    accIds.add(acc.id);
  }
  // Cuenta para movimientos sin cuenta (o de una cuenta que ya no existe).
  const fallbackAccount = (accounts.find((a) => !a.archived) || accounts[0]).id;
  const accountFor = (accId) => (accIds.has(accId) ? accId : fallbackAccount);

  // Préstamos (primera pasada: ids válidos, para validar sus movimientos)
  const rawLoans = arr(data.loans).filter((l) => isObj(l) && id(l.id) && (l.direction === "lent" || l.direction === "borrowed") && positive(l.amount) && date(l.date));
  const loanIds = new Set(rawLoans.map((l) => l.id));

  // Movimientos
  const txIds = new Set();
  const transactions = [];
  for (const t of arr(data.transactions)) {
    if (!isObj(t) || !id(t.id) || txIds.has(t.id)) continue;
    // Transferencia entre cuentas: ni ingreso ni gasto.
    if (t.type === "transfer") {
      const amount = positive(t.amount);
      const toAmount = positive(t.toAmount);
      const day = date(t.date);
      if (!amount || !toAmount || !day || !accIds.has(t.accountId) || !accIds.has(t.toAccountId) || t.accountId === t.toAccountId) continue;
      txIds.add(t.id);
      transactions.push({
        id: t.id,
        type: "transfer",
        amount,
        currency: currency(t.currency, main),
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        toAmount,
        toCurrency: currency(t.toCurrency, main),
        date: day,
        time: time(t.time),
        description: str(t.description, 80),
        createdAt: str(t.createdAt, 40) || day,
      });
      continue;
    }
    // Plata de un préstamo (prestada, recibida o devuelta): ni ingreso ni gasto.
    if (t.type === "loan") {
      const amount = positive(t.amount);
      const day = date(t.date);
      if (!amount || !day || !loanIds.has(t.loanId) || !accIds.has(t.accountId) || (t.flow !== "in" && t.flow !== "out")) continue;
      txIds.add(t.id);
      transactions.push({
        id: t.id,
        type: "loan",
        loanId: t.loanId,
        flow: t.flow,
        amount,
        currency: currency(t.currency, main),
        accountId: t.accountId,
        date: day,
        time: time(t.time),
        description: str(t.description, 80),
        createdAt: str(t.createdAt, 40) || day,
      });
      continue;
    }
    const type = t.type === "income" ? "income" : t.type === "expense" ? "expense" : "";
    const amount = positive(t.amount);
    const day = date(t.date);
    if (!type || !amount || !day) continue;
    txIds.add(t.id);
    const categoryId = categoryFor(t.categoryId, type);
    const tx = {
      id: t.id,
      type,
      amount,
      currency: currency(t.currency, main),
      date: day,
      time: time(t.time),
      categoryId,
      subcategoryId: subFor(categoryId, t.subcategoryId),
      description: str(t.description, 80),
      accountId: accountFor(t.accountId),
      createdAt: str(t.createdAt, 40) || day,
    };
    if (id(t.billId)) tx.billId = t.billId;
    // Compra en cuotas: cada cuota es un gasto con su número ("2 de 6").
    if (isObj(t.installment) && id(t.installment.group)) {
      const of = Math.trunc(finite(t.installment.of));
      const n = Math.trunc(finite(t.installment.n));
      if (of >= 1 && of <= 60 && n >= 1 && n <= of) tx.installment = { group: t.installment.group, n, of };
    }
    // Se repite (sueldo, gimnasio…): un ingreso o un gasto suelto; nunca el
    // pago de una factura ni una cuota, que ya tienen su propia fecha.
    if (isObj(t.recurrence) && FREQUENCIES[t.recurrence.freq] && isISODate(t.recurrence.nextDate) && !tx.billId && !tx.installment) {
      tx.recurrence = { freq: t.recurrence.freq, nextDate: t.recurrence.nextDate };
      // Monto habitual, si el último cobro fue distinto (parcial, con descuento…).
      if (positive(t.recurrence.amount)) tx.recurrence.amount = positive(t.recurrence.amount);
    }
    transactions.push(tx);
  }

  // Facturas
  const billIds = new Set();
  const bills = [];
  for (const b of arr(data.bills)) {
    if (!isObj(b) || !id(b.id) || billIds.has(b.id)) continue;
    const amount = positive(b.amount);
    const dueDate = date(b.dueDate);
    if (!amount || !dueDate) continue;
    billIds.add(b.id);
    const categoryId = categoryFor(b.categoryId, "expense");
    const dueDay = Math.trunc(finite(b.dueDay));
    bills.push({
      id: b.id,
      name: str(b.name, 60) || "Factura",
      icon: emoji(b.icon, "🧾"),
      amount,
      currency: currency(b.currency, main),
      dueDate,
      dueDay: dueDay >= 1 && dueDay <= 31 ? dueDay : Number(dueDate.slice(8)),
      frequency: FREQUENCIES[b.frequency] ? b.frequency : "monthly",
      recurring: bool(b.recurring),
      categoryId,
      subcategoryId: subFor(categoryId, b.subcategoryId),
      status: b.status === "paid" ? "paid" : "pending",
      payments: arr(b.payments)
        .filter((p) => isObj(p) && id(p.txId) && isISODate(p.dueDate) && isISODate(p.paidAt))
        .map((p) => {
          const payment = { txId: p.txId, dueDate: p.dueDate, paidAt: p.paidAt };
          // Lo que se esperaba pagar (para el fondo de facturas).
          if (positive(p.expected)) Object.assign(payment, { expected: positive(p.expected), expectedCurrency: currency(p.expectedCurrency, main) });
          return payment;
        }),
      createdAt: str(b.createdAt, 40) || dueDate,
    });
  }
  // Un pago que apunta a una factura borrada queda como gasto normal.
  for (const tx of transactions) if (tx.billId && !billIds.has(tx.billId)) delete tx.billId;

  // Metas
  const goalIds = new Set();
  const goals = [];
  for (const g of arr(data.goals)) {
    if (!isObj(g) || !id(g.id) || goalIds.has(g.id)) continue;
    const target = positive(g.target);
    if (!target) continue;
    goalIds.add(g.id);
    goals.push({
      id: g.id,
      name: str(g.name, 60) || "Meta",
      icon: emoji(g.icon, "🎯"),
      color: color(g.color, "#8a63d2"),
      target,
      currency: currency(g.currency, main),
      targetDate: date(g.targetDate),
      movements: arr(g.movements)
        .filter((m) => isObj(m) && id(m.id) && isISODate(m.date) && signed(m.amount))
        .map((m) => ({ id: m.id, date: m.date, amount: signed(m.amount), note: str(m.note, 80) })),
      createdAt: str(g.createdAt, 40) || settings.createdAt,
    });
  }

  // Préstamos: los pagos solo apuntan a movimientos que existen.
  const seenLoans = new Set();
  const loans = [];
  for (const l of rawLoans) {
    if (seenLoans.has(l.id)) continue;
    seenLoans.add(l.id);
    const loanTx = (txId) => (id(txId) && transactions.some((t) => t.id === txId && t.type === "loan" && t.loanId === l.id) ? txId : "");
    const loan = {
      id: l.id,
      person: str(l.person, 40) || "Alguien",
      direction: l.direction,
      amount: positive(l.amount),
      currency: currency(l.currency, main),
      date: date(l.date),
      dueDate: date(l.dueDate),
      note: str(l.note, 120),
      payments: arr(l.payments)
        .filter((p) => isObj(p) && id(p.id) && isISODate(p.date) && positive(p.amount))
        .map((p) => {
          const payment = { id: p.id, date: p.date, amount: positive(p.amount) };
          if (loanTx(p.txId)) payment.txId = p.txId;
          return payment;
        }),
      createdAt: str(l.createdAt, 40) || date(l.date),
    };
    if (loanTx(l.txId)) loan.txId = l.txId;
    // Préstamo en cuotas: cuántas son y de cuánto (las cuotas son gastos programados).
    if (isObj(l.plan) && id(l.plan.group) && l.direction === "borrowed") {
      const count = Math.trunc(finite(l.plan.count));
      if (count >= 1 && count <= 60 && positive(l.plan.amount)) loan.plan = { group: l.plan.group, count, amount: positive(l.plan.amount) };
    }
    loans.push(loan);
  }

  // Presupuestos
  const budgets = [];
  const budgetIds = new Set();
  for (const b of arr(data.budgets)) {
    if (!isObj(b) || !id(b.id) || budgetIds.has(b.id) || !isObj(b.target)) continue;
    const mode = ["fixed", "percent", "daily"].includes(b.mode) ? b.mode : "";
    const value = positive(b.value);
    if (!mode || !value || (mode === "percent" && value > 100)) continue;
    let target;
    if (b.target.kind === "goal" && goalIds.has(b.target.goalId)) target = { kind: "goal", goalId: b.target.goalId };
    else if (b.target.kind === "rest") target = { kind: "rest" };
    else if (b.target.kind === "categories")
      target = { kind: "categories", categoryIds: arr(b.target.categoryIds).filter((c) => catById.get(c)?.type === "expense") };
    if (!target) continue;
    budgetIds.add(b.id);
    const budget = {
      id: b.id,
      name: str(b.name, 60) || "Presupuesto",
      icon: emoji(b.icon, "🎯"),
      color: color(b.color, "#4a63dd"),
      mode,
      value,
      currency: currency(b.currency, main),
      target,
      // Reservar: lo que falta gastar del mes se descuenta del disponible.
      reserve: bool(b.reserve) && target.kind !== "goal",
    };
    if (date(b.since)) budget.since = b.since;
    if (typeof b.settledMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(b.settledMonth)) budget.settledMonth = b.settledMonth;
    budgets.push(budget);
  }

  // Monedas en uso: la principal y cualquiera que ya aparezca en los datos.
  const usedCurrencies = [main, ...accounts, ...transactions, ...bills, ...goals, ...loans, ...budgets].map((x) => (typeof x === "string" ? x : x.currency)).filter((c) => CURRENCY_CODES.includes(c));
  settings.currencies = CURRENCY_CODES.filter((c) => settings.currencies.includes(c) || usedCurrencies.includes(c));

  return {
    version: base.version,
    settings,
    rates,
    ratesUpdatedAt: str(data.ratesUpdatedAt, 40) || base.ratesUpdatedAt,
    categories,
    accounts,
    transactions,
    bills,
    goals,
    budgets,
    loans,
  };
}
