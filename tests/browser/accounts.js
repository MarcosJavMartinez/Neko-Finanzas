// Cuentas y transferencias desde la interfaz real.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const { transactionsToCSV } = await w.eval('import("/js/core/csv.js")');
    const bal = (id) => Math.round(F.accountBalance(store.getState(), id).balance * 100) / 100;
    const total = () => Math.round(F.totalBalance(store.getState()));
    store.loadDemo(); await wait(200);
    const s0 = store.getState();
    const [bank, cash, wallet, usd] = s0.accounts.map((a) => a.id);

    // 1) Inicio: tarjeta de cuentas
    w.location.hash = "#/inicio"; await wait(400);
    const homeRows = d.querySelectorAll("#view .account-row");
    const sumAccounts = Math.round(F.accountBalances(store.getState()).reduce((s, e) => s + e.balanceMain, 0));
    log(`inicio: ${homeRows.length} cuentas · total=${total()} suma de cuentas=${sumAccounts}${total() === sumAccounts ? "" : " ✗"}`);

    // 2) Transferir en la misma moneda (desde la pantalla Cuentas)
    w.location.hash = "#/cuentas"; await wait(400);
    log("pantalla cuentas: " + d.querySelectorAll("#view .account-row").length + " filas · " + d.querySelector(".summary-amount").textContent);
    const t0 = total(), b0 = bal(bank), c0 = bal(cash);
    d.querySelector("#view [data-action=add-transfer]").click(); await wait(500);
    let form = sheet().querySelector("form");
    form.elements.fromId.value = bank; form.elements.fromId.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.toId.value = cash; form.elements.toId.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.amount.value = "10.000"; form.elements.amount.dispatchEvent(new Event("input", { bubbles: true }));
    log("misma moneda, campo 'llega' oculto: " + form.querySelector("[data-to-amount]").hidden);
    form.requestSubmit(); await wait(500);
    log(`transferencia: banco ${b0}→${bal(bank)} · efectivo ${c0}→${bal(cash)} · total igual=${total() === t0 ? "sí" : "NO ✗"}`);

    // 3) Transferir a dólares (otra moneda, con el tipo de cambio sugerido)
    d.querySelector("#view [data-action=add-transfer]").click(); await wait(500);
    form = sheet().querySelector("form");
    form.elements.toId.value = usd; form.elements.toId.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.amount.value = "135000"; form.elements.amount.dispatchEvent(new Event("input", { bubbles: true }));
    log(`a dólares: campo 'llega' visible=${!form.querySelector("[data-to-amount]").hidden} · sugerido=${form.elements.toAmount.value}`);
    form.elements.toAmount.value = "90"; form.elements.toAmount.dispatchEvent(new Event("input", { bubbles: true }));
    const u0 = bal(usd);
    form.requestSubmit(); await wait(500);
    log(`dólares: ${u0} → ${bal(usd)} USD`);

    // 4) Validación: misma cuenta
    d.querySelector("#view [data-action=add-transfer]").click(); await wait(500);
    form = sheet().querySelector("form");
    form.elements.toId.value = form.elements.fromId.value; form.elements.toId.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.amount.value = "100";
    form.requestSubmit(); await wait(200);
    log("misma cuenta: " + (form.querySelector('[data-error-for="amount"]').textContent || "sin error ✗"));
    sheet().querySelector("[data-sheet-close]").click(); await wait(400);

    // 5) Nueva cuenta en USD con saldo inicial
    d.querySelector("#view [data-action=add-account]").click(); await wait(500);
    form = sheet().querySelector("form");
    form.elements.name.value = "Caja de ahorro USD";
    form.querySelector("input[name=kind][value=savings]").click();
    form.querySelector("input[name=currency][value=USD]").click(); await wait(50);
    form.elements.opening.value = "1.000";
    log("moneda del saldo sigue a la elegida: " + form.querySelector('[data-currency-for="opening"]').textContent);
    form.requestSubmit(); await wait(500);
    const created = store.getState().accounts.find((a) => a.name === "Caja de ahorro USD");
    log(`cuenta creada: ${created ? `${created.currency} ${created.opening} ${created.kind}` : "NO ✗"}`);

    // 6) Gasto desde el formulario eligiendo cuenta
    const cashBefore = bal(cash);
    d.querySelector("#view") && w.dispatchEvent(new Event("neko:rerender"));
    const { openTransactionForm } = await w.eval('import("/js/ui/forms/transactionForm.js")');
    openTransactionForm({ type: "expense" }); await wait(500);
    form = sheet().querySelector("form");
    log("selector de cuenta en el gasto: " + (form.elements.accountId ? form.elements.accountId.options.length + " opciones" : "NO ✗"));
    form.elements.accountId.value = cash;
    form.elements.amount.value = "2500";
    form.requestSubmit(); await wait(500);
    log(`gasto en efectivo: ${cashBefore} → ${bal(cash)}`);
    openTransactionForm({ type: "expense" }); await wait(500);
    log("recuerda la última cuenta: " + (sheet().querySelector("form").elements.accountId.value === cash ? "sí" : "NO ✗"));
    sheet().querySelector("[data-sheet-close]").click(); await wait(400);

    // 7) Borrar / archivar
    const { openAccountForm } = await w.eval('import("/js/ui/forms/accountForms.js")');
    openAccountForm({ account: store.getState().accounts.find((a) => a.id === bank) }); await wait(500);
    log("cuenta con movimientos: botón eliminar=" + !!sheet().querySelector("[data-form-delete]") + " · moneda bloqueada=" + !sheet().querySelector("input[name=currency]"));
    sheet().querySelector("[data-sheet-close]").click(); await wait(400);
    try { store.deleteAccount(bank); log("borrar con movimientos: PERMITIDO ✗"); } catch (e) { log("borrar con movimientos: " + e.message); }
    store.saveAccount({ ...created, archived: true });
    openTransactionForm({ type: "expense" }); await wait(500);
    const opts = [...sheet().querySelector("form").elements.accountId.options].map((o) => o.value);
    log("archivada fuera del selector: " + (!opts.includes(created.id) ? "sí" : "NO ✗"));
    sheet().querySelector("[data-sheet-close]").click(); await wait(400);
    store.deleteAccount(created.id);
    log("cuenta sin movimientos borrada: " + !store.getState().accounts.some((a) => a.id === created.id));

    // 8) Pagar una factura desde otra cuenta
    const { openPayBill } = await w.eval('import("/js/ui/forms/billForms.js")');
    const bill = store.getState().bills.find((b) => b.recurring);
    const walletBefore = bal(wallet);
    openPayBill(bill.id); await wait(500);
    form = sheet().querySelector("form");
    form.elements.accountId.value = wallet;
    form.requestSubmit(); await wait(500);
    log(`factura pagada desde la billetera: ${walletBefore} → ${bal(wallet)}`);

    // 9) Transacciones: filtro por cuenta, transferencias neutras
    w.location.hash = "#/transacciones"; await wait(400);
    d.querySelector("[data-action=tx-filter][data-value=transfer]")?.click(); await wait(300);
    const rows = [...d.querySelectorAll("#view .tx-row")];
    log(`filtro transferencias: ${rows.length} filas · todas neutras=${rows.every((r) => r.querySelector(".is-transfer"))}`);
    d.querySelector("[data-action=tx-filter][data-value=all]").click(); await wait(300);
    const transferRow = d.querySelector("#view .tx-transfer");
    transferRow?.click(); await wait(500);
    log("tocar una transferencia abre: " + (sheet()?.querySelector(".sheet-title")?.textContent || "nada ✗"));
    sheet()?.querySelector("[data-sheet-close]")?.click(); await wait(400);

    // 10) CSV
    const csv = transactionsToCSV(store.getState()).trim().split("\r\n");
    const tr = csv.find((l) => l.includes(";Transferencia;"));
    log("csv encabezado: " + csv[0].slice(1, 60) + " · transferencia: " + tr + (tr?.endsWith(";") ? "" : " ✗"));
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
