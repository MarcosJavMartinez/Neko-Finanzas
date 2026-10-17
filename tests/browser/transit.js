// Tarjeta de transporte: nombre del país, pasajes que quedan, "Viajé" como
// gasto, cargar como movimiento entre cuentas y corregir el saldo.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const A = await w.eval('import("/js/ui/forms/accountForms.js")');
    store.loadDemo(); await wait(200);
    const D = await w.eval('import("/js/core/dates.js")');
    const expenses0 = F.monthlyTotals(store.getState(), D.currentMonthKey()).expense;
    A.openAccountForm(); await wait(500);
    let form = sheet().querySelector("form");
    form.querySelector("input[name=kind][value=transit]").click(); await wait(100);
    log("al crearla, interruptor «Está en rojo»: " + (form.querySelector("[data-negative-toggle]").hidden ? "oculto" : "visible ✗"));
    const suggested = form.elements.name.value;
    form.elements.name.value = "Mi tarjeta"; form.elements.fare.value = "700"; form.elements.opening.value = "3.200";
    form.requestSubmit(); await wait(600);
    const card = store.getState().accounts.find((a) => a.kind === "transit");
    log(`nombre: vacío para escribir (${suggested === "" ? "sí" : suggested + " ✗"}) · ejemplo: ${form.elements.name.placeholder} · guardada con pasaje ${card?.fare}${card?.fare === 700 ? "" : " ✗"}`);
    w.location.hash = "#/inicio"; await wait(500);
    const home = () => d.querySelector(".transit-card")?.innerText.replace(/\s+/g, " ").trim() || "no aparece ✗";
    log("inicio: " + home());
    d.querySelector(".transit-card [data-action=transit-trip]").click(); await wait(500);
    form = sheet().querySelector("form");
    form.querySelector("[data-step='1']").click();
    form.requestSubmit(); await wait(600);
    let st = F.transitStatus(store.getState(), card);
    const spent = F.monthlyTotals(store.getState(), D.currentMonthKey()).expense - expenses0;
    log(`2 viajes: saldo ${st.balance} · quedan ${st.trips} · gasto del mes +${spent}${st.balance === 1800 && st.trips === 2 && st.low && spent === 1400 ? "" : " ✗"}`);
    A.openTransitFix(card.id); await wait(500);
    form = sheet().querySelector("form");
    form.elements.real.value = "1.000"; form.requestSubmit(); await wait(600);
    st = F.transitStatus(store.getState(), card);
    log(`corregido a 1.000: saldo ${st.balance} · quedan ${st.trips} · gastado este mes ${st.spent}${st.balance === 1000 && st.trips === 1 && st.spent === 2200 ? "" : " ✗"}`);
    w.location.hash = "#/cuentas"; await wait(200); w.location.hash = "#/inicio"; await wait(500);
    log("inicio con 1 pasaje: " + home() + (home().includes("Te queda 1 pasaje") ? "" : " ✗"));
    const total0 = F.balanceSummary(store.getState()).total;
    A.openTransitLoad(card.id); await wait(500);
    form = sheet().querySelector("form");
    form.elements.amount.value = "5.000"; form.requestSubmit(); await wait(600);
    st = F.transitStatus(store.getState(), card);
    log(`cargar 5.000: saldo ${st.balance} · cargado este mes ${st.loaded} · total igual: ${Math.round(F.balanceSummary(store.getState()).total) === Math.round(total0)}${st.balance === 6000 && st.loaded === 5000 ? "" : " ✗"}`);
    // Viajar de más: el saldo queda en negativo (deuda) y la carga primero la cubre
    A.openTripForm(card.id); await wait(500);
    form = sheet().querySelector("form");
    form.elements.trips.value = "9"; form.elements.trips.dispatchEvent(new w.Event("input", { bubbles: true }));
    form.requestSubmit(); await wait(600);
    st = F.transitStatus(store.getState(), card);
    const toastText = [...d.querySelectorAll(".toast")].pop()?.innerText.replace(/\s+/g, " ").trim();
    log(`9 viajes con 6.000: saldo ${st.balance} · debe ${st.debt} · ${toastText}${st.balance === -300 && st.debt === 300 ? "" : " ✗"}`);
    w.location.hash = "#/cuentas"; await wait(200); w.location.hash = "#/inicio"; await wait(500);
    log("inicio en negativo: " + home() + (home().includes("Debes") ? "" : " ✗"));
    A.openTransitLoad(card.id); await wait(500);
    form = sheet().querySelector("form");
    log("cargar con deuda: " + (sheet().querySelector(".notice-warn")?.innerText.replace(/\s+/g, " ").trim() || "sin aviso ✗"));
    form.elements.amount.value = "1.000"; form.requestSubmit(); await wait(600);
    st = F.transitStatus(store.getState(), card);
    log(`cargar 1.000: saldo ${st.balance} · debe ${st.debt} · quedan ${st.trips}${st.balance === 700 && st.debt === 0 && st.trips === 1 ? "" : " ✗"}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
