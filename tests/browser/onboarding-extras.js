const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
(async () => {
  try {
    await wait(800);
    let s = sheet();
    log("tutorial al abrir por primera vez: " + (s ? s.querySelector(".sheet-title").textContent : "NO"));
    const steps = [];
    for (let i = 0; i < 4; i++) {
      const vis = s.querySelector(".ob-step:not([hidden]) .ob-title").textContent;
      const btns = [...s.querySelectorAll("[data-ob]")].filter((b) => !b.hidden).map((b) => b.textContent.trim());
      steps.push(`${vis} [${btns.join("/")}]`);
      if (i < 3) { s.querySelector("[data-ob=next]").click(); await wait(80); }
    }
    log("pasos: " + steps.join(" → "));
    s.querySelector("[data-ob=next]").click(); await wait(400);
    log("tras 'Explorar': abierto=" + !!sheet() + " visto=" + w.localStorage.getItem("nekoFinanzas.onboardingSeen") + " demo=" + JSON.parse(w.localStorage.getItem("nekoFinanzas.data.v1")).settings.isDemo);

    // Ojito
    const heroTxt = () => d.querySelector(".hero-amount").textContent;
    const before = heroTxt();
    d.querySelector(".hero-eye").click(); await wait(200);
    const digits = (d.querySelector("#view").innerText.match(/\$ ?\d[\d.]*/g) || []);
    log(`ojito: ${before} → ${heroTxt()} · pressed=${d.querySelector(".hero-eye").getAttribute("aria-pressed")} · montos visibles en inicio: ${digits.length}`);
    w.location.hash = "#/transacciones"; await wait(300);
    log("transacciones ocultas: " + ((d.querySelector("#view").innerText.match(/\$ ?\d[\d.]*/g) || []).slice(0, 3).join(",") || "ninguno") + " · ejemplo: " + d.querySelector(".tx-amount, [class*=amount]")?.textContent.trim());
    w.location.hash = "#/reportes"; await wait(300);
    log("reportes ocultos: " + ((d.querySelector("#view").innerText.match(/\$ ?\d[\d.]*/g) || []).slice(0, 3).join(",") || "ninguno"));
    w.location.hash = "#/ajustes"; await wait(300);
    const sw = d.querySelector("[data-change=set-hide-amounts]");
    log("config ocultar montos marcado=" + sw.checked);
    sw.click(); await wait(200);
    w.location.hash = "#/inicio"; await wait(300);
    log("desactivado desde config: hero=" + heroTxt() + " guardado=" + w.localStorage.getItem("nekoFinanzas.hideAmounts"));

    // Más: cómo funciona y compartir
    w.location.hash = "#/mas"; await wait(300);
    log("más: " + [...d.querySelectorAll(".more-title")].map((e) => e.textContent).join(", "));
    let shared = null; w.navigator.share = async (data) => { shared = data; };
    d.querySelector("[data-action=share-app]").click(); await wait(200);
    log("compartir: " + JSON.stringify(shared));
    d.querySelector("[data-action=show-onboarding]").click(); await wait(400);
    s = sheet();
    log("tutorial desde Más: " + (s ? [...s.querySelectorAll("[data-ob]")].map((b) => b.dataset.ob + (b.hidden ? "(oculto)" : "")).join(",") : "NO"));
    d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(400);

    // Resumen como imagen
    const mod = await w.eval('import("/js/ui/summaryImage.js")');
    const store = await w.eval('import("/js/core/store.js")');
    const canvas = await mod.drawMonthSummary(store.getState(), "2026-09");
    log(`imagen: ${canvas.width}x${canvas.height} · png ${Math.round(canvas.toDataURL().length / 1024)} KB`);
    w.location.hash = "#/reportes"; await wait(300);
    w.navigator.canShare = () => false;
    d.querySelector("[data-action=share-summary]").click(); await wait(1500);
    log("toast tras compartir resumen: " + [...d.querySelectorAll(".toast")].map((t) => t.textContent.trim()).join(" | "));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) { log("ERROR " + e.stack); }
})();
