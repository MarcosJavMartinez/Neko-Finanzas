// Ingresos variables: cobro parcial con monto habitual, registrar el sueldo
// ajustando el monto y sumando extras (aguinaldo, comisión, propinas).
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const form = () => sheet().querySelector("form");
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { openTransactionForm } = await w.eval('import("/js/ui/forms/transactionForm.js")');
    await store.resetEverything(); await wait(300);
    const lastMonth = D.addMonths(D.todayISO(), -1);

    // 1) Cobro parcial del mes pasado, que se repite, con el sueldo completo como habitual
    openTransactionForm({ type: "income" }); await wait(500);
    log("monto habitual oculto hasta elegir Repetir: " + form().querySelector("[data-usual]").hidden);
    form().elements.amount.value = "400.000";
    form().elements.date.value = lastMonth;
    form().elements.description.value = "Sueldo";
    form().elements.recurrence.value = "monthly";
    form().elements.recurrence.dispatchEvent(new Event("change", { bubbles: true }));
    log("al elegir Mensual aparece: " + !form().querySelector("[data-usual]").hidden);
    form().elements.usualAmount.value = "abc";
    form().requestSubmit(); await wait(200);
    log("habitual inválido: " + (form().querySelector('[data-error-for="usualAmount"]').textContent || "sin error ✗"));
    form().elements.usualAmount.value = "800.000";
    form().requestSubmit(); await wait(500);
    const first = store.getState().transactions[0];
    log(`guardado: cobró ${first.amount} · habitual ${first.recurrence?.amount} · próximo ${first.recurrence?.nextDate}${first.amount === 400000 && first.recurrence?.amount === 800000 ? "" : " ✗"}`);

    // 2) El recordatorio del Inicio propone el sueldo completo
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(400);
    const card = d.querySelector(".card-pending");
    log("recordatorio: " + (card?.innerText.replace(/\s+/g, " ").trim().slice(0, 70) || "NO ✗"));

    // 3) Registrar: monto ajustable + extras
    card.querySelector("[data-action=confirm-recurring]").click(); await wait(500);
    log("hoja: " + sheet().querySelector(".sheet-title").textContent + " · propone " + form().elements.amount.value + " · extras: " + [...form().querySelectorAll("[name^=extra-]")].length);
    form().elements.amount.value = "780.000";
    form().elements["extra-aguinaldo"].value = "400.000";
    form().elements["extra-propinas"].value = "xx";
    form().requestSubmit(); await wait(200);
    log("extra inválido: " + (form().querySelector('[data-error-for="extras"]').textContent || "sin error ✗"));
    form().elements["extra-propinas"].value = "12.500";
    form().requestSubmit(); await wait(600);
    const s = store.getState();
    const month = D.currentMonthKey();
    const mine = s.transactions.filter((t) => t.date.startsWith(month));
    log("registrado: " + mine.map((t) => `${t.description} ${t.amount}`).join(" · ") + ` · ingresos del mes=${F.monthlyTotals(s, month).income}${F.monthlyTotals(s, month).income === 1192500 ? "" : " ✗"}`);
    const next = s.transactions.find((t) => t.recurrence);
    log(`próximo recordatorio: habitual ${next.recurrence.amount} el ${next.recurrence.nextDate}${next.recurrence.amount === 800000 ? "" : " ✗"} · ya no hay pendiente=${!d.querySelector(".card-pending")}`);
    log("aviso: " + ([...d.querySelectorAll(".toast")].pop()?.textContent.trim().split("\n")[0] || "ninguno ✗"));

    // 4) Deshacer vuelve al recordatorio
    [...d.querySelectorAll(".toast-action")].pop()?.click(); await wait(500);
    log("deshacer: movimientos=" + store.getState().transactions.length + " · recordatorio de vuelta=" + !!d.querySelector(".card-pending"));

    // 5) Subcategorías nuevas del sueldo en el formulario
    const sueldo = store.getState().categories.find((c) => c.id === "inc-sueldo");
    log("subcategorías de Sueldo: " + sueldo.subcategories.map((x) => x.name).join(", "));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
