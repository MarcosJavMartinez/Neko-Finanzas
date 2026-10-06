// Campos de monto, como en un cajero: los números entran desde los centavos
// (0,01 → 0,15 → 1,50 → 15,00) y la coma y los puntos los pone la app. Se
// escribe con el teclado de verdad (execCommand dispara los mismos eventos
// que una tecla).
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const { parseAmount } = await w.eval('import("/js/core/money.js")');
    const { openBudgetForm } = await w.eval('import("/js/ui/forms/budgetForm.js")');
    const { openTransactionForm } = await w.eval('import("/js/ui/forms/transactionForm.js")');
    await store.resetEverything(); await wait(300);
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(400);
    d.querySelector("[data-action=add-expense]").click(); await wait(600);
    let input = sheet().querySelector("input[name=amount]");
    const type = (text) => { for (const ch of text) d.execCommand("insertText", false, ch); };
    const fresh = (text) => { input.focus(); input.value = ""; type(text); return input.value; };
    log(`vacío: valor="${input.value}" · se ve "${input.placeholder}"${input.value === "" && input.placeholder === "0,00" ? "" : " ✗"}`);

    // Número a número, como en el ejemplo: 1, 5, 0, 0, 0, 0
    input.focus(); input.value = "";
    const steps = [];
    for (const ch of "150000") { type(ch); steps.push(input.value); }
    const expected = ["0,01", "0,15", "1,50", "15,00", "150,00", "1.500,00"];
    log(`tipeo 1-5-0-0-0-0: ${steps.join(" → ")}${steps.join("|") === expected.join("|") ? "" : " ✗"}`);

    const cases = [
      ["135000000", "1.350.000,00", 1350000],
      ["135075", "1.350,75", 1350.75],
      ["20.5", "2,05", 2.05],
      ["12,34", "12,34", 12.34],
      ["007", "0,07", 0.07],
      ["12a3", "1,23", 1.23],
      ["000", "", NaN],
    ];
    for (const [typed, shown, value] of cases) {
      const got = fresh(typed);
      const parsed = parseAmount(got);
      log(`tipeo "${typed}" → "${got}"${got === shown && (Number.isNaN(value) ? Number.isNaN(parsed) : parsed === value) ? "" : ` ✗ (esperaba "${shown}")`}`);
    }

    // Borrar saca el último número; hasta quedar vacío
    fresh("1500");
    const erased = [];
    for (let i = 0; i < 4; i++) { d.execCommand("delete"); erased.push(input.value || "(vacío)"); }
    log(`borrar desde 15,00: ${erased.join(" → ")}${erased.join("|") === "1,50|0,15|0,01|(vacío)" ? "" : " ✗"}`);
    fresh("150000");
    input.setSelectionRange(2, 2); d.execCommand("delete");
    log(`borrar sobre el punto de miles: "${input.value}"${input.value === "150,00" ? "" : " ✗"}`);
    fresh("1500");
    input.setSelectionRange(1, 1); type("9");
    log(`tipear con el cursor en el medio: "${input.value}" cursor al final=${input.selectionStart === input.value.length}${input.value === "195,00" ? "" : " ✗"}`);

    // Lo pegado se interpreta entero, venga como venga
    for (const [pasted, shown] of [["1,350,000", "1.350.000,00"], ["$ 1.350,75", "1.350,75"], ["470.250", "470.250,00"]]) {
      input.value = pasted;
      input.dispatchEvent(new w.InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
      log(`pego "${pasted}" → "${input.value}"${input.value === shown ? "" : " ✗"}`);
    }

    // Se guarda lo que se ve, y al editar el monto vuelve con sus centavos
    fresh("250050");
    sheet().querySelector("form").requestSubmit(); await wait(700);
    const tx = store.getState().transactions[0];
    log(`guardado: ${tx?.amount}${tx?.amount === 2500.5 ? "" : " ✗"}`);
    openTransactionForm({ transaction: tx, id: tx.id, tx }); await wait(600);
    input = sheet().querySelector("input[name=amount]");
    if (input.value) {
      const prefilled = input.value;
      input.focus(); input.setSelectionRange(prefilled.length, prefilled.length); type("0");
      log(`al editar: "${prefilled}" + un 0 → "${input.value}"${prefilled === "2.500,50" && input.value === "25.005,00" ? "" : " ✗"}`);
    } else log("al editar: (el formulario abrió vacío, no se prueba)");
    sheet().querySelector("[data-sheet-close]").click(); await wait(500);

    // Presupuesto: el porcentaje se escribe tal cual; al pasar a monto, con centavos
    openBudgetForm(); await wait(500);
    const form = sheet().querySelector("form");
    input = form.elements.value;
    const pct = fresh("25");
    const pctDec = fresh("12,5");
    log(`porcentaje: "25" → "${pct}" · "12,5" → "${pctDec}"${pct === "25" && pctDec === "12,5" ? "" : " ✗"}`);
    fresh("25");
    form.querySelector("input[name=mode][value=fixed]").click(); await wait(150);
    const converted = input.value;
    input.focus(); input.setSelectionRange(converted.length, converted.length); type("0");
    log(`al pasar a "Por mes": "${converted}" + un 0 → "${input.value}"${converted === "25,00" && input.value === "250,00" ? "" : " ✗"}`);
    form.querySelector("input[name=mode][value=percent]").click(); await wait(150);
    log(`de vuelta a porcentaje: "${input.value}"${input.value === "250" ? "" : " ✗"}`);
    sheet().querySelector("[data-sheet-close]").click(); await wait(500);

    // Sin centavos (Configuración): se escriben pesos enteros
    w.localStorage.setItem("nekoFinanzas.amountCents", "off");
    openTransactionForm({ type: "expense" }); await wait(600);
    input = sheet().querySelector("input[name=amount]");
    const refocus = (value) => { input.value = value; input.focus(); input.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true })); };
    refocus("");
    const whole = [];
    for (const ch of "1500") { type(ch); whole.push(input.value); }
    log(`sin centavos, tipeo 1-5-0-0: ${whole.join(" → ")} · se ve "${input.placeholder}"${whole.join("|") === "1|15|150|1.500" && input.placeholder === "0" ? "" : " ✗"}`);
    d.execCommand("delete");
    log(`sin centavos, borrar: "${input.value}"${input.value === "150" ? "" : " ✗"}`);
    refocus("2.000,00");
    const stripped = input.value; type("5");
    log(`sin centavos, monto ya cargado: "${stripped}" + un 5 → "${input.value}"${stripped === "2.000" && input.value === "20.005" ? "" : " ✗"}`);
    refocus("2.500,50"); type("0");
    log(`sin centavos, monto que traía centavos: "${input.value}"${input.value === "25.005,00" ? "" : " ✗"}`);
    refocus(""); type("1500");
    sheet().querySelector("form").requestSubmit(); await wait(700);
    const wholeTx = store.getState().transactions.find((t) => t.amount === 1500);
    log(`sin centavos, guardado: ${wholeTx?.amount}${wholeTx ? "" : " ✗"}`);
    w.localStorage.removeItem("nekoFinanzas.amountCents");
    sheet()?.querySelector("[data-sheet-close]")?.click(); await wait(500);

    // Lo que se calcula mientras se escribe usa el monto ya acomodado
    const card = store.saveAccount({ name: "Visa", kind: "credit", currency: "ARS", opening: 0, closingDay: 25, dueDay: 5, icon: "💳", color: "#7651e8" });
    openTransactionForm({ type: "expense" }); await wait(600);
    const txForm = sheet().querySelector("form");
    txForm.elements.accountId.value = card.id;
    txForm.elements.accountId.dispatchEvent(new w.Event("change", { bubbles: true }));
    txForm.elements.installments.value = "3";
    txForm.elements.installments.dispatchEvent(new w.Event("change", { bubbles: true }));
    input = txForm.elements.amount;
    input.focus(); input.value = ""; type("30000");
    const hint = txForm.querySelector("[data-installments-hint]").textContent;
    log(`cuotas en vivo: "${input.value}" → ${hint.slice(0, 22)}${input.value === "300,00" && /3 cuotas de ≈ \$\s?100\b/.test(hint) ? "" : " ✗ (" + hint + ")"}`);
    sheet().querySelector("[data-sheet-close]").click(); await wait(500);

    // Cuenta en rojo: el signo no se tipea, se marca con un interruptor
    const { openAccountForm } = await w.eval('import("/js/ui/forms/accountForms.js")');
    openAccountForm(); await wait(500);
    const acc = sheet().querySelector("form");
    acc.elements.name.value = "Descubierto";
    input = acc.elements.opening;
    fresh("5000000");
    acc.elements.openingNegative.click();
    acc.requestSubmit(); await wait(600);
    const red = store.getState().accounts.find((x) => x.name === "Descubierto");
    log(`cuenta en rojo: saldo inicial ${red?.opening}${red?.opening === -50000 ? "" : " ✗"}`);
    openAccountForm({ account: red }); await wait(500);
    const again = sheet().querySelector("form");
    log(`al editarla: "${again.elements.opening.value}" · en rojo=${again.elements.openingNegative.checked}${again.elements.opening.value === "50.000,00" && again.elements.openingNegative.checked ? "" : " ✗"}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
