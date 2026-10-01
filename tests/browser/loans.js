// Préstamos desde la interfaz: prestar, cobrar en partes, deber con fecha
// (se reserva), borrar con todo lo que movió.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { openLoanForm, openLoanDetail, openLoanPayment } = await w.eval('import("/js/ui/forms/loanForms.js")');
    store.loadDemo(); await wait(200);
    const bal = (id) => Math.round(F.accountBalance(store.getState(), id).balance);
    const sum = () => F.balanceSummary(store.getState());
    const cash = store.getState().accounts.find((a) => a.kind === "cash").id;
    const wallet = store.getState().accounts.find((a) => a.kind === "wallet").id;

    // 1) Ejemplo: pantalla, inicio y reserva
    w.location.hash = "#/prestamos"; await wait(400);
    log("totales: " + [...d.querySelectorAll(".loan-total")].map((e) => e.innerText.replace(/\s+/g, " ").trim()).join(" | ") + " · filas=" + d.querySelectorAll("#view .loan-row").length);
    w.location.hash = "#/inicio"; await wait(400);
    log("inicio: tarjeta préstamos=" + [...d.querySelectorAll("#view .section-title")].some((h) => h.textContent === "Préstamos") + " · reserva: " + d.querySelector(".avail-reserve")?.textContent.trim());

    // 2) Prestar desde efectivo
    const c0 = bal(cash), total0 = F.totalBalance(store.getState()), exp0 = F.monthlyTotals(store.getState(), D.currentMonthKey()).expense;
    openLoanForm({ direction: "lent" }); await wait(500);
    let form = sheet().querySelector("form");
    form.elements.person.value = "Juli";
    form.elements.amount.value = "25.000";
    form.elements.accountId.value = cash;
    form.requestSubmit(); await wait(500);
    const juli = store.getState().loans.find((l) => l.person === "Juli");
    log(`prestar: efectivo ${c0}→${bal(cash)} · total baja ${Math.round(total0 - F.totalBalance(store.getState()))} · no es gasto=${F.monthlyTotals(store.getState(), D.currentMonthKey()).expense === exp0}`);

    // 3) Cobrar en partes
    openLoanPayment(juli.id); await wait(500);
    form = sheet().querySelector("form");
    form.elements.amount.value = "30.000";
    form.requestSubmit(); await wait(200);
    log("cobrar de más: " + (form.querySelector('[data-error-for="amount"]').textContent || "sin error ✗"));
    form.elements.amount.value = "10.000";
    form.elements.accountId.value = wallet;
    const w0 = bal(wallet);
    form.requestSubmit(); await wait(500);
    log(`devolución parcial: billetera ${w0}→${bal(wallet)} · falta=${F.loanOutstanding(store.getState().loans.find((l) => l.id === juli.id))}`);
    openLoanPayment(juli.id); await wait(500);
    form = sheet().querySelector("form");
    log("sugerido = lo que falta: " + form.elements.amount.value);
    form.requestSubmit(); await wait(500);
    log("toast: " + [...d.querySelectorAll(".toast")].pop()?.textContent.trim());

    // 4) Detalle: borrar una devolución
    openLoanDetail(juli.id); await wait(500);
    log("detalle: " + sheet().querySelector(".account-detail-balance").textContent + " · devoluciones=" + sheet().querySelectorAll(".loan-payment").length);
    sheet().querySelector("[data-remove-payment]").click(); await wait(500);
    log("tras borrar una devolución: falta=" + F.loanOutstanding(store.getState().loans.find((l) => l.id === juli.id)));

    // 5) Deber con fecha: se reserva
    const r0 = sum().debts.amount;
    openLoanForm({ direction: "borrowed" }); await wait(500);
    form = sheet().querySelector("form");
    log("etiqueta de cuenta al deber: " + form.querySelector('label[for$="accountId"]').textContent);
    form.elements.person.value = "Lucas";
    form.elements.amount.value = "40.000";
    form.elements.dueDate.value = D.addDays(D.todayISO(), 10);
    form.requestSubmit(); await wait(500);
    log(`deuda con fecha: reservado ${Math.round(r0)}→${Math.round(sum().debts.amount)} · identidad=${Math.abs(sum().available - (sum().total - sum().inGoals - sum().reserved)) < 0.01 ? "ok" : "MAL ✗"}`);

    // 6) Sin mover plata: solo anotarlo
    const t1 = F.totalBalance(store.getState());
    store.addLoan({ person: "Anotado", direction: "lent", amount: 5000, currency: "ARS", date: D.todayISO(), accountId: "" });
    log("solo anotado: total igual=" + (Math.abs(F.totalBalance(store.getState()) - t1) < 0.01));

    // 7) Tocar el movimiento en Transacciones abre el préstamo
    w.location.hash = "#/transacciones"; await wait(400);
    d.querySelector("#view .tx-loan")?.click(); await wait(500);
    log("tocar movimiento de préstamo abre: " + (sheet()?.querySelector(".sheet-title")?.textContent || "nada ✗"));
    sheet()?.querySelector("[data-sheet-close]")?.click(); await wait(400);

    // 8) Borrar el préstamo: vuelve la plata
    openLoanForm({ loan: store.getState().loans.find((l) => l.id === juli.id) }); await wait(500);
    sheet().querySelector("[data-form-delete]").click(); await wait(500);
    sheet().querySelector("[data-confirm]").click(); await wait(600);
    log(`borrado: efectivo=${bal(cash)} (antes ${c0}) · movimientos de Juli=${store.getState().transactions.filter((t) => t.loanId === juli.id).length}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
