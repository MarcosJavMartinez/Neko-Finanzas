const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const root = d.documentElement;
const tok = (n) => w.getComputedStyle(root).getPropertyValue(n).trim();
function lum(h) { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
(async () => {
  try {
    const bg = await w.eval('import("/js/ui/background.js")');
    const theme = await w.eval('import("/js/ui/theme.js")');
    const store = await w.eval('import("/js/core/store.js")');
    const rows = []; if (false)
    for (const t of ["light", "dark"]) {
      theme.setThemePreference(t);
      for (const p of [...bg.PALETTES.map((x) => x.id), "custom-amarillo", "custom-blanco", "custom-negro"]) {
        if (p.startsWith("custom")) bg.setCustomColor({ "custom-amarillo": "#ffee00", "custom-blanco": "#ffffff", "custom-negro": "#000000" }[p]);
        else bg.setPalette(p);
        const surface = t === "dark" ? "#172622" : "#ffffff";
        const action = tok("--action"), ink = tok("--brand-ink"), tabInk = tok("--tab-active-ink");
        const header = (tok("--header-gradient").match(/#[0-9a-f]{6}/gi) || [])[1];
        const c1 = cr(action, "#ffffff"), c2 = cr(ink, surface), c3 = cr(tabInk, "#ffffff"), c4 = header ? cr(header, "#ffffff") : 0;
        const ok = c1 >= (t === "dark" ? 3.5 : 4.5) && c2 >= 4.5 && c3 >= 4.5 && c4 >= 3;
        rows.push(`${t}/${p}: botón ${c1.toFixed(1)} · texto marca ${c2.toFixed(1)} · pestaña ${c3.toFixed(1)} · header ${c4.toFixed(1)}${ok ? "" : " ✗"}`);
      }
    }
    bg.setPalette("cian"); theme.setThemePreference("light");
    log("cian sin estilos en línea: " + (root.getAttribute("style") || "(ninguno)") + " · meta=" + d.querySelector('meta[name="theme-color"]').content);

    // Valores maliciosos guardados a mano
    w.localStorage.setItem("nekoFinanzas.palette", "custom");
    w.localStorage.setItem("nekoFinanzas.customColor", 'red;} body{display:none');
    w.localStorage.setItem("nekoFinanzas.bgColor", "url(javascript:alert(1))");
    w.localStorage.setItem("nekoFinanzas.bgImage", "<img onerror=alert(1)>");
    w.NekoAppearance.apply();
    log("maliciosos: style=" + (root.getAttribute("style") || "(ninguno)") + " data-bg=" + root.dataset.bg + " body visible=" + (w.getComputedStyle(d.body).display !== "none"));
    w.localStorage.setItem("nekoFinanzas.palette", "__proto__"); w.NekoAppearance.apply();
    log("palette __proto__: style=" + (root.getAttribute("style") || "(ninguno)") + " getPalette=" + bg.getPalette());
    ["palette", "customColor", "bgColor", "bgImage"].forEach((k) => w.localStorage.removeItem("nekoFinanzas." + k)); w.NekoAppearance.apply();

    // Fondo
    bg.setBgColor("#223344");
    log("color de fondo: --bg=" + tok("--bg") + " data-bg=" + root.dataset.bg + " data-bg-color=" + root.hasAttribute("data-bg-color"));
    await bg.setBackground("pattern");
    log("patrón: data-bg=" + root.dataset.bg + " --bg=" + tok("--bg") + " color=" + root.hasAttribute("data-bg-color"));
    await bg.setBackground("none");
    log("sin imagen: " + root.dataset.bg + " · before bg-image=" + w.getComputedStyle(d.body, "::before").backgroundImage);
    // UI de Configuración
    w.location.hash = "#/ajustes"; await wait(400);
    log("swatches=" + d.querySelectorAll(".palette-swatch").length + " marcado=" + d.querySelector("input[name=palette]:checked")?.value + " fondos=" + d.querySelectorAll(".bg-option").length);
    d.querySelector("input[name=palette][value=uva]").click(); await wait(200);
    log("clic en uva: --brand=" + tok("--brand") + " guardado=" + w.localStorage.getItem("nekoFinanzas.palette") + " marcado=" + d.querySelector("input[name=palette]:checked")?.value);
    const cc = d.querySelector("input[type=color][data-change=set-custom-color]");
    cc.value = "#12ab34"; cc.dispatchEvent(new Event("input", { bubbles: true })); await wait(50);
    log("arrastrando color propio: --brand=" + tok("--brand"));
    cc.dispatchEvent(new Event("change", { bubbles: true })); await wait(200);
    log("color propio: custom marcado=" + !!d.querySelector(".palette-swatch-custom.is-checked"));
    d.querySelector("input[name=bg][value=none]").click(); await wait(300);
    log("fondo sin imagen desde UI: " + root.dataset.bg);
    bg.setPalette("cian"); await bg.setBackground("pattern");

    // Animaciones
    w.location.hash = "#/inicio"; await wait(400);
    store.addTransaction({ type: "expense", amount: 1234, currency: "ARS", date: "2026-09-30", categoryId: "exp-otros", description: "Nuevo" });
    await wait(100);
    log("latidos tras gasto: " + [...d.querySelectorAll(".pulse")].map((e) => e.dataset.pulse).join(",") + " · fila nueva=" + !!d.querySelector(".tx-row.is-new"));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) { log("ERROR " + e.stack); }
})();
