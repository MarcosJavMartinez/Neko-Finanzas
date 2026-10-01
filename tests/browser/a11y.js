// Rendimiento con 10.000 movimientos + accesibilidad básica
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const data = JSON.parse(store.exportJSON()).data;
    const cats = data.categories;
    let seed = 5;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const base = new Date(2023, 9, 1);
    for (let i = 0; i < 10000; i++) {
      const type = rnd() < 0.2 ? "income" : "expense";
      const cs = cats.filter((c) => c.type === type);
      const c = cs[Math.floor(rnd() * cs.length)];
      const dd = new Date(base.getTime() + rnd() * 1095 * 86400000);
      const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
      data.transactions.push({ id: "perf" + i, type, amount: Math.round(rnd() * 90000) + 100, currency: rnd() < 0.1 ? "USD" : "ARS", date: iso, time: "", categoryId: c.id, subcategoryId: c.subcategories[0]?.id || "", description: "Movimiento de prueba " + i, createdAt: iso });
    }
    let t = performance.now();
    store.importJSON(JSON.stringify({ data }));
    const importMs = performance.now() - t;
    const bytes = w.localStorage.getItem("nekoFinanzas.data.v1").length * 2;
    const times = [];
    for (const r of ["#/inicio", "#/transacciones", "#/reportes", "#/presupuestos", "#/facturas", "#/metas", "#/categorias"]) {
      w.location.hash = r; await wait(50);
      t = performance.now();
      w.dispatchEvent(new Event("neko:rerender"));
      times.push(`${r.slice(2)} ${Math.round(performance.now() - t)}ms`);
      await wait(100);
    }
    t = performance.now();
    store.addTransaction({ type: "expense", amount: 10, currency: "ARS", date: "2026-09-30", categoryId: "exp-otros" });
    const addMs = performance.now() - t;
    log(`10.137 movimientos: importar+validar ${Math.round(importMs)}ms · guardar un gasto (incluye redibujar) ${Math.round(addMs)}ms · datos ${(bytes / 1024 / 1024).toFixed(2)} MB (UTF-16)`);
    log("render por pantalla: " + times.join(" · "));

    // Accesibilidad: botones/enlaces sin nombre accesible, campos sin etiqueta
    const noName = [];
    const noLabel = [];
    const scan = (scope, where) => {
      for (const el of scope.querySelectorAll("button, a[href], [role=button]")) {
        const name = (el.getAttribute("aria-label") || el.textContent || el.title || "").trim();
        if (!name && !el.closest("[aria-hidden=true]")) noName.push(`${where}:${el.className || el.tagName}`);
      }
      for (const el of scope.querySelectorAll("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea")) {
        const labelled = el.getAttribute("aria-label") || (el.id && scope.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
        if (!labelled) noLabel.push(`${where}:${el.name || el.id || el.type}`);
      }
    };
    for (const r of ["#/inicio", "#/transacciones", "#/metas", "#/mas", "#/facturas", "#/presupuestos", "#/reportes", "#/categorias", "#/monedas", "#/ajustes"]) {
      w.location.hash = r; await wait(300);
      scan(d, r);
    }
    for (const sel of ["[data-action=add-expense]", "[data-action=add-bill]", "[data-action=add-goal]", "[data-action=add-budget]", "[data-action=add-category]"]) {
      const routes = { "[data-action=add-bill]": "#/facturas", "[data-action=add-budget]": "#/presupuestos", "[data-action=add-category]": "#/categorias", "[data-action=add-goal]": "#/metas" };
      w.location.hash = routes[sel] || "#/transacciones"; await wait(300);
      d.querySelector(sel)?.click(); await wait(400);
      const sheet = [...d.querySelectorAll(".sheet-root")].pop();
      if (sheet) scan(sheet, "hoja " + sel.slice(13, -1));
      d.querySelectorAll(".sheet-root [data-sheet-close]").forEach((b) => b.click()); await wait(300);
    }
    log("a11y · botones/enlaces sin nombre: " + ([...new Set(noName)].join(", ") || "ninguno"));
    log("a11y · campos sin etiqueta: " + ([...new Set(noLabel)].join(", ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
