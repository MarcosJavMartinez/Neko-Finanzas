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
    w.location.hash = "#/ajustes-datos"; await wait(400);
    const checked = (n) => d.querySelector(`input[name=${n}]:checked`)?.value;
    log("backupEvery: " + checked("backupEvery") + " · estado: " + d.querySelector(".backup-status")?.innerText.trim());
    d.querySelector("input[name=backupEvery][value=never]").click(); await wait(100);
    log("backupEvery nunca guardado=" + ls("backupEvery"));
    w.location.hash = "#/ajustes-apariencia"; await wait(400);
    log("tema marcado: " + checked("theme"));
    d.querySelector("input[name=theme][value=dark]").click(); await wait(200);
    log("oscuro: data-theme=" + d.documentElement.dataset.theme + " guardado=" + ls("theme") + " marcado=" + checked("theme"));
    d.querySelector("input[name=theme][value=auto]").click(); await wait(200);
    const sys = w.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    log("auto: data-theme=" + d.documentElement.dataset.theme + " (sistema " + sys + ") guardado=" + ls("theme") + " marcado=" + checked("theme"));
    log("sin botón de tema en el encabezado: " + (d.querySelector("#app-header [data-action=toggle-theme]") ? "SIGUE ✗" : "sí"));
    w.location.hash = "#/ajustes-dispositivo"; await wait(400);
    const vib = d.querySelector("[data-change=set-vibration]");
    log("vibración: " + (vib ? "visible, checked=" + vib.checked : "oculta (sin soporte)"));
    if (vib) { vib.click(); await wait(100); log("vibración apagada guardado=" + ls("vibration")); vib.click(); await wait(100); log("vibración prendida guardado=" + ls("vibration")); }
    const inst = [...d.querySelectorAll(".setting")].find((s) => /Instalar la app/.test(s.innerText));
    log("instalar: " + inst.innerText.replace(/\s+/g, " ").slice(0, 140));

    // CSV
    store.addTransaction({ type: "expense", amount: 1234.5, currency: "USD", date: "2026-09-30", categoryId: "exp-otros", description: '=HYPERLINK("x");a' });
    const csv = transactionsToCSV(store.getState());
    const lines = csv.trim().split("\r\n");
    log("csv: bom=" + (csv.charCodeAt(0) === 0xfeff) + " filas=" + (lines.length - 1) + " de " + store.getState().transactions.length + " · encabezado: " + lines[0].slice(1));
    log("csv última con inyección: " + lines.find((l) => l.includes("HYPERLINK")));
    log("csv 2 filas: " + lines.slice(1, 3).join(" | "));
    // Backup que reemplaza siempre el mismo archivo (selector de archivos simulado)
    const backupFile = await w.eval('import("/js/ui/backupFile.js")');
    const fake = { name: "mi-backup.json", content: "", writes: 0, queryPermission: async () => "granted", createWritable: async () => ({ write: async (t) => (fake.content = t), close: async () => fake.writes++ }) };
    let picks = 0;
    w.showSaveFilePicker = async () => { picks++; return fake; };
    const r1 = await backupFile.saveBackup(store.exportJSON());
    const r2 = await backupFile.saveBackup(store.exportJSON());
    log(`backup en archivo: 1º=${r1.how}${r1.first ? " (eligió archivo)" : ""} · 2º=${r2.how} · veces que preguntó dónde=${picks}${picks === 1 ? "" : " ✗"} · escrituras=${fake.writes} · nombre=${backupFile.backupFileKnown()}`);
    const parsed = JSON.parse(fake.content);
    log(`contenido: compacto=${!fake.content.includes("\n") ? "sí" : "NO ✗"} · movimientos=${parsed.data.transactions.length} · ${Math.round(fake.content.length / 1024)} KB (con sangría serían ${Math.round(JSON.stringify(parsed, null, 2).length / 1024)} KB)`);
    const r3 = await backupFile.saveBackup("otro", { choose: true });
    log("guardar en otro archivo: " + r3.how + " · preguntó de nuevo=" + (picks === 2));
    w.showSaveFilePicker = async () => { throw new w.DOMException("cancelado", "AbortError"); };
    await backupFile.forgetBackupFile();
    log("si cancela: " + (await backupFile.saveBackup("x")).how);
    w.showSaveFilePicker = async () => fake;
    w.location.hash = "#/ajustes-datos"; await wait(300);
    d.querySelector("[data-action=export-data]").click(); await wait(600);
    log("botón: " + [...d.querySelectorAll(".toast")].pop()?.textContent.trim().split("\n")[0] + " · ahora dice: " + d.querySelector("[data-action=export-data] strong").textContent);
    w.showSaveFilePicker = undefined;
    const bad = [...d.body.innerText.matchAll(/NaN|undefined|\[object/g)].length;
    log("textos raros: " + bad);
  } catch (e) { log("ERROR " + e.stack); }
})();
