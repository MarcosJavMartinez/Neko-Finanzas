const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ls = (k) => w.localStorage.getItem("nekoFinanzas." + k);
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const { transactionsToCSV } = await w.eval('import("/js/core/csv.js")');
    store.loadDemo();
    const old = new Date(Date.now() - 60 * 86400000).toISOString();
    store.updateSettings({ isDemo: false, createdAt: old });
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(300);
    const banner = () => d.querySelector(".backup-banner");
    log("banner con 60 días sin backup: " + (banner() ? banner().innerText.replace(/\s+/g, " ").slice(0, 90) : "NO"));
    banner().querySelector("[data-action=snooze-backup]").click(); await wait(200);
    log("tras 'Ahora no': banner=" + !!banner() + " snooze=" + !!ls("backupSnooze"));
    w.localStorage.removeItem("nekoFinanzas.backupSnooze");
    w.dispatchEvent(new Event("neko:rerender")); await wait(200);
    log("sin snooze vuelve: " + !!banner());
    banner().querySelector("[data-action=export-data]").click(); await wait(300);
    log("tras 'Hacer backup': banner=" + !!banner() + " lastBackup=" + !!ls("lastBackup"));

    // Configuración
    w.location.hash = "#/ajustes"; await wait(400);
    const checked = (n) => d.querySelector(`input[name=${n}]:checked`)?.value;
    log("tema marcado: " + checked("theme") + " · backupEvery: " + checked("backupEvery") + " · estado: " + d.querySelector(".backup-status")?.innerText.trim());
    d.querySelector("input[name=theme][value=dark]").click(); await wait(200);
    log("oscuro: data-theme=" + d.documentElement.dataset.theme + " guardado=" + ls("theme") + " marcado=" + checked("theme"));
    d.querySelector("input[name=theme][value=auto]").click(); await wait(200);
    const sys = w.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    log("auto: data-theme=" + d.documentElement.dataset.theme + " (sistema " + sys + ") guardado=" + ls("theme") + " marcado=" + checked("theme"));
    d.querySelector("[data-action=toggle-theme]").click(); await wait(200);
    log("botón del header desde auto: " + d.documentElement.dataset.theme + " guardado=" + ls("theme"));
    const vib = d.querySelector("[data-change=set-vibration]");
    log("vibración: " + (vib ? "visible, checked=" + vib.checked : "oculta (sin soporte)"));
    if (vib) { vib.click(); await wait(100); log("vibración apagada guardado=" + ls("vibration")); vib.click(); await wait(100); log("vibración prendida guardado=" + ls("vibration")); }
    d.querySelector("input[name=backupEvery][value=never]").click(); await wait(100);
    log("backupEvery nunca guardado=" + ls("backupEvery"));
    const inst = [...d.querySelectorAll(".setting")].find((s) => /Instalar la app/.test(s.innerText));
    log("instalar: " + inst.innerText.replace(/\s+/g, " ").slice(0, 140));

    // CSV
    store.addTransaction({ type: "expense", amount: 1234.5, currency: "USD", date: "2026-09-30", categoryId: "exp-otros", description: '=HYPERLINK("x");a' });
    const csv = transactionsToCSV(store.getState());
    const lines = csv.trim().split("\r\n");
    log("csv: bom=" + (csv.charCodeAt(0) === 0xfeff) + " filas=" + (lines.length - 1) + " de " + store.getState().transactions.length + " · encabezado: " + lines[0].slice(1));
    log("csv última con inyección: " + lines.find((l) => l.includes("HYPERLINK")));
    log("csv 2 filas: " + lines.slice(1, 3).join(" | "));
    const bad = [...d.body.innerText.matchAll(/NaN|undefined|\[object/g)].length;
    log("textos raros: " + bad);
  } catch (e) { log("ERROR " + e.stack); }
})();
