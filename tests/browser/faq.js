// Preguntas frecuentes: están todas, el buscador encuentra sin importar tildes,
// avisa cuando no hay nada, y cada "Ir ahí" / "Abrir" lleva a algo que existe.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
return (async () => {
  try {
    const { FAQ } = await w.eval('import("/js/data/faq.js")');
    const store = await w.eval('import("/js/core/store.js")');
    store.loadDemo(); await wait(200);
    const total = FAQ.reduce((s, g) => s + g.items.length, 0);
    w.location.hash = "#/ayuda"; await wait(500);
    log(`preguntas: ${d.querySelectorAll(".faq-item").length} de ${total}${d.querySelectorAll(".faq-item").length === total ? "" : " ✗"}`);
    const search = (text) => { const i = d.querySelector("[data-input=faq-search]"); i.value = text; i.dispatchEvent(new w.Event("input", { bubbles: true })); };
    search("DOLARES"); await wait(200);
    const found = d.querySelectorAll(".faq-item").length;
    log(`buscar "DOLARES": ${found} · ${d.querySelector(".faq-count")?.textContent.trim()} · abiertas: ${d.querySelectorAll(".faq-item[open]").length}${found >= 2 ? "" : " ✗"} · foco en el buscador: ${d.activeElement === d.querySelector("[data-input=faq-search]") || "no"}`);
    search("propina extras"); await wait(200);
    log(`buscar "propina extras": ${[...d.querySelectorAll(".faq-q")].map((q) => q.textContent.trim().slice(0, 40)).join(" | ") || "nada ✗"}`);
    search("zzzqqq"); await wait(200);
    log("sin resultados: " + (d.querySelector(".faq-empty")?.textContent.replace(/\s+/g, " ").trim().slice(0, 60) || "no avisa ✗"));
    search(""); await wait(200);
    // Cada destino existe
    const routes = new Set();
    const bad = [];
    for (const g of FAQ) for (const item of g.items) {
      if (item.href) routes.add(item.href);
      if (item.action && !d.querySelector(`.faq-go[data-action="${item.action}"]`)) bad.push(item.action);
    }
    for (const href of routes) {
      w.location.hash = href; await wait(350);
      if (!d.querySelector("#view")?.children.length || d.querySelector(".not-found")) bad.push(href);
    }
    w.location.hash = "#/ayuda"; await wait(400);
    for (const action of new Set(FAQ.flatMap((g) => g.items).map((i) => i.action).filter(Boolean))) {
      d.querySelector(`.faq-go[data-action="${action}"]`).click(); await wait(600);
      const sheet = [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
      if (!sheet) bad.push(action + " (no abre)");
      sheet?.querySelector("[data-sheet-close]")?.click(); await wait(500);
      [...d.querySelectorAll(".sheet-root:not(.is-closing) [data-sheet-close]")].forEach((b) => b.click()); await wait(300);
      if (w.location.hash !== "#/ayuda") { w.location.hash = "#/ayuda"; await wait(400); }
    }
    log(`destinos: ${routes.size} pantallas y acciones probadas · ${bad.length ? "fallan: " + bad.join(", ") + " ✗" : "todas existen"}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
