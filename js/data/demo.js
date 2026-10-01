// Datos de demostración. Se generan relativos a la fecha de hoy para que la
// app siempre se vea "viva" (sueldo de este mes, facturas por vencer, etc.)
// y con números estables (random con semilla fija). Se borran desde el aviso
// del inicio o desde Configuración.

import { createEmptyState, uid, DEFAULT_ACCOUNT_ID } from "./defaults.js";
import { addDays, addMonths, lastMonthKeys, parseISO, todayISO, currentMonthKey } from "../core/dates.js";

function seeded(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoState(today = todayISO()) {
  const state = createEmptyState();
  const rand = seeded(42);
  const between = (min, max, step = 500) => Math.round((min + rand() * (max - min)) / step) * step;
  // --- Cuentas -------------------------------------------------------------
  const BANK = DEFAULT_ACCOUNT_ID;
  const CASH = "acc-demo-efectivo";
  const WALLET = "acc-demo-billetera";
  const USD = "acc-demo-dolares";
  const CARD = "acc-demo-tarjeta";
  state.accounts = [
    { id: BANK, name: "Cuenta sueldo", icon: "🏦", color: "#08a7c8", currency: "ARS", kind: "bank", opening: 350000, archived: false },
    { id: CASH, name: "Efectivo", icon: "💵", color: "#2ba66a", currency: "ARS", kind: "cash", opening: 45000, archived: false },
    { id: WALLET, name: "Billetera virtual", icon: "📱", color: "#3a86d4", currency: "ARS", kind: "wallet", opening: 30000, archived: false },
    { id: USD, name: "Dólares", icon: "🐷", color: "#d99a2b", currency: "USD", kind: "savings", opening: 600, archived: false },
    { id: CARD, name: "Tarjeta de crédito", icon: "💳", color: "#7651e8", currency: "ARS", kind: "credit", opening: 0, archived: false, closingDay: 25, dueDay: 5 },
  ];
  // En qué cuenta cae cada gasto del ejemplo (por subcategoría o categoría).
  const ACCOUNT_FOR = {
    "exp-super.almacen": WALLET,
    "exp-super.limpieza": WALLET,
    "exp-super.dietetica": WALLET,
    "exp-super.carniceria": CASH,
    "exp-super.verduleria": CASH,
    "exp-transporte.sube": WALLET,
    "exp-comida": WALLET,
    "exp-entretenimiento": CASH,
    "exp-salud": WALLET,
    "exp-hogar": CASH,
    "exp-ropa": CARD,
    "exp-compras": CARD,
    "inc-propinas": CASH,
  };
  const tx = (type, amount, date, categoryId, description, extra = {}) => {
    if (date > today) return null;
    // Las facturas se pagan desde el banco; el resto según el tipo de gasto.
    const accountId = extra.billId ? BANK : ACCOUNT_FOR[extra.subcategoryId] || ACCOUNT_FOR[categoryId] || BANK;
    const item = { id: uid("tx"), type, amount, currency: "ARS", date, time: "", categoryId, description, accountId, createdAt: date, ...extra };
    state.transactions.push(item);
    return item;
  };
  const transfer = (amount, date, fromId, toId, description, toAmount = amount, currencies = ["ARS", "ARS"]) => {
    if (date > today) return;
    state.transactions.push({ id: uid("tx"), type: "transfer", amount, currency: currencies[0], accountId: fromId, toAccountId: toId, toAmount, toCurrency: currencies[1], date, time: "", description, createdAt: date });
  };

  state.settings.isDemo = true;

  // --- Ingresos y gastos de los últimos 5 meses -------------------------
  const months = lastMonthKeys(5);
  months.forEach((key, index) => {
    const day = (d) => `${key}-${String(d).padStart(2, "0")}`;
    const isCurrent = key === currentMonthKey();

    // Plata que se mueve entre cuentas (no es gasto ni ingreso).
    transfer(130000, day(2), BANK, CASH, "Retiro de efectivo");
    transfer(150000, day(4), BANK, WALLET, "Carga de la billetera");
    transfer(between(140000, 170000, 10000), day(16), BANK, WALLET, "Carga de la billetera");
    if (index === 2) transfer(210000, day(16), BANK, USD, "Compra de dólares", 150, ["ARS", "USD"]);

    const salary = tx("income", 800000, day(1), "inc-sueldo", "Sueldo", { subcategoryId: "inc-sueldo.mensual" });
    if (isCurrent && salary) salary.recurrence = { freq: "monthly", nextDate: addMonths(salary.date, 1) };
    tx("income", 400000 + (index % 2 ? -20000 : 0), day(15), "inc-independiente", "Trabajo extra", { subcategoryId: "inc-independiente.proyectos" });
    if (index % 2 === 0) tx("income", between(18000, 32000), day(22), "inc-propinas", "Propinas");

    // Súper repartido en subcategorías (la descripción queda vacía: se muestra la subcategoría).
    [[3, "almacen", 42000, 68000], [10, "carniceria", 28000, 45000], [14, "verduleria", 12000, 20000], [17, "almacen", 42000, 68000], [21, "limpieza", 15000, 26000], [24, "dietetica", 9000, 16000]].forEach(
      ([d, sub, min, max]) => tx("expense", between(min, max), day(d), "exp-super", "", { subcategoryId: `exp-super.${sub}` })
    );
    [6, 20].forEach((d) => tx("expense", between(30000, 42000), day(d), "exp-transporte", "", { subcategoryId: "exp-transporte.nafta" }));
    [5, 12, 19, 26].forEach((d) => tx("expense", between(12000, 26000), day(d), "exp-comida", "", { subcategoryId: d % 2 ? "exp-comida.delivery" : "exp-comida.almuerzo" }));
    tx("expense", between(35000, 70000), day(8 + index), "exp-ropa", "", { subcategoryId: index % 2 ? "exp-ropa.calzado" : "exp-ropa.ropa" });
    tx("expense", between(15000, 28000), day(13), "exp-entretenimiento", "Salida al cine", { subcategoryId: "exp-entretenimiento.cine" });
    if (index % 2) tx("expense", between(9000, 18000), day(21), "exp-salud", "", { subcategoryId: "exp-salud.farmacia" });
    tx("expense", between(20000, 60000), day(11), "exp-hogar", index % 2 ? "Ferretería" : "Arreglo de la canilla", { subcategoryId: "exp-hogar.reparaciones" });
    tx("expense", between(25000, 60000), day(18), "exp-compras", index % 2 ? "Auriculares" : "Regalo de cumpleaños", { subcategoryId: index % 2 ? "exp-compras.tecnologia" : "exp-compras.regalos" });
    [9, 23].forEach((d) => tx("expense", between(8000, 16000), day(d), "exp-transporte", "", { subcategoryId: "exp-transporte.sube" }));
  });

  // --- Tarjeta: una heladera en 6 cuotas y el pago mensual del resumen -------
  const fridgeDay = `${months[2]}-10`;
  const fridgeGroup = uid("cuotas");
  for (let k = 0; k < 6; k++) {
    const date = addMonths(fridgeDay, k, 10);
    state.transactions.push({ id: uid("tx"), type: "expense", amount: 120000, currency: "ARS", date, time: "", categoryId: "exp-hogar", subcategoryId: "", description: "Heladera", accountId: CARD, installment: { group: fridgeGroup, n: k + 1, of: 6 }, createdAt: fridgeDay });
  }
  // Cada mes se paga lo que se gastó con la tarjeta el mes anterior.
  months.forEach((key, index) => {
    if (!index) return;
    const prev = months[index - 1];
    const spent = state.transactions.filter((t) => t.accountId === CARD && t.type === "expense" && t.date.startsWith(prev) && t.date <= today).reduce((s, t) => s + t.amount, 0);
    if (spent) transfer(spent, `${key}-05`, BANK, CARD, "Pago de la tarjeta");
  });

  // --- Préstamos: le prestaste a Caro (ya devolvió una parte) y tu papá te
  // prestó plata que hay que devolver en unos días -----------------------------
  const loanMove = (loan, flow, amount, accountId, date, description) => {
    const t = { id: uid("tx"), type: "loan", loanId: loan.id, flow, amount, currency: "ARS", accountId, date, time: "", description, createdAt: date };
    state.transactions.push(t);
    return t.id;
  };
  const caro = { id: uid("loan"), person: "Caro", direction: "lent", amount: 60000, currency: "ARS", date: `${months[3]}-12`, dueDate: "", note: "Para el arreglo de la moto", payments: [], createdAt: `${months[3]}-12` };
  caro.txId = loanMove(caro, "out", 60000, CASH, caro.date, "Préstamo a Caro");
  caro.payments.push({ id: uid("pay"), date: `${months[3]}-26`, amount: 20000, txId: loanMove(caro, "in", 20000, WALLET, `${months[3]}-26`, "Caro te devolvió") });
  const papa = { id: uid("loan"), person: "Papá", direction: "borrowed", amount: 150000, currency: "ARS", date: `${months[2]}-20`, dueDate: addDays(today, 20), note: "", payments: [], createdAt: `${months[2]}-20` };
  papa.txId = loanMove(papa, "in", 150000, BANK, papa.date, "Préstamo de Papá");
  papa.payments.push({ id: uid("pay"), date: `${months[3]}-20`, amount: 50000, txId: loanMove(papa, "out", 50000, BANK, `${months[3]}-20`, "Le devolviste a Papá") });
  state.loans = [caro, papa];

  // --- Facturas y servicios ------------------------------------------------
  // offset = días desde hoy hasta el próximo vencimiento pendiente.
  const bills = [
    { name: "Luz", icon: "💡", amount: 38500, offset: 13, categoryId: "exp-servicios", subcategoryId: "exp-servicios.luz" },
    { name: "Gas", icon: "🔥", amount: 21000, offset: -2, categoryId: "exp-servicios", subcategoryId: "exp-servicios.gas" },
    { name: "Internet", icon: "🌐", amount: 27000, offset: 2, categoryId: "exp-servicios", subcategoryId: "exp-servicios.internet" },
    { name: "Expensas", icon: "🏠", amount: 95000, offset: 8, categoryId: "exp-hogar", subcategoryId: "exp-hogar.expensas" },
    { name: "ChatGPT", icon: "🤖", amount: 20, currency: "USD", offset: 1, categoryId: "exp-suscripciones", subcategoryId: "exp-suscripciones.chatgpt" },
    { name: "Netflix", icon: "📺", amount: 11000, offset: 18, categoryId: "exp-suscripciones", subcategoryId: "exp-suscripciones.netflix" },
    { name: "Spotify", icon: "🎵", amount: 4500, offset: 5, categoryId: "exp-suscripciones", subcategoryId: "exp-suscripciones.spotify" },
    { name: "GeForce NOW", icon: "🎮", amount: 9.99, currency: "USD", offset: 24, categoryId: "exp-suscripciones", subcategoryId: "exp-suscripciones.geforce" },
  ];
  for (const def of bills) {
    const dueDate = addDays(today, def.offset);
    const dueDay = parseISO(dueDate).getDate();
    const bill = {
      id: uid("bill"),
      name: def.name,
      icon: def.icon,
      amount: def.amount,
      currency: def.currency || "ARS",
      dueDate,
      dueDay,
      frequency: "monthly",
      recurring: true,
      categoryId: def.categoryId,
      subcategoryId: def.subcategoryId,
      status: "pending",
      payments: [],
      createdAt: today,
    };
    for (let k = 4; k >= 1; k--) {
      const due = addMonths(dueDate, -k, dueDay);
      const paidAt = addDays(due, -1);
      const payment = tx("expense", bill.amount, paidAt, bill.categoryId, bill.name, { billId: bill.id, currency: bill.currency, subcategoryId: bill.subcategoryId });
      if (payment) bill.payments.push({ txId: payment.id, dueDate: due, paidAt });
    }
    state.bills.push(bill);
  }

  // --- Metas ---------------------------------------------------------------
  const goal = (name, icon, color, target, currency, deposits, targetDate = "") => {
    const g = { id: uid("goal"), name, icon, color, target, currency, targetDate, movements: [], createdAt: months[0] + "-01" };
    deposits.forEach(([monthIndex, amount]) => {
      const date = `${months[monthIndex]}-02`;
      if (date <= today) g.movements.push({ id: uid("mov"), date, amount, note: "" });
    });
    state.goals.push(g);
    return g;
  };
  const trip = goal("Viaje a Europa", "✈️", "#3a86d4", 2000, "USD", [[0, 150], [1, 150], [2, 100], [3, 150], [4, 100]], addMonths(today, 10));
  goal("Consola", "🎮", "#7651e8", 700000, "ARS", [[1, 60000], [2, 60000], [3, 50000], [4, 50000]]);
  goal("Ropa de invierno", "👕", "#e0609e", 150000, "ARS", [[2, 40000], [3, 30000], [4, 20000]]);
  const emergency = goal("Fondo de emergencia", "🛟", "#2ba66a", 1500000, "ARS", [[0, 150000], [1, 120000], [2, 100000], [3, 80000], [4, 70000]]);

  // --- Presupuestos ------------------------------------------------------------
  state.budgets = [
    { id: uid("bud"), name: "Facturas", icon: "🧾", color: "#4a63dd", mode: "percent", value: 25, currency: "ARS", target: { kind: "categories", categoryIds: ["exp-servicios", "exp-suscripciones", "exp-hogar"] } },
    { id: uid("bud"), name: "Viajes", icon: "✈️", color: "#8a63d2", mode: "percent", value: 10, currency: "ARS", target: { kind: "goal", goalId: trip.id } },
    { id: uid("bud"), name: "Ropa", icon: "👕", color: "#d65c96", mode: "percent", value: 5, currency: "ARS", target: { kind: "categories", categoryIds: ["exp-ropa"] } },
    { id: uid("bud"), name: "Fondo de emergencia", icon: "🛟", color: "#1f9e74", mode: "percent", value: 10, currency: "ARS", target: { kind: "goal", goalId: emergency.id } },
    { id: uid("bud"), name: "Gastos generales", icon: "🛒", color: "#d99a2b", mode: "percent", value: 50, currency: "ARS", target: { kind: "rest" } },
  ];

  return state;
}
