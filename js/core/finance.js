/**
 * ============================================================================
 *  LÓGICA FINANCIERA DE NEKO FINANZAS
 * ============================================================================
 *
 *  Todas las cuentas de la app salen de este archivo. Son funciones puras:
 *  reciben el estado y devuelven números, nunca modifican datos.
 *
 *  Los cuatro números principales (todos en la moneda principal):
 *
 *    DINERO TOTAL      = la suma de tus cuentas, y cada cuenta es
 *                          su saldo inicial
 *                        + ingresos registrados en ella (con fecha hasta hoy)
 *                        − gastos registrados en ella   (con fecha hasta hoy)
 *                        ± transferencias desde/hacia otras cuentas
 *                      Es la plata que realmente tenés, sumando todo. Una
 *                      transferencia no es ingreso ni gasto: solo cambia de
 *                      cuenta (salvo la diferencia si cambia de moneda).
 *
 *    EN METAS          = lo acumulado en cada meta de ahorro.
 *                      Separar plata para una meta NO es un gasto: el dinero
 *                      sigue siendo tuyo (sigue en el total), solo queda
 *                      apartado. Cada depósito o retiro lo hace el usuario a
 *                      mano y queda en el historial de la meta.
 *
 *    A RESERVAR        = facturas pendientes que vencen dentro del horizonte
 *                      de reserva (por defecto, los próximos 30 días; se
 *                      cambia en Configuración) + las vencidas sin pagar
 *                      + gastos programados (con fecha futura, como las
 *                      próximas cuotas de una compra) dentro del horizonte.
 *                      Una factura semanal cuenta una vez por cada
 *                      vencimiento dentro del horizonte. Cuando se paga,
 *                      se registra como gasto y sale de la reserva.
 *
 *    DISPONIBLE        = DINERO TOTAL − EN METAS − A RESERVAR
 *                      Lo que se puede gastar sin tocar metas ni facturas.
 *                      Puede ser negativo: significa que lo apartado supera
 *                      lo que tenés, y la app lo muestra como aviso.
 *
 *  Monedas: cada movimiento guarda su monto en su propia moneda. Las sumas se
 *  hacen convirtiendo al momento del cálculo con el tipo de cambio que
 *  configuró el usuario (ver money.js). Si cambia el tipo de cambio, cambian
 *  los equivalentes, no los montos guardados.
 * ============================================================================
 */

import { convert } from "./money.js";
import {
  addDays,
  daysBetween,
  lastMonthKeys,
  monthKey,
  monthRange,
  nextDate,
  parseISO,
  todayISO,
} from "./dates.js";

// ---------------------------------------------------------------------------
// Conversión y utilidades
// ---------------------------------------------------------------------------

export function toMain(state, amount, currency) {
  return convert(amount, currency, state.settings.mainCurrency, state.rates);
}

/** Porcentaje 0..100 (puede superar 100), a prueba de divisiones por cero. */
export function percent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function sumMain(state, items) {
  return items.reduce((sum, item) => sum + toMain(state, item.amount, item.currency), 0);
}

export function findCategory(state, id) {
  return state.categories.find((c) => c.id === id);
}

export function findSubcategory(category, subId) {
  return subId ? category?.subcategories?.find((sub) => sub.id === subId) : undefined;
}

// ---------------------------------------------------------------------------
// Saldos
// ---------------------------------------------------------------------------

/**
 * Saldo de cada cuenta (en su moneda y en la principal), en una sola pasada
 * por los movimientos: [{ account, balance, balanceMain }].
 */
export function accountBalances(state, today = todayISO()) {
  const byId = new Map(state.accounts.map((a) => [a.id, { account: a, balance: a.opening }]));
  const add = (accountId, amount, currency) => {
    const entry = byId.get(accountId);
    if (entry) entry.balance += convert(amount, currency, entry.account.currency, state.rates);
  };
  for (const tx of state.transactions) {
    if (tx.date > today) continue;
    if (tx.type === "transfer") {
      add(tx.accountId, -tx.amount, tx.currency);
      add(tx.toAccountId, tx.toAmount, tx.toCurrency);
    } else {
      add(tx.accountId, tx.type === "income" ? tx.amount : -tx.amount, tx.currency);
    }
  }
  return [...byId.values()].map((e) => ({ ...e, balanceMain: toMain(state, e.balance, e.account.currency) }));
}

export function accountBalance(state, accountId, today = todayISO()) {
  return accountBalances(state, today).find((e) => e.account.id === accountId) || null;
}

export function findAccount(state, id) {
  return state.accounts.find((a) => a.id === id);
}

export function totalBalance(state, today = todayISO()) {
  return accountBalances(state, today).reduce((sum, e) => sum + e.balanceMain, 0);
}

export function goalSaved(goal) {
  return goal.movements.reduce((sum, m) => sum + m.amount, 0);
}

export function goalProgress(goal) {
  const saved = goalSaved(goal);
  const pct = Math.max(0, Math.min(100, percent(saved, goal.target)));
  return { saved, target: goal.target, pct, remaining: Math.max(0, goal.target - saved), done: saved >= goal.target };
}

export function totalInGoals(state) {
  return state.goals.reduce((sum, g) => sum + toMain(state, goalSaved(g), g.currency), 0);
}

// ---------------------------------------------------------------------------
// Facturas y reservas
// ---------------------------------------------------------------------------

/** Último día que cuenta para la reserva, según la configuración. */
export function reserveHorizonEnd(state, today = todayISO()) {
  if (state.settings.reserveHorizon === "month") return monthRange(monthKey(today)).end;
  return addDays(today, 30);
}

/**
 * Vencimientos pendientes de una factura hasta `until` (inclusive),
 * contando los ya vencidos que siguen sin pagar.
 */
export function billOccurrences(bill, until) {
  if (!bill.recurring) {
    return bill.status === "pending" && bill.dueDate <= until ? [bill.dueDate] : [];
  }
  const dates = [];
  let date = bill.dueDate;
  // Tope solo como protección ante datos rotos: alcanza para ~40 años de
  // vencimientos semanales atrasados sin subestimar la reserva.
  while (date <= until && dates.length < 2000) {
    dates.push(date);
    date = nextDate(date, bill.frequency, bill.dueDay);
  }
  return dates;
}

/** Estado visible de una factura: "overdue" | "pending" | "paid". */
export function billStatus(bill, today = todayISO()) {
  if (!bill.recurring && bill.status === "paid") return "paid";
  if (bill.dueDate < today) return "overdue";
  // Una recurrente que ya se pagó este período muestra "pagada" hasta que
  // se acerque el próximo vencimiento (7 días antes vuelve a "pendiente").
  const last = bill.payments[bill.payments.length - 1];
  if (bill.recurring && last && daysBetween(last.paidAt, today) <= 31 && daysBetween(today, bill.dueDate) > 7) {
    return "paid";
  }
  return "pending";
}

export function billReserve(state, today = todayISO()) {
  const until = reserveHorizonEnd(state, today);
  const items = [];
  for (const bill of state.bills) {
    for (const dueDate of billOccurrences(bill, until)) {
      items.push({ bill, dueDate, amountMain: toMain(state, bill.amount, bill.currency) });
    }
  }
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { amount: items.reduce((s, i) => s + i.amountMain, 0), items, until };
}

/**
 * Calendario de vencimientos de un mes: { "2026-09-29": [{ bill, dueDate,
 * status, amountMain }] }. Incluye lo ya pagado (según el historial de
 * pagos) y lo pendiente, proyectando las recurrentes hacia adelante para
 * poder mirar meses futuros.
 */
export function billCalendar(state, key, today = todayISO()) {
  const { start, end } = monthRange(key);
  const days = {};
  const add = (bill, dueDate, status) => {
    (days[dueDate] ||= []).push({ bill, dueDate, status, amountMain: toMain(state, bill.amount, bill.currency) });
  };
  for (const bill of state.bills) {
    for (const payment of bill.payments) {
      if (payment.dueDate >= start && payment.dueDate <= end) add(bill, payment.dueDate, "paid");
    }
    for (const dueDate of billOccurrences(bill, end)) {
      if (dueDate >= start) add(bill, dueDate, dueDate < today ? "overdue" : "pending");
    }
  }
  return days;
}

/** Próximos vencimientos (sin repetir la misma factura), para el inicio. */
export function upcomingBills(state, today = todayISO(), limit = 4) {
  return state.bills
    .filter((b) => b.recurring || b.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Resumen principal
// ---------------------------------------------------------------------------

/**
 * Gastos con fecha futura dentro del horizonte de reserva (cuotas que
 * vienen, gastos programados). Todavía no bajaron tu total, pero ya están
 * comprometidos.
 */
export function scheduledReserve(state, today = todayISO()) {
  const until = reserveHorizonEnd(state, today);
  const items = state.transactions
    .filter((tx) => tx.type === "expense" && tx.date > today && tx.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { amount: sumMain(state, items), items, until };
}

export function balanceSummary(state, today = todayISO()) {
  const total = totalBalance(state, today);
  const inGoals = totalInGoals(state);
  const reserve = billReserve(state, today);
  const scheduled = scheduledReserve(state, today);
  const reserved = reserve.amount + scheduled.amount;
  const available = total - inGoals - reserved;
  return { total, inGoals, reserved, reserve, scheduled, available };
}

// ---------------------------------------------------------------------------
// Tarjetas de crédito
// ---------------------------------------------------------------------------

/** Próxima fecha (hoy incluido) que cae en ese día del mes (o el último día si no existe). */
function nextDayOfMonth(day, today) {
  const [y, m] = today.split("-").map(Number);
  for (let k = 0; k < 2; k++) {
    const last = new Date(y, m - 1 + k + 1, 0).getDate();
    const d = new Date(y, m - 1 + k, Math.min(day, last));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (iso >= today) return iso;
  }
  return today;
}

/**
 * Estado de una tarjeta: deuda de hoy, próximo cierre y vencimiento, y las
 * compras en cuotas que todavía tienen cuotas por venir.
 */
export function cardStatus(state, account, today = todayISO()) {
  const entry = accountBalance(state, account.id, today);
  const debt = Math.max(0, -(entry?.balance || 0));
  const future = state.transactions.filter((t) => t.accountId === account.id && t.type === "expense" && t.date > today);
  const groups = new Map();
  for (const t of future) {
    const key = t.installment?.group || t.id;
    const g = groups.get(key) || { key, title: t.description, categoryId: t.categoryId, of: t.installment?.of || 1, remaining: 0, amount: 0, next: t.date, currency: account.currency };
    g.remaining++;
    g.amount += convert(t.amount, t.currency, account.currency, state.rates);
    if (t.date < g.next) g.next = t.date;
    groups.set(key, g);
  }
  return {
    debt,
    balance: entry?.balance || 0,
    closing: nextDayOfMonth(account.closingDay || 25, today),
    due: nextDayOfMonth(account.dueDay || 5, today),
    upcoming: [...groups.values()].sort((a, b) => a.next.localeCompare(b.next)),
    upcomingTotal: future.reduce((s, t) => s + convert(t.amount, t.currency, account.currency, state.rates), 0),
  };
}

// ---------------------------------------------------------------------------
// Totales por mes
// ---------------------------------------------------------------------------

export function transactionsInMonth(state, key) {
  const { start, end } = monthRange(key);
  return state.transactions.filter((tx) => tx.date >= start && tx.date <= end);
}

/** Depósitos netos a metas dentro de un mes (retiros restan). */
export function goalMovementsInMonth(state, key, goalId) {
  const { start, end } = monthRange(key);
  return state.goals
    .filter((g) => !goalId || g.id === goalId)
    .reduce((sum, g) => {
      const net = g.movements
        .filter((m) => m.date >= start && m.date <= end)
        .reduce((s, m) => s + m.amount, 0);
      return sum + toMain(state, net, g.currency);
    }, 0);
}

export function monthlyTotals(state, key) {
  const txs = transactionsInMonth(state, key);
  const incomes = txs.filter((t) => t.type === "income");
  const expenses = txs.filter((t) => t.type === "expense");
  const income = sumMain(state, incomes);
  const expense = sumMain(state, expenses);
  const bills = sumMain(state, expenses.filter((t) => t.billId));
  const toGoals = goalMovementsInMonth(state, key);
  return {
    income,
    expense,
    bills,
    toGoals,
    // Ahorro del mes: lo que entró y no se gastó.
    saved: income - expense,
    savingsRate: percent(income - expense, income),
  };
}

export function expensesByCategory(state, key) {
  const totals = new Map();
  for (const tx of transactionsInMonth(state, key)) {
    if (tx.type !== "expense") continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) || 0) + toMain(state, tx.amount, tx.currency));
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ category: findCategory(state, categoryId), categoryId, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Detalle de una categoría por subcategoría. Lo que no tiene subcategoría
 * va en un grupo aparte (sub = null), así la suma siempre da el total.
 */
export function expensesBySubcategory(state, key, categoryId) {
  const category = findCategory(state, categoryId);
  const totals = new Map();
  for (const tx of transactionsInMonth(state, key)) {
    if (tx.type !== "expense" || tx.categoryId !== categoryId) continue;
    const subId = findSubcategory(category, tx.subcategoryId) ? tx.subcategoryId : "";
    totals.set(subId, (totals.get(subId) || 0) + toMain(state, tx.amount, tx.currency));
  }
  return [...totals.entries()]
    .map(([subId, amount]) => ({ sub: findSubcategory(category, subId) || null, amount }))
    .sort((a, b) => (a.sub ? 0 : 1) - (b.sub ? 0 : 1) || b.amount - a.amount);
}

/** Serie de los últimos meses para los gráficos de reportes. */
export function monthlySeries(state, count, endKey) {
  return lastMonthKeys(count, endKey).map((key) => {
    const totals = monthlyTotals(state, key);
    const end = monthRange(key).end;
    const today = todayISO();
    return { key, ...totals, balanceEnd: totalBalance(state, end < today ? end : today) };
  });
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

/**
 * Base para los presupuestos en porcentaje: los ingresos del mes, o el
 * "ingreso de referencia" de Configuración si el mes todavía no tiene
 * ingresos cargados (así un 25% no vale $0 el día 1).
 */
export function budgetBase(state, key) {
  const income = monthlyTotals(state, key).income;
  if (income > 0) return { amount: income, source: "income" };
  const ref = state.settings.budgetReference || 0;
  return { amount: toMain(state, ref, state.settings.mainCurrency), source: ref ? "reference" : "none" };
}

export function budgetLimit(state, budget, base) {
  if (budget.mode === "percent") return (base * budget.value) / 100;
  return toMain(state, budget.value, budget.currency);
}

/** Categorías cubiertas por algún presupuesto "por categorías". */
function coveredCategoryIds(state) {
  const ids = new Set();
  for (const b of state.budgets) if (b.target.kind === "categories") b.target.categoryIds.forEach((id) => ids.add(id));
  return ids;
}

export function budgetSpent(state, budget, key) {
  const expenses = transactionsInMonth(state, key).filter((t) => t.type === "expense");
  if (budget.target.kind === "goal") return Math.max(0, goalMovementsInMonth(state, key, budget.target.goalId));
  if (budget.target.kind === "rest") {
    const covered = coveredCategoryIds(state);
    return sumMain(state, expenses.filter((t) => !covered.has(t.categoryId)));
  }
  const ids = new Set(budget.target.categoryIds);
  return sumMain(state, expenses.filter((t) => ids.has(t.categoryId)));
}

/**
 * level: "ok" (< 80%), "near" (80–100%), "over" (> 100%).
 * Los presupuestos que apuntan a una meta miden ahorro, no gasto: llegar al
 * 100% es bueno, así que usan "done" en vez de "near"/"over".
 */
export function budgetStatus(state, budget, key, base = budgetBase(state, key).amount) {
  const limit = budgetLimit(state, budget, base);
  const spent = budgetSpent(state, budget, key);
  const pct = percent(spent, limit);
  let level = limit <= 0 ? (spent > 0 ? "over" : "ok") : pct > 100 ? "over" : pct >= 80 ? "near" : "ok";
  if (budget.target.kind === "goal") level = limit > 0 && pct >= 100 ? "done" : "ok";
  return { budget, limit, spent, remaining: limit - spent, pct, level };
}

export function budgetsOverview(state, key) {
  const base = budgetBase(state, key);
  const items = state.budgets.map((b) => budgetStatus(state, b, key, base.amount));
  const assignedPct = state.budgets.reduce(
    (sum, b) => sum + (b.mode === "percent" ? b.value : percent(budgetLimit(state, b, base.amount), base.amount)),
    0
  );
  return { base, items, assignedPct };
}

// ---------------------------------------------------------------------------
// Ingresos recurrentes
// ---------------------------------------------------------------------------

/**
 * Ingresos recurrentes cuya próxima fecha ya llegó. La app NO los registra
 * sola: los muestra en el inicio para que el usuario confirme que cobró.
 */
export function pendingRecurringIncomes(state, today = todayISO()) {
  return state.transactions
    .filter((tx) => tx.recurrence && tx.recurrence.nextDate <= today)
    .sort((a, b) => a.recurrence.nextDate.localeCompare(b.recurrence.nextDate));
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

/** Cuánto habría que separar por mes para llegar a la fecha objetivo. */
export function goalMonthlyNeeded(goal, today = todayISO()) {
  if (!goal.targetDate) return null;
  const { remaining } = goalProgress(goal);
  if (remaining <= 0) return 0;
  const from = parseISO(today);
  const to = parseISO(goal.targetDate);
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return remaining / Math.max(1, months);
}
