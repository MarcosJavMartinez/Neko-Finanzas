// Quien ya vio el tutorial pero nunca llegó al cuestionario de inicio lo
// recibe solo al abrir la app: con los datos de ejemplo, el tutorial que
// termina en el cuestionario; con la app vacía, el cuestionario directo.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const title = () => sheet()?.querySelector(".sheet-title")?.textContent.trim() || "(sin hoja)";
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    await wait(1500);
    const empty = store.isEmptyState();
    log(`al abrir (${empty ? "app vacía" : "datos de ejemplo"}): ${title()}`);
    if (!empty) {
      // Aunque el ejemplo esté tocado, el último paso ofrece empezar con lo propio.
      for (let i = 0; i < 3; i++) { sheet().querySelector("[data-ob=next]").click(); await wait(250); }
      log("último paso: " + [...sheet().querySelectorAll("[data-ob]:not([hidden])")].map((b) => b.textContent.trim()).join(" / "));
      sheet().querySelector("[data-ob=next]").click(); await wait(1500);
      log(`tras 'Empezar con lo mío': ${title()} · app vacía=${store.isEmptyState()}${sheet()?.querySelector("form.setup") && store.isEmptyState() ? "" : " ✗"}`);
    } else {
      log("es el cuestionario: " + (sheet()?.querySelector("form.setup") ? "sí" : "no ✗"));
    }
    log("anotado como ofrecido: " + (w.localStorage.getItem("nekoFinanzas.setupOffered") === "1" ? "sí" : "no ✗"));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
