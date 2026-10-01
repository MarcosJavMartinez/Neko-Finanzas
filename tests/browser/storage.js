// Capa de datos: paso de localStorage a IndexedDB, copias automáticas,
// restaurar, borrar todo, aviso de iPhone y sincronización entre pestañas.
// El runner deja antes de abrir la app un dato "viejo" en localStorage.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const storage = await w.eval('import("/js/core/storage.js")');
    const db = await w.eval('import("/js/core/db.js")');

    // 1) Migración desde localStorage
    const s0 = store.getState();
    const legacy = s0.transactions.find((t) => t.id === "t-legado");
    log(`modo=${storage.storageMode()} · dato viejo migrado=${legacy?.amount === 777 ? "sí" : "NO ✗"} · localStorage limpio=${w.localStorage.getItem("nekoFinanzas.data.v1") === null ? "sí" : "NO ✗"}`);
    await storage.flush();
    const fromIdb = await storage.loadData();
    log("en IndexedDB: " + (fromIdb?.transactions?.some((t) => t.id === "t-legado") ? "sí" : "NO ✗"));

    // 2) Copia diaria al abrir (hay datos propios)
    await wait(500);
    let list = await store.listSnapshots();
    log("copias al abrir: " + list.map((x) => x.reason).join(", ") + (list.length === 1 ? "" : " ✗"));

    // 3) Guardar un cambio y que persista
    store.addTransaction({ type: "income", amount: 1000, currency: "ARS", date: "2026-09-10", categoryId: "inc-otros", description: "Nuevo" });
    await storage.flush();
    log("cambio guardado: " + ((await storage.loadData()).transactions.length === 2 ? "sí" : "NO ✗"));

    // 4) Empezar de cero guarda copia antes; restaurarla trae todo de vuelta
    store.startFresh();
    await wait(300);
    list = await store.listSnapshots();
    const before = list.find((x) => x.reason === "Antes de empezar de cero");
    log(`copia antes de empezar de cero: ${before ? `${before.counts.transactions} movimientos` : "NO ✗"} · ahora=${store.getState().transactions.length}`);
    await store.restoreSnapshot(before.id);
    await storage.flush();
    log(`restaurada: movimientos=${store.getState().transactions.length}${store.getState().transactions.length === 2 ? "" : " ✗"} · copias=${(await store.listSnapshots()).length}`);

    // 5) La hoja de copias en Configuración
    w.location.hash = "#/ajustes-datos"; await wait(400);
    d.querySelector("[data-action=open-snapshots]").click(); await wait(800);
    const rows = d.querySelectorAll(".sheet .snapshot-row");
    log("hoja de copias: " + rows.length + " filas · primera: " + (rows[0]?.innerText.replace(/\s+/g, " ").trim() || "—"));
    d.querySelectorAll(".sheet-root [data-sheet-close]").forEach((b) => b.click()); await wait(400);

    // 6) Otra pestaña guarda: esta se entera y recarga
    const other = JSON.parse(JSON.stringify(store.getState()));
    other.transactions.push({ ...other.transactions[0], id: "t-otra-pestana", description: "Desde otra pestaña" });
    await db.withStore("data", "readwrite", (s) => s.put(JSON.stringify(other), "current"));
    new w.BroadcastChannel("nekoFinanzas.data").postMessage({ type: "saved" });
    await wait(800);
    log("otra pestaña: " + (store.getState().transactions.some((t) => t.id === "t-otra-pestana") ? "recargado" : "NO ✗"));

    // 7) Aviso de iPhone (simulando Safari de iPhone sin instalar)
    Object.defineProperty(w.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", configurable: true });
    w.location.hash = "#/inicio"; await wait(300);
    w.dispatchEvent(new Event("neko:rerender")); await wait(300);
    const banner = d.querySelector(".ios-banner");
    log("aviso iPhone: " + (banner ? "visible" : "NO ✗"));
    banner?.querySelector("[data-action=install-help]").click(); await wait(500);
    log("pasos iPhone: " + d.querySelectorAll(".sheet .install-steps li").length);
    d.querySelectorAll(".sheet-root [data-sheet-close]").forEach((b) => b.click()); await wait(400);
    d.querySelector(".ios-banner [data-action=snooze-ios-notice]")?.click(); await wait(300);
    log("tras 'Ahora no': " + (d.querySelector(".ios-banner") ? "sigue ✗" : "oculto"));

    // 8) Borrar todo: datos y copias
    await store.resetEverything();
    await storage.flush();
    const after = await storage.loadData();
    log(`borrar todo: movimientos=${store.getState().transactions.length} guardados=${after?.transactions?.length ?? "nada"} copias=${(await store.listSnapshots()).length}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
