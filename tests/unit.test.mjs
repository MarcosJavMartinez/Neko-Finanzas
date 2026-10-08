// Pruebas unitarias de la lógica (node unit.mjs)
// Las pruebas corren como un dispositivo de Argentina (Node se presenta como en-US).
Object.defineProperty(globalThis, "navigator", { value: { language: "es-AR", languages: ["es-AR"] }, configurable: true });
const base = new URL("../js/", import.meta.url).href;
const M = await import(base + "core/money.js");
const D = await import(base + "core/dates.js");
const F = await import(base + "core/finance.js");
const { sanitizeState, isISODate } = await import(base + "core/sanitize.js");
const { buildDemoState } = await import(base + "data/demo.js");

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log("✗", name, "→", JSON.stringify(got), "esperado", JSON.stringify(want));
};

// --- parseAmount -------------------------------------------------------------
const P = M.parseAmount;
eq("1.350 = mil", P("1.350"), 1350);
eq("0.350 = 0,35", P("0.350"), 0.35);
eq("20.5", P("20.5"), 20.5);
eq("1.350,75", P("1.350,75"), 1350.75);
eq("470.250", P("470.250"), 470250);
eq("1.234.567", P("1.234.567"), 1234567);
eq("9,99", P("9,99"), 9.99);
eq("$ 12.000", P("$ 12.000"), 12000);
eq("vacío", Number.isNaN(P("")), true);
eq("letras", Number.isNaN(P("abc")), true);
eq("100.00 (dos decimales)", P("100.00"), 100);

// --- formatMoney -------------------------------------------------------------
eq("fmt entero", M.formatMoney(470250, "ARS"), "$ 470.250");
eq("fmt centavos USD", M.formatMoney(9.99, "USD"), "US$ 9,99");
eq("fmt negativo", M.formatMoney(-1500, "ARS"), "−$ 1.500");
eq("fmt casi cero negativo", M.formatMoney(-0.004, "ARS"), "$ 0");
eq("fmt signo +", M.formatMoney(26000, "ARS", { sign: true }), "+$ 26.000");
eq("fmt NaN", M.formatMoney(NaN, "ARS"), "$ 0");

// --- fechas -----------------------------------------------------------------
eq("31 ene + 1 mes", D.addMonths("2026-01-31", 1), "2026-02-28");
eq("31 ene + 2 meses (día preferido)", D.addMonths(D.addMonths("2026-01-31", 1, 31), 1, 31), "2026-03-31");
eq("bisiesto 29 feb + 12", D.addMonths("2028-02-29", 12), "2029-02-28");
eq("fin de año", D.addDays("2026-12-31", 1), "2027-01-01");
eq("daysBetween cambio de horario", D.daysBetween("2026-03-28", "2026-03-30"), 2);
eq("monthRange feb bisiesto", D.monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
eq("shiftMonthKey dic→ene", D.shiftMonthKey("2026-12", 1), "2027-01");
eq("isISODate válida", isISODate("2026-02-28"), true);
eq("isISODate 30 feb", isISODate("2026-02-30"), false);
eq("isISODate basura", isISODate("__proto__"), false);

// --- facturas ----------------------------------------------------------------
const weekly = { recurring: true, frequency: "weekly", dueDate: "2026-09-28", status: "pending", payments: [] };
eq("semanal en 30 días", F.billOccurrences(weekly, "2026-10-28").length, 5);
const once = { recurring: false, status: "pending", dueDate: "2026-10-05", payments: [] };
eq("única pendiente", F.billOccurrences(once, "2026-10-28"), ["2026-10-05"]);
eq("única pagada", F.billOccurrences({ ...once, status: "paid" }, "2026-10-28"), []);
const day31 = { recurring: true, frequency: "monthly", dueDate: "2026-01-31", dueDay: 31, status: "pending", payments: [] };
eq("mensual día 31", F.billOccurrences(day31, "2026-05-31"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);

// --- validación de datos ------------------------------------------------------
const evil = sanitizeState({
  rates: { USD: "1350", EUR: -5, ARS: 99 },
  settings: { mainCurrency: "XXX", openingBalance: "abc", reserveHorizon: "nope" },
  categories: [
    { id: "exp-otros", name: "Otros", icon: "📦", color: "red;position:fixed", type: "expense", subcategories: "no" },
    { id: "dup", name: "<b>x</b>", icon: '<img src=x onerror=alert(1)>', color: "#12AB34", type: "expense" },
    { id: "dup", name: "duplicada", type: "expense" },
    { name: "sin id", type: "expense" },
  ],
  transactions: [
    { id: "a", type: "income", amount: "500", currency: "ARS", date: "2026-09-01", categoryId: "exp-otros" },
    { id: "b", type: "expense", amount: 1e308, currency: "ARS", date: "2026-09-02" },
    { id: "c", type: "expense", amount: 10, date: "__proto__" },
    { id: "d", type: "hack", amount: 10, date: "2026-09-02" },
    { id: "a", type: "income", amount: 1, date: "2026-09-03" },
  ],
  bills: [{ id: "x", amount: "abc", dueDate: "2026-10-01" }, { id: "y", name: "Luz", amount: 100, dueDate: "2026-10-01", frequency: "hack", payments: "no" }],
  goals: [{ id: "g", target: 0 }, { id: "h", name: "Viaje", target: 1000, color: "url(https://evil)", movements: "no" }],
  budgets: [{ id: "q", mode: "percent", value: 250, target: { kind: "rest" } }, { id: "r", mode: "fixed", value: 10, target: { kind: "goal", goalId: "zzz" } }],
});
eq("tipos de cambio", [evil.rates.ARS, evil.rates.USD, evil.rates.EUR, Object.keys(evil.rates).length], [1, 1350, 1470, 8]);
eq("moneda principal inválida", evil.settings.mainCurrency, "ARS");
eq("saldo inicial inválido", evil.accounts[0].opening, 0);
eq("sin saldo inicial en configuración", "openingBalance" in evil.settings, false);

// Datos de antes de las cuentas: el saldo inicial pasa a una primera cuenta y el total no cambia
const legacy = sanitizeState({ settings: { mainCurrency: "ARS", openingBalance: 5000, openingCurrency: "USD" }, rates: { USD: 1000 }, categories: [], transactions: [{ id: "t1", type: "expense", amount: 1000000, currency: "ARS", date: "2026-01-05", categoryId: "exp-otros" }] });
eq("legado: una cuenta", legacy.accounts.length, 1);
eq("legado: saldo y moneda", [legacy.accounts[0].opening, legacy.accounts[0].currency], [5000, "USD"]);
eq("legado: movimiento en esa cuenta", legacy.transactions[0].accountId, legacy.accounts[0].id);
eq("legado: total", Math.round(F.totalBalance(legacy, "2026-09-30")), 5000 * 1000 - 1000000);

// Transferencias: no cambian el total (misma moneda), sí los saldos de cada cuenta
const acc = sanitizeState({
  rates: { USD: 1000 },
  categories: [],
  accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 10000 }, { id: "b", name: "B", currency: "ARS", kind: "cash", opening: 0 }, { id: "u", name: "U", currency: "USD", kind: "savings", opening: 0 }],
  transactions: [
    { id: "x1", type: "transfer", amount: 3000, currency: "ARS", accountId: "a", toAccountId: "b", toAmount: 3000, toCurrency: "ARS", date: "2026-02-01" },
    { id: "x2", type: "transfer", amount: 2000, currency: "ARS", accountId: "a", toAccountId: "u", toAmount: 2, toCurrency: "USD", date: "2026-02-02" },
    { id: "x3", type: "transfer", amount: 50, currency: "ARS", accountId: "a", toAccountId: "a", toAmount: 50, toCurrency: "ARS", date: "2026-02-02" },
    { id: "x4", type: "transfer", amount: 50, currency: "ARS", accountId: "a", toAccountId: "fantasma", toAmount: 50, toCurrency: "ARS", date: "2026-02-02" },
  ],
});
eq("transferencias inválidas descartadas", acc.transactions.map((t) => t.id), ["x1", "x2"]);
eq("saldos por cuenta", F.accountBalances(acc, "2026-09-30").map((e) => Math.round(e.balance)), [5000, 3000, 2]);
eq("total con transferencias", Math.round(F.totalBalance(acc, "2026-09-30")), 10000);
eq("transferencias no son gastos", F.monthlyTotals(acc, "2026-02").expense, 0);

// Préstamos: mueven dinero de las cuentas pero no son ingreso ni gasto
const lo = sanitizeState({
  rates: { USD: 1000 },
  categories: [],
  settings: { reserveHorizon: "30d" },
  accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 100000 }],
  loans: [
    { id: "L1", person: "Caro", direction: "lent", amount: 30000, currency: "ARS", date: "2026-09-01", txId: "m1", payments: [{ id: "p1", date: "2026-09-10", amount: 10000, txId: "m2" }, { id: "p2", date: "2026-09-11", amount: 5000, txId: "fantasma" }] },
    { id: "L2", person: "Papá", direction: "borrowed", amount: 50000, currency: "ARS", date: "2026-09-02", dueDate: "2026-10-10", payments: [] },
    { id: "L3", person: "Mal", direction: "otra", amount: 5, date: "2026-09-02" },
  ],
  transactions: [
    { id: "m1", type: "loan", loanId: "L1", flow: "out", amount: 30000, currency: "ARS", accountId: "a", date: "2026-09-01" },
    { id: "m2", type: "loan", loanId: "L1", flow: "in", amount: 10000, currency: "ARS", accountId: "a", date: "2026-09-10" },
    { id: "m3", type: "loan", loanId: "L3", flow: "in", amount: 5, currency: "ARS", accountId: "a", date: "2026-09-10" },
  ],
});
eq("préstamos válidos", lo.loans.map((l) => l.id), ["L1", "L2"]);
eq("pago con movimiento inexistente queda sin txId", lo.loans[0].payments.map((p) => p.txId || "-"), ["m2", "-"]);
eq("movimiento de un préstamo inválido descartado", lo.transactions.map((t) => t.id), ["m1", "m2"]);
eq("saldo de la cuenta con préstamos", Math.round(F.accountBalances(lo, "2026-09-30")[0].balance), 80000);
eq("falta cobrar", F.loanOutstanding(lo.loans[0]), 15000);
eq("te deben / debes", [F.loansSummary(lo).lent, F.loansSummary(lo).borrowed], [15000, 50000]);
eq("deuda que vence en 30 días se reserva", Math.round(F.balanceSummary(lo, "2026-09-30").debts.amount), 50000);
eq("préstamos no son gastos", F.monthlyTotals(lo, "2026-09").expense, 0);
eq("color con CSS inyectado", evil.categories[0].color, "#8b958e");
eq("ícono con HTML", evil.categories[1].icon, "🏷️");
eq("categorías: sin duplicadas ni sin id, + respaldo de ingresos", evil.categories.map((c) => c.id), ["exp-otros", "dup", "inc-otros"]);
eq("movimientos válidos (monto texto ok, ingreso a categoría de gasto → Otros ingresos)", evil.transactions.map((t) => [t.id, t.amount, t.categoryId]), [["a", 500, "inc-otros"]]);
eq("facturas válidas", evil.bills.map((b) => [b.id, b.frequency, b.payments.length]), [["y", "monthly", 0]]);
eq("metas válidas + color seguro", evil.goals.map((g) => [g.id, g.color, g.movements.length]), [["h", "#8a63d2", 0]]);
eq("presupuestos inválidos descartados", evil.budgets.length, 0);
eq("no se contamina el prototipo", ({}).polluted, undefined);

// --- ids: miles creados de corrido no se repiten ---------------------------------
{
  const { uid } = await import(base + "data/defaults.js");
  const made = new Set();
  for (let i = 0; i < 200000; i++) made.add(uid("tx"));
  eq("ids únicos aunque se creen en el mismo milisegundo", made.size, 200000);
}

// --- el demo sobrevive a la validación sin perder nada ------------------------
const demo = buildDemoState();
const clean = sanitizeState(JSON.parse(JSON.stringify(demo)));
eq("demo: movimientos", clean.transactions.length, demo.transactions.length);
eq("demo: facturas", clean.bills.length, demo.bills.length);
eq("demo: metas", clean.goals.length, demo.goals.length);
eq("demo: presupuestos", clean.budgets.length, demo.budgets.length);
eq("demo: saldo igual", Math.round(F.balanceSummary(clean).available), Math.round(F.balanceSummary(demo).available));
eq("demo: subcategorías intactas", clean.transactions.filter((t) => t.subcategoryId).length, demo.transactions.filter((t) => t.subcategoryId).length);

// ---------------------------------------------------------------------------
// Casos límite de lo nuevo: tarjetas, cuotas, préstamos, avisos, datos raros
// ---------------------------------------------------------------------------
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const store = await import(base + "core/store.js");
const R = await import(base + "ui/reminders.js");

// Datos hostiles en cuentas, transferencias, cuotas y préstamos
const weird = sanitizeState({
  categories: [],
  accounts: [
    { id: "a", name: "<b>x</b>", currency: "ARS", kind: "credit", opening: -100, closingDay: "40", dueDay: "abc", color: "red;}" },
    { id: "a", name: "duplicada", currency: "ARS", kind: "bank" },
    { id: "b", name: "", currency: "XXX", kind: "inventada", opening: "1e99", archived: true },
    "no soy una cuenta",
  ],
  transactions: [
    { id: "t1", type: "expense", amount: 10, date: "2026-01-01", accountId: "fantasma", installment: { group: "g", n: 9, of: 3 } },
    { id: "t2", type: "expense", amount: 10, date: "2026-01-01", accountId: "a", installment: { group: "g", n: 2, of: 3 } },
    { id: "t3", type: "transfer", amount: -5, toAmount: 5, accountId: "a", toAccountId: "b", date: "2026-01-01" },
    { id: "t4", type: "loan", loanId: "L", flow: "arriba", amount: 5, accountId: "a", date: "2026-01-01" },
  ],
  loans: [{ id: "L", person: "", direction: "lent", amount: 100, date: "2026-01-01", dueDate: "no es fecha", payments: [{ id: "p", date: "2026-01-02", amount: 500 }, { id: "q", date: "x", amount: 1 }] }],
});
eq("cuentas: sin duplicadas ni basura", weird.accounts.map((a) => a.id), ["a", "b"]);
eq("tarjeta: días inválidos → por defecto", [weird.accounts[0].closingDay, weird.accounts[0].dueDay], [25, 5]);
eq("cuenta: color, tipo, moneda y saldo inválidos", [weird.accounts[0].color, weird.accounts[1].kind, weird.accounts[1].currency, weird.accounts[1].opening], ["#08a7c8", "cash", "ARS", 0]);
eq("movimiento de cuenta inexistente → cuenta activa", weird.transactions[0].accountId, "a");
eq("cuota imposible (9 de 3) se descarta, la válida queda", [weird.transactions[0].installment, weird.transactions[1].installment?.n], [undefined, 2]);
eq("transferencia y préstamo inválidos descartados", weird.transactions.map((t) => t.id), ["t1", "t2"]);
eq("préstamo: persona, fecha y pagos", [weird.loans[0].person, weird.loans[0].dueDate, weird.loans[0].payments.length], ["Alguien", "", 1]);
eq("pagar de más no deja saldo negativo", F.loanOutstanding(weird.loans[0]), 0);
eq("limpiar dos veces da lo mismo", JSON.stringify(sanitizeState(JSON.parse(JSON.stringify(weird)))), JSON.stringify(weird));

// Tarjeta: deuda, saldo a favor y vencimiento a fin de mes
const cardState = sanitizeState({
  categories: [],
  accounts: [{ id: "bank", name: "Banco", currency: "ARS", kind: "bank", opening: 1000 }, { id: "card", name: "Visa", currency: "ARS", kind: "credit", opening: 0, closingDay: 31, dueDay: 31 }],
  transactions: [
    { id: "c1", type: "expense", amount: 300, currency: "ARS", date: "2026-02-10", categoryId: "exp-otros", accountId: "card" },
    { id: "c2", type: "expense", amount: 200, currency: "ARS", date: "2026-03-10", categoryId: "exp-otros", accountId: "card", installment: { group: "g", n: 2, of: 2 } },
  ],
});
const cardAcc = cardState.accounts[1];
eq("tarjeta: deuda de hoy (sin cuotas futuras)", F.cardStatus(cardState, cardAcc, "2026-02-15").debt, 300);
eq("tarjeta: vence el día 31 → último día de febrero", F.cardStatus(cardState, cardAcc, "2026-02-15").due, "2026-02-28");
eq("tarjeta: el mismo día del vencimiento sigue siendo ese", F.cardStatus(cardState, cardAcc, "2026-03-31").due, "2026-03-31");
eq("tarjeta: cuotas por venir", F.cardStatus(cardState, cardAcc, "2026-02-15").upcomingTotal, 200);
eq("el total descuenta la deuda de la tarjeta", F.totalBalance(cardState, "2026-02-15"), 700);
eq("la cuota futura se reserva si cae en el plazo", F.balanceSummary(cardState, "2026-02-15").scheduled.amount, 200);
eq("y no se reserva si está lejos", F.balanceSummary(cardState, "2026-01-01").scheduled.amount, 0);
cardState.transactions.push({ id: "pago", type: "transfer", amount: 500, currency: "ARS", accountId: "bank", toAccountId: "card", toAmount: 500, toCurrency: "ARS", date: "2026-02-12", description: "", time: "", createdAt: "2026-02-12" });
eq("tarjeta pagada de más: saldo a favor", [F.cardStatus(cardState, cardAcc, "2026-02-15").debt, F.cardStatus(cardState, cardAcc, "2026-02-15").credit], [0, 200]);
eq("pagar la tarjeta no cambia el total", F.totalBalance(cardState, "2026-02-15"), 700);

// Cuotas desde el store
store.restore(sanitizeState({ categories: [], accounts: [{ id: "card", name: "Visa", currency: "ARS", kind: "credit" }, { id: "bank", name: "Banco", currency: "ARS", kind: "bank" }] }));
const three = store.addInstallmentPurchase({ type: "expense", amount: 1000, currency: "ARS", date: "2026-01-31", categoryId: "exp-otros", accountId: "card", description: "x" }, 3);
eq("cuotas: montos suman el total", three.map((t) => t.amount), [333.33, 333.33, 333.34]);
eq("cuotas: día 31 respeta los meses cortos", three.map((t) => t.date), ["2026-01-31", "2026-02-28", "2026-03-31"]);
const tiny = store.addInstallmentPurchase({ type: "expense", amount: 0.02, currency: "ARS", date: "2026-01-10", categoryId: "exp-otros", accountId: "card" }, 12);
eq("monto que no alcanza para cuotas → un solo pago", [tiny.length, tiny[0].amount, tiny[0].installment], [1, 0.02, undefined]);
eq("la cuenta por defecto no es la tarjeta", store.defaultAccountId(), "bank");
let threw = "";
try { store.addTransfer({ fromId: "bank", toId: "bank", amount: 10 }); } catch (e) { threw = e.message; }
eq("transferir a la misma cuenta se rechaza", threw, "Elige dos cuentas distintas");
try { store.deleteAccount("card"); threw = "se borró"; } catch (e) { threw = e.message; }
eq("no se borra una cuenta con movimientos", threw, "Esta cuenta tiene movimientos: puedes archivarla");
store.saveAccount({ ...store.getState().accounts[0], archived: true });
store.saveAccount({ ...store.getState().accounts[1], archived: true });
eq("siempre queda una cuenta activa", store.getState().accounts.some((a) => !a.archived), true);

// Préstamos desde el store
const loan = store.addLoan({ person: "Caro", direction: "lent", amount: 100, currency: "ARS", date: "2026-01-01", accountId: "bank" });
store.addLoanPayment(loan.id, { amount: 40, date: "2026-01-05", accountId: "bank" });
eq("préstamo: sale 100 y vuelven 40", Math.round(F.accountBalance(store.getState(), "bank", "2026-12-31").balance), -60);
const payTx = store.getState().transactions.find((t) => t.type === "loan" && t.flow === "in");
store.deleteTransaction(payTx.id);
eq("borrar el movimiento de una devolución la saca del préstamo", store.getState().loans[0].payments.length, 0);
store.deleteLoan(loan.id);
eq("borrar el préstamo borra lo que movió", store.getState().transactions.filter((t) => t.type === "loan").length, 0);

// Cambiar la moneda principal convierte el ingreso de referencia
store.restore(sanitizeState({ categories: [], rates: { USD: 1000 }, settings: { mainCurrency: "ARS", budgetReference: 800000 } }));
store.setMainCurrency("USD");
eq("moneda principal: el ingreso de referencia se convierte", [store.getState().settings.mainCurrency, store.getState().settings.budgetReference], ["USD", 800]);
store.setMainCurrency("ARS");
eq("y vuelve al volver", store.getState().settings.budgetReference, 800000);
store.setMainCurrency("XXX");
eq("moneda inventada: no cambia nada", store.getState().settings.mainCurrency, "ARS");

// Sueldo: cobro parcial, monto habitual y extras
const oldCats = buildDemoState().categories.map((c) => (c.id === "inc-sueldo" ? { ...c, subcategories: c.subcategories.slice(0, 3) } : c));
store.restore({ version: 4, categories: oldCats, accounts: [{ id: "bank", name: "Banco", currency: "ARS", kind: "bank" }], transactions: [{ id: "s1", type: "income", amount: 400000, currency: "ARS", date: "2026-10-10", categoryId: "inc-sueldo", accountId: "bank", description: "Sueldo", recurrence: { freq: "monthly", nextDate: "2026-11-10", amount: 800000 } }] });
eq("cobro parcial: se guarda el monto habitual", store.getState().transactions[0].recurrence.amount, 800000);
const paid = store.confirmRecurring("s1");
eq("al mes siguiente se propone lo habitual, no el parcial", [paid.amount, paid.date, paid.recurrence.nextDate, paid.recurrence.amount], [800000, "2026-11-10", "2026-12-10", undefined]);
eq("la recurrencia pasa al cobro nuevo", store.getState().transactions.filter((t) => t.recurrence).map((t) => t.id), [paid.id]);
const dec = store.confirmRecurring(paid.id, { amount: 750000, date: "2026-12-11", extras: [{ name: "Paga extra o aguinaldo", amount: 400000, categoryId: "inc-sueldo", subcategoryId: "inc-sueldo.aguinaldo" }, { name: "Propinas", amount: 5000, categoryId: "inc-propinas" }, { name: "Nada", amount: 0, categoryId: "inc-sueldo" }] });
eq("cobro con descuento: registra lo real y conserva lo habitual", [dec.amount, dec.date, dec.recurrence.amount, dec.recurrence.nextDate], [750000, "2026-12-11", 800000, "2027-01-10"]);
const extrasTx = store.getState().transactions.filter((t) => ["Paga extra o aguinaldo", "Propinas", "Nada"].includes(t.description));
eq("extras: un ingreso aparte por cada uno", extrasTx.map((t) => [t.description, t.amount, t.categoryId, t.subcategoryId, t.date, t.accountId]), [["Paga extra o aguinaldo", 400000, "inc-sueldo", "inc-sueldo.aguinaldo", "2026-12-11", "bank"], ["Propinas", 5000, "inc-propinas", "", "2026-12-11", "bank"]]);
eq("ingresos de diciembre = sueldo + extras", F.monthlyTotals(store.getState(), "2026-12").income, 1155000);
const raise = store.confirmRecurring(dec.id, { amount: 900000, keepAsUsual: true });
eq("aumento: el monto nuevo pasa a ser el habitual", [raise.amount, raise.recurrence.amount], [900000, undefined]);
eq("datos de antes reciben las subcategorías nuevas del sueldo", store.getState().categories.find((c) => c.id === "inc-sueldo").subcategories.map((x) => x.id).filter((id) => /comision|otros/.test(id)), ["inc-sueldo.comision", "inc-sueldo.otros"]);

// Para gastar por día
const dayState = (extra = []) => sanitizeState({ categories: [], accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 100000 }], bills: [{ id: "b", name: "Luz", amount: 10000, dueDate: "2026-03-20", recurring: true, frequency: "monthly" }], transactions: extra });
let day = F.dailyAllowance(dayState(), "2026-03-22");
eq("por día hasta fin de mes (10 días; 100.000 menos dos vencimientos de 10.000)", [day.days, day.reason, Math.round(day.perDay), Math.round(day.leftToday)], [10, "month", 8000, 8000]);
day = F.dailyAllowance(dayState([{ id: "s", type: "income", amount: 1, currency: "ARS", date: "2026-03-01", categoryId: "inc-sueldo", accountId: "a", recurrence: { freq: "monthly", nextDate: "2026-03-27" } }]), "2026-03-22");
eq("por día hasta el próximo cobro (5 días)", [day.days, day.reason, day.until, Math.round(day.perDay)], [5, "income", "2026-03-27", 16000]);
day = F.dailyAllowance(dayState([{ id: "c", type: "expense", amount: 3000, currency: "ARS", date: "2026-03-22", categoryId: "exp-otros", accountId: "a" }]), "2026-03-22");
eq("un café de hoy baja lo de hoy, no lo de cada día", [Math.round(day.perDay), Math.round(day.leftToday), day.spentToday], [8000, 5000, 3000]);
day = F.dailyAllowance(dayState([{ id: "c", type: "expense", amount: 30000, currency: "ARS", date: "2026-03-22", categoryId: "exp-otros", accountId: "a" }]), "2026-03-22");
eq("si hoy te pasaste, da negativo", [Math.round(day.perDay), Math.round(day.leftToday)], [8000, -22000]);
day = F.dailyAllowance(dayState([{ id: "p", type: "expense", amount: 10000, currency: "ARS", date: "2026-03-22", categoryId: "exp-otros", accountId: "a", billId: "b" }]), "2026-03-22");
eq("pagar una factura no cuenta como gasto del día", day.spentToday, 0);
day = F.dailyAllowance(dayState([{ id: "q", type: "expense", amount: 10000, currency: "ARS", date: "2026-03-22", categoryId: "exp-otros", accountId: "a", installment: { group: "g", n: 2, of: 3 } }]), "2026-03-22");
eq("una cuota que cae hoy tampoco", day.spentToday, 0);
day = F.dailyAllowance(dayState(), "2026-03-31");
eq("último día del mes: un día", day.days, 1);
day = F.dailyAllowance(dayState([{ id: "g", type: "expense", amount: 500000, currency: "ARS", date: "2026-03-10", categoryId: "exp-otros", accountId: "a" }]), "2026-03-22");
eq("sin disponible, nunca da negativo por día", day.perDay, 0);

// Sobres: presupuesto reservado (supermercado) y gustos por día
const env = (budgets, transactions = [], goals = []) => sanitizeState({ accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 500000 }], categories: buildDemoState().categories, budgets, transactions, goals });
const superB = { id: "sup", name: "Supermercado", mode: "fixed", value: 200000, currency: "ARS", target: { kind: "categories", categoryIds: ["exp-super"] }, reserve: true, since: "2026-02-10" };
const gasto = (id, amount, date, categoryId = "exp-super") => ({ id, type: "expense", amount, currency: "ARS", date, categoryId, accountId: "a" });
let es = env([superB], [gasto("g1", 50000, "2026-03-05")]);
eq("supermercado reservado: lo que falta gastar del mes", [F.budgetReserve(es, "2026-03-10").amount, F.balanceSummary(es, "2026-03-10").available], [150000, 300000]);
eq("gastar en el supermercado no cambia el disponible", F.balanceSummary(env([superB], [gasto("g1", 50000, "2026-03-05"), gasto("g2", 30000, "2026-03-09")]), "2026-03-10").available, 300000);
eq("pasarse del presupuesto sí lo baja", F.balanceSummary(env([superB], [gasto("g1", 260000, "2026-03-05")]), "2026-03-10").available, 240000);
eq("sin 'reservar' no se descuenta", F.budgetReserve(env([{ ...superB, reserve: false }]), "2026-03-10").amount, 0);
eq("un presupuesto para una meta nunca se reserva", env([{ ...superB, target: { kind: "goal", goalId: "x" } }]).budgets.length, 0);
es = env([superB], [gasto("g1", 120000, "2026-02-15")], [{ id: "goal", name: "Viaje", target: 1000000, currency: "ARS", movements: [] }]);
eq("sobrante del mes pasado", F.budgetLeftovers(es, "2026-03-03").map((l) => [l.budget.id, l.month, l.amount]), [["sup", "2026-02", 80000]]);
eq("en el mismo mes en que se creó no hay sobrante que ofrecer", F.budgetLeftovers(es, "2026-02-20"), []);
store.restore(es);
store.settleBudgetLeftover("sup", "2026-02", { goalId: "goal", amount: 80000, note: "Sobrante" });
eq("pasarlo a la meta: queda apartado y no se vuelve a ofrecer", [F.goalSaved(store.getState().goals[0]), store.getState().budgets[0].settledMonth, F.budgetLeftovers(store.getState(), "2026-03-03").length], [80000, "2026-02", 0]);
store.restore(es);
store.settleBudgetLeftover("sup", "2026-02");
eq("dejarlo disponible: no mueve dinero y no se vuelve a ofrecer", [F.goalSaved(store.getState().goals[0]), F.budgetLeftovers(store.getState(), "2026-03-03").length], [0, 0]);

const treatsB = { id: "tr", name: "Gustos", icon: "☕", mode: "daily", value: 5000, currency: "ARS", target: { kind: "categories", categoryIds: ["exp-comida"] }, reserve: true, since: "2026-02-01" };
let ts = env([treatsB]);
let tr = F.treatAllowance(ts, "2026-03-04");
eq("gustos: se acumulan los días sin gastar", [tr.days, tr.perDay, tr.accumulated], [4, 5000, 20000]);
tr = F.treatAllowance(env([treatsB], [gasto("c1", 3000, "2026-03-02", "exp-comida"), gasto("c2", 4000, "2026-03-04", "exp-comida"), gasto("s", 9999, "2026-03-04", "exp-super")]), "2026-03-04");
eq("gustos: baja con lo gastado en sus categorías (no con el supermercado)", [tr.accumulated, tr.spentToday, tr.spent], [13000, 4000, 7000]);
tr = F.treatAllowance(env([treatsB], [gasto("c1", 30000, "2026-03-01", "exp-comida")]), "2026-03-02");
eq("gustos: pasarse deja saldo negativo que se recupera con los días", tr.accumulated, -20000);
eq("gustos: límite del mes = valor por día × días del mes", F.budgetStatus(ts, ts.budgets[0], "2026-03").limit, 155000);
tr = F.treatAllowance(env([{ ...treatsB, since: "2026-03-20" }], [gasto("c0", 9000, "2026-03-05", "exp-comida")]), "2026-03-22");
eq("gustos creados a mitad de mes: cuentan desde ese día", [tr.days, tr.accumulated, F.budgetStatus(ts, { ...treatsB, since: "2026-03-20" }, "2026-03").limit], [3, 15000, 60000]);
eq("sin presupuesto por día no hay gustos", F.treatAllowance(env([superB]), "2026-03-04"), null);
store.restore(env([]));
const made = store.saveBudget({ name: "Gustos", icon: "☕", color: "#d99a2b", mode: "daily", value: 100, currency: "ARS", target: { kind: "categories", categoryIds: ["exp-comida"] }, reserve: true });
eq("al crear uno reservado se anota desde cuándo cuenta", [made.reserve, /^\d{4}-\d{2}-\d{2}$/.test(made.since)], [true, true]);

// Fondo de facturas
const cushionState = (on) => sanitizeState({ settings: { billCushion: on, billCushionSince: "2026-01-01", reserveHorizon: "month" }, categories: buildDemoState().categories, accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 300000 }], bills: [{ id: "luz", name: "Luz", amount: 40000, currency: "ARS", dueDate: "2026-03-10", dueDay: 10, recurring: true, frequency: "monthly", categoryId: "exp-servicios" }] });
store.restore(cushionState(true));
const before = F.balanceSummary(store.getState(), "2026-03-09").available;
store.payBill("luz", { date: "2026-03-09", amount: 30000 });
eq("vino por menos: la diferencia queda en el fondo", [F.billCushion(store.getState()).amount, store.getState().bills[0].payments[0].expected], [10000, 40000]);
eq("y el disponible no cambia", F.balanceSummary(store.getState(), "2026-03-09").available, before);
store.payBill("luz", { date: "2026-04-09", amount: 46000 });
eq("vino por más: sale del fondo", F.billCushion(store.getState()).amount, 4000);
store.payBill("luz", { date: "2026-05-09", amount: 50000 });
eq("el fondo nunca es negativo", F.billCushion(store.getState()).amount, 0);
store.undoLastPayment("luz");
eq("deshacer un pago lo recalcula", F.billCushion(store.getState()).amount, 4000);
store.releaseBillCushion(4000);
eq("liberar: vuelve al disponible", [F.billCushion(store.getState()).amount, store.getState().settings.billCushionReleased], [0, 4000]);
store.restore({ ...cushionState(true), goals: [{ id: "meta", name: "Viaje", target: 100000, currency: "ARS", movements: [] }] });
store.payBill("luz", { date: "2099-01-09", amount: 25000 });
store.moveCushionToGoal("meta", 10000);
eq("fondo a una meta: sale del fondo y queda apartado", [F.billCushion(store.getState()).amount, F.goalSaved(store.getState().goals[0]), store.getState().goals[0].movements[0].note], [5000, 10000, "Fondo de facturas"]);
store.moveCushionToGoal("no-existe", 5000);
eq("meta inexistente: no se pierde dinero del fondo", F.billCushion(store.getState()).amount, 5000);
store.restore(cushionState(false));
store.payBill("luz", { date: "2026-03-09", amount: 30000 });
eq("desactivado: no reserva nada", [F.billCushion(store.getState()).amount, F.balanceSummary(store.getState(), "2026-03-09").available], [0, 270000]);
store.setBillCushion(true);
eq("al activarlo no cuenta los pagos anteriores", F.billCushion(store.getState()).amount, 0);

// Regiones: formato de números, monedas y tipos de cambio
{
  const fmt = (region, fn) => { M.configureMoney({ region }); const out = fn(); M.configureMoney({ region: "es-AR", currencies: ["ARS", "USD", "EUR"] }); return out; };
  const clean = (s) => s.replace(/[  ]/g, " ");
  eq("formato por región", ["es-AR", "es-ES", "pt-BR", "en-US", "en-GB", "ja-JP", "ru-RU", "tr-TR"].map((r) => fmt(r, () => clean(M.formatNumber(1234567.5, 2)))), ["1.234.567,50", "1.234.567,50", "1.234.567,50", "1,234,567.50", "1,234,567.50", "1,234,567.50", "1 234 567,50", "1.234.567,50"]);
  eq("leer montos con punto decimal (EE. UU.)", fmt("en-US", () => ["1,350.75", "470,250", "20.5", "1,5", "1,350,000", "1500"].map(M.parseAmount)), [1350.75, 470250, 20.5, 1.5, 1350000, 1500]);
  eq("leer montos con coma decimal (Brasil)", fmt("pt-BR", () => ["1.350,75", "470.250", "20,5", "1500"].map(M.parseAmount)), [1350.75, 470250, 20.5, 1500]);
  eq("leer montos en Rusia (espacio de miles)", fmt("ru-RU", () => M.parseAmount(M.amountToInput(1234567.5))), 1234567.5);
  eq("ida y vuelta por el campo en cada región", ["es-AR", "es-ES", "pt-BR", "en-US", "en-GB", "ru-RU", "tr-TR"].map((r) => fmt(r, () => M.parseAmount(M.amountToInput(98765.43)))), Array(7).fill(98765.43));
  eq("Japón: sin centavos", fmt("ja-JP", () => [M.usesCents(), M.zeroAmount(), M.amountToInput(1500), M.formatMoney(1500.4, "JPY")]), [false, "0", "1,500", "¥ 1,500"]);
  eq("el cero de un campo sigue a la región", [fmt("es-AR", M.zeroAmount), fmt("en-US", M.zeroAmount)], ["0,00", "0.00"]);
  eq("símbolos", fmt("pt-BR", () => [M.formatMoney(10, "BRL"), M.formatMoney(10, "GBP"), M.formatMoney(10, "RUB"), M.formatMoney(10, "TRY")]), ["R$ 10", "£ 10", "₽ 10", "₺ 10"]);
  eq("el signo $ es de la moneda del país; la otra lleva prefijo", [fmt("es-AR", () => [M.symbolOf("ARS"), M.symbolOf("USD")]), fmt("en-US", () => [M.symbolOf("ARS"), M.symbolOf("USD")]), fmt("pt-BR", () => [M.symbolOf("ARS"), M.symbolOf("USD")])], [["$", "US$"], ["AR$", "$"], ["AR$", "US$"]]);
  const langs = (list) => { Object.defineProperty(globalThis, "navigator", { value: { language: list[0], languages: list }, configurable: true }); const r = M.detectRegion(); Object.defineProperty(globalThis, "navigator", { value: { language: "es-AR", languages: ["es-AR"] }, configurable: true }); return r; };
  eq("región según el idioma del dispositivo", [["pt-BR"], ["pt"], ["en-GB"], ["en-AU"], ["es-MX"], ["es-ES"], ["ja"], ["ru-RU"], ["tr"], ["de-DE"], ["de", "tr-TR"]].map(langs), ["pt-BR", "pt-BR", "en-GB", "en-US", "es-AR", "es-ES", "ja-JP", "ru-RU", "tr-TR", "es-AR", "tr-TR"]);
  Object.defineProperty(globalThis, "navigator", { value: { language: "pt-BR", languages: ["pt-BR"] }, configurable: true });
  const br = sanitizeState(undefined);
  Object.defineProperty(globalThis, "navigator", { value: { language: "es-AR", languages: ["es-AR"] }, configurable: true });
  eq("instalación nueva en Brasil: reales y dólares", [br.settings.region, br.settings.mainCurrency, br.settings.currencies], ["pt-BR", "BRL", ["USD", "BRL"]]);
  const old = sanitizeState({ settings: { mainCurrency: "USD", createdAt: "2026-01-01T00:00:00Z" }, accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank" }] });
  eq("datos de antes de las regiones: Argentina, sus tres monedas", [old.settings.region, old.settings.mainCurrency, old.settings.currencies], ["es-AR", "USD", ["ARS", "USD", "EUR"]]);
  const mixed = sanitizeState({ settings: { region: "tr-TR", mainCurrency: "TRY", currencies: ["XXX", "USD"], createdAt: "2026-01-01T00:00:00Z" }, accounts: [{ id: "a", name: "A", currency: "GBP", kind: "bank" }] });
  eq("las monedas en uso incluyen la principal y las de los datos", mixed.settings.currencies, ["USD", "GBP", "TRY"]);
  // Tipos de cambio cargados en la moneda principal
  store.restore(sanitizeState({ settings: { region: "pt-BR", mainCurrency: "BRL", currencies: ["BRL", "USD", "ARS"], createdAt: "2026-01-01T00:00:00Z" } }));
  store.setRateInMain("USD", 5.4);
  const r1 = store.getState().rates;
  eq("1 USD = 5,40 BRL", Math.round((r1.USD / r1.BRL) * 100) / 100, 5.4);
  store.setRateInMain("ARS", 1 / 250); // 1 BRL = 250 ARS
  const r2 = store.getState().rates;
  eq("cambiar el peso (pivote) no mueve el dólar contra el real", [Math.round((r2.BRL / r2.ARS) * 100) / 100, Math.round((r2.USD / r2.BRL) * 100) / 100, r2.ARS], [250, 5.4, 1]);
  store.toggleCurrency("EUR", true);
  store.toggleCurrency("BRL", false);
  eq("sumar una moneda; la principal no se puede sacar", store.getState().settings.currencies, ["ARS", "USD", "EUR", "BRL"]);
  store.setRegion("en-US");
  eq("cambiar la región cambia el formato, no los montos", [M.getRegion(), M.formatMoney(1234.5, "BRL"), store.getState().settings.mainCurrency], ["en-US", "R$ 1,234.50", "BRL"]);
  store.setRegion("es-AR");
  M.configureMoney({ region: "es-AR", currencies: ["ARS", "USD", "EUR"] });
}

// Gastos que se repiten (gimnasio): recordatorio, reserva y registro
store.restore(sanitizeState({ accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 100000 }], categories: buildDemoState().categories, settings: { reserveHorizon: "month" }, transactions: [
  { id: "gym", type: "expense", amount: 20000, currency: "ARS", date: "2099-01-05", categoryId: "exp-salud", description: "Gimnasio", accountId: "a", recurrence: { freq: "monthly", nextDate: "2099-02-05" } },
  { id: "pay", type: "income", amount: 500000, currency: "ARS", date: "2099-01-01", categoryId: "inc-sueldo", description: "Sueldo", accountId: "a", recurrence: { freq: "monthly", nextDate: "2099-02-01" } },
  { id: "cuota", type: "expense", amount: 100, currency: "ARS", date: "2099-01-05", categoryId: "exp-otros", accountId: "a", installment: { group: "g", n: 1, of: 2 }, recurrence: { freq: "monthly", nextDate: "2099-02-05" } },
] }));
let rs = store.getState();
eq("gasto que se repite: se conserva; en una cuota, no", [Boolean(rs.transactions.find((t) => t.id === "gym").recurrence), Boolean(rs.transactions.find((t) => t.id === "cuota").recurrence)], [true, false]);
eq("gasto que se repite: pendiente cuando llega la fecha", F.pendingRecurringIncomes(rs, "2099-02-05").map((t) => t.id).sort(), ["gym", "pay"]);
eq("gasto que se repite: reservado desde que entra en el horizonte", [F.scheduledReserve(rs, "2099-01-20").amount, F.scheduledReserve(rs, "2099-02-02").amount], [0, 20000]);
eq("el día de cobro sale solo de los ingresos que se repiten", F.dailyAllowance(rs, "2099-01-20").until, "2099-02-01");
const gymPaid = store.confirmRecurring("gym", { amount: 22000, date: "2099-02-05" });
rs = store.getState();
eq("gasto que se repite: al registrarlo queda como gasto y sigue el mes próximo", [gymPaid.type, gymPaid.amount, gymPaid.recurrence.nextDate, gymPaid.recurrence.amount, rs.transactions.filter((t) => t.description === "Gimnasio").length], ["expense", 22000, "2099-03-05", 20000, 2]);
eq("gasto que se repite: ya no está reservado después de pagarlo", F.scheduledReserve(rs, "2099-02-06").amount, 0);

// Préstamo en cuotas (banco o billetera): entra lo recibido y las cuotas quedan programadas
store.restore(sanitizeState({ accounts: [{ id: "a", name: "A", currency: "ARS", kind: "bank", opening: 100000 }], categories: buildDemoState().categories, settings: { reserveHorizon: "month" } }));
const credit = store.addCreditLoan({ lender: "Mercado Pago", received: 100000, count: 6, installment: 25000, firstDue: "2099-02-10", currency: "ARS", accountId: "a", date: "2099-01-10" });
let cs = store.getState();
let cp = F.loanPlanStatus(cs, cs.loans[0], "2099-01-15");
eq("préstamo en cuotas: entra lo recibido, sin contar como ingreso", [F.balanceSummary(cs, "2099-01-15").total, cs.transactions.filter((t) => t.type === "income").length], [200000, 0]);
eq("préstamo en cuotas: faltan todas, próxima y total con interés", [cp.remaining, cp.next, cp.left, cp.total, cp.interest], [6, "2099-02-10", 150000, 150000, 50000]);
eq("préstamo en cuotas: cuenta en lo que debes", F.loansSummary(cs, "2099-01-15").borrowed, 150000);
eq("préstamo en cuotas: la cuota que se acerca queda reservada", F.scheduledReserve(cs, "2099-02-05").amount, 25000);
eq("préstamo en cuotas: no se reserva dos veces", F.loansReserve(cs, "2099-02-05").amount, 0);
cp = F.loanPlanStatus(cs, cs.loans[0], "2099-03-15");
eq("préstamo en cuotas: las cuotas vencidas bajan el dinero y la deuda", [cp.paid, cp.remaining, cp.left, F.balanceSummary(cs, "2099-03-15").total], [2, 4, 100000, 150000]);
eq("préstamo en cuotas: al terminar no se debe nada", [F.loanPlanStatus(cs, cs.loans[0], "2099-08-01").remaining, F.loansSummary(cs, "2099-08-01").borrowed], [0, 0]);
const csBack = sanitizeState(JSON.parse(JSON.stringify(cs)));
eq("préstamo en cuotas: sobrevive a un backup", [csBack.loans[0].plan.count, csBack.loans[0].plan.amount, csBack.transactions.filter((t) => t.installment?.group === csBack.loans[0].plan.group).length], [6, 25000, 6]);
eq("préstamo en cuotas: un plan inválido se descarta", sanitizeState({ ...JSON.parse(JSON.stringify(cs)), loans: [{ ...cs.loans[0], plan: { group: "x", count: 0, amount: 5 } }] }).loans[0].plan, undefined);
eq("préstamo en cuotas: la cuota que vence hoy no cuenta como gasto del día", F.dailyAllowance(cs, "2099-02-10").spentToday, 0);
// Editar: después de 2 cuotas pagadas, pasan a ser 8 en total de 20.000 y vencen los días 15
store.updateCreditLoan(credit.id, { lender: "Mercado Pago", count: 8, installment: 20000, nextDue: "2099-04-15" }, "2099-03-15");
cs = store.getState();
cp = F.loanPlanStatus(cs, cs.loans[0], "2099-03-15");
eq("editar préstamo: las pagadas no cambian, las que faltan sí", [cp.paid, cp.remaining, cp.next, cp.left, cp.total, cp.installments.map((t) => t.installment.n + "/" + t.installment.of).join(" ")], [2, 6, "2099-04-15", 120000, 170000, "1/8 2/8 3/8 4/8 5/8 6/8 7/8 8/8"]);
eq("editar préstamo: lo ya pagado no se mueve", F.balanceSummary(cs, "2099-03-15").total, 150000);
// Cancelarlo antes: un pago de 100.000 reemplaza las 6 cuotas que faltaban
store.payOffCreditLoan(credit.id, { amount: 100000, date: "2099-03-20", accountId: "a" }, "2099-03-20");
cs = store.getState();
cp = F.loanPlanStatus(cs, cs.loans[0], "2099-03-20");
eq("cancelar antes: no queda nada por pagar y el total es lo realmente pagado", [cp.remaining, cp.left, cp.count, cp.total, cp.interest, F.balanceSummary(cs, "2099-03-20").total], [0, 0, 3, 150000, 50000, 50000]);
eq("cancelar antes: sobrevive a un backup", sanitizeState(JSON.parse(JSON.stringify(cs))).loans[0].plan.count, 3);
store.deleteLoan(credit.id);
eq("préstamo en cuotas: borrarlo se lleva el dinero y las cuotas", [store.getState().loans.length, store.getState().transactions.length], [0, 0]);

// Avisos de vencimientos
const remState = sanitizeState({
  categories: [],
  bills: [{ id: "b1", name: "Luz", amount: 100, currency: "ARS", dueDate: "2026-03-10", recurring: true, frequency: "monthly" }, { id: "b2", name: "Vieja", amount: 5, dueDate: "2026-01-01", recurring: false, status: "pending" }],
  loans: [{ id: "L", person: "Papá", direction: "borrowed", amount: 50, date: "2026-01-01", dueDate: "2026-03-11", payments: [] }],
});
const plan = R.buildPlan(remState, "2026-03-09", 1);
eq("avisos: lo vencido hace mucho no se avisa", plan.some((i) => i.tag.startsWith("factura:b2")), false);
eq("avisos: el día anterior", plan.find((i) => i.tag === "factura:b1:2026-03-10:antes").titles["2026-03-09"], "Mañana vence Luz");
eq("avisos: el día y los siguientes", Object.values(plan.find((i) => i.tag === "factura:b1:2026-03-10:dia").titles), ["Hoy vence Luz", "Luz venció ayer", "Luz venció hace 2 días", "Luz venció hace 3 días"]);
eq("avisos: préstamo que hay que devolver", plan.find((i) => i.tag === "prestamo:L:2026-03-11:antes").titles["2026-03-10"], "Mañana le tienes que devolver a Papá");
eq("avisos: 3 días antes", Object.values(R.buildPlan(remState, "2026-03-07", 3).find((i) => i.tag === "factura:b1:2026-03-10:antes").titles), ["En 3 días vence Luz", "En 2 días vence Luz", "Mañana vence Luz"]);
eq("avisos: con ese día no hay aviso previo", R.buildPlan(remState, "2026-03-09", 0).some((i) => i.tag.endsWith(":antes")), false);
mem.set("nekoFinanzas.hideAmounts", "1");
eq("avisos: con montos ocultos no se ve el monto", R.buildPlan(remState, "2026-03-09", 1).every((i) => !/\$/.test(i.body)), true);
mem.delete("nekoFinanzas.hideAmounts");

// Idiomas: los templates se traducen por tramos, con los valores en el orden de cada idioma
const I = await import(base + "core/i18n.js");
const { html } = await import(base + "ui/dom.js");
I.useDictionary("en", { "Hola {0}, tienes {1} mensajes": "{1} messages for you, {0}", Guardar: "Save", "Faltan {0} días": "{0} days left", Cerrar: "Close" });
eq("idiomas: template con valores reordenados", String(html`<p class="x">Hola ${"Ana"}, tienes ${3} mensajes</p>`), '<p class="x">3 messages for you, Ana</p>');
eq("idiomas: ícono delante, atributo y valor suelto", String(html`<button aria-label="Cerrar">${html`<i></i>`} Guardar</button><span>${"Guardar"}</span>`), '<button aria-label="Close"><i></i> Save</button><span>Save</span>');
eq("idiomas: texto armado con msg", I.msg`Faltan ${4} días`, "4 days left");
eq("idiomas: lo escrito por la persona se escapa igual", String(html`<p>Hola ${"<b>"}, tienes ${1} mensajes</p>`), "<p>1 messages for you, &lt;b&gt;</p>");
eq("idiomas: sin traducción queda el español", String(html`<p>Texto sin traducir ${1}</p>`), "<p>Texto sin traducir 1</p>");
I.useDictionary("es", null);
eq("idiomas: en español no cambia nada", String(html`<p>Hola ${"Ana"}, tienes ${3} mensajes</p>`), "<p>Hola Ana, tienes 3 mensajes</p>");
const i18nReport = await (await import(new URL("../tools/i18n.mjs", import.meta.url).href)).report();
eq("idiomas: a ningún diccionario le faltan textos", Object.fromEntries(Object.entries(i18nReport.missing).map(([code, list]) => [code, list ? list.length : -1])), { en: 0, pt: 0, tr: 0, ru: 0, ja: 0 });
eq("idiomas: ningún texto con variables quedó sin la etiqueta msg", i18nReport.loose.length, 0);

console.log(`\n${pass} pruebas OK, ${fail} fallidas`);
