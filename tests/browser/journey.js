// Recorrido completo de un usuario nuevo, todo por la interfaz. Después de
// cada paso se comprueba que: los datos son válidos (pasarlos por la
// validación no cambia nada), las cuentas cierran (total = suma de cuentas;
// disponible = total − metas − reservas), lo guardado es igual a lo que hay
// en memoria, y en pantalla no aparece ningún "NaN" ni "undefined".
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const form = () => sheet().querySelector("form");
const set = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])])) : v);
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const storage = await w.eval('import("/js/core/storage.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { sanitizeState } = await w.eval('import("/js/core/sanitize.js")');
    const forms = {
      tx: await w.eval('import("/js/ui/forms/transactionForm.js")'),
      acc: await w.eval('import("/js/ui/forms/accountForms.js")'),
      bill: await w.eval('import("/js/ui/forms/billForms.js")'),
      goal: await w.eval('import("/js/ui/forms/goalForms.js")'),
      loan: await w.eval('import("/js/ui/forms/loanForms.js")'),
      ob: await w.eval('import("/js/ui/onboarding.js")'),
    };
    const today = D.todayISO();
    const problems = [];
    async function check(step) {
      const s = store.getState();
      const clean = sanitizeState(JSON.parse(JSON.stringify(s)));
      clean.version = s.version;
      const a = JSON.stringify(canon(JSON.parse(JSON.stringify(s)))), b = JSON.stringify(canon(clean));
      const sum = F.balanceSummary(s);
      const accounts = F.accountBalances(s).reduce((t, e) => t + e.balanceMain, 0);
      await storage.flush();
      const saved = JSON.stringify(canon(await storage.loadData()));
      const text = d.body.innerText;
      const issues = [
        a !== b && "datos inválidos",
        Math.abs(sum.total - accounts) > 0.01 && "total ≠ suma de cuentas",
        Math.abs(sum.available - (sum.total - sum.inGoals - sum.reserved)) > 0.01 && "disponible no cierra",
        !Number.isFinite(sum.available) && "disponible no es un número",
        saved !== a && "lo guardado ≠ memoria",
        /NaN|undefined|\[object/.test(text) && "texto raro en pantalla",
      ].filter(Boolean);
      if (issues.length) problems.push(`${step}: ${issues.join(", ")}`);
      log(`${issues.length ? "✗" : "ok"} ${step} · total=${Math.round(sum.total)} disponible=${Math.round(sum.available)} reservado=${Math.round(sum.reserved)}${issues.length ? " · " + issues.join(", ") : ""}`);
    }
    const submit = async () => { form().requestSubmit(); await wait(500); };

    // 0) Usuario nuevo: tutorial → "Empezar con lo mío" → asistente
    store.loadDemo(); await wait(200);
    forms.ob.openOnboarding(); await wait(400);
    for (let i = 0; i < 4; i++) { sheet().querySelector("[data-ob=next]").click(); await wait(i === 3 ? 700 : 80); }
    form().elements.salary.value = "800.000";
    await submit();
    set(form().elements["acc-amount-0"], "500.000");
    for (let i = 0; i < 12 && sheet()?.querySelector("form.setup"); i++) await submit();
    await check("asistente (plata hoy 500.000, sueldo 800.000)");

    // 1) Ingreso que se repite
    forms.tx.openTransactionForm({ type: "income" }); await wait(400);
    form().elements.amount.value = "800000";
    form().elements.description.value = "Sueldo";
    form().elements.recurrence.value = "monthly";
    await submit();
    await check("ingreso mensual");

    // 2) Gasto con subcategoría
    forms.tx.openTransactionForm({ type: "expense" }); await wait(400);
    form().elements.amount.value = "12.500,50";
    form().querySelector("input[name=categoryId]")?.click(); await wait(200);
    form().querySelector("input[name=subcategoryId]")?.click();
    await submit();
    await check("gasto con subcategoría");

    // 3) Cuentas: banco y tarjeta
    forms.acc.openAccountForm(); await wait(400);
    form().elements.name.value = "Banco";
    form().elements.opening.value = "1.000.000";
    await submit();
    forms.acc.openAccountForm(); await wait(400);
    form().elements.name.value = "Visa";
    form().querySelector("input[name=kind][value=credit]").click(); await wait(100);
    form().elements.openingDebt.value = "50.000";
    await submit();
    await check("cuenta banco + tarjeta con deuda");
    const acc = (name) => store.getState().accounts.find((x) => x.name === name);

    // 4) Transferencia
    forms.acc.openTransferForm({ fromId: store.defaultAccountId(), toId: acc("Banco").id }); await wait(400);
    set(form().elements.amount, "100000");
    await submit();
    await check("transferencia a Banco");

    // 5) Compra con tarjeta en 6 cuotas
    forms.tx.openTransactionForm({ type: "expense" }); await wait(400);
    set(form().elements.accountId, acc("Visa").id);
    set(form().elements.amount, "120000");
    set(form().elements.installments, "6");
    form().elements.description.value = "Televisor";
    await submit();
    await check("compra en 6 cuotas");

    // 6) Factura nueva y pago desde el banco
    forms.bill.openBillForm(); await wait(400);
    form().elements.name.value = "Internet";
    form().elements.amount.value = "27000";
    form().elements.dueDate.value = D.addDays(today, 5);
    await submit();
    await check("factura nueva");
    const bill = store.getState().bills[0];
    forms.bill.openPayBill(bill.id); await wait(400);
    set(form().elements.accountId, acc("Banco").id);
    await submit();
    await check("factura pagada");

    // 7) Meta y depósito
    forms.goal.openGoalForm(); await wait(400);
    form().elements.name.value = "Vacaciones";
    form().elements.target.value = "300000";
    await submit();
    forms.goal.openGoalMove(store.getState().goals[0].id, "deposit"); await wait(400);
    form().elements.amount.value = "50000";
    await submit();
    await check("meta con depósito");

    // 8) Préstamo y devolución parcial
    forms.loan.openLoanForm({ direction: "borrowed" }); await wait(400);
    form().elements.person.value = "Papá";
    form().elements.amount.value = "80000";
    form().elements.dueDate.value = D.addDays(today, 10);
    await submit();
    const loan = store.getState().loans[0];
    forms.loan.openLoanPayment(loan.id); await wait(400);
    form().elements.amount.value = "30000";
    await submit();
    await check("préstamo recibido + devolución parcial");

    // 9) Editar un gasto y borrar otro con deshacer
    const gasto = store.getState().transactions.find((t) => t.type === "expense" && !t.installment && !t.billId);
    forms.tx.openTransactionForm({ tx: gasto }); await wait(400);
    form().elements.amount.value = "20.000";
    await submit();
    await check("gasto editado");
    const before = JSON.stringify(canon(store.getState()));
    forms.tx.openTransactionForm({ tx: store.getState().transactions.find((t) => t.id === gasto.id) }); await wait(400);
    sheet().querySelector("[data-form-delete]").click(); await wait(500);
    [...d.querySelectorAll(".toast-action")].pop()?.click(); await wait(400);
    log("borrar + deshacer deja todo igual: " + (JSON.stringify(canon(store.getState())) === before ? "sí" : "NO ✗"));
    await check("borrar con deshacer");

    // 10) Pagar la tarjeta
    const visa = acc("Visa");
    const debt = F.cardStatus(store.getState(), visa).debt;
    forms.acc.openAccountDetail(visa.id); await wait(400);
    sheet().querySelector("[data-do=pay-card]").click(); await wait(700);
    await submit();
    log(`tarjeta: deuda ${Math.round(debt)} → ${Math.round(F.cardStatus(store.getState(), acc("Visa")).debt)}`);
    await check("tarjeta pagada");

    // 11) Backup → cambios → importar: vuelve exactamente a como estaba
    const backup = store.exportJSON();
    const snapshot = JSON.stringify(canon(store.getState()));
    store.addTransaction({ type: "expense", amount: 999, currency: "ARS", date: today, categoryId: "exp-otros" });
    store.importJSON(backup); await wait(300);
    log("importar el backup restaura todo: " + (JSON.stringify(canon(store.getState())) === snapshot ? "sí" : "NO ✗"));
    await check("backup importado");

    // 12) Todas las pantallas se dibujan con estos datos
    const bad = [];
    for (const r of ["inicio", "transacciones", "metas", "mas", "cuentas", "prestamos", "facturas", "presupuestos", "reportes", "categorias", "monedas", "ajustes", "ajustes-calculo", "ajustes-apariencia", "ajustes-dispositivo", "ajustes-datos"]) {
      w.location.hash = "#/" + r; await wait(250);
      if (d.querySelector(".render-error") || /NaN|undefined|\[object/.test(d.querySelector("#view").innerText)) bad.push(r);
    }
    log("pantallas con problemas: " + (bad.join(", ") || "ninguna"));
    if (bad.length) problems.push("pantallas: " + bad.join(", "));

    log("problemas: " + (problems.length ? problems.join(" | ") + " ✗" : "ninguno"));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
