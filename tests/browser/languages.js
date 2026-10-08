// Otro idioma: se recorren todas las pantallas y las hojas con los datos de
// ejemplo y se busca (1) texto que quedó en español, (2) texto cortado en
// botones, pestañas y títulos, (3) desborde horizontal de la página y
// (4) "NaN" / "undefined" / claves sin completar ({0}) a la vista.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const i18n = await w.eval('import("/js/core/i18n.js")');
    const lang = i18n.getLanguage();
    const dict = (await w.eval(`import("/js/i18n/${lang}.js")`)).default;
    store.loadDemo(); await wait(400);

    // Texto en español: una clave del diccionario que se ve tal cual, o palabras que solo existen en español.
    // "para" es dinero en turco y "meses" es portugués: cada idioma descarta lo que comparte con el español.
    const words = "hoy|cuotas?|facturas?|días|meses|tus|los|las|del|para|con|que|una|sin|más|vence|sueldo|gastos?|ingresos?|cuentas?|metas?";
    const shared = { pt: /^(meses|tus|para|que|sem|sin|gastos?|metas?|vence)$/, tr: /^(para|sin)$/ }[lang];
    const spanishOnly = new RegExp("[¿¡ñ]|\b(" + words.split("|").filter((x) => !shared || !shared.test(x.replace("?", ""))).join("|") + ")\b", "i");
    const allow = /Neko|nekotools|Bariloche|ChatGPT|Netflix|Spotify|Disney|YouTube|Crunchyroll|GeForce|Prime Video|Uber|Visa|iCloud|Drive|Safari|Chrome|Edge|Outlook|Google|Excel|Dock|JavaScript|Caro|Juan|Lu\b|Español|Português/;
    const spanish = new Set();
    const cut = new Set();
    const odd = new Set();
    const wide = new Set();
    function look(text, where) {
      const t = text.replace(/\s+/g, " ").trim();
      if (!t || t.length < 3) return;
      if (/NaN|undefined|\[object|\{\d+\}/.test(t)) odd.add(`${where}: ${t.slice(0, 60)}`);
      if (allow.test(t) && !(t in dict)) return;
      if ((t in dict && dict[t] !== t) || spanishOnly.test(t)) spanish.add(`${where}: ${t.slice(0, 70)}`);
    }
    function scan(scope, where) {
      const walker = d.createTreeWalker(scope, w.NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || el.closest("script, style, option[value='es'], [hidden]") || el.closest("select#f-language")) continue;
        look(node.nodeValue, where);
      }
      for (const el of scope.querySelectorAll("[aria-label], [title], [placeholder]")) for (const a of ["aria-label", "title", "placeholder"]) if (el.hasAttribute(a)) look(el.getAttribute(a), `${where} @${a}`);
      // Texto cortado donde no debería: botones, pestañas, fichas, títulos y etiquetas de campo.
      for (const el of scope.querySelectorAll("button, .btn, .chip, .tabbar a, .side-link, .segmented label span, h1, h2, h3, .field-label, .toggle-label, .quick-action, .more-title, .stat-label")) {
        if (!el.offsetParent || el.closest(".tx-row, .row-main, .account-row")) continue;
        if (el.scrollWidth > el.clientWidth + 2 && el.textContent.trim()) cut.add(`${where}: ${el.textContent.trim().replace(/\s+/g, " ").slice(0, 40)}`);
      }
      if (d.documentElement.scrollWidth > w.innerWidth + 1) wide.add(where);
    }

    const routes = ["inicio", "transacciones", "metas", "mas", "cuentas", "prestamos", "facturas", "presupuestos", "reportes", "categorias", "monedas", "ajustes", "ajustes-calculo", "ajustes-apariencia", "ajustes-dispositivo", "ajustes-datos"];
    for (const r of routes) {
      w.location.hash = "#/" + r; await wait(350);
      scan(d.body, r);
    }

    // Hojas: cada acción se busca en la pantalla donde existe.
    const actions = {
      inicio: ["add-any", "add-expense", "add-income", "add-extras", "confirm-recurring", "pay-bill", "edit-tx", "leftover-to-goal", "add-treats"],
      transacciones: ["tx-filter", "edit-tx", "edit-transfer"],
      metas: ["add-goal", "goal-detail"],
      cuentas: ["add-account", "add-transfer", "account-detail"],
      prestamos: ["add-loan", "add-credit-loan", "loan-detail"],
      facturas: ["add-bill", "bill-detail", "cushion-to-goal"],
      presupuestos: ["add-budget", "edit-budget"],
      categorias: ["add-category", "edit-category"],
      ajustes: ["setup-wizard", "show-onboarding"],
      "ajustes-datos": ["open-snapshots"],
      "ajustes-dispositivo": ["install-help"],
    };
    let opened = 0;
    const missing = [];
    for (const [route, list] of Object.entries(actions)) {
      for (const action of list) {
        w.location.hash = "#/" + route; await wait(300);
        const el = d.querySelector(`[data-action="${action}"]`);
        if (!el) { missing.push(action); continue; }
        el.click(); await wait(500);
        let s = sheet();
        if (!s) { missing.push(action + " (sin hoja)"); continue; }
        opened++;
        scan(s, "hoja " + action);
        // El asistente y el tutorial tienen varios pasos: se recorren.
        for (let i = 0; i < 9 && (action === "setup-wizard" || action === "show-onboarding"); i++) {
          const next = s.querySelector("[data-setup-next], [data-ob=next]");
          if (!next) break;
          next.click(); await wait(350);
          s = sheet();
          if (!s) break;
          scan(s, `hoja ${action} paso ${i + 2}`);
        }
        // Se cierra sin guardar (el asistente, al llegar al final, ya guardó y cerró).
        for (let i = 0; i < 4 && sheet(); i++) { (sheet().querySelector(".sheet-close, [data-close]") || sheet()).dispatchEvent(new w.MouseEvent("click", { bubbles: true })); w.history.back(); await wait(350); }
      }
    }

    const show = (set) => (set.size ? `${set.size} ✗\n  ` + [...set].slice(0, 40).join("\n  ") : "ninguno");
    log(`${lang}: ${routes.length} pantallas y ${opened} hojas${missing.length ? " · no se encontraron: " + missing.join(", ") : ""}`);
    log("texto en español: " + show(spanish));
    log("texto cortado: " + show(cut));
    log("desborde horizontal: " + show(wide));
    log("texto raro: " + show(odd));
    log("errores: " + (errs.length ? errs.join(" | ") : "ninguno"));
  } catch (e) { log("ERROR " + (e.stack || e.message)); }
})();
