// Pruebas de propiedades: miles de estados y operaciones aleatorias sobre la
// lógica, verificando invariantes que siempre tienen que cumplirse.
const base = new URL("../js/", import.meta.url).href;
const F = await import(base + "core/finance.js");
const D = await import(base + "core/dates.js");
const M = await import(base + "core/money.js");
const { sanitizeState } = await import(base + "core/sanitize.js");
const { buildDemoState } = await import(base + "data/demo.js");
const { createEmptyState, DEFAULT_CATEGORIES } = await import(base + "data/defaults.js");

// Random con semilla, para poder reproducir una falla
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const failures = [];
const check = (name, ok, info) => { if (!ok && failures.length < 25) failures.push(name + " → " + JSON.stringify(info).slice(0, 300)); };

const TODAY = "2026-09-30";
const randomDate = () => D.addDays(TODAY, int(-400, 60));
const cats = DEFAULT_CATEGORIES;

function randomState() {
  const s = createEmptyState();
  s.settings.mainCurrency = pick(["ARS", "ARS", "USD", "EUR"]);
  s.accounts[0].opening = int(-50000, 2000000);
  for (let i = 0; i < int(0, 3); i++) s.accounts.push({ id: "acc" + i, name: "C" + i, icon: "🏦", color: "#123456", currency: pick(["ARS", "USD"]), kind: "bank", opening: int(0, 900000), archived: rnd() < 0.2 });
  s.settings.reserveHorizon = pick(["30d", "month"]);
  s.rates = { ARS: 1, USD: int(500, 2500), EUR: int(600, 2800) };
  const nTx = int(0, 150);
  for (let i = 0; i < nTx; i++) {
    const type = pick(["income", "expense"]);
    const cat = pick(cats.filter((c) => c.type === type));
    s.transactions.push({ id: "t" + i, type, amount: pick([int(1, 5000000), rnd() * 1000]), currency: pick(["ARS", "ARS", "USD", "EUR"]), date: randomDate(), time: "", categoryId: cat.id, subcategoryId: pick(["", ...(cat.subcategories || []).map((x) => x.id)]), description: "", createdAt: "2026-01-01" });
  }
  // Transferencias entre cuentas al azar (algunas en otra moneda)
  for (let i = 0; i < int(0, 20) && s.accounts.length > 1; i++) {
    const from = pick(s.accounts);
    const to = pick(s.accounts.filter((a) => a !== from));
    s.transactions.push({ id: "x" + i, type: "transfer", amount: int(1, 300000), currency: from.currency, accountId: from.id, toAccountId: to.id, toAmount: int(1, 300000), toCurrency: to.currency, date: randomDate(), time: "", description: "", createdAt: "2026-01-01" });
  }
  for (let i = 0; i < int(0, 12); i++) {
    const dueDate = D.addDays(TODAY, int(-200, 90));
    s.bills.push({ id: "b" + i, name: "B" + i, icon: "🧾", amount: int(1, 300000), currency: pick(["ARS", "USD"]), dueDate, dueDay: Number(dueDate.slice(8)), frequency: pick(Object.keys(D.FREQUENCIES)), recurring: rnd() < 0.8, categoryId: "exp-servicios", subcategoryId: "", status: pick(["pending", "pending", "paid"]), payments: [], createdAt: TODAY });
  }
  for (let i = 0; i < int(0, 6); i++) {
    const g = { id: "g" + i, name: "G" + i, icon: "🎯", color: "#8a63d2", target: int(1, 3000000), currency: pick(["ARS", "USD"]), targetDate: pick(["", D.addDays(TODAY, int(-30, 700))]), movements: [], createdAt: TODAY };
    for (let j = 0; j < int(0, 8); j++) g.movements.push({ id: `m${i}-${j}`, date: randomDate(), amount: pick([1, 1, -1]) * int(1, 500000), note: "" });
    s.goals.push(g);
  }
  return s;
}

const near = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(a) * 1e-9);
const hasBad = (v) => typeof v !== "number" || !Number.isFinite(v);

const N = 1500;
for (let n = 0; n < N; n++) {
  const s = randomState();
  const clean = sanitizeState(JSON.parse(JSON.stringify(s)));

  // 1. La validación es idempotente y no pierde datos válidos
  check("sanitize idempotente", JSON.stringify(sanitizeState(JSON.parse(JSON.stringify(clean)))) === JSON.stringify(clean), { n });
  check("sanitize conserva movimientos", clean.transactions.length === s.transactions.length, { n, a: s.transactions.length, b: clean.transactions.length });

  // 2. Identidad del saldo y números finitos
  const sum = F.balanceSummary(clean, TODAY);
  for (const k of ["total", "inGoals", "reserved", "available"]) check("finito " + k, !hasBad(sum[k]), { n, k, v: sum[k] });
  check("disponible = total − metas − reserva", near(sum.available, sum.total - sum.inGoals - sum.reserved), { n, sum });
  check("reserva ≥ 0", sum.reserved >= 0, { n, r: sum.reserved });

  // 3. La reserva solo incluye vencimientos hasta el horizonte
  const until = F.reserveHorizonEnd(clean, TODAY);
  check("reserva dentro del horizonte", sum.reserve.items.every((i) => i.dueDate <= until), { n });

  // 4. Totales del mes: ingresos − gastos = ahorro; categorías suman el gasto
  const key = D.monthKey(TODAY);
  const mt = F.monthlyTotals(clean, key);
  check("ahorro = ingresos − gastos", near(mt.saved, mt.income - mt.expense), { n, mt });
  const byCat = F.expensesByCategory(clean, key).reduce((a, x) => a + x.amount, 0);
  check("categorías suman el gasto del mes", near(byCat, mt.expense), { n, byCat, e: mt.expense });
  for (const c of F.expensesByCategory(clean, key)) {
    const subs = F.expensesBySubcategory(clean, key, c.categoryId).reduce((a, x) => a + x.amount, 0);
    check("subcategorías suman su categoría", near(subs, c.amount), { n, cat: c.categoryId, subs, amount: c.amount });
  }

  // 5. Serie mensual coherente con el saldo de hoy
  const series = F.monthlySeries(clean, 6, key);
  check("último punto de la serie = dinero total de hoy", near(series[series.length - 1].balanceEnd, sum.total), { n, last: series.at(-1).balanceEnd, total: sum.total });

  // 6. Calendario: cada vencimiento de la reserva aparece en su mes
  for (const item of sum.reserve.items.slice(0, 5)) {
    const cal = F.billCalendar(clean, D.monthKey(item.dueDate), TODAY);
    check("vencimiento de la reserva está en el calendario", (cal[item.dueDate] || []).some((x) => x.bill.id === item.bill.id), { n, item: item.dueDate });
  }

  // 7. Presupuestos: nunca NaN
  clean.budgets = [
    { id: "p1", name: "a", icon: "🎯", color: "#4a63dd", mode: "percent", value: int(1, 100), currency: "ARS", target: { kind: "rest" } },
    { id: "p2", name: "b", icon: "🎯", color: "#4a63dd", mode: "fixed", value: int(1, 500000), currency: pick(["ARS", "USD"]), target: { kind: "categories", categoryIds: ["exp-super"] } },
  ];
  for (const b of F.budgetsOverview(clean, key).items) check("presupuesto finito", !hasBad(b.limit) && !hasBad(b.spent) && !hasBad(b.pct), { n, b: { limit: b.limit, spent: b.spent, pct: b.pct } });
}

// 8. Formato de montos: nunca NaN/undefined/Infinity y siempre re-parseable
for (let i = 0; i < 5000; i++) {
  const v = pick([rnd() * 1e9, -rnd() * 1e6, int(0, 99999), rnd(), -rnd() * 0.01, 1e12]);
  const cur = pick(["ARS", "USD", "EUR"]);
  const s = M.formatMoney(v, cur);
  check("formatMoney sin basura", !/NaN|undefined|Infinity/.test(s), { v, s });
  const back = M.parseAmount(s);
  const expected = Math.abs(v) >= 10000 ? Math.round(Math.abs(v)) : Math.round(Math.abs(v) * 100) / 100;
  if (Math.round(Math.abs(v) * 100) / 100 !== 0) check("formatMoney → parseAmount ida y vuelta", near(back, expected), { v, s, back, expected });
  const input = M.amountToInput(Math.round(Math.abs(v) * 100) / 100);
  check("amountToInput → parseAmount", near(M.parseAmount(input), Math.round(Math.abs(v) * 100) / 100), { v, input, back: M.parseAmount(input) });
}

// 9. Fechas: sumar meses nunca se "corre" con el día preferido
for (let i = 0; i < 2000; i++) {
  const day = int(1, 31);
  let d = `2026-01-${String(Math.min(day, 31)).padStart(2, "0")}`;
  for (let k = 0; k < 24; k++) {
    const next = D.addMonths(d, 1, day);
    const [y, m] = next.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    check("addMonths respeta el día preferido", Number(next.slice(8)) === Math.min(day, lastDay), { d, next, day });
    d = next;
  }
}

// 10. Factura muy atrasada: el tope de vencimientos no puede subestimar la reserva
const late = { id: "x", recurring: true, frequency: "weekly", dueDate: D.addDays(TODAY, -365 * 3), dueDay: 1, status: "pending", payments: [] };
const occ = F.billOccurrences(late, D.addDays(TODAY, 30));
const realCount = Math.floor((365 * 3 + 30) / 7) + 1;
check("factura semanal atrasada 3 años: se cuentan todos los vencimientos", occ.length === realCount, { got: occ.length, real: realCount });

console.log(failures.length ? "FALLAS:\n" + failures.join("\n") : "Todas las propiedades se cumplen");
console.log(`(${N} estados aleatorios, 5000 montos, 2000 series de fechas)`);
