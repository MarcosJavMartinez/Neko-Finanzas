// ¿A dónde va tu dinero?: la cuenta cierra con el inicio, cada cosa reservada
// aparece en su grupo y lo del mes se cuenta en frases (deuda en otra moneda
// incluida).
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const M = await w.eval('import("/js/core/money.js")');
    store.loadDemo(); await wait(200);
    const main = store.getState().settings.mainCurrency;
    const owed = store.addLoan({ direction: "borrowed", person: "Gabriel", amount: 450, currency: "USD", accountId: "", saveMonthly: 60 });
    store.addLoanPayment(owed.id, { amount: 50, accountId: store.defaultAccountId(), accountAmount: 70000 });
    await wait(200);

    // Desde el inicio, "reservados para…" lleva a la pantalla
    w.location.hash = "#/inicio"; await wait(400);
    const link = d.querySelector(".avail-reserve");
    log("inicio: enlace " + (link?.getAttribute("href") === "#/tu-dinero" ? "a la pantalla" : `${link?.getAttribute("href")} ✗`));
    link.click(); await wait(500);

    const s = F.balanceSummary(store.getState());
    const lines = [...d.querySelectorAll(".flow-sum .flow-line dd")].map((e) => e.textContent.trim());
    const want = [M.formatMoney(s.total, main), "− " + M.formatMoney(s.inGoals, main), "− " + M.formatMoney(s.reserved, main), M.formatMoney(s.available, main)];
    log("cuenta: " + lines.join(" | ") + (JSON.stringify(lines) === JSON.stringify(want) ? "" : " ✗ esperaba " + want.join(" | ")));

    const groups = [...d.querySelectorAll(".flow-group")].map((g) => g.firstElementChild.textContent.trim());
    log("grupos: " + groups.join(", ") + (["Facturas", "Deudas", "Metas"].every((g) => groups.includes(g)) ? "" : " ✗"));
    const rows = [...d.querySelectorAll(".flow-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim());
    const gab = rows.filter((r) => r.includes("Gabriel"));
    log("Gabriel: " + gab.join(" | ") + (gab.some((r) => r.includes("apartados para devolverle")) && gab.some((r) => r.includes("te costó")) && gab.some((r) => r.includes("Se apartaron")) ? "" : " ✗"));
    log("del mes: " + rows.filter((r) => r.includes("se usaron en")).length + " gastos · ej.: " + (rows.find((r) => r.includes("se usaron en")) || "ninguno ✗"));

    // Tocar una fila abre su detalle
    d.querySelector(".flow-row[data-action=loan-detail]").click(); await wait(600);
    const sheet = [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
    log("tocar abre: " + (sheet?.querySelector(".sheet-title")?.textContent.trim() || "nada ✗"));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
