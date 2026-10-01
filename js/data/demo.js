// Datos de demostración. Se generan relativos a la fecha de hoy para que la
// app siempre se vea "viva" (sueldo de este mes, facturas por vencer, etc.)
// y con números estables (random con semilla fija). Se borran desde el aviso
// del inicio o desde Configuración.

import { createEmptyState, uid } from "./defaults.js";
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
  const tx = (type, amount, date, categoryId, description, extra = {}) => {
    if (date > today) return null;
    const item = { id: uid("tx"), type, amount, currency: "ARS", date, time: "", categoryId, description, createdAt: date, ...extra };
    state.transactions.push(item);
    return item;
  };

  state.settings.isDemo = true;
  state.settings.openingBalance = 0;

  // --- Ingresos y gastos de los últimos 5 meses -------------------------
  const months = lastMonthKeys(5);
  months.forEach((key, index) => {
    const day = (d) => `${key}-${String(d).padStart(2, "0")}`;
    const isCurrent = key === currentMonthKey();

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
