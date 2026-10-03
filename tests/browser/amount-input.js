// Campos de monto: los puntos de miles los pone la app; el punto o la coma
// que se tipea es siempre el decimal. Se escribe con el teclado de verdad
// (execCommand dispara los mismos eventos que una tecla).
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const { parseAmount } = await w.eval('import("/js/core/money.js")');
    await store.resetEverything(); await wait(300);
    w.location.hash = "#/transacciones"; await wait(200); w.location.hash = "#/inicio"; await wait(400);
    d.querySelector("[data-action=add-expense]").click(); await wait(600);
    const input = sheet().querySelector("input[name=amount]");
    const type = (text) => { for (const ch of text) d.execCommand("insertText", false, ch); };
    const fresh = (text) => { input.focus(); input.value = ""; type(text); return input.value; };
    const cases = [
      ["1350000", "1.350.000", 1350000],
      ["1350,75", "1.350,75", 1350.75],
      ["20.5", "20,5", 20.5],
      ["1.350", "1,35", 1.35],
      ["12,3456", "12,34", 12.34],
      [",5", "0,5", 0.5],
      ["007", "7", 7],
      ["12a3", "123", 123],
      ["1,2,3", "12,3", 12.3],
    ];
    for (const [typed, shown, value] of cases) {
      const got = fresh(typed);
      log(`tipeo "${typed}" → "${got}" = ${parseAmount(got)}${got === shown && parseAmount(got) === value ? "" : ` ✗ (esperaba "${shown}")`}`);
    }
    // El cursor queda donde estaba al insertar en el medio y al borrar
    fresh("1350000");
    input.setSelectionRange(1, 1); type("9");
    log(`insertar en el medio: "${input.value}" cursor=${input.selectionStart}${input.value === "19.350.000" && input.selectionStart === 2 ? "" : " ✗"}`);
    fresh("1350000");
    d.execCommand("delete"); d.execCommand("delete");
    log(`borrar dos: "${input.value}"${input.value === "13.500" ? "" : " ✗"}`);
    fresh("1350");
    input.setSelectionRange(2, 2); d.execCommand("delete");
    log(`borrar sobre el punto de miles: "${input.value}" cursor=${input.selectionStart}${input.value === "350" && input.selectionStart === 0 ? "" : " ✗"}`);
    // Lo pegado se interpreta entero, venga como venga
    for (const [pasted, shown] of [["1,350,000", "1.350.000"], ["$ 1.350,75", "1.350,75"], ["470.250", "470.250"]]) {
      input.value = pasted;
      input.dispatchEvent(new w.InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
      log(`pego "${pasted}" → "${input.value}"${input.value === shown ? "" : " ✗"}`);
    }
    // Se guarda lo que se ve
    fresh("2500,5");
    sheet().querySelector("form").requestSubmit(); await wait(600);
    const saved = store.getState().transactions[0]?.amount;
    log(`guardado: ${saved}${saved === 2500.5 ? "" : " ✗"}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
