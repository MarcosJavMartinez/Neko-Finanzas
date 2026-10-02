// Avisos de vencimientos: prender, qué se avisa, que no se repitan, cambiar
// los días, montos ocultos y apagar. (El runner da permiso de notificaciones.)
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const R = await w.eval('import("/js/ui/reminders.js")');
    const prefs = await w.eval('import("/js/core/prefs.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const db = await w.eval('import("/js/core/db.js")');
    const today = D.todayISO();
    const record = () => db.withStore("assets", "readonly", (s) => s.get("reminders"));
    // Chrome sin ventana acepta las notificaciones pero no las lista: se espían las llamadas.
    const calls = [];
    w.ServiceWorkerRegistration.prototype.showNotification = function (title) { calls.push(title); return Promise.resolve(); };
    const shownNow = async () => [...calls].sort();
    store.loadDemo(); await wait(300);
    await w.navigator.serviceWorker.ready;

    // 1) Apagados por defecto
    log(`por defecto: prendidos=${prefs.remindersEnabled()} · permiso=${R.reminderPermission()} · avisos mostrados=${await R.fireDue()}`);

    // 2) El plan (sin prender nada): qué se diría hoy
    const plan = R.buildPlan(store.getState(), today, 1);
    const todayTitles = plan.filter((i) => i.from <= today && i.until >= today).map((i) => i.titles[today]);
    log(`plan con 1 día antes: ${plan.length} avisos programados · hoy tocarían: ${todayTitles.join(" | ")}`);

    // 3) Prender desde Configuración
    w.location.hash = "#/ajustes-dispositivo"; await wait(400);
    const sw = d.querySelector("[data-change=set-reminders]");
    log("interruptor: " + (sw ? "visible, apagado=" + !sw.checked : "NO ✗"));
    sw.click(); await wait(1500);
    const first = await shownNow();
    log(`prendidos=${prefs.remindersEnabled()} · notificaciones: ${first.join(" | ") || "ninguna ✗"}`);
    log("opciones al prender: días=" + d.querySelector("input[name=reminderDays]:checked")?.value + " · botón probar=" + !!d.querySelector("[data-action=test-reminder]"));

    // 4) No se repiten
    log("segunda pasada muestra: " + (await R.fireDue()) + ((await R.fireDue()) === 0 ? "" : " ✗"));

    // 5) Avisar 3 días antes: aparecen los que vencen en 2 y 3 días
    d.querySelector("input[name=reminderDays][value='3']").click(); await wait(1200);
    const more = (await shownNow()).filter((t) => !first.includes(t));
    log("con 3 días antes se suman: " + (more.join(" | ") || "ninguno"));

    // 6) Pagar una factura la saca del plan
    const bill = store.getState().bills.find((b) => b.name === "ChatGPT");
    const oldDue = bill.dueDate;
    const before = (await record()).items.filter((i) => i.tag.startsWith(`factura:${bill.id}:${oldDue}`)).length;
    store.payBill(bill.id, {}); await wait(1500);
    const after = (await record()).items.filter((i) => i.tag.startsWith(`factura:${bill.id}:${oldDue}`)).length;
    log(`pagar ChatGPT: avisos de ese vencimiento ${before} → ${after}${after === 0 ? "" : " ✗"}`);

    // 7) Con los montos ocultos, el aviso no muestra el monto
    const withAmount = (await record()).items.find((i) => /\$/.test(i.body));
    prefs.setAmountsHidden(true);
    await R.syncPlan(store.getState());
    const hidden = (await record()).items.some((i) => /\$|US\$|€/.test(i.body));
    prefs.setAmountsHidden(false);
    log(`montos en el aviso: normal="${withAmount?.body}" · con montos ocultos se ven=${hidden}${hidden ? " ✗" : ""}`);

    // 8) Aviso de prueba
    log("aviso de prueba: " + (await R.testReminder()) + " · " + ((await shownNow()).includes("Así se ven los avisos de Neko Finanzas") ? "mostrado" : "NO ✗"));

    // 9) Apagar
    d.querySelector("[data-change=set-reminders]").click(); await wait(1200);
    const rec = await record();
    log(`apagados: prendidos=${prefs.remindersEnabled()} · plan=${rec.items.length} · al abrir avisa=${await R.fireDue()}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
