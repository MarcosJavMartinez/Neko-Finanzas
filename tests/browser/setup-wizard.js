// Cuestionario de inicio completo: los 7 pasos por la interfaz, validaciones
// y que al final quede cargado exactamente lo respondido.
const w = f.contentWindow, d = w.document, log = (m) => w.console.log("CHECK " + m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; w.addEventListener("error", (e) => errs.push(e.message)); w.addEventListener("unhandledrejection", (e) => errs.push("promesa " + (e.reason?.message || e.reason)));
const sheet = () => [...d.querySelectorAll(".sheet-root:not(.is-closing)")].pop();
const form = () => sheet().querySelector("form.setup");
const type = (name, value) => { const el = form().elements[name]; el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
const next = async () => { form().requestSubmit(); await wait(250); };
const step = () => `${Number(form().dataset.step) + 1}: ${form().querySelector(".setup-title").textContent}`;
const error = () => { const e = form().querySelector("[data-setup-error]"); return e.hidden ? "" : e.textContent; };
return (async () => {
  try {
    const store = await w.eval('import("/js/core/store.js")');
    const F = await w.eval('import("/js/core/finance.js")');
    const D = await w.eval('import("/js/core/dates.js")');
    const { sanitizeState } = await w.eval('import("/js/core/sanitize.js")');
    const { openSetupWizard } = await w.eval('import("/js/ui/forms/setupForm.js")');
    await store.resetEverything(); await wait(300);
    openSetupWizard(); await wait(500);

    // 1) Lo básico
    log("paso " + step());
    type("salary", "abc"); await next();
    log("sueldo inválido: " + (error() || "sin error ✗") + " · sigue en el paso " + (Number(form().dataset.step) + 1));
    type("salary", "900.000"); await next();

    // 2) Cuentas (escribir el monto marca la cuenta)
    log("paso " + step());
    type("acc-amount-0", "50.000");
    type("acc-amount-1", "400.000");
    type("acc-amount-3", "500");
    log("se marcan solas: " + [0, 1, 2, 3].map((i) => form().elements[`acc-on-${i}`].checked).join(","));
    await next();

    // 3) Tarjeta y cuotas
    log("paso " + step());
    await next();
    log("sin tarjeta se puede seguir: paso " + (Number(form().dataset.step) + 1));
    form().querySelector("[data-setup=back]").click(); await wait(250);
    form().elements["card-on"].click(); await wait(100);
    log("campos de tarjeta visibles: " + !form().querySelector("[data-card-box]").hidden);
    type("card-name", "Visa");
    type("card-debt", "80.000");
    form().elements["card-due"].value = "10";
    type("pur-what-0", "Heladera"); type("pur-per-0", "30.000"); type("pur-left-0", "abc");
    await next();
    log("cuotas inválidas: " + (error() || "sin error ✗"));
    type("pur-left-0", "4");
    form().querySelector("[data-setup=add-purchase]").click(); await wait(250);
    log("al agregar otra compra se conserva lo escrito: " + (form().elements["pur-what-0"].value === "Heladera" && form().elements["card-name"].value === "Visa"));
    type("pur-what-1", "Celular"); type("pur-per-1", "20.000"); type("pur-left-1", "1");
    await next();

    // 4) Facturas
    log("paso " + step());
    form().elements["bill-on-0"].click();
    await next();
    log("factura marcada sin monto: " + (error() || "sin error ✗"));
    type("bill-amount-0", "250.000"); form().elements["bill-day-0"].value = "5";
    type("bill-amount-4", "27.000"); form().elements["bill-day-4"].value = "31";
    await next();

    // 5) Préstamos
    log("paso " + step());
    type("loan-amount-0", "10.000"); await next();
    log("préstamo sin nombre: " + (error() || "sin error ✗"));
    type("loan-person-0", "Caro");
    form().querySelector("[data-setup=add-loan]").click(); await wait(250);
    form().querySelector("input[name='loan-dir-1'][value=borrowed]").click();
    type("loan-person-1", "Papá"); type("loan-amount-1", "60.000");
    form().elements["loan-due-1"].value = D.addDays(D.todayISO(), 10);
    await next();

    // 6) Metas
    log("paso " + step());
    type("goal-name-0", "Vacaciones"); type("goal-target-0", "300.000"); type("goal-saved-0", "40.000");
    await next();

    // 7) Resumen, ir atrás y volver sin perder nada
    log("paso " + step());
    log("resumen: " + [...form().querySelectorAll(".setup-summary li")].map((li) => li.innerText.replace(/\s+/g, " ").trim()).join(" | "));
    form().querySelector("[data-setup=back]").click(); await wait(250);
    log("atrás conserva la meta: " + form().elements["goal-name-0"].value);
    await next();
    await next(); await wait(700);

    // Resultado
    const s = store.getState();
    const today = D.todayISO();
    const sum = F.balanceSummary(s);
    log("hoja cerrada=" + !sheet() + " · pantalla=" + d.querySelector("#view").dataset.screen + " · aviso: " + ([...d.querySelectorAll(".toast")].pop()?.textContent.trim().split("\n")[0] || "ninguno ✗"));
    log("cuentas: " + s.accounts.map((a) => `${a.name} ${a.currency} ${a.opening}`).join(" · "));
    log("la primera cuenta reemplazó a «Mi plata»: " + (s.accounts.length === 4 && !s.accounts.some((a) => a.name === "Mi plata") ? "sí" : "NO ✗"));
    const card = s.accounts.find((a) => a.kind === "credit");
    const st = F.cardStatus(s, card, today);
    log(`tarjeta: ${card.name} deuda=${st.debt} vence día ${card.dueDay} · por venir=${st.upcomingTotal} en ${st.upcoming.map((g) => `${g.title} ${g.remaining}/${g.of}`).join(", ")}${st.debt === 80000 && st.upcomingTotal === 140000 ? "" : " ✗"}`);
    log("facturas: " + s.bills.map((b) => `${b.name} ${b.amount} vence ${b.dueDate} (día ${b.dueDay})`).join(" · ") + (s.bills.every((b) => b.dueDate >= today && b.recurring) && s.bills.length === 2 ? "" : " ✗"));
    const loans = F.loansSummary(s);
    log(`préstamos: te deben ${loans.lent} · debés ${loans.borrowed} · movieron plata=${s.transactions.some((t) => t.type === "loan")}${loans.lent === 10000 && loans.borrowed === 60000 ? "" : " ✗"}`);
    log("meta: " + s.goals.map((g) => `${g.name} ${F.goalSaved(g)}/${g.target}`).join(", ") + (F.goalSaved(s.goals[0]) === 40000 ? "" : " ✗"));
    log(`referencia=${s.settings.budgetReference} · total=${Math.round(sum.total)} · reservado=${Math.round(sum.reserved)} (facturas ${Math.round(sum.reserve.amount)}, cuotas ${Math.round(sum.scheduled.amount)}, deudas ${Math.round(sum.debts.amount)}) · en metas=${Math.round(sum.inGoals)} · disponible=${Math.round(sum.available)}`);
    // Pasarlos por la validación no cambia nada (sin importar el orden de los campos).
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])])) : v);
    const clean = sanitizeState(JSON.parse(JSON.stringify(s)));
    clean.version = s.version;
    log("datos válidos: " + (JSON.stringify(canon(clean)) === JSON.stringify(canon(JSON.parse(JSON.stringify(s)))) ? "sí" : "NO ✗"));

    // Deshacer vuelve a la app vacía
    [...d.querySelectorAll(".toast-action")].pop()?.click(); await wait(400);
    log("deshacer: vacía de nuevo=" + store.isEmptyState());

    // Todo vacío: no carga nada y no rompe
    openSetupWizard(); await wait(500);
    for (let i = 0; i < 6; i++) await next();
    log("sin responder nada: " + (form().querySelector(".notice-info")?.innerText.trim().slice(0, 28) || "sin aviso ✗"));
    await next(); await wait(600);
    log("app sigue vacía=" + store.isEmptyState() + " · cuentas=" + store.getState().accounts.length);

    // Desde Configuración, con datos: se suma a lo que hay
    store.loadDemo(); await wait(200);
    const before = store.getState().accounts.length;
    w.location.hash = "#/ajustes"; await wait(400);
    d.querySelector("#view [data-action=setup-wizard]").click(); await wait(500);
    log("desde Configuración: " + (form() ? "abre · " + (/se suma a lo que ya tenés/.test(form().innerText) ? "avisa que se suma" : "sin aviso ✗") : "NO ✗"));
    await next();
    type("acc-amount-2", "1.000");
    for (let i = 0; i < 6; i++) await next();
    await wait(600);
    log(`con datos: cuentas ${before} → ${store.getState().accounts.length} (no pisa la principal)${store.getState().accounts.length === before + 1 ? "" : " ✗"}`);
    log("errores: " + (errs.join(" | ") || "ninguno"));
  } catch (e) {
    log("ERROR " + e.stack);
  }
})();
