// Sobres: presupuesto reservado (súper), gustos por día que se acumulan y
// sobrante del mes pasado que se ofrece pasar a una meta.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const form = () => sheet().querySelector("form");
const home = async () => { w.location.hash = "#/transacciones"; await wait(150); w.location.hash = "#/inicio"; await wait(400); };
const text = (sel) => d.querySelector(sel)?.innerText.replace(/\s+/g, " ").trim() || "(no está)";
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { openBudgetForm } = await w.eval('import("/js/ui/forms/budgetForm.js")');
    const today = D.todayISO();
    await store.resetEverything(); await wait(300);
    store.saveAccount({ ...store.getState().accounts[0], opening: 600000 });
    const avail = () => Math.round(F.balanceSummary(store.getState()).available);

    // 1) Sin presupuestos: tarjeta general con el enlace a "gustos por día"
    await home();
    log("sin gustos: " + text(".daily-card .daily-main") + " · enlace=" + !!d.querySelector(".daily-card [data-action=add-treats]"));

    // 2) Súper reservado por mes
    openBudgetForm(); await wait(500);
    form().elements.name.value = "Supermercado";
    form().querySelector("input[name=mode][value=fixed]").click();
    form().elements.value.value = "200.000";
    form().querySelector("input[name=categoryIds][value='exp-super']").click();
    form().elements.reserve.click();
    const before = avail();
    form().requestSubmit(); await wait(500);
    log(`súper reservado: disponible ${before} → ${avail()}${avail() === before - 200000 ? "" : " ✗"}`);
    store.addTransaction({ type: "expense", amount: 40000, currency: "ARS", date: today, categoryId: "exp-super" });
    log(`gasté 40.000 en el súper: disponible sigue en ${avail()}${avail() === before - 200000 ? "" : " ✗"} · reservado baja a ${F.budgetReserve(store.getState()).amount}`);

    // 3) Gustos por día desde el enlace del Inicio
    await home();
    d.querySelector(".daily-card [data-action=add-treats]").click(); await wait(500);
    log(`formulario de gustos: modo=${form().querySelector("input[name=mode]:checked").value} · reservar=${form().elements.reserve.checked} · nombre=${form().elements.name.value} · ayuda visible=${!form().querySelector("[data-daily-only]").hidden}`);
    form().elements.value.value = "5.000";
    form().requestSubmit(); await wait(500);
    const treats = store.getState().budgets.find((b) => b.mode === "daily");
    log(`gustos creados: ${treats.value} por día · desde ${treats.since === today ? "hoy" : treats.since} · categorías=${treats.target.categoryIds.join(",")}`);
    await home();
    log("inicio: " + text(".daily-card .daily-main") + " · " + text(".daily-card .daily-sub"));
    store.addTransaction({ type: "expense", amount: 1800, currency: "ARS", date: today, categoryId: "exp-comida", description: "Café" });
    await home();
    log("tras un café de 1.800: " + text(".daily-card .daily-main") + " · " + text(".daily-card .daily-sub"));
    store.addTransaction({ type: "expense", amount: 9000, currency: "ARS", date: today, categoryId: "exp-comida", description: "Almuerzo" });
    await home();
    log("tras pasarse: " + text(".daily-card .daily-main") + " · clase is-over=" + d.querySelector(".daily-card").classList.contains("is-over"));
    log("reserva del inicio: " + text(".avail-reserve"));

    // 4) Pantalla de presupuestos
    w.location.hash = "#/presupuestos"; await wait(400);
    log("presupuestos: " + [...d.querySelectorAll(".budget-card .row-title")].map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" | ") + " · leyenda: " + [...d.querySelectorAll(".legend-item")].map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" | "));

    // 5) Sobrante del mes pasado: como si los presupuestos existieran desde antes
    const prev = D.shiftMonthKey(D.currentMonthKey(), -1);
    const s = store.snapshot();
    s.budgets.forEach((b) => (b.since = `${prev}-01`));
    s.transactions.push({ id: "viejo", type: "expense", amount: 150000, currency: "ARS", date: `${prev}-10`, categoryId: "exp-super", accountId: s.accounts[0].id, description: "", time: "", createdAt: `${prev}-10` });
    s.goals.push({ id: "meta", name: "Vacaciones", icon: "🏖️", color: "#8a63d2", target: 500000, currency: "ARS", targetDate: "", movements: [], createdAt: today });
    store.restore(s); await wait(200);
    await home();
    const cards = [...d.querySelectorAll(".card-pending")].map((c) => c.querySelector(".row-title").textContent);
    log("sobrantes ofrecidos: " + cards.join(" | "));
    const superId = store.getState().budgets.find((b) => b.name === "Supermercado").id;
    d.querySelector(`[data-action=leftover-to-goal][data-id="${superId}"]`).click(); await wait(500);
    log("hoja: " + sheet().querySelector(".sheet-title").textContent + " · propone " + form().elements.amount.value);
    form().elements.amount.value = "90.000";
    form().requestSubmit(); await wait(200);
    log("más de lo que sobró: " + (form().querySelector('[data-error-for="amount"]').textContent || "sin error ✗"));
    form().elements.amount.value = "50.000";
    const a0 = avail();
    form().requestSubmit(); await wait(600);
    const goal = store.getState().goals[0];
    log(`pasado a la meta: ${F.goalSaved(goal)} en ${goal.name} · disponible ${a0} → ${avail()} · nota="${goal.movements[0].note}"${F.goalSaved(goal) === 50000 && avail() === a0 - 50000 ? "" : " ✗"}`);
    await home();
    log("ya no se ofrece el del súper: " + ![...d.querySelectorAll("[data-action=leftover-to-goal]")].some((b) => b.dataset.id === superId));
    const other = d.querySelector("[data-action=leftover-keep]");
    if (other) { other.click(); await wait(400); }
    log("'dejarlo disponible' saca el aviso: quedan " + d.querySelectorAll("[data-action=leftover-keep]").length + " · metas sin cambios=" + (F.goalSaved(store.getState().goals[0]) === 50000));
    // 6) Colchón de facturas: se activa en Configuración y se ve en Facturas
    const { openPayBill } = await w.eval('import("/js/ui/forms/billForms.js")');
    w.location.hash = "#/ajustes-calculo"; await wait(400);
    d.querySelector("[data-change=set-bill-cushion]").click(); await wait(300);
    log("colchón activado: " + store.getState().settings.billCushion);
    store.addBill({ name: "Luz", icon: "💡", amount: 40000, currency: "ARS", dueDate: today, dueDay: Number(today.slice(8)), frequency: "monthly", recurring: true, categoryId: "exp-servicios" });
    const luz = store.getState().bills.find((x) => x.name === "Luz");
    const a1 = avail();
    openPayBill(luz.id); await wait(500);
    form().elements.amount.value = "31.000";
    form().requestSubmit(); await wait(600);
    log("aviso al pagar menos: " + [...d.querySelectorAll(".toast")].pop()?.textContent.trim().split("\n")[0]);
    log(`colchón=${F.billCushion(store.getState()).amount} · disponible ${a1} → ${avail()}${F.billCushion(store.getState()).amount === 9000 ? "" : " ✗"}`);
    w.location.hash = "#/facturas"; await wait(400);
    log("en Facturas: " + text(".cushion-card .row-title"));
    d.querySelector("[data-action=release-cushion]").click(); await wait(400);
    log(`liberar: colchón=${F.billCushion(store.getState()).amount} · disponible=${avail()}${avail() === a1 + 9000 ? "" : " ✗"}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
