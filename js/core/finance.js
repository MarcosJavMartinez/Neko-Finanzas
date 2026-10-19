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
 *                      Es el dinero que realmente tienes, sumando todo. Una
 *                      transferencia no es ingreso ni gasto: solo cambia de
 *                      cuenta (salvo la diferencia si cambia de moneda).
 *
 *    EN METAS          = lo acumulado en cada meta de ahorro.
 *                      Separar dinero para una meta NO es un gasto: el dinero
 *                      sigue siendo tuyo (sigue en el total), solo queda
 *                      apartado. Cada depósito o retiro lo hace el usuario a
 *                      mano y queda en el historial de la meta.
 *
 *    A RESERVAR        = facturas pendientes que vencen dentro del horizonte
 *                      de reserva (por defecto, los próximos 30 días; se
 *                      cambia en Configuración) + las vencidas sin pagar
 *                      + gastos programados (con fecha futura, como las
 *                      próximas cuotas de una compra) dentro del horizonte
 *                      + lo que debes de un préstamo que vence en ese plazo
 *                      + lo que falta gastar este mes de los presupuestos
 *                      marcados "reservar" (supermercado, gustos por día)
 *                      + el fondo de facturas, si está activado: lo que
 *                      sobró de facturas que vinieron por menos.
 *
 *  Préstamos: prestar dinero la saca de tu cuenta (no es un gasto) y lo que
 *  te deben no cuenta como dinero tuyo hasta que te la devuelven; si te
 *  prestan, el dinero entra (no es un ingreso) y devolverla la saca.
 *                      Una factura semanal cuenta una vez por cada
 *                      vencimiento dentro del horizonte. Cuando se paga,
 *                      se registra como gasto y sale de la reserva.
 *
 *    DISPONIBLE        = DINERO TOTAL − EN METAS − A RESERVAR
 *                      Lo que se puede gastar sin tocar metas ni facturas.
 *                      Puede ser negativo: significa que lo apartado supera
 *                      lo que tienes, y la app lo muestra como aviso.
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
  shiftMonthKey,
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
    } else if (tx.type === "loan") {
      // Devolver dólares pagando con pesos: vale lo que costó de verdad, no la conversión de hoy.
      const sign = tx.flow === "in" ? 1 : -1;
      if (tx.accountAmount > 0 && tx.accountCurrency) add(tx.accountId, sign * tx.accountAmount, tx.accountCurrency);
      else add(tx.accountId, sign * tx.amount, tx.currency);
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
  // Los gastos que se repiten (gimnasio, colectivo) cuentan con su monto
  // habitual desde que entran en el horizonte hasta que se registran u omiten.
  const recurring = state.transactions
    .filter((tx) => tx.type === "expense" && tx.recurrence && tx.recurrence.nextDate <= until)
    .map((tx) => ({ ...tx, id: `${tx.id}:next`, amount: tx.recurrence.amount || tx.amount, date: tx.recurrence.nextDate, recurringOf: tx.id }));
  const items = [...state.transactions.filter((tx) => tx.type === "expense" && tx.date > today && tx.date <= until), ...recurring].sort((a, b) => a.date.localeCompare(b.date));
  return { amount: sumMain(state, items), items, until };
}

/**
 * Fondo de facturas (opcional): la suma de lo que sobró al pagar facturas
 * por menos de lo esperado, menos lo que hubo que poner de más cuando
 * vinieron más caras, menos lo que se liberó a mano. Nunca es negativo.
 * Mientras tenga saldo, queda reservado para las próximas facturas.
 */
export function billCushion(state) {
  const s = state.settings;
  if (!s.billCushion) return { amount: 0, saved: 0, enabled: false };
  const txById = new Map(state.transactions.map((t) => [t.id, t]));
  let saved = 0;
  for (const bill of state.bills) {
    for (const p of bill.payments) {
      const tx = txById.get(p.txId);
      if (!p.expected || !tx || (s.billCushionSince && p.paidAt < s.billCushionSince)) continue;
      saved += toMain(state, p.expected, p.expectedCurrency || bill.currency) - toMain(state, tx.amount, tx.currency);
    }
  }
  return { amount: Math.max(0, Math.round((saved - (s.billCushionReleased || 0)) * 100) / 100), saved, enabled: true };
}

// ---------------------------------------------------------------------------
// Préstamos
// ---------------------------------------------------------------------------

/**
 * Un préstamo en cuotas: cuántas faltan, cuándo vence la próxima y cuánto se
 * termina devolviendo. Las cuotas son los gastos programados del préstamo;
 * las que ya pasaron de fecha cuentan como pagadas.
 */
export function loanPlanStatus(state, loan, today = todayISO()) {
  if (!loan.plan) return null;
  const all = state.transactions.filter((t) => t.installment?.group === loan.plan.group).sort((a, b) => a.date.localeCompare(b.date));
  const pending = all.filter((t) => t.date > today);
  const left = Math.round(pending.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const total = all.length ? Math.round(all.reduce((s, t) => s + t.amount, 0) * 100) / 100 : Math.round(loan.plan.count * loan.plan.amount * 100) / 100;
  return { count: all.length || loan.plan.count, amount: pending[0]?.amount || loan.plan.amount, installments: all, remaining: pending.length, paid: all.length - pending.length, next: pending[0]?.date || "", left, total, interest: Math.round((total - loan.amount) * 100) / 100 };
}

/**
 * Lo que falta devolver de un préstamo (nunca negativo). En uno en cuotas
 * (hace falta el estado para verlas) es la suma de las cuotas por venir.
 */
export function loanOutstanding(loan, state, today = todayISO()) {
  if (loan.plan && state) return loanPlanStatus(state, loan, today).left;
  const paid = loan.payments.reduce((s, p) => s + p.amount, 0);
  return Math.max(0, Math.round((loan.amount - paid) * 100) / 100);
}

/** Te deben / debes, en la moneda principal, con cada préstamo abierto. */
export function loansSummary(state, today = todayISO()) {
  const items = (state.loans || []).map((loan) => {
    const outstanding = loanOutstanding(loan, state, today);
    return { loan, outstanding, outstandingMain: toMain(state, outstanding, loan.currency), plan: loanPlanStatus(state, loan, today) };
  });
  const sum = (dir) => items.filter((i) => i.loan.direction === dir).reduce((s, i) => s + i.outstandingMain, 0);
  return { items, lent: sum("lent"), borrowed: sum("borrowed"), open: items.filter((i) => i.outstanding > 0).length };
}

/**
 * "Apartar por mes": lo que ya debería estar juntado para devolver una deuda.
 * Un monto por cada mes desde que se empezó a apartar (el primero cuenta
 * entero), menos lo devuelto desde entonces, y nunca más de lo que falta.
 */
export function loanSetAside(loan, outstanding, today = todayISO(), state = null) {
  if (!(loan.saveMonthly > 0) || !loan.saveSince || loan.plan) return 0;
  if (state && loanSaveCurrency(loan) !== loan.currency) return loanSetAsideStatus(state, loan, outstanding, today).saved;
  const [y1, m1] = loan.saveSince.split("-").map(Number);
  const [y2, m2] = today.split("-").map(Number);
  const months = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
  const paid = loan.payments.filter((p) => p.date >= loan.saveSince).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, Math.min(outstanding, Math.round((loan.saveMonthly * months - paid) * 100) / 100));
}

/** La moneda en la que se aparta para devolver una deuda: la elegida, o la de la deuda. */
export const loanSaveCurrency = (loan) => loan.saveCurrency || loan.currency;

/**
 * Cómo viene lo apartado para una deuda, en la moneda en la que se aparta:
 * cuánto hay juntado, cuánto hace falta (lo que se debe, al tipo de cambio de
 * hoy) y en cuántos meses más se llega. Si se devolvió pagando con esa moneda,
 * se descuenta lo que costó de verdad.
 */
export function loanSetAsideStatus(state, loan, outstanding, today = todayISO()) {
  const currency = loanSaveCurrency(loan);
  const round = (n) => Math.round(n * 100) / 100;
  const target = round(convert(outstanding, loan.currency, currency, state.rates));
  if (!(loan.saveMonthly > 0) || !loan.saveSince || loan.plan) return { currency, saved: 0, target, monthsLeft: 0 };
  let saved;
  if (currency === loan.currency) saved = loanSetAside(loan, outstanding, today);
  else {
    const [y1, m1] = loan.saveSince.split("-").map(Number);
    const [y2, m2] = today.split("-").map(Number);
    const months = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
    const paid = loan.payments
      .filter((p) => p.date >= loan.saveSince)
      .reduce((s, p) => {
        const tx = p.txId && state.transactions.find((t) => t.id === p.txId);
        return s + (tx?.accountCurrency === currency && tx.accountAmount > 0 ? tx.accountAmount : convert(p.amount, loan.currency, currency, state.rates));
      }, 0);
    saved = Math.max(0, Math.min(target, round(loan.saveMonthly * months - paid)));
  }
  return { currency, saved, target, monthsLeft: Math.ceil((target - saved) / loan.saveMonthly - 1e-9) };
}

/**
 * Lo que se reserva por lo que debes: entero si vence dentro del horizonte (o
 * ya venció); si no, lo que se viene apartando por mes.
 */
export function loansReserve(state, today = todayISO()) {
  const until = reserveHorizonEnd(state, today);
  const items = loansSummary(state)
    .items.filter((i) => i.loan.direction === "borrowed" && i.outstanding > 0)
    .map((i) => {
      const dueSoon = i.loan.dueDate && i.loan.dueDate <= until;
      const reserved = dueSoon ? i.outstanding : loanSetAside(i.loan, i.outstanding, today, state);
      return { ...i, reserved, reservedMain: toMain(state, reserved, dueSoon ? i.loan.currency : loanSaveCurrency(i.loan)) };
    })
    .filter((i) => i.reserved > 0);
  return { amount: items.reduce((s, i) => s + i.reservedMain, 0), items, until };
}

export function balanceSummary(state, today = todayISO()) {
  const total = totalBalance(state, today);
  const inGoals = totalInGoals(state);
  const reserve = billReserve(state, today);
  const scheduled = scheduledReserve(state, today);
  const debts = loansReserve(state, today);
  const envelopes = budgetReserve(state, today);
  const cushion = billCushion(state);
  const reserved = reserve.amount + scheduled.amount + debts.amount + envelopes.amount + cushion.amount;
  const available = total - inGoals - reserved;
  return { total, inGoals, reserved, reserve, scheduled, debts, envelopes, cushion, available };
}

// ---------------------------------------------------------------------------
// Para gastar por día
// ---------------------------------------------------------------------------

/**
 * Cuánto se puede gastar por día sin tocar lo reservado ni las metas: el
 * disponible repartido entre los días que faltan hasta el próximo cobro (el
 * próximo ingreso que se repite) o, si no hay, hasta fin de mes.
 *
 *   perDay    = (disponible + lo gastado hoy) / días que faltan (hoy incluido)
 *   leftToday = perDay − lo gastado hoy   (negativo: hoy te pasaste)
 *
 * Lo gastado hoy no cuenta los pagos de facturas, las cuotas de una compra que
 * caen hoy (de la 2 en adelante) ni las cuotas de un préstamo: ese dinero ya
 * estaba reservada, no cambia el disponible.
 */
export function dailyAllowance(state, today = todayISO()) {
  const { available } = balanceSummary(state, today);
  const nextIncome = state.transactions
    .filter((tx) => tx.type === "income" && tx.recurrence && tx.recurrence.nextDate > today)
    .map((tx) => tx.recurrence.nextDate)
    .sort()[0];
  const monthEnd = monthRange(monthKey(today)).end;
  // Hasta el día anterior al cobro, o hasta el último día del mes inclusive.
  const days = Math.max(1, nextIncome ? daysBetween(today, nextIncome) : daysBetween(today, monthEnd) + 1);
  const loanGroups = new Set((state.loans || []).map((l) => l.plan?.group).filter(Boolean));
  const reservedBefore = (tx) => tx.billId || (tx.installment && (tx.installment.n > 1 || loanGroups.has(tx.installment.group)));
  const spentToday = sumMain(state, state.transactions.filter((tx) => tx.type === "expense" && tx.date === today && !reservedBefore(tx)));
  const perDay = Math.max(0, (available + spentToday) / days);
  return { perDay, leftToday: perDay - spentToday, spentToday, days, until: nextIncome || monthEnd, reason: nextIncome ? "income" : "month", available };
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
    // Saldo a favor: se pagó más de lo que se debía.
    credit: Math.max(0, entry?.balance || 0),
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

/**
 * Ingresos y gastos de un mes hasta cierto día. Sirve para comparar "lo que
 * llevo este mes" contra "lo que llevaba el mes pasado a esta altura": comparar
 * contra el mes entero daría siempre "menos".
 */
export function monthToDate(state, key, day) {
  const txs = transactionsInMonth(state, key).filter((t) => Number(t.date.slice(8)) <= day);
  return { income: sumMain(state, txs.filter((t) => t.type === "income")), expense: sumMain(state, txs.filter((t) => t.type === "expense")) };
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
 * ingresos registrados (así un 25% no vale $0 el día 1).
 */
export function budgetBase(state, key) {
  const income = monthlyTotals(state, key).income;
  if (income > 0) return { amount: income, source: "income" };
  const ref = state.settings.budgetReference || 0;
  return { amount: toMain(state, ref, state.settings.mainCurrency), source: ref ? "reference" : "none" };
}

/**
 * Días que cuenta un presupuesto "por día" en un mes: todos, o desde el día
 * en que se creó si fue a mitad de ese mes.
 */
function dailyDays(budget, key) {
  const { start, end } = monthRange(key);
  if (budget.since && budget.since > end) return 0;
  const from = budget.since && budget.since > start ? budget.since : start;
  return daysBetween(from, end) + 1;
}

export function budgetLimit(state, budget, base, key = monthKey(todayISO())) {
  if (budget.mode === "percent") return (base * budget.value) / 100;
  const value = toMain(state, budget.value, budget.currency);
  // "Por día": el límite del mes es el valor diario por los días que cuenta.
  return budget.mode === "daily" ? value * dailyDays(budget, key) : value;
}

/** Categorías cubiertas por algún presupuesto "por categorías". */
function coveredCategoryIds(state) {
  const ids = new Set();
  for (const b of state.budgets) if (b.target.kind === "categories") b.target.categoryIds.forEach((id) => ids.add(id));
  return ids;
}

/** Gastos del mes que entran en un presupuesto (por categorías o "todo lo demás"). */
function budgetExpenses(state, budget, key) {
  let expenses = transactionsInMonth(state, key).filter((t) => t.type === "expense");
  // Uno "por día" creado a mitad de mes cuenta desde ese día.
  if (budget.mode === "daily" && budget.since) expenses = expenses.filter((t) => t.date >= budget.since);
  if (budget.target.kind === "rest") {
    const covered = coveredCategoryIds(state);
    return expenses.filter((t) => !covered.has(t.categoryId));
  }
  const ids = new Set(budget.target.categoryIds || []);
  return expenses.filter((t) => ids.has(t.categoryId));
}

export function budgetSpent(state, budget, key) {
  if (budget.target.kind === "goal") return Math.max(0, goalMovementsInMonth(state, key, budget.target.goalId));
  return sumMain(state, budgetExpenses(state, budget, key));
}

// ---------------------------------------------------------------------------
// Sobres: presupuestos con el dinero reservado, y gustos por día
// ---------------------------------------------------------------------------

const isEnvelope = (budget) => budget.reserve && budget.target.kind !== "goal";

/**
 * Lo que falta gastar este mes de los presupuestos marcados "reservar" (por
 * ejemplo, supermercado). Ese dinero se descuenta del disponible: está
 * guardada para eso.
 */
export function budgetReserve(state, today = todayISO()) {
  const key = monthKey(today);
  const base = budgetBase(state, key).amount;
  const items = state.budgets
    .filter(isEnvelope)
    // "No lo uso": liberado, pasado a una meta o a otro presupuesto → ya no se reserva aquí.
    // Reservado para el mes que viene (lo mismo o cualquier cosa) → sigue apartado.
    .filter((budget) => !(budget.pause?.month === key && !budgetKeptForNext(budget, key)))
    .map((budget) => ({ budget, amount: Math.max(0, budgetStatus(state, budget, key, base).remaining), keptForNext: budgetKeptForNext(budget, key) }))
    .filter((item) => item.amount > 0);
  return { amount: items.reduce((s, i) => s + i.amount, 0), items };
}

/**
 * Lo que sobró el mes pasado de cada presupuesto reservado y todavía no se
 * decidió qué hacer (pasarlo a una meta o dejarlo disponible). La app lo
 * ofrece; nunca lo mueve sola.
 */
export function budgetLeftovers(state, today = todayISO()) {
  const month = shiftMonthKey(monthKey(today), -1);
  const base = budgetBase(state, month).amount;
  return state.budgets
    .filter((b) => isEnvelope(b) && b.since && monthKey(b.since) <= month && b.settledMonth !== month && b.pause?.month !== month)
    .map((budget) => ({ budget, month, amount: Math.round(budgetStatus(state, budget, month, base).remaining * 100) / 100 }))
    .filter((item) => item.amount > 0);
}

/**
 * Gustos por día: el primer presupuesto "por día". Lo que no se gasta se
 * acumula dentro del mes:
 *   acumulado = valor por día × días transcurridos − lo gastado hasta hoy
 */
export function treatAllowance(state, today = todayISO()) {
  const budget = state.budgets.find((b) => b.mode === "daily" && b.target.kind !== "goal");
  if (!budget || (budget.since && budget.since > today)) return null;
  const key = monthKey(today);
  const start = monthRange(key).start;
  const from = budget.since && budget.since > start ? budget.since : start;
  const days = daysBetween(from, today) + 1;
  const perDay = toMain(state, budget.value, budget.currency);
  const expenses = budgetExpenses(state, budget, key).filter((t) => t.date <= today);
  const spent = sumMain(state, expenses);
  const spentToday = sumMain(state, expenses.filter((t) => t.date === today));
  return { budget, perDay, days, spent, spentToday, accumulated: perDay * days - spent };
}

/**
 * level: "ok" (< 80%), "near" (80–100%), "over" (> 100%).
 * Los presupuestos que apuntan a una meta miden ahorro, no gasto: llegar al
 * 100% es bueno, así que usan "done" en vez de "near"/"over".
 */
/** Lo que otros presupuestos le pasaron este mes ("Este mes no lo uso" → a otro presupuesto). */
function budgetIncoming(state, budget, key) {
  return state.budgets.reduce((s, b) => s + (b.id !== budget.id && b.pause?.month === key && b.pause.mode === "budget" && b.pause.targetId === budget.id ? b.pause.amount || 0 : 0), 0);
}

/** "Este mes no lo uso" con la plata que sigue apartada (para el mes que viene). */
export const budgetKeptForNext = (budget, key) => budget.pause?.month === key && (budget.pause.mode === "same" || budget.pause.mode === "any");

export function budgetStatus(state, budget, key, base = budgetBase(state, key).amount) {
  const limit = budgetLimit(state, budget, base, key) + budgetIncoming(state, budget, key);
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
    (sum, b) => sum + (b.mode === "percent" ? b.value : percent(budgetLimit(state, b, base.amount, key), base.amount)),
    0
  );
  return { base, items, assignedPct };
}

// ---------------------------------------------------------------------------
// Ingresos recurrentes
// ---------------------------------------------------------------------------

/**
 * Ingresos y gastos que se repiten y cuya próxima fecha ya llegó. La app NO
 * los registra sola: los muestra en el inicio para que el usuario confirme
 * que cobró o pagó.
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

// ---------------------------------------------------------------------------
// Tarjeta de transporte
// ---------------------------------------------------------------------------

/**
 * Saldo, lo cargado y lo gastado en el mes, y cuántos pasajes alcanzan con el
 * saldo (si se sabe el precio del pasaje).
 */
export function transitStatus(state, account, today = todayISO()) {
  const { start } = monthRange(monthKey(today));
  const balance = accountBalance(state, account.id, today).balance;
  const inMonth = (t) => t.date >= start && t.date <= today;
  const loaded = state.transactions
    .filter((t) => t.type === "transfer" && t.toAccountId === account.id && inMonth(t))
    .reduce((s, t) => s + (t.toAmount ?? t.amount), 0);
  const spent = state.transactions
    .filter((t) => t.type === "expense" && t.accountId === account.id && inMonth(t))
    .reduce((s, t) => s + convert(t.amount, t.currency, account.currency, state.rates), 0);
  const fare = account.fare > 0 ? account.fare : 0;
  const trips = fare ? Math.max(0, Math.floor((balance + 0.000001) / fare)) : null;
  // Saldo negativo: viajaste más de lo que tenía; es lo que le debes a la tarjeta.
  const debt = balance < -0.004 ? Math.round(-balance * 100) / 100 : 0;
  return { balance, loaded: Math.round(loaded * 100) / 100, spent: Math.round(spent * 100) / 100, fare, trips, debt, low: !debt && trips !== null && trips <= 2 };
}

// ---------------------------------------------------------------------------
// El mes que viene
// ---------------------------------------------------------------------------

/**
 * Lo que hay que pagar el mes que viene (facturas, cuotas y gastos que se
 * repiten, deudas que vencen o que se vienen apartando, presupuestos
 * reservados), lo que sobra hoy de este mes y lo que falta juntar. Los
 * ingresos que se repiten (el sueldo) se cuentan aparte, como esperados.
 */
export function nextMonthPlan(state, today = todayISO()) {
  const key = shiftMonthKey(monthKey(today), 1);
  const { start, end } = monthRange(key);
  const inRange = (d) => d >= start && d <= end;
  const items = [];
  // Fechas en que cae algo que se repite, dentro del mes que viene.
  const occurrences = (from, freq) => {
    const dates = [];
    let d = from;
    for (let i = 0; d <= end && i < 400; i++) {
      if (d >= start) dates.push(d);
      d = nextDate(d, freq, Number(from.slice(8)));
    }
    return dates;
  };
  for (const bill of state.bills) {
    for (const date of billOccurrences(bill, end).filter((d) => d >= start)) {
      items.push({ kind: "bill", icon: bill.icon, name: bill.name, date, amount: bill.amount, currency: bill.currency, amountMain: toMain(state, bill.amount, bill.currency), id: bill.id });
    }
  }
  for (const tx of state.transactions) {
    if (tx.type !== "expense") continue;
    if (inRange(tx.date)) items.push({ kind: "scheduled", tx, name: tx.description, date: tx.date, amount: tx.amount, currency: tx.currency, amountMain: toMain(state, tx.amount, tx.currency), id: tx.id });
    if (tx.recurrence) {
      for (const date of occurrences(tx.recurrence.nextDate, tx.recurrence.freq)) {
        const amount = tx.recurrence.amount || tx.amount;
        items.push({ kind: "scheduled", tx, name: tx.description, date, amount, currency: tx.currency, amountMain: toMain(state, amount, tx.currency), id: tx.id });
      }
    }
  }
  for (const i of loansSummary(state, today).items) {
    const loan = i.loan;
    if (loan.direction !== "borrowed" || i.outstanding <= 0 || loan.plan) continue;
    if (loan.dueDate && inRange(loan.dueDate)) {
      items.push({ kind: "debt", loan, name: loan.person, date: loan.dueDate, amount: i.outstanding, currency: loan.currency, amountMain: i.outstandingMain, id: loan.id });
    } else if (loan.saveMonthly > 0 && (!loan.dueDate || loan.dueDate > end)) {
      const currency = loanSaveCurrency(loan);
      const status = loanSetAsideStatus(state, loan, i.outstanding, today);
      const amount = Math.min(loan.saveMonthly, Math.max(0, status.target - status.saved));
      if (amount > 0) items.push({ kind: "setAside", loan, name: loan.person, date: start, amount, currency, amountMain: toMain(state, amount, currency), id: loan.id });
    }
  }
  const base = budgetBase(state, key).amount;
  const thisKey = monthKey(today);
  for (const budget of state.budgets.filter(isEnvelope)) {
    const limit = budgetStatus(state, budget, key, base).limit;
    // Guardado este mes para lo mismo el que viene: lo que necesitas sigue siendo el
    // presupuesto entero, pero esa parte ya la tienes (baja lo que falta juntar).
    const carried = budget.pause?.month === thisKey && budget.pause.mode === "same" ? Math.min(limit, Math.max(0, budgetStatus(state, budget, thisKey).remaining)) : 0;
    if (limit > 0) items.push({ kind: "budget", budget, icon: budget.icon, name: budget.name, date: start, amount: limit, currency: state.settings.mainCurrency, amountMain: limit, carried, id: budget.id });
  }
  let income = 0;
  for (const tx of state.transactions) {
    if (tx.type !== "income" || !tx.recurrence) continue;
    for (const date of occurrences(tx.recurrence.nextDate, tx.recurrence.freq)) income += toMain(state, tx.recurrence.amount || tx.amount, tx.currency);
  }
  // Guardado este mes "para lo que haya que pagar el mes que viene": ya cuenta como juntado.
  // y lo guardado "para lo mismo" (arriba, en cada presupuesto).
  const saved =
    state.budgets.filter((b) => isEnvelope(b) && b.pause?.month === thisKey && b.pause.mode === "any").reduce((s, b) => s + Math.max(0, budgetStatus(state, b, thisKey).remaining), 0) +
    items.reduce((s, i) => s + (i.carried || 0), 0);
  items.sort((a, b) => a.date.localeCompare(b.date));
  const round = (n) => Math.round(n * 100) / 100;
  const needs = round(items.reduce((s, i) => s + i.amountMain, 0));
  const have = round(Math.max(0, balanceSummary(state, today).available));
  return { key, start, end, items, needs, have, saved: round(saved), income: round(income), missing: round(Math.max(0, needs - have - saved)), afterIncome: round(have + saved + income - needs) };
}

/** Gastos con fecha futura (cuotas, programados) y lo próximo de los que se repiten, por fecha. */
export function scheduledReserveAll(state, today = todayISO()) {
  const recurring = state.transactions
    .filter((tx) => tx.type === "expense" && tx.recurrence)
    .map((tx) => ({ ...tx, id: `${tx.id}:next`, amount: tx.recurrence.amount || tx.amount, date: tx.recurrence.nextDate, recurringOf: tx.id }));
  return [...state.transactions.filter((tx) => tx.type === "expense" && tx.date > today), ...recurring].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}
