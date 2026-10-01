// Monkey testing: acciones al azar sobre la app real, buscando errores
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED = Number(new URLSearchParams(w.location.search).get("seed") || w.__seed || 1);
let seed = SEED * 9973;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const errors = new Map();
const addErr = (msg) => errors.set(msg, (errors.get(msg) || 0) + 1);
w.addEventListener("error", (e) => addErr("error: " + (e.message || e.error)));
w.addEventListener("unhandledrejection", (e) => addErr("promesa: " + (e.reason?.message || e.reason)));
const origConsoleError = w.console.error;
w.console.error = (...a) => { addErr("console.error: " + a.map(String).join(" ").slice(0, 120)); origConsoleError.apply(w.console, a); };

const SKIP_ACTIONS = new Set(["export-data", "install-app", "export-csv", "share-app", "share-summary"]);
const TEXT_POOL = ["", " ", "0", "-5", "1.234,56", "abc", "<b>x</b>", "9999999999999", "12", "0,01", "1.350", "20.5", "😺", "a".repeat(200)];
const DATE_POOL = ["", "2026-02-30", "2026-09-15", "2030-12-31", "1999-01-01", "2026-10-31"];
const ROUTES = ["#/inicio", "#/transacciones", "#/metas", "#/mas", "#/facturas", "#/presupuestos", "#/reportes", "#/categorias", "#/monedas", "#/ajustes", "#/ajustes-calculo", "#/ajustes-apariencia", "#/ajustes-dispositivo", "#/ajustes-datos"];
const badText = new Map();

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !el.closest("[hidden]") && !el.disabled;
}
function topSheet() { return [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop(); }

function fillForm(form) {
  for (const el of form.elements) {
    if (rnd() < 0.3 || el.disabled || el.type === "hidden" || el.type === "file" || el.tagName === "BUTTON") continue;
    if (el.type === "radio" || el.type === "checkbox") { if (rnd() < 0.5) el.click(); continue; }
    if (el.tagName === "SELECT") { el.selectedIndex = Math.floor(rnd() * el.options.length); el.dispatchEvent(new Event("change", { bubbles: true })); continue; }
    if (el.type === "date") { el.value = pick(DATE_POOL); el.dispatchEvent(new Event("change", { bubbles: true })); continue; }
    if (el.type === "time") { el.value = pick(["", "12:30", "23:59"]); continue; }
    el.value = pick(TEXT_POOL);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function scanText(step) {
  const areas = [d.querySelector("#view"), d.querySelector("#app-header"), ...d.querySelectorAll(".sheet-root")];
  for (const a of areas) {
    if (!a) continue;
    const t = a.innerText || "";
    for (const bad of ["NaN", "undefined", "Infinity", "[object Object]", "null"]) {
      if (new RegExp(`(^|[^a-zA-Z])${bad.replace(/[[\]]/g, "\\$&")}([^a-zA-Z]|$)`).test(t)) {
        const ctx = t.slice(Math.max(0, t.indexOf(bad) - 40), t.indexOf(bad) + 40).replace(/\s+/g, " ");
        badText.set(bad + " … " + ctx, step);
      }
    }
  }
  const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) addErr("ids duplicados: " + [...new Set(dup)].join(","));
  if (!d.querySelector("#view").children.length) addErr("vista vacía en " + w.location.hash);
}

return (async () => {
  const STEPS = 250;
  const kinds = {};
  for (let step = 0; step < STEPS; step++) {
    try {
      const sheet = topSheet();
      const r = rnd();
      let kind;
      if (sheet && r < 0.45) {
        kind = "form";
        const form = sheet.querySelector("form");
        if (form && rnd() < 0.8) { fillForm(form); form.requestSubmit(); }
        else pick([...sheet.querySelectorAll("button, [data-do]")].filter(visible) || [])?.click?.();
      } else if (r < 0.55 && sheet) {
        // "Atrás" solo con una hoja abierta: sin hojas, sale de la página de prueba.
        kind = "atrás"; w.history.back();
      } else if (r < 0.6) {
        kind = "escape"; d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else if (r < 0.7) {
        kind = "ruta"; w.location.hash = pick(ROUTES);
      } else {
        kind = "toque";
        const root = sheet || d;
        const targets = [...root.querySelectorAll("[data-action], [data-do], a[href^='#/'], [data-toggle-cats], [data-quick], [data-add-sub], [data-edit-sub], [data-remove-sub], [data-confirm], [data-new-subcategory], [data-new-category], summary, .tab")]
          .filter((el) => visible(el) && !SKIP_ACTIONS.has(el.dataset.action));
        const t = pick(targets);
        if (t) t.click();
      }
      kinds[kind] = (kinds[kind] || 0) + 1;
    } catch (e) {
      addErr("excepción del test: " + e.message);
    }
    await wait(rnd() < 0.5 ? 60 : 260);
    scanText(step);
    if (step % 50 === 49) log(`progreso ${step + 1}/${STEPS} en ${w.location.hash}`);
  }
  const storage = await w.eval('import("/js/core/storage.js")'); await storage.flush();
  const state = await storage.loadData();
  log(`seed ${SEED}: ${STEPS} pasos (${Object.entries(kinds).map(([k, v]) => k + "=" + v).join(", ")}) · movimientos=${state.transactions.length} facturas=${state.bills.length} metas=${state.goals.length}`);
  log("errores: " + (errors.size ? [...errors.entries()].map(([m, c]) => `${m} (×${c})`).join(" | ") : "ninguno"));
  log("textos raros: " + (badText.size ? [...badText.entries()].slice(0, 8).map(([m, s]) => `[paso ${s}] ${m}`).join(" | ") : "ninguno"));
})();
