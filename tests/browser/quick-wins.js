// Calendario (.ics), Configuración en subpantallas, asistente de inicio,
// "Ingresar dinero" en verde y modo oscuro teñido por la paleta.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const tok = (n) => w.getComputedStyle(d.documentElement).getPropertyValue(n).trim();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const { billsToICS } = await w.eval('import("/js/core/ics.js")');

    // 1) Calendario
    store.loadDemo(); await wait(100);
    store.addBill({ name: "Alquiler, depto; 2B", icon: "🏠", amount: 350000, currency: "ARS", dueDate: "2026-10-31", dueDay: 31, frequency: "monthly", recurring: true, categoryId: "exp-hogar" });
    const { ics, count } = billsToICS(store.getState());
    const lines = ics.split("\r\n");
    const long = lines.filter((l) => new TextEncoder().encode(l).length > 75);
    const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
    log(`ics: ${count} facturas · eventos=${events} · reglas=${(ics.match(/RRULE:/g) || []).length} · avisos=${(ics.match(/BEGIN:VALARM/g) || []).length} · líneas largas=${long.length}${long.length ? " ✗" : ""}`);
    const unfolded = ics.replace(/\r\n /g, "");
    log("escapado: " + (unfolded.includes("Vence Alquiler\\, depto\\; 2B") ? "ok" : "MAL ✗") + " · día 31: " + (unfolded.match(/RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1/) ? "último día del mes" : "MAL ✗"));
    w.location.hash = "#/facturas"; await wait(400);
    d.querySelector("[data-action=export-ics]").click(); await wait(300);
    log("botón exportar: " + ([...d.querySelectorAll(".toast")].pop()?.textContent.trim() || "sin aviso ✗"));

    // 2) Configuración en subpantallas
    w.location.hash = "#/ajustes"; await wait(400);
    const links = [...d.querySelectorAll("#view .more-item")].map((a) => a.querySelector(".more-title").textContent);
    log("configuración: " + links.join(" · "));
    for (const r of ["calculo", "apariencia", "dispositivo", "datos"]) {
      w.location.hash = "#/ajustes-" + r; await wait(300);
      const back = d.querySelector(".header-back")?.getAttribute("href");
      log(`  ${r}: "${d.querySelector(".header-title").textContent}" · ${d.querySelectorAll("#view .setting, #view .settings-action").length} controles · volver=${back}${back === "#/ajustes" ? "" : " ✗"}`);
    }
    log("encabezado sin sol/luna: " + (d.querySelector("#app-header [data-action=toggle-theme]") ? "SIGUE ✗" : "sí"));

    // 3) "Ingresar dinero" en verde de ingresos
    w.location.hash = "#/inicio"; await wait(300);
    const qa = d.querySelector(".qa-income .qa-icon");
    const green = w.getComputedStyle(qa).color;
    const probe = d.createElement("span"); probe.style.color = "var(--income)"; d.body.append(probe);
    log("Ingresar dinero: " + (green === w.getComputedStyle(probe).color ? "verde de ingresos" : `otro color ✗ (${green})`));
    probe.remove();

    // 4) Modo oscuro teñido por la paleta
    w.localStorage.setItem("nekoFinanzas.theme", "dark");
    w.localStorage.setItem("nekoFinanzas.palette", "oceano");
    w.NekoAppearance.apply();
    const oceanSurface = tok("--surface");
    w.localStorage.removeItem("nekoFinanzas.palette"); w.NekoAppearance.apply();
    const cianSurface = tok("--surface");
    log(`superficie oscura: océano=${oceanSurface} · cian=${cianSurface}${oceanSurface !== cianSurface && cianSurface === "#172622" ? "" : " ✗"}`);
    w.localStorage.setItem("nekoFinanzas.theme", "light"); w.NekoAppearance.apply();

    // 5) Primera vez: "Empezar con lo mío" → asistente
    store.loadDemo(); await wait(100);
    const ob = await w.eval('import("/js/ui/onboarding.js")');
    ob.openOnboarding(); await wait(400);
    let s = sheet();
    for (let i = 0; i < 3; i++) { s.querySelector("[data-ob=next]").click(); await wait(80); }
    log("botones finales: " + [...s.querySelectorAll("[data-ob]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()).join(" / "));
    s.querySelector("[data-ob=next]").click(); await wait(700);
    s = sheet();
    log(`asistente: ${s?.querySelector(".sheet-title")?.textContent || "NO ✗"} · datos de ejemplo borrados=${store.getState().transactions.length === 0 && !store.getState().settings.isDemo}`);
    const form = s.querySelector("form");
    form.querySelector("input[name=currency][value=USD]").click();
    form.elements.salary.value = "abc";
    form.requestSubmit(); await wait(200);
    log("sueldo inválido: " + (form.querySelector("[data-setup-error]").textContent || "sin error ✗"));
    form.elements.salary.value = "900";
    form.requestSubmit(); await wait(250);
    form.elements["acc-amount-0"].value = "1.500,50";
    form.elements["acc-amount-0"].dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 12 && sheet()?.querySelector("form.setup"); i++) { form.requestSubmit(); await wait(250); }
    await wait(500);
    const st = store.getState().settings;
    const acc0 = store.getState().accounts[0];
    log(`guardado: moneda=${st.mainCurrency} saldo=${acc0.opening} (${acc0.currency}) referencia=${st.budgetReference} · hoja cerrada=${!sheet()}`);
    // 6) Presupuesto para "una meta" sin tener metas: avisa en vez de no hacer nada
    const { openBudgetForm } = await w.eval('import("/js/ui/forms/budgetForm.js")');
    openBudgetForm(); await wait(500);
    const bf = sheet().querySelector("form");
    bf.elements.name.value = "Ahorro";
    bf.elements.value.value = "10";
    bf.querySelector("input[name=kind][value=goal]").click(); await wait(100);
    bf.requestSubmit(); await wait(400);
    log("presupuesto a meta sin metas: " + ([...d.querySelectorAll(".toast")].pop()?.textContent.trim() || "sin aviso ✗") + " · creados=" + store.getState().budgets.length);
    sheet()?.querySelector("[data-sheet-close]")?.click(); await wait(400);

    // 7) Cambiar la moneda principal convierte el ingreso de referencia
    const refBefore = store.getState().settings.budgetReference;
    w.location.hash = "#/monedas"; await wait(400);
    d.querySelector("input[name='main-currency'][value=ARS]").click(); await wait(300);
    const stAfter = store.getState();
    log(`moneda principal USD→ARS: referencia ${refBefore} → ${stAfter.settings.budgetReference} (1 USD = ${stAfter.rates.USD})${stAfter.settings.budgetReference === refBefore * stAfter.rates.USD ? "" : " ✗"}`);

    // 8) "Empezar con lo mío" desde el aviso de datos de ejemplo abre el cuestionario
    store.loadDemo(); await wait(300);
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(500);
    d.querySelector(".demo-banner [data-action=start-fresh]").click(); await wait(600);
    [...sheet().querySelectorAll("button")].find((b) => b.textContent.trim() === "Empezar de cero").click(); await wait(1800);
    const wizard = !!sheet()?.querySelector("form.setup");
    log(`empezar con lo mío: app vacía=${store.isEmptyState()} · abre el cuestionario=${wizard}${wizard && store.isEmptyState() ? "" : " ✗"}`);
    sheet()?.querySelector("[data-sheet-close]")?.click(); await wait(400);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
