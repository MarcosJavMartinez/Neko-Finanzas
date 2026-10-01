// Pruebas unitarias de la lógica (node unit.mjs)
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
eq("tipos de cambio", evil.rates, { ARS: 1, USD: 1350, EUR: 1470 });
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
eq("color con CSS inyectado", evil.categories[0].color, "#8b958e");
eq("ícono con HTML", evil.categories[1].icon, "🏷️");
eq("categorías: sin duplicadas ni sin id, + respaldo de ingresos", evil.categories.map((c) => c.id), ["exp-otros", "dup", "inc-otros"]);
eq("movimientos válidos (monto texto ok, ingreso a categoría de gasto → Otros ingresos)", evil.transactions.map((t) => [t.id, t.amount, t.categoryId]), [["a", 500, "inc-otros"]]);
eq("facturas válidas", evil.bills.map((b) => [b.id, b.frequency, b.payments.length]), [["y", "monthly", 0]]);
eq("metas válidas + color seguro", evil.goals.map((g) => [g.id, g.color, g.movements.length]), [["h", "#8a63d2", 0]]);
eq("presupuestos inválidos descartados", evil.budgets.length, 0);
eq("no se contamina el prototipo", ({}).polluted, undefined);

// --- el demo sobrevive a la validación sin perder nada ------------------------
const demo = buildDemoState();
const clean = sanitizeState(JSON.parse(JSON.stringify(demo)));
eq("demo: movimientos", clean.transactions.length, demo.transactions.length);
eq("demo: facturas", clean.bills.length, demo.bills.length);
eq("demo: metas", clean.goals.length, demo.goals.length);
eq("demo: presupuestos", clean.budgets.length, demo.budgets.length);
eq("demo: saldo igual", Math.round(F.balanceSummary(clean).available), Math.round(F.balanceSummary(demo).available));
eq("demo: subcategorías intactas", clean.transactions.filter((t) => t.subcategoryId).length, demo.transactions.filter((t) => t.subcategoryId).length);

console.log(`\n${pass} pruebas OK, ${fail} fallidas`);
