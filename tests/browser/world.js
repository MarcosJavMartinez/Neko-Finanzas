// Otros países, todo por la interfaz: en cada uno se empieza de cero, el
// asistente propone su moneda, se elige otra moneda con el tipo de cambio
// escrito a mano, se cargan cuentas en las dos y se registran movimientos.
// Se comprueba que el tipo de cambio quedó como se escribió, que el total
// cierra, que los datos son válidos y que en pantalla no hay nada raro.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const form = () => sheet()?.querySelector("form");
const change = (el, value) => { if (value !== undefined) el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
const next = async () => { form().requestSubmit(); await wait(280); };
const near = (a, b) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 1e-9);
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const M = await w.eval('import("/js/core/money.js")');
    const { sanitizeState } = await w.eval('import("/js/core/sanitize.js")');
    const { openSetupWizard } = await w.eval('import("/js/ui/forms/setupForm.js")');
    const tx = await w.eval('import("/js/ui/forms/transactionForm.js")');
    const acc = await w.eval('import("/js/ui/forms/accountForms.js")');
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])])) : v);

    // typed: lo que se escribe en "1 X = __"; unitInMain: cuánto debe valer 1 unidad de la otra moneda en la principal
    const cases = [
      { region: "ja-JP", main: "JPY", symbol: "¥", extra: "USD", typed: "150", unitInMain: 150, cents: false },
      { region: "en-GB", main: "GBP", symbol: "£", extra: "USD", typed: "1.25", unitInMain: 0.8, cents: true },
      { region: "es-CL", main: "CLP", symbol: "$", extra: "USD", typed: "950", unitInMain: 950, cents: false },
      { region: "en-EG", main: "EGP", symbol: "E£", extra: "EUR", typed: "55.5", unitInMain: 55.5, cents: true },
      { region: "es-VE", main: "VES", symbol: "Bs.", extra: "USD", typed: "200,5", unitInMain: 200.5, cents: true },
      { region: "es-MX", main: "MXN", symbol: "$", extra: "USD", typed: "18.7", unitInMain: 18.7, cents: true },
      { region: "ru-RU", main: "RUB", symbol: "₽", extra: "USD", typed: "95,5", unitInMain: 95.5, cents: true },
      { region: "es-CU", main: "CUP", symbol: "$", extra: "USD", typed: "400", unitInMain: 400, cents: true },
      { region: "en-US", main: "USD", symbol: "$", extra: "EUR", typed: "1.1", unitInMain: 1.1, cents: true },
      { region: "tr-TR", main: "TRY", symbol: "₺", extra: "GBP", typed: "52,5", unitInMain: 52.5, cents: true },
    ];
    for (const c of cases) {
      const bad = [];
      store.startFresh({ keepSetup: false }); await wait(200);
      for (let i = 0; i < 3 && sheet(); i++) { w.history.back(); await wait(350); }
      openSetupWizard(); await wait(500);

      // 1) País → propone su moneda y su forma de escribir los números
      change(form().elements["setup-region"], c.region); await wait(250);
      if (form().elements.currency.value !== c.main) bad.push(`moneda propuesta ${form().elements.currency.value}`);
      if (M.symbolOf(c.main) !== c.symbol) bad.push(`símbolo ${M.symbolOf(c.main)}`);
      if (M.usesCents() !== c.cents) bad.push(`centavos=${M.usesCents()}`);
      await next();

      // 2) Otra moneda con el tipo de cambio de hoy
      // Si la moneda no está entre las propuestas, se agrega desde el desplegable; las demás se desmarcan.
      if (!form().elements["cur-on-" + c.extra]) { change(form().elements["cur-add"], c.extra); await wait(250); }
      for (let i = 0; i < 6; i++) {
        const wrong = [...form().querySelectorAll("input[name^=cur-on-]")].find((el) => el.checked !== (el.name === "cur-on-" + c.extra));
        if (!wrong) break;
        wrong.click(); await wait(220);
      }
      const rate = form().elements["cur-rate-" + c.extra];
      if (!rate) bad.push("sin campo de tipo de cambio");
      else change(rate, c.typed);
      await next();

      // 3) Cuentas: la primera en la moneda del país y los ahorros en la otra
      const rows = [...form().querySelectorAll("input[name^=acc-amount-]")];
      if (rows.length !== 4) bad.push(`filas de cuentas=${rows.length}`);
      change(rows[0], "1000"); change(rows[rows.length - 1], "100");
      for (let i = 0; i < 12 && sheet()?.querySelector("form.setup"); i++) await next();
      await wait(500);

      let s = store.getState();
      const unit = M.convert(1, c.extra, c.main, s.rates);
      if (!near(unit, c.unitInMain)) bad.push(`1 ${c.extra} = ${unit} ${c.main}, esperaba ${c.unitInMain}`);
      if (s.settings.mainCurrency !== c.main || s.settings.region !== c.region) bad.push(`quedó ${s.settings.mainCurrency}/${s.settings.region}`);
      if (s.settings.currencies.slice().sort().join() !== [c.main, c.extra].sort().join()) bad.push(`monedas ${s.settings.currencies}`);
      let sum = F.balanceSummary(s);
      if (!near(sum.total, 1000 + 100 * c.unitInMain)) bad.push(`total ${sum.total}, esperaba ${1000 + 100 * c.unitInMain}`);

      // 4) Un gasto en cada moneda y una transferencia entre las dos
      const main0 = s.accounts.find((a) => a.currency === c.main), other = s.accounts.find((a) => a.currency === c.extra);
      tx.openTransactionForm({ type: "expense" }); await wait(400);
      change(form().elements.amount, "50"); await next();
      tx.openTransactionForm({ type: "expense", accountId: other.id }); await wait(400);
      change(form().elements.accountId, other.id); await wait(100);
      const cur = form().querySelector(`input[name=currency][value=${c.extra}]`);
      if (cur) cur.click();
      change(form().elements.amount, "10"); await next();
      acc.openTransferForm({ fromId: main0.id, toId: other.id }); await wait(400);
      change(form().elements.amount, "100"); await wait(150);
      const arrives = M.parseAmount(form().elements.toAmount?.value || "");
      if (!near(Math.round(arrives * 100) / 100, Math.round((100 / c.unitInMain) * 100) / 100)) bad.push(`transferir 100 ${c.main} sugiere ${form().elements.toAmount?.value} ${c.extra}`);
      await next();
      for (let i = 0; i < 3 && sheet(); i++) { w.history.back(); await wait(350); }

      s = store.getState(); sum = F.balanceSummary(s);
      const byAccount = F.accountBalances(s).reduce((t, e) => t + e.balanceMain, 0);
      const expected = 1000 + 100 * c.unitInMain - 50 - 10 * c.unitInMain - 100 + (Math.round((100 / c.unitInMain) * 100) / 100) * c.unitInMain;
      if (!near(sum.total, byAccount)) bad.push("total ≠ suma de cuentas");
      if (Math.abs(sum.total - expected) > Math.max(0.02, c.unitInMain * 0.011)) bad.push(`total tras movimientos ${sum.total}, esperaba ${expected}`);
      const clean = sanitizeState(JSON.parse(JSON.stringify(s))); clean.version = s.version;
      const raw = canon(JSON.parse(JSON.stringify(s))), fixed = canon(clean);
      for (const key of Object.keys(raw)) {
        const x = JSON.stringify(raw[key]), y = JSON.stringify(fixed[key]);
        if (x === y) continue;
        let at = 0; while (x[at] === y[at]) at++;
        bad.push(`datos inválidos en ${key}: …${x.slice(Math.max(0, at - 60), at + 40)}… → …${y.slice(Math.max(0, at - 10), at + 40)}…`);
      }

      // 5) Pantallas: nada raro, el símbolo del país a la vista y sin desborde
      for (const r of ["inicio", "transacciones", "cuentas", "monedas", "reportes"]) {
        w.location.hash = "#/" + r; await wait(300);
        const text = d.querySelector("#view").innerText;
        if (/NaN|undefined|\[object|Infinity/.test(text)) bad.push(`texto raro en ${r}`);
        if (d.documentElement.scrollWidth > w.innerWidth + 1) bad.push(`desborde en ${r}`);
      }
      w.location.hash = "#/inicio"; await wait(300);
      const hero = d.querySelector(".hero-amount, [data-pulse=available]")?.textContent || d.querySelector("#view").innerText.slice(0, 200);
      if (!hero.includes(c.symbol)) bad.push(`el disponible no muestra ${c.symbol}: ${hero.trim().slice(0, 30)}`);
      if (!c.cents && /[.,]\d{2}(?!\d)/.test(M.formatMoney(sum.available, c.main).replace(/[.,]\d{3}/g, ""))) bad.push("disponible con decimales en una moneda sin centavos");

      log(`${bad.length ? "✗" : "ok"} ${c.region} ${c.main} + ${c.extra} · 1 ${c.extra} = ${Math.round(unit * 10000) / 10000} ${c.main} · total ${M.formatMoney(sum.total, c.main)}${bad.length ? " · " + bad.join(" | ") : ""}`);
    }
    log("errores: " + (errs.length ? errs.join(" | ") : "ninguno"));
  } catch (e) { log("ERROR " + (e.stack || e.message)); }
})();
