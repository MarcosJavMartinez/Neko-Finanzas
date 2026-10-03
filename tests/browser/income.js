// Ingresos en dos líneas: el sueldo (fijo, se repite, puede cobrarse parcial)
// y los extras del mes (aguinaldo, comisión, propinas…: variables, aparte).
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const form = () => sheet().querySelector("form");
const title = () => sheet()?.querySelector(".sheet-title")?.textContent || "(ninguna)";
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { openTransactionForm } = await w.eval('import("/js/ui/forms/transactionForm.js")');
    await store.resetEverything(); await wait(300);
    const lastMonth = D.addMonths(D.todayISO(), -1);
    const month = D.currentMonthKey();

    // 1) Cobro parcial del mes pasado, que se repite, con el sueldo completo como habitual
    openTransactionForm({ type: "income" }); await wait(500);
    log("monto habitual oculto hasta elegir Repetir: " + form().querySelector("[data-usual]").hidden + " · link a extras visible: " + !form().querySelector("[data-extras-link]").hidden);
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
    log(`guardado: cobró ${first.amount} · habitual ${first.recurrence?.amount}${first.amount === 400000 && first.recurrence?.amount === 800000 ? "" : " ✗"}`);

    // 2) El recordatorio del Inicio propone el sueldo completo
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(400);
    const card = d.querySelector(".card-pending");
    log("recordatorio: " + (card?.innerText.replace(/\s+/g, " ").trim().slice(0, 60) || "NO ✗"));
    log("línea de extras en el inicio: " + (d.querySelector(".extras-line")?.innerText.replace(/\s+/g, " ").trim() || "NO ✗"));

    // 3) Registrar el sueldo: solo el sueldo (monto ajustable), sin campos de extras
    card.querySelector("[data-action=confirm-recurring]").click(); await wait(500);
    log(`hoja del sueldo: propone ${form().elements.amount.value} · campos de extras=${form().querySelectorAll("[name^=extra-]").length}${form().querySelectorAll("[name^=extra-]").length ? " ✗" : ""}`);
    form().elements.amount.value = "780.000";
    form().elements.withExtras.click();
    form().requestSubmit(); await wait(900);
    const salary = store.getState().transactions.filter((t) => t.date.startsWith(month));
    log(`sueldo registrado: ${salary.map((t) => `${t.description} ${t.amount}`).join(" · ")} · habitual sigue en ${store.getState().transactions.find((t) => t.recurrence).recurrence.amount}`);

    // 4) "También tuve extras" abre la hoja de extras
    log("después se abre: " + title());
    form().requestSubmit(); await wait(200);
    log("sin montos: " + (form().querySelector('[data-error-for="extras"]').textContent || "sin error ✗"));
    form().elements["extra-aguinaldo"].value = "400.000";
    form().elements["extra-propinas"].value = "xx";
    form().requestSubmit(); await wait(200);
    log("extra inválido: " + (form().querySelector('[data-error-for="extras"]').textContent || "sin error ✗"));
    form().elements["extra-propinas"].value = "12.500";
    form().elements["other-name"].value = "Viáticos";
    form().requestSubmit(); await wait(200);
    log("otro sin monto: " + (form().querySelector('[data-error-for="extras"]').textContent || "sin error ✗"));
    form().elements["other-amount"].value = "30.000";
    form().requestSubmit(); await wait(600);
    const s = store.getState();
    const extras = s.transactions.filter((t) => t.date.startsWith(month) && t.description !== "Sueldo");
    log("extras: " + extras.map((t) => `${t.description} ${t.amount} [${t.categoryId}${t.subcategoryId ? "/" + t.subcategoryId.split(".")[1] : ""}] repite=${!!t.recurrence}`).join(" · "));
    log(`ingresos del mes=${F.monthlyTotals(s, month).income}${F.monthlyTotals(s, month).income === 1222500 ? "" : " ✗"} · aviso: ${[...d.querySelectorAll(".toast")].pop()?.textContent.trim().split("\n")[0]}`);
    log("solo el sueldo se repite: " + (s.transactions.filter((t) => t.recurrence).length === 1 ? "sí" : "NO ✗"));

    // 5) El inicio y la hoja muestran lo ya cargado
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(400);
    const line = d.querySelector(".extras-line")?.innerText.replace(/\s+/g, " ").trim();
    log("inicio: " + line + (/442\.500/.test(line) ? "" : " ✗"));
    d.querySelector(".extras-line [data-action=add-extras]").click(); await wait(500);
    log("hoja de extras: " + [...sheet().querySelectorAll(".extra-loaded")].map((e) => e.textContent).join(" · "));

    // 6) Deshacer la carga de un extra
    form().elements["extra-comision"].value = "50.000";
    form().requestSubmit(); await wait(600);
    const n = store.getState().transactions.length;
    [...d.querySelectorAll(".toast-action")].pop()?.click(); await wait(500);
    log(`deshacer: movimientos ${n} → ${store.getState().transactions.length}`);

    // 7) Desde "Ingresar dinero" se llega a los extras
    openTransactionForm({ type: "income" }); await wait(500);
    form().querySelector("[data-open-extras]").click(); await wait(900);
    log("link desde Ingresar dinero abre: " + title());
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
