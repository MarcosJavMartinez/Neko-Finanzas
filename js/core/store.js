// Estado de la app y todas las acciones que lo modifican. Ninguna pantalla
// toca los datos directamente: llaman a estas acciones, que guardan en el
// dispositivo y avisan a los suscriptores para que se vuelva a dibujar.
//
// Regla: ninguna acción mueve plata "por su cuenta". Pagar una factura
// registra un gasto visible; depositar en una meta queda en su historial;
// un ingreso recurrente solo se registra cuando el usuario lo confirma.

import { initStorage, loadData, saveData, clearData, onWriteError, saveSnapshot, listSnapshots, loadSnapshot } from "./storage.js";
import { ACCOUNT_KINDS, DEFAULT_ACCOUNT_ID, createEmptyState, DEFAULT_CATEGORIES, defaultSubcategories, FALLBACK_CATEGORY, PALETTE, PALETTE_V1, SCHEMA_VERSION, uid } from "../data/defaults.js";
import { buildDemoState } from "../data/demo.js";
import { sanitizeState } from "./sanitize.js";
import { addMonths, nextDate, todayISO } from "./dates.js";
import { convert, CURRENCY_CODES } from "./money.js";

let state = null;
const listeners = new Set();
const saveErrorListeners = new Set();

export async function initStore() {
  const saved = await initStorage();
  state = migrate(saved || buildDemoState());
  if (!saved) saveData(state);
  maybeDailySnapshot();
  return state;
}

onWriteError(() => saveErrorListeners.forEach((fn) => fn()));

// ---------------------------------------------------------------------------
// Copias automáticas: una por día y otra antes de cada acción que reemplaza
// todo (importar, cargar el ejemplo, empezar de cero, restaurar una copia).
// Los datos de ejemplo sin tocar o una app vacía no se copian: no hay nada
// tuyo que recuperar.
// ---------------------------------------------------------------------------

function worthSaving(s = state) {
  return s && !isPristineDemo(s) && !isEmptyState(s);
}

function snapshotBefore(reason) {
  if (worthSaving()) saveSnapshot(state, reason);
}

/** Copia diaria (si la última tiene más de 20 horas). */
export async function maybeDailySnapshot() {
  if (!worthSaving()) return;
  const [last] = await listSnapshots();
  if (!last || Date.now() - Date.parse(last.at) > 20 * 3600 * 1000) await saveSnapshot(state, "Copia diaria");
}

export { listSnapshots };

/** Vuelve a una copia automática (antes guarda una copia de lo actual). */
export async function restoreSnapshot(id) {
  const data = await loadSnapshot(id);
  if (!data) throw new Error("No se encontró esa copia");
  snapshotBefore("Antes de restaurar una copia");
  restore(data);
}

/** Datos de ejemplo sin tocar (se pueden reemplazar sin perder nada tuyo). */
export function isPristineDemo(s = state) {
  return s.settings.isDemo && !s.settings.demoEdited;
}

/** Sin nada cargado: ni movimientos, ni facturas, ni metas, ni saldo inicial. */
export function isEmptyState(s = state) {
  return !s.transactions.length && !s.bills.length && !s.goals.length && !s.budgets.length && !(s.loans || []).length && s.accounts.every((a) => !a.opening);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Avisa cuando no se pudo guardar (almacenamiento lleno o bloqueado). */
export function onSaveError(fn) {
  saveErrorListeners.add(fn);
  return () => saveErrorListeners.delete(fn);
}

function commit(mutator) {
  const before = state;
  const result = mutator(state);
  // Cambios propios sobre los datos de ejemplo: desde ahí ya hay algo tuyo
  // que cuidar (recordatorio de backup, no ofrecer "empezar de cero" sin más).
  // Cargar el ejemplo, reiniciar o importar reemplazan el estado y no cuentan.
  if (state === before && state.settings.isDemo) state.settings.demoEdited = true;
  if (!saveData(state)) saveErrorListeners.forEach((fn) => fn());
  listeners.forEach((fn) => fn(state));
  return result;
}

/**
 * Otra pestaña guardó cambios: se recargan para no pisarlos después.
 * Devuelve false si no había nada para recargar.
 */
export async function reloadFromStorage() {
  const saved = await loadData();
  if (!saved) return false;
  state = migrate(saved);
  listeners.forEach((fn) => fn(state));
  return true;
}

/** Copia completa para poder "deshacer" una acción destructiva. */
export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

export function restore(saved) {
  commit(() => {
    state = migrate(saved);
  });
}

/**
 * Actualiza datos de versiones anteriores y después los valida con
 * sanitizeState: lo que llega del dispositivo o de un backup nunca entra
 * al estado sin pasar por ahí.
 */
function migrate(data) {
  const raw = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
  if (Array.isArray(raw.categories)) {
    raw.categories = raw.categories.map((c) => {
      if (!c || typeof c !== "object") return c;
      // Datos anteriores a las subcategorías: las predeterminadas reciben las suyas.
      let category = Array.isArray(c.subcategories) ? c : { ...c, subcategories: c.builtin ? defaultSubcategories(c.id) : [] };
      // v1 → v2: la paleta pasó a los colores del ícono. Las predeterminadas
      // que conservan su color original reciben el nuevo.
      if ((raw.version || 1) < 2) {
        const def = DEFAULT_CATEGORIES.find((d) => d.id === category.id);
        const index = def ? PALETTE.indexOf(def.color) : -1;
        if (index !== -1 && category.color === PALETTE_V1[index]) category = { ...category, color: def.color };
      }
      return category;
    });
  }
  const clean = sanitizeState(raw);
  clean.version = SCHEMA_VERSION;
  return clean;
}

const find = (list, id) => list.find((item) => item.id === id);
const without = (list, id) => list.filter((item) => item.id !== id);

/**
 * Categoría válida para un movimiento o factura: si no existe (por ejemplo,
 * el usuario borró "Servicios") o es del tipo equivocado, va a "Otros", y la
 * subcategoría solo se conserva si pertenece a esa categoría.
 */
function withValidCategory(s, item, type) {
  const category = find(s.categories, item.categoryId);
  const categoryId = category && category.type === type ? category.id : FALLBACK_CATEGORY[type];
  const subOk = categoryId === item.categoryId && category.subcategories.some((sub) => sub.id === item.subcategoryId);
  return { ...item, categoryId, subcategoryId: subOk ? item.subcategoryId : "" };
}

/** Cuenta por defecto: la primera activa que no sea tarjeta (la de la app recién instalada). */
export function defaultAccountId(s = state) {
  return (s.accounts.find((a) => !a.archived && a.kind !== "credit") || s.accounts.find((a) => !a.archived) || s.accounts[0]).id;
}

/** Un movimiento siempre pertenece a una cuenta que existe. */
function withValidAccount(s, item) {
  return { ...item, accountId: find(s.accounts, item.accountId) ? item.accountId : defaultAccountId(s) };
}

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

export function addTransaction(data) {
  return commit((s) => {
    const tx = withValidAccount(s, withValidCategory(s, { id: uid("tx"), time: "", description: "", createdAt: new Date().toISOString(), ...data }, data.type));
    s.transactions.push(tx);
    return tx;
  });
}

export function updateTransaction(id, data) {
  commit((s) => {
    const tx = find(s.transactions, id);
    if (tx && tx.type !== "transfer") Object.assign(tx, withValidAccount(s, withValidCategory(s, { ...tx, ...data }, data.type || tx.type)));
  });
}

// ---------------------------------------------------------------------------
// Cuentas y transferencias
// ---------------------------------------------------------------------------

/**
 * Transferencia entre dos cuentas: { fromId, toId, amount, toAmount?, date,
 * description }. Si las cuentas tienen distinta moneda, toAmount es lo que
 * llega (por ejemplo, pesos que se convierten en dólares).
 */
function transferValues(s, data) {
  const from = find(s.accounts, data.fromId);
  const to = find(s.accounts, data.toId);
  if (!from || !to || from.id === to.id) throw new Error("Elegí dos cuentas distintas");
  if (!(data.amount > 0)) throw new Error("Ingresá un monto mayor a cero");
  const toAmount = from.currency === to.currency ? data.amount : data.toAmount;
  if (!(toAmount > 0)) throw new Error("Ingresá cuánto llega a la otra cuenta");
  return {
    type: "transfer",
    amount: data.amount,
    currency: from.currency,
    accountId: from.id,
    toAccountId: to.id,
    toAmount,
    toCurrency: to.currency,
    date: data.date || todayISO(),
    time: data.time || "",
    description: (data.description || "").trim(),
  };
}

export function addTransfer(data) {
  return commit((s) => {
    const tx = { id: uid("tx"), createdAt: new Date().toISOString(), ...transferValues(s, data) };
    s.transactions.push(tx);
    return tx;
  });
}

export function updateTransfer(id, data) {
  commit((s) => {
    const tx = find(s.transactions, id);
    if (tx?.type === "transfer") Object.assign(tx, transferValues(s, data));
  });
}

export function countAccountUsage(id) {
  return state.transactions.filter((t) => t.accountId === id || t.toAccountId === id).length;
}

/** Crea o actualiza una cuenta. La moneda solo cambia si no tiene movimientos. */
export function saveAccount(data) {
  return commit((s) => {
    const existing = data.id && find(s.accounts, data.id);
    const kind = Object.prototype.hasOwnProperty.call(ACCOUNT_KINDS, data.kind) ? data.kind : "cash";
    const values = {
      name: (data.name || "").trim().slice(0, 40) || "Cuenta",
      icon: data.icon || ACCOUNT_KINDS[kind].icon,
      color: /^#[0-9a-f]{6}$/i.test(data.color || "") ? data.color : "#08a7c8",
      kind,
      opening: Number.isFinite(data.opening) ? Math.round(data.opening * 100) / 100 : 0,
      archived: Boolean(data.archived),
    };
    if (kind === "credit") {
      const day = (v, fallback) => (Number.isInteger(Number(v)) && v >= 1 && v <= 31 ? Number(v) : fallback);
      values.closingDay = day(data.closingDay, 25);
      values.dueDay = day(data.dueDay, 5);
    }
    if (existing) {
      const used = s.transactions.some((t) => t.accountId === existing.id || t.toAccountId === existing.id);
      if (kind !== "credit") {
        delete existing.closingDay;
        delete existing.dueDay;
      }
      Object.assign(existing, values, used ? {} : { currency: data.currency || existing.currency });
      // Siempre tiene que quedar al menos una cuenta activa.
      if (!s.accounts.some((a) => !a.archived)) existing.archived = false;
      return existing;
    }
    const account = { id: uid("acc"), currency: data.currency || s.settings.mainCurrency, ...values, archived: false };
    s.accounts.push(account);
    return account;
  });
}

/** Solo se borra una cuenta sin movimientos (si tiene, se puede archivar). */
export function deleteAccount(id) {
  if (state.accounts.length <= 1) throw new Error("Tiene que quedar al menos una cuenta");
  if (countAccountUsage(id)) throw new Error("Esta cuenta tiene movimientos: podés archivarla");
  commit((s) => {
    s.accounts = without(s.accounts, id);
    if (!s.accounts.some((a) => !a.archived)) s.accounts[0].archived = false;
  });
}

export { DEFAULT_ACCOUNT_ID };

// ---------------------------------------------------------------------------
// Préstamos ("le presté a…", "me prestó…")
// ---------------------------------------------------------------------------

const loanFlow = (loan, isPayment) => ((loan.direction === "lent") === isPayment ? "in" : "out");
const loanText = (loan, isPayment) =>
  loan.direction === "lent" ? (isPayment ? `${loan.person} te devolvió` : `Préstamo a ${loan.person}`) : isPayment ? `Le devolviste a ${loan.person}` : `Préstamo de ${loan.person}`;

function loanMovement(s, loan, { amount, accountId, date, isPayment }) {
  return withValidAccount(s, {
    id: uid("tx"),
    type: "loan",
    loanId: loan.id,
    flow: loanFlow(loan, isPayment),
    amount,
    currency: loan.currency,
    accountId,
    date,
    time: "",
    description: loanText(loan, isPayment),
    createdAt: new Date().toISOString(),
  });
}

function loanValues(data) {
  if (!(data.amount > 0)) throw new Error("Ingresá un monto mayor a cero");
  return {
    person: (data.person || "").trim().slice(0, 40) || "Alguien",
    amount: Math.round(data.amount * 100) / 100,
    currency: data.currency,
    date: data.date || todayISO(),
    dueDate: data.dueDate || "",
    note: (data.note || "").trim().slice(0, 120),
  };
}

/**
 * Nuevo préstamo. Si se indica una cuenta, la plata sale de ella (le
 * prestaste) o entra (te prestaron); si no, solo queda anotado.
 */
export function addLoan(data) {
  return commit((s) => {
    const loan = { id: uid("loan"), direction: data.direction === "borrowed" ? "borrowed" : "lent", ...loanValues(data), payments: [], createdAt: new Date().toISOString() };
    if (data.accountId) {
      const tx = loanMovement(s, loan, { amount: loan.amount, accountId: data.accountId, date: loan.date, isPayment: false });
      s.transactions.push(tx);
      loan.txId = tx.id;
    }
    (s.loans ||= []).push(loan);
    return loan;
  });
}

/** Editar: también ajusta (o crea, o quita) el movimiento de la cuenta. */
export function updateLoan(id, data) {
  commit((s) => {
    const loan = find(s.loans, id);
    if (!loan) return;
    Object.assign(loan, loanValues(data));
    const tx = loan.txId && find(s.transactions, loan.txId);
    if (data.accountId) {
      const values = loanMovement(s, loan, { amount: loan.amount, accountId: data.accountId, date: loan.date, isPayment: false });
      if (tx) Object.assign(tx, { ...values, id: tx.id, createdAt: tx.createdAt });
      else {
        s.transactions.push(values);
        loan.txId = values.id;
      }
    } else if (tx) {
      s.transactions = without(s.transactions, tx.id);
      delete loan.txId;
    }
    // Los pagos pasan a la moneda nueva del préstamo.
    for (const p of loan.payments) {
      const ptx = p.txId && find(s.transactions, p.txId);
      if (ptx) Object.assign(ptx, { currency: loan.currency, description: loanText(loan, true) });
    }
  });
}

/** Borra el préstamo y la plata que movió (con "deshacer" desde la UI). */
export function deleteLoan(id) {
  commit((s) => {
    s.loans = without(s.loans, id);
    s.transactions = s.transactions.filter((t) => !(t.type === "loan" && t.loanId === id));
  });
}

/** Registrar una devolución (parcial o total). */
export function addLoanPayment(loanId, { amount, date = todayISO(), accountId } = {}) {
  return commit((s) => {
    const loan = find(s.loans, loanId);
    if (!loan || !(amount > 0)) return null;
    const payment = { id: uid("pay"), date, amount: Math.round(amount * 100) / 100 };
    if (accountId) {
      const tx = loanMovement(s, loan, { amount: payment.amount, accountId, date, isPayment: true });
      s.transactions.push(tx);
      payment.txId = tx.id;
    }
    loan.payments.push(payment);
    return payment;
  });
}

export function deleteLoanPayment(loanId, paymentId) {
  commit((s) => {
    const loan = find(s.loans, loanId);
    const payment = loan?.payments.find((p) => p.id === paymentId);
    if (!payment) return;
    loan.payments = without(loan.payments, paymentId);
    if (payment.txId) s.transactions = without(s.transactions, payment.txId);
  });
}

// ---------------------------------------------------------------------------
// Compras en cuotas (tarjeta de crédito)
// ---------------------------------------------------------------------------

/**
 * Divide una compra en cuotas mensuales iguales (la última ajusta los
 * centavos). La primera cuota tiene la fecha de la compra y las demás caen
 * mes a mes: quedan "programadas" y se reservan cuando entran en el
 * horizonte de reserva, igual que una factura.
 */
export function addInstallmentPurchase(data, count) {
  const n = Math.max(2, Math.min(60, Math.trunc(count)));
  const total = Math.round(data.amount * 100) / 100;
  const base = Math.floor((total / n) * 100) / 100;
  // Menos de un centavo por cuota no se puede repartir: va en un solo pago.
  if (!(base > 0)) return [addTransaction(data)];
  const group = uid("cuotas");
  const day = Number(data.date.slice(8));
  return commit((s) => {
    const created = [];
    for (let k = 0; k < n; k++) {
      const amount = k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
      const tx = withValidAccount(
        s,
        withValidCategory(
          s,
          { time: "", description: "", ...data, id: uid("tx"), amount, date: addMonths(data.date, k, day), installment: { group, n: k + 1, of: n }, createdAt: new Date().toISOString() },
          data.type
        )
      );
      delete tx.recurrence;
      s.transactions.push(tx);
      created.push(tx);
    }
    return created;
  });
}

/** Borra todas las cuotas de una compra. */
export function deleteInstallmentGroup(group) {
  commit((s) => {
    s.transactions = s.transactions.filter((t) => t.installment?.group !== group);
  });
}

export function deleteTransaction(id) {
  commit((s) => {
    const tx = find(s.transactions, id);
    if (!tx) return;
    s.transactions = without(s.transactions, id);
    // Si era el pago de una factura, la factura vuelve a quedar pendiente.
    if (tx.billId) revertBillPayment(s, tx.billId, id);
    // Plata de un préstamo: el préstamo sigue, sin ese movimiento (y un pago se borra).
    if (tx.type === "loan") {
      const loan = find(s.loans, tx.loanId);
      if (loan?.txId === id) delete loan.txId;
      if (loan) loan.payments = loan.payments.filter((p) => p.txId !== id);
    }
  });
}

/** Confirma un ingreso recurrente: lo registra y programa el siguiente. */
export function confirmRecurring(templateId) {
  return commit((s) => {
    const template = find(s.transactions, templateId);
    if (!template?.recurrence) return null;
    const { freq, nextDate: date } = template.recurrence;
    const tx = {
      ...template,
      id: uid("tx"),
      date,
      time: "",
      createdAt: new Date().toISOString(),
    };
    delete tx.recurrence;
    s.transactions.push(tx);
    // La recurrencia pasa al registro nuevo, así se edita desde el último.
    tx.recurrence = { freq, nextDate: nextDate(date, freq) };
    delete template.recurrence;
    return tx;
  });
}

export function skipRecurring(templateId) {
  commit((s) => {
    const template = find(s.transactions, templateId);
    if (template?.recurrence) {
      template.recurrence.nextDate = nextDate(template.recurrence.nextDate, template.recurrence.freq);
    }
  });
}

// ---------------------------------------------------------------------------
// Facturas y servicios
// ---------------------------------------------------------------------------

export function addBill(data) {
  return commit((s) => {
    const bill = withValidCategory(s, { id: uid("bill"), status: "pending", payments: [], createdAt: todayISO(), ...data }, "expense");
    s.bills.push(bill);
    return bill;
  });
}

export function updateBill(id, data) {
  commit((s) => {
    const bill = find(s.bills, id);
    if (bill) Object.assign(bill, withValidCategory(s, { ...bill, ...data }, "expense"));
  });
}

export function deleteBill(id) {
  commit((s) => {
    s.bills = without(s.bills, id);
    // Los pagos ya registrados quedan como gastos normales.
    s.transactions.forEach((tx) => {
      if (tx.billId === id) delete tx.billId;
    });
  });
}

/**
 * Paga el vencimiento actual: registra un gasto con el monto de la factura
 * y, si es recurrente, pasa al próximo vencimiento.
 */
export function payBill(id, { date = todayISO(), amount, currency, accountId } = {}) {
  return commit((s) => {
    const bill = find(s.bills, id);
    if (!bill) return null;
    const tx = withValidAccount(s, {
      id: uid("tx"),
      type: "expense",
      amount: amount ?? bill.amount,
      currency: currency || bill.currency,
      date,
      time: "",
      categoryId: bill.categoryId,
      subcategoryId: bill.subcategoryId || "",
      description: bill.name,
      billId: bill.id,
      accountId,
      createdAt: new Date().toISOString(),
    });
    s.transactions.push(tx);
    bill.payments.push({ txId: tx.id, dueDate: bill.dueDate, paidAt: date });
    if (bill.recurring) bill.dueDate = nextDate(bill.dueDate, bill.frequency, bill.dueDay);
    else bill.status = "paid";
    return tx;
  });
}

/** Deshace el último pago: borra el gasto y restaura el vencimiento. */
export function undoLastPayment(id) {
  commit((s) => {
    const bill = find(s.bills, id);
    const last = bill?.payments[bill.payments.length - 1];
    if (!last) return;
    s.transactions = without(s.transactions, last.txId);
    revertBillPayment(s, id, last.txId);
  });
}

function revertBillPayment(s, billId, txId) {
  const bill = find(s.bills, billId);
  if (!bill) return;
  const index = bill.payments.findIndex((p) => p.txId === txId);
  if (index === -1) return;
  const [payment] = bill.payments.splice(index, 1);
  // Solo el último pago mueve el vencimiento; uno viejo solo sale del historial.
  if (index === bill.payments.length) {
    bill.dueDate = payment.dueDate;
    bill.status = "pending";
  }
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export function addGoal(data) {
  return commit((s) => {
    const goal = { id: uid("goal"), movements: [], createdAt: todayISO(), ...data };
    s.goals.push(goal);
    return goal;
  });
}

export function updateGoal(id, data) {
  commit((s) => {
    const goal = find(s.goals, id);
    if (goal) Object.assign(goal, data);
  });
}

export function deleteGoal(id) {
  commit((s) => {
    s.goals = without(s.goals, id);
    s.budgets = s.budgets.filter((b) => !(b.target.kind === "goal" && b.target.goalId === id));
  });
}

/** amount > 0 deposita, amount < 0 retira. Siempre en la moneda de la meta. */
export function moveGoalMoney(id, amount, note = "", date = todayISO()) {
  commit((s) => {
    const goal = find(s.goals, id);
    if (goal) goal.movements.push({ id: uid("mov"), date, amount, note });
  });
}

export function deleteGoalMovement(goalId, movementId) {
  commit((s) => {
    const goal = find(s.goals, goalId);
    if (goal) goal.movements = without(goal.movements, movementId);
  });
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

export function saveBudget(data) {
  commit((s) => {
    const existing = data.id && find(s.budgets, data.id);
    if (existing) Object.assign(existing, data);
    else s.budgets.push({ ...data, id: uid("bud") });
  });
}

export function deleteBudget(id) {
  commit((s) => {
    s.budgets = without(s.budgets, id);
  });
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export function saveCategory(data) {
  return commit((s) => {
    const existing = data.id && find(s.categories, data.id);
    if (existing) {
      // Subcategorías quitadas en el formulario: sus movimientos quedan en la categoría.
      if (data.subcategories) {
        const kept = new Set(data.subcategories.map((sub) => sub.id));
        existing.subcategories.filter((sub) => !kept.has(sub.id)).forEach((sub) => clearSubcategoryRefs(s, sub.id));
      }
      return Object.assign(existing, data);
    }
    const category = { subcategories: [], ...data, id: uid("cat"), builtin: false };
    s.categories.push(category);
    return category;
  });
}

export function isProtectedCategory(id) {
  return Object.values(FALLBACK_CATEGORY).includes(id);
}

/** Borra una categoría y pasa sus movimientos a "Otros" del mismo tipo. */
export function deleteCategory(id) {
  commit((s) => {
    const category = find(s.categories, id);
    if (!category || isProtectedCategory(id)) return;
    const fallback = FALLBACK_CATEGORY[category.type];
    for (const item of [...s.transactions, ...s.bills]) {
      if (item.categoryId !== id) continue;
      item.categoryId = fallback;
      item.subcategoryId = "";
    }
    s.budgets.forEach((b) => {
      if (b.target.kind === "categories") b.target.categoryIds = b.target.categoryIds.filter((c) => c !== id);
    });
    s.categories = without(s.categories, id);
  });
}

/** Crea o edita una subcategoría dentro de su categoría. */
export function saveSubcategory(categoryId, data) {
  return commit((s) => {
    const category = find(s.categories, categoryId);
    if (!category) return null;
    const existing = data.id && find(category.subcategories, data.id);
    if (existing) return Object.assign(existing, data);
    const sub = { ...data, id: uid("sub") };
    category.subcategories.push(sub);
    return sub;
  });
}

export function deleteSubcategory(categoryId, subId) {
  commit((s) => {
    const category = find(s.categories, categoryId);
    if (!category) return;
    category.subcategories = without(category.subcategories, subId);
    clearSubcategoryRefs(s, subId);
  });
}

/** Los movimientos y facturas de una subcategoría borrada quedan en la categoría. */
function clearSubcategoryRefs(s, subId) {
  for (const item of [...s.transactions, ...s.bills]) {
    if (item.subcategoryId === subId) item.subcategoryId = "";
  }
}

export function countSubcategoryUsage(subId) {
  return state.transactions.filter((t) => t.subcategoryId === subId).length + state.bills.filter((b) => b.subcategoryId === subId).length;
}

export function countCategoryUsage(id) {
  return state.transactions.filter((t) => t.categoryId === id).length + state.bills.filter((b) => b.categoryId === id).length;
}

// ---------------------------------------------------------------------------
// Monedas y configuración
// ---------------------------------------------------------------------------

export function setRate(code, value) {
  commit((s) => {
    s.rates[code] = value;
    s.ratesUpdatedAt = new Date().toISOString();
  });
}

/**
 * Cambia la moneda principal. El "ingreso de referencia" está guardado en la
 * moneda principal, así que se convierte: $ 800.000 no pasan a ser US$ 800.000.
 */
export function setMainCurrency(code) {
  if (!CURRENCY_CODES.includes(code)) return;
  commit((s) => {
    const previous = s.settings.mainCurrency;
    if (previous === code) return;
    s.settings.budgetReference = Math.round(convert(s.settings.budgetReference || 0, previous, code, s.rates) * 100) / 100;
    s.settings.mainCurrency = code;
  });
}

export function updateSettings(data) {
  commit((s) => {
    Object.assign(s.settings, data);
  });
}

// ---------------------------------------------------------------------------
// Datos: demo, reinicio, backup
// ---------------------------------------------------------------------------

export function loadDemo() {
  snapshotBefore("Antes de cargar el ejemplo");
  commit(() => {
    state = migrate(buildDemoState());
  });
}

/** Deja la app vacía pero conserva monedas y categorías personalizadas. */
export function startFresh({ keepSetup = true } = {}) {
  snapshotBefore("Antes de empezar de cero");
  commit((s) => {
    const fresh = createEmptyState();
    if (keepSetup) {
      fresh.rates = { ...s.rates };
      fresh.settings.mainCurrency = s.settings.mainCurrency;
      fresh.categories = s.categories;
      // Las cuentas propias se conservan (sin saldo: se empieza de cero); las
      // del ejemplo no.
      if (!s.settings.isDemo) fresh.accounts = s.accounts.map((acc) => ({ ...acc, opening: 0 }));
      else fresh.accounts[0].currency = s.settings.mainCurrency;
    }
    state = fresh;
  });
}

/** Borra todo, copias automáticas incluidas (por ejemplo, antes de regalar el celular). */
export async function resetEverything() {
  await clearData();
  commit(() => {
    state = createEmptyState();
  });
}

export function exportJSON() {
  // Sin espacios ni sangría: el archivo pesa bastante menos y se lee igual al importarlo.
  return JSON.stringify({ app: "neko-finanzas", exportedAt: new Date().toISOString(), data: state });
}

export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("El archivo no es un backup válido (no se pudo leer).");
  }
  const data = parsed?.data ?? parsed;
  if (!data || typeof data !== "object" || !Array.isArray(data.transactions) || !Array.isArray(data.categories)) {
    throw new Error("El archivo no parece un backup de Neko Finanzas.");
  }
  // Se valida antes de reemplazar nada: si algo falla, los datos actuales quedan intactos.
  const clean = migrate(data);
  snapshotBefore("Antes de importar un backup");
  const skipped = data.transactions.length - clean.transactions.length;
  restore(clean);
  return { transactions: clean.transactions.length, skipped };
}
