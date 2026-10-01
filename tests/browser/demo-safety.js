const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const obButtons = () => [...sheet().querySelectorAll("[data-ob]")].map((b) => b.dataset.ob + (b.hidden ? "·" : ""));
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const prefs = await w.eval('import("/js/core/prefs.js")');
    const ob = await w.eval('import("/js/ui/onboarding.js")');
    // 1) Demo intacto → "Empezar con lo mío" saca el ejemplo y abre el asistente
    store.loadDemo(); await wait(100);
    log("demo intacto: pristine=" + store.isPristineDemo() + " edited=" + store.getState().settings.demoEdited);
    ob.openOnboarding(); await wait(300);
    for (let i = 0; i < 3; i++) sheet().querySelector("[data-ob=next]").click();
    log("tutorial demo intacto: " + obButtons().join(","));
    const n0 = store.getState().transactions.length;
    sheet().querySelector("[data-ob=next]").click(); await wait(700);
    log(`empezar con lo mío: movimientos ${n0} → ${store.getState().transactions.length} · asistente=${sheet()?.querySelector(".sheet-title")?.textContent || "NO ✗"}`);
    sheet()?.querySelector("[data-sheet-close]")?.click(); await wait(400);
    store.loadDemo(); await wait(100);
    log("ejemplo cargado de nuevo: movimientos=" + store.getState().transactions.length);

    // 2) Demo con datos propios → ya no es "intacto"
    store.addTransaction({ type: "expense", amount: 500, currency: "ARS", date: "2026-09-30", categoryId: "exp-otros", description: "mío" });
    await wait(100);
    const s = store.getState();
    log("demo con dato propio: pristine=" + store.isPristineDemo() + " edited=" + s.settings.demoEdited);
    // guardado y recargado conserva el flag
    const storage = await w.eval('import("/js/core/storage.js")'); await storage.flush();
    const saved = await storage.loadData();
    log("guardado en: " + storage.storageMode());
    log("flag guardado=" + saved.settings.demoEdited);
    // recordatorio: con createdAt viejo debe aparecer aunque isDemo
    s.settings.createdAt = "2026-01-01T00:00:00Z";
    log("recordatorio en demo editado: " + prefs.backupReminderDue(s));
    ob.openOnboarding(); await wait(300);
    for (let i = 0; i < 3; i++) sheet().querySelector("[data-ob=next]").click();
    log("tutorial con datos propios: " + obButtons().join(",") + " texto=" + sheet().querySelector("[data-ob=next]").textContent);
    sheet().querySelector("[data-ob=next]").click(); await wait(400);

    // 3) Solo facturas (sin movimientos) → no ofrece "ver ejemplo"
    store.startFresh(); await wait(50);
    store.addBill({ name: "Luz", amount: 1000, currency: "ARS", dueDate: "2026-10-10", frequency: "monthly", categoryId: "exp-servicios" });
    await wait(50);
    log("solo una factura: empty=" + store.isEmptyState() + " pristine=" + store.isPristineDemo());
    ob.openOnboarding(); await wait(300);
    for (let i = 0; i < 3; i++) sheet().querySelector("[data-ob=next]").click();
    log("tutorial con una factura: " + obButtons().join(","));
    sheet().querySelector("[data-ob=next]").click(); await wait(400);

    // 4) Foco tras cambiar tema con teclado
    w.location.hash = "#/ajustes-apariencia"; await wait(400);
    const dark = d.querySelector("input[name=theme][value=dark]");
    dark.focus(); dark.click(); await wait(200);
    log("foco tras cambiar tema: " + (d.activeElement.name + "=" + d.activeElement.value));
    w.location.hash = "#/ajustes-dispositivo"; await wait(400);
    const hide = d.querySelector("[data-change=set-hide-amounts]");
    hide.focus(); hide.click(); await wait(200);
    log("foco tras ocultar montos: " + (d.activeElement.dataset.change || d.activeElement.tagName));
    hide.click(); await wait(200);

    // 5) Otra pestaña cambia prefs
    w.localStorage.setItem("nekoFinanzas.hideAmounts", "1");
    w.dispatchEvent(new w.StorageEvent("storage", { key: "nekoFinanzas.hideAmounts", newValue: "1" })); await wait(200);
    w.location.hash = "#/inicio"; await wait(300);
    log("otra pestaña ocultó montos: " + d.querySelector(".hero-amount").textContent);
    w.localStorage.removeItem("nekoFinanzas.hideAmounts");
    w.dispatchEvent(new w.StorageEvent("storage", { key: "nekoFinanzas.hideAmounts", newValue: null })); await wait(200);
    log("otra pestaña mostró montos: " + d.querySelector(".hero-amount").textContent);
    w.localStorage.setItem("nekoFinanzas.theme", "light");
    w.dispatchEvent(new w.StorageEvent("storage", { key: "nekoFinanzas.theme", newValue: "light" })); await wait(200);
    log("otra pestaña cambió tema: " + d.documentElement.dataset.theme);

    // 6) Import malicioso de prefs? (no viajan) + backup con demoEdited raro
    const mal = JSON.parse(store.exportJSON());
    mal.data.settings.demoEdited = "<img src=x onerror=alert(1)>";
    mal.data.settings.createdAt = "<script>";
    store.importJSON(JSON.stringify(mal)); await wait(200);
    log("import raro: demoEdited=" + JSON.stringify(store.getState().settings.demoEdited) + " días=" + prefs.daysSinceBackup(store.getState()));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) { log("ERROR " + e.stack); }
})();
