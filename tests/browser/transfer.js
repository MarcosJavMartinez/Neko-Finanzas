// Pasar a otro dispositivo: enviar muestra QR y código; recibir con un código
// mal escrito avisa sin gastarlo; con el bueno, pide confirmar y reemplaza los
// datos. El servidor se imita en la página con el mismo protocolo que
// transfer-finanzas.php (lo que llega es un bloque cifrado).
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await wait(100); } return null; };
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    // Servidor de mentira, en memoria
    const box = new Map();
    let seen = "";
    const reply = (status, body) => new w.Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    w.fetch = async (url, opts = {}) => {
      if (!String(url).startsWith("https://nekotools.site/transfer-finanzas.php")) return reply(404, {});
      const q = new URL(url).searchParams;
      if (opts.method === "POST") {
        const body = JSON.parse(opts.body);
        seen = opts.body;
        const code = "QWERTY";
        box.set(code, body);
        return reply(200, { ok: true, code, ttlSeconds: 900 });
      }
      if (q.has("check")) { const b = box.get(q.get("check")); return reply(200, b ? { ok: true, active: true, salt: b.salt } : { ok: true, active: false }); }
      const b = box.get(q.get("code"));
      if (!b) return reply(404, { ok: false, error: "not_found_or_expired" });
      if (b.proof !== q.get("proof")) return reply(404, { ok: false, error: "wrong_key" });
      box.delete(q.get("code"));
      const { proof, ...payload } = b;
      return reply(200, { ok: true, payload });
    };

    store.loadDemo(); await wait(200);
    const before = store.getState().transactions.length;
    w.location.hash = "#/ajustes-datos"; await wait(500);
    d.querySelector("[data-action=transfer-data]").click(); await wait(500);
    sheet().querySelector("[data-view=send]").click(); await wait(100);
    sheet().querySelector("[data-do=generate]").click();
    const shown = await until(() => sheet().querySelector("[data-code]").textContent.trim());
    const qr = sheet().querySelector("[data-qr]");
    const status = sheet().querySelector("[data-status]").textContent.trim();
    log(`enviar: código ${shown || "ninguno ✗"} · QR ${qr.hidden ? "oculto ✗" : qr.width + "px"} · ${status}${/^QWERTY-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(shown) && status.includes("Esperando") ? "" : " ✗"}`);
    // El QR dibujado se puede leer con el mismo lector que usa el iPhone
    const jsQR = (await w.eval('import("/js/vendor/jsqr.js")')).default;
    const read = jsQR(qr.getContext("2d").getImageData(0, 0, qr.width, qr.height).data, qr.width, qr.height)?.data || "";
    log("el QR se lee: " + read + (read === "NEKOFIN:" + shown.replace(/-/g, "") ? "" : " ✗"));
    const leaked =seen.includes("Supermercado") || seen.includes("transactions") || seen.includes(store.getState().accounts[0].name);
    log("al servidor llega cifrado: " + (leaked ? "se ve el contenido ✗" : "sí") + ` · ${Math.round(seen.length / 1024)} KB`);
    sheet().querySelector("[data-sheet-close]").click(); await wait(500);

    // "Otro dispositivo": sin datos
    store.startFresh({ keepSetup: false }); await wait(200);
    d.querySelector("[data-action=transfer-data]").click(); await wait(500);
    sheet().querySelector("[data-view=receive]").click(); await wait(100);
    const form = sheet().querySelector("[data-code-form]");
    const input = form.elements.code;
    const type = (text) => { input.value = text; input.dispatchEvent(new w.Event("input", { bubbles: true })); };
    type("qwer");
    form.requestSubmit(); await wait(200);
    log("código corto: " + form.querySelector("[data-error-for=code]").textContent.trim());
    const good = shown.replace(/-/g, "");
    const typo = good.slice(0, 7) + (good[7] === "A" ? "B" : "A") + good.slice(8);
    type(typo.toLowerCase());
    log("se agrupa solo: " + input.value);
    form.requestSubmit();
    const wrong = await until(() => form.querySelector("[data-error-for=code]").textContent.trim());
    log(`mal escrito: ${wrong} · sigue guardado: ${box.has("QWERTY")}${box.has("QWERTY") ? "" : " ✗"}`);
    type(good);
    form.requestSubmit();
    const confirm = await until(() => d.querySelector("[data-confirm]"));
    log("confirmar: " + (confirm ? sheet().querySelector(".sheet-text").textContent.trim().slice(0, 70) + "…" : "no aparece ✗"));
    confirm.click(); await wait(1200);
    const after = store.getState().transactions.length;
    log(`recibido: ${after} movimientos (eran ${before})${after === before ? "" : " ✗"} · en ${w.location.hash} · borrado del servidor: ${!box.has("QWERTY")}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
