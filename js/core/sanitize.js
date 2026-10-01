// Validación y limpieza de los datos guardados o importados.
//
// Todo lo que entra al estado (lo que había en el dispositivo, un backup
// importado) pasa por acá: se corrigen tipos, se descartan registros
// inválidos y se reparan referencias rotas. Así un archivo dañado o
// manipulado no puede romper la app ni inyectar estilos: por ejemplo, los
// colores solo pueden ser "#rrggbb" porque se usan dentro de atributos style.

import { CURRENCY_CODES } from "./money.js";
import { FREQUENCIES } from "./dates.js";
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, createEmptyState } from "../data/defaults.js";

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
  const main = currency(s.mainCurrency, "ARS");
  const settings = {
    ...base.settings,
    mainCurrency: main,
    openingBalance: Number.isFinite(signed(s.openingBalance)) ? signed(s.openingBalance) : 0,
    openingCurrency: currency(s.openingCurrency, main),
    reserveHorizon: s.reserveHorizon === "month" ? "month" : "30d",
    budgetReference: positive(s.budgetReference) || 0,
    isDemo: bool(s.isDemo),
    demoEdited: bool(s.demoEdited),
    createdAt: Number.isFinite(Date.parse(str(s.createdAt, 40))) ? str(s.createdAt, 40) : base.settings.createdAt,
  };

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

  // Movimientos
  const txIds = new Set();
  const transactions = [];
  for (const t of arr(data.transactions)) {
    if (!isObj(t) || !id(t.id) || txIds.has(t.id)) continue;
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
      createdAt: str(t.createdAt, 40) || day,
    };
    if (id(t.billId)) tx.billId = t.billId;
    if (isObj(t.recurrence) && FREQUENCIES[t.recurrence.freq] && isISODate(t.recurrence.nextDate) && type === "income") {
      tx.recurrence = { freq: t.recurrence.freq, nextDate: t.recurrence.nextDate };
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
        .map((p) => ({ txId: p.txId, dueDate: p.dueDate, paidAt: p.paidAt })),
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

  // Presupuestos
  const budgets = [];
  const budgetIds = new Set();
  for (const b of arr(data.budgets)) {
    if (!isObj(b) || !id(b.id) || budgetIds.has(b.id) || !isObj(b.target)) continue;
    const mode = b.mode === "fixed" ? "fixed" : b.mode === "percent" ? "percent" : "";
    const value = positive(b.value);
    if (!mode || !value || (mode === "percent" && value > 100)) continue;
    let target;
    if (b.target.kind === "goal" && goalIds.has(b.target.goalId)) target = { kind: "goal", goalId: b.target.goalId };
    else if (b.target.kind === "rest") target = { kind: "rest" };
    else if (b.target.kind === "categories")
      target = { kind: "categories", categoryIds: arr(b.target.categoryIds).filter((c) => catById.get(c)?.type === "expense") };
    if (!target) continue;
    budgetIds.add(b.id);
    budgets.push({
      id: b.id,
      name: str(b.name, 60) || "Presupuesto",
      icon: emoji(b.icon, "🎯"),
      color: color(b.color, "#4a63dd"),
      mode,
      value,
      currency: currency(b.currency, main),
      target,
    });
  }

  return {
    version: base.version,
    settings,
    rates,
    ratesUpdatedAt: str(data.ratesUpdatedAt, 40) || base.ratesUpdatedAt,
    categories,
    transactions,
    bills,
    goals,
    budgets,
  };
}
