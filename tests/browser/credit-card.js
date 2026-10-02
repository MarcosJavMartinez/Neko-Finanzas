// Tarjeta de crédito: compras en cuotas, reserva de cuotas, pago del resumen.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { openTransactionForm } = await w.eval('import("/js/ui/forms/transactionForm.js")');
    const { openAccountForm, openAccountDetail } = await w.eval('import("/js/ui/forms/accountForms.js")');
    store.loadDemo(); await wait(200);
    const card = () => store.getState().accounts.find((a) => a.kind === "credit");
    const status = () => F.cardStatus(store.getState(), card());
    const today = D.todayISO();

    // 1) La tarjeta del ejemplo
    log(`tarjeta: deuda=${Math.round(status().debt)} · cierra=${status().closing} · vence=${status().due} · cuotas por venir=${status().upcoming.length}`);
    const sum0 = F.balanceSummary(store.getState());
    log(`reserva: facturas=${Math.round(sum0.reserve.amount)} + programado=${Math.round(sum0.scheduled.amount)} = ${Math.round(sum0.reserved)} · identidad=${Math.abs(sum0.available - (sum0.total - sum0.inGoals - sum0.reserved)) < 0.01 ? "ok" : "MAL ✗"}`);
    w.location.hash = "#/cuentas"; await wait(400);
    const cardRow = [...d.querySelectorAll("#view .account-row")].find((r) => r.textContent.includes("Tarjeta"));
    log("fila tarjeta: " + (cardRow?.innerText.replace(/\s+/g, " ").trim() || "NO ✗"));

    // 2) Cuotas solo con tarjeta
    openTransactionForm({ type: "expense" }); await wait(500);
    let form = sheet().querySelector("form");
    const box = form.querySelector(".installments-field");
    form.elements.accountId.value = store.defaultAccountId(); form.elements.accountId.dispatchEvent(new Event("change", { bubbles: true }));
    const hiddenWithBank = box.hidden;
    form.elements.accountId.value = card().id; form.elements.accountId.dispatchEvent(new Event("change", { bubbles: true }));
    log(`campo cuotas: con banco oculto=${hiddenWithBank} · con tarjeta visible=${!box.hidden}`);

    // 3) Compra de $ 60.000 en 6 cuotas
    form.elements.amount.value = "60.000"; form.elements.amount.dispatchEvent(new Event("input", { bubbles: true }));
    form.elements.installments.value = "6"; form.elements.installments.dispatchEvent(new Event("change", { bubbles: true }));
    log("aviso: " + box.querySelector("[data-installments-hint]").textContent);
    form.elements.description.value = "Celular";
    const totalBefore = F.totalBalance(store.getState());
    form.requestSubmit(); await wait(500);
    const cuotas = store.getState().transactions.filter((t) => t.description === "Celular").sort((a, b) => a.installment.n - b.installment.n);
    log(`cuotas: ${cuotas.length} · montos=${cuotas.map((c) => c.amount).join("+")}=${cuotas.reduce((s, c) => s + c.amount, 0)} · fechas=${cuotas.map((c) => c.date.slice(5)).join(",")}`);
    log(`la primera baja el total hoy: ${Math.round(totalBefore - F.totalBalance(store.getState()))} · las demás programadas=${cuotas.filter((c) => c.date > today).length}`);

    // 3b) Las cuotas que vienen se ven en Transacciones avanzando de mes
    w.location.hash = "#/transacciones"; await wait(400);
    const next = d.querySelector("[data-action=tx-month][data-delta='1']");
    const enabled = !next.disabled;
    next.click(); await wait(300);
    const future = [...d.querySelectorAll("#view .tx-row")].filter((r) => r.textContent.includes("Celular"));
    log(`mes siguiente: botón habilitado=${enabled} · cuota del Celular visible=${future.length === 1} · etiqueta=${future[0]?.querySelector(".tag-installment")?.textContent} · aviso=${!!d.querySelector("[data-action=tx-today]")}${enabled && future.length === 1 ? "" : " ✗"}`);
    d.querySelector("[data-action=tx-today]")?.click(); await wait(300);
    log("volver a este mes: " + (d.querySelector("[data-action=tx-month][data-delta='1']").disabled === false ? "sigue pudiendo avanzar" : "bloqueado"));

    // 4) Redondeo: 100 en 3 cuotas
    const g = store.addInstallmentPurchase({ type: "expense", amount: 100, currency: "ARS", date: today, categoryId: "exp-otros", accountId: card().id, description: "Redondeo" }, 3);
    log("100 en 3: " + g.map((t) => t.amount).join(" + "));

    // 5) Detalle de la tarjeta y pago del resumen
    openAccountDetail(card().id); await wait(600);
    log("detalle: " + (sheet().querySelector(".section-title")?.textContent || "sin cuotas ✗") + " · " + sheet().querySelectorAll(".installment-row").length + " compras");
    sheet().querySelector("[data-do=pay-card]").click(); await wait(800);
    form = sheet().querySelector("form");
    const debt = status().debt;
    log(`pagar tarjeta: desde=${store.getState().accounts.find((a) => a.id === form.elements.fromId.value)?.name} hacia=${store.getState().accounts.find((a) => a.id === form.elements.toId.value)?.name} monto=${form.elements.amount.value} (deuda ${debt})`);
    const t0 = F.totalBalance(store.getState());
    form.requestSubmit(); await wait(500);
    log(`tras pagar: deuda=${Math.round(status().debt)} · total igual=${Math.abs(F.totalBalance(store.getState()) - t0) < 0.01 ? "sí" : "NO ✗"}`);

    // 5b) Pagar de más deja saldo a favor (no "Sin deuda")
    store.addTransfer({ fromId: store.defaultAccountId(), toId: card().id, amount: 1500, date: today });
    w.location.hash = "#/inicio"; await wait(200); w.location.hash = "#/cuentas"; await wait(400);
    const favor = [...d.querySelectorAll("#view .account-row")].find((r) => r.textContent.includes("Tarjeta"));
    log("pagada de más: " + favor.querySelector(".account-amount").innerText.replace(/s+/g, " ").trim() + (/a favor/.test(favor.innerText) ? "" : " ✗"));

    // 6) Editar y borrar una cuota
    openTransactionForm({ tx: cuotas[2] }); await wait(500);
    log("editar cuota: " + (sheet().querySelector(".notice")?.textContent.trim() || "sin aviso ✗"));
    sheet().querySelector("[data-form-delete]").click(); await wait(500);
    sheet().querySelector("[data-confirm]").click(); await wait(600);
    log("borrar compra: quedan " + store.getState().transactions.filter((t) => t.description === "Celular").length + " cuotas");

    // 7) Nueva tarjeta desde el formulario
    openAccountForm(); await wait(500);
    form = sheet().querySelector("form");
    form.elements.name.value = "Otra tarjeta";
    form.querySelector("input[name=kind][value=credit]").click(); await wait(100);
    log(`form tarjeta: días visibles=${!form.querySelector("[data-card-fields]").hidden} · deuda visible=${!form.querySelector("[data-opening-card]").hidden}`);
    form.elements.closingDay.value = "28"; form.elements.dueDay.value = "8";
    form.elements.openingDebt.value = "50.000";
    form.requestSubmit(); await wait(500);
    const nueva = store.getState().accounts.find((a) => a.name === "Otra tarjeta");
    log(`tarjeta creada: kind=${nueva?.kind} cierre=${nueva?.closingDay} vence=${nueva?.dueDay} saldo=${nueva?.opening} · deuda=${F.cardStatus(store.getState(), nueva).debt}`);
    log("cuenta por defecto no es tarjeta: " + (store.getState().accounts.find((a) => a.id === store.defaultAccountId()).kind !== "credit"));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
