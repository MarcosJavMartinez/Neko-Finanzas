// Punto de entrada: inicia el estado, el router por hash (#/inicio, …), la
// delegación de eventos y el service worker.
//
// Cada pantalla (js/screens) exporta { id, tab, title, back?, wide?,
// search?, render, actions?, changes?, inputs? }. Los botones usan data-action="…" y los inputs
// data-change="…": se busca primero en la pantalla actual y después en las
// acciones globales de abajo. Si un handler devuelve true, se redibuja.

import * as store from "./core/store.js";
import { requestPersistence, STORAGE_KEY, onRemoteChange } from "./core/storage.js";
import { html, setHTML, $, prefersReducedMotion } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { toast } from "./ui/toast.js";
import { confirmDialog, whenHistorySettled } from "./ui/sheet.js";
import { initChartTooltips } from "./ui/charts.js";
import { formatMoney, setMasked, isMasked } from "./core/money.js";
import { openTransactionForm } from "./ui/forms/transactionForm.js";
import { openBillForm, openBillDetail, openPayBill } from "./ui/forms/billForms.js";
import { openGoalForm, openGoalDetail } from "./ui/forms/goalForms.js";
import { openBudgetForm } from "./ui/forms/budgetForm.js";
import { openLeftoverSheet } from "./ui/forms/leftoverForm.js";
import { openCategoryForm } from "./ui/forms/categoryForm.js";
import { openAccountForm, openTransferForm, openAccountDetail } from "./ui/forms/accountForms.js";
import { openLoanForm, openLoanDetail } from "./ui/forms/loanForms.js";
import { openIncomeConfirm } from "./ui/forms/incomeConfirm.js";
import { openIncomeExtras } from "./ui/forms/incomeExtras.js";
import { watchSystemTheme, applySavedTheme } from "./ui/theme.js";
import { showCustomImage } from "./ui/background.js";
import { canPromptInstall, promptInstall, onInstallChange, openInstallHelp } from "./ui/install.js";
import { downloadFile } from "./ui/download.js";
import { saveBackup, initBackupFile } from "./ui/backupFile.js";
import { syncPlan, fireDue } from "./ui/reminders.js";
import { snoozeIosNotice, markBackup, snoozeBackupReminder, amountsHidden, setAmountsHidden, onboardingSeen, markOnboardingSeen } from "./core/prefs.js";
import { openOnboarding } from "./ui/onboarding.js";
import { openSetupWizard } from "./ui/forms/setupForm.js";
import { transactionsToCSV } from "./core/csv.js";
import { todayISO } from "./core/dates.js";

import home from "./screens/home.js";
import transactions from "./screens/transactions.js";
import goals from "./screens/goals.js";
import more from "./screens/more.js";
import accounts from "./screens/accounts.js";
import loans from "./screens/loans.js";
import bills from "./screens/bills.js";
import budgets from "./screens/budgets.js";
import reports from "./screens/reports.js";
import categories from "./screens/categories.js";
import currencies from "./screens/currencies.js";
import settings, { settingsCalc, settingsLook, settingsDevice, settingsData } from "./screens/settings.js";

const SCREENS = [home, transactions, goals, more, accounts, loans, bills, budgets, reports, categories, currencies, settings, settingsCalc, settingsLook, settingsDevice, settingsData];
const ROUTES = Object.fromEntries(SCREENS.map((s) => [s.id, s]));
const DEFAULT_ROUTE = "inicio";

const viewEl = $("#view");
const headerEl = $("#app-header");
let currentScreen = null;

// ---------------------------------------------------------------------------
// Acciones globales (disponibles desde cualquier pantalla)
// ---------------------------------------------------------------------------

const byId = (list, id) => list.find((x) => x.id === id);

const GLOBAL_ACTIONS = {
  "add-income": () => openTransactionForm({ type: "income" }),
  "add-expense": () => openTransactionForm({ type: "expense" }),
  "add-extras": () => openIncomeExtras(),
  "add-bill": () => openBillForm(),
  "add-goal": () => openGoalForm(),
  "add-budget": () => openBudgetForm(),
  "add-treats": () => openBudgetForm({ preset: "daily" }),
  "leftover-to-goal": (el) => openLeftoverSheet(el.dataset.id),
  "leftover-keep": (el) => {
    const backup = store.snapshot();
    store.settleBudgetLeftover(el.dataset.id, el.dataset.month);
    toast("Listo, queda en tu disponible", { type: "info", actionLabel: "Deshacer", onAction: () => store.restore(backup) });
  },
  "add-category": (el) => openCategoryForm({ type: el.dataset.type || "expense" }),
  "edit-tx": (el) => openTransactionForm({ tx: byId(store.getState().transactions, el.dataset.id) }),
  "edit-transfer": (el) => openTransferForm({ tx: byId(store.getState().transactions, el.dataset.id) }),
  "add-transfer": (el) => openTransferForm({ fromId: el.dataset.from }),
  "add-account": () => openAccountForm(),
  "account-detail": (el) => openAccountDetail(el.dataset.id),
  "add-loan": (el) => openLoanForm({ direction: el.dataset.direction || "lent" }),
  "loan-detail": (el) => openLoanDetail(el.dataset.id),
  "edit-budget": (el) => openBudgetForm({ budget: byId(store.getState().budgets, el.dataset.id) }),
  "edit-category": (el) => openCategoryForm({ category: byId(store.getState().categories, el.dataset.id) }),
  "pay-bill": (el) => openPayBill(el.dataset.id),
  "bill-detail": (el) => openBillDetail(el.dataset.id),
  "goal-detail": (el) => openGoalDetail(el.dataset.id),
  // Registrar el sueldo del mes: se puede ajustar el monto y sumar extras.
  "confirm-recurring": (el) => openIncomeConfirm(el.dataset.id),
  "skip-recurring": (el) => {
    store.skipRecurring(el.dataset.id);
    toast("Listo, te lo recordamos el próximo período", { type: "info" });
  },
  "start-fresh": async () => {
    const ok = await confirmDialog({
      title: "¿Empezar de cero?",
      text: "Se borran movimientos, facturas, metas y presupuestos. Tus categorías y tipos de cambio se mantienen. Después te hacemos unas preguntas para cargar tu punto de partida.",
      confirmLabel: "Empezar de cero",
      danger: true,
    });
    if (!ok) return;
    store.startFresh();
    // Con la app vacía arranca el cuestionario: es la forma de cargar el punto
    // de partida. Quien no lo quiera, lo cierra.
    whenHistorySettled(() => {
      location.hash = "#/inicio";
      setTimeout(openSetupWizard, 250);
    });
  },
  // Backup completo (.json): siempre el mismo archivo, que se reemplaza.
  // Queda anotada la fecha para el recordatorio.
  "export-data": async (el) => {
    const result = await saveBackup(store.exportJSON(), { choose: el?.dataset.choose === "1" });
    if (result.how === "cancelled") return;
    markBackup();
    toast(
      result.how === "replaced"
        ? result.first
          ? `Backup guardado en “${result.name}”. Los próximos van a reemplazar ese mismo archivo.`
          : `Backup actualizado en “${result.name}”`
        : result.how === "shared"
          ? "Backup listo. Guardalo con el mismo nombre para reemplazar el anterior."
          : "Backup descargado"
    );
    render();
  },
  "export-csv": () => {
    const state = store.getState();
    if (!state.transactions.length) {
      toast("Todavía no hay movimientos para exportar", { type: "info" });
      return;
    }
    downloadFile(transactionsToCSV(state), `neko-finanzas-movimientos-${todayISO()}.csv`, "text/csv;charset=utf-8");
    toast(`Planilla descargada: ${state.transactions.length} movimiento${state.transactions.length === 1 ? "" : "s"}`);
  },
  "show-onboarding": () => openOnboarding(),
  "setup-wizard": () => openSetupWizard(),
  "install-help": () => openInstallHelp(),
  "snooze-ios-notice": () => {
    snoozeIosNotice(7);
    toast("Te lo recordamos en una semana", { type: "info" });
    return true;
  },
  "toggle-amounts": () => {
    setAmountsHidden(!isMasked());
    setMasked(!isMasked());
    return true;
  },
  "snooze-backup": () => {
    snoozeBackupReminder(7);
    toast("Te lo recordamos en una semana", { type: "info" });
    return true;
  },
  "install-app": async () => {
    if (await promptInstall()) toast("¡Listo! Neko Finanzas ya está en tu dispositivo");
  },
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function routeId() {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES[id] ? id : DEFAULT_ROUTE;
}

function renderHeader() {
  const screen = currentScreen;
  const isHome = screen.id === DEFAULT_ROUTE;
  const search = screen.search?.();
  setHTML(
    headerEl,
    html`<div class="header-top">
      <div class="header-left">
        ${screen.back
          ? html`<a class="header-back" href="${screen.back}" aria-label="Volver">${icon("chevronLeft", 22)}</a>`
          : html`<img src="img/logo-header.png" alt="" class="header-logo" width="44" height="44" />`}
        <div class="header-text">
          ${isHome || !screen.back
            ? html`<h1 class="header-title">${isHome ? "Neko Finanzas" : screen.title}</h1><span class="header-by">${isHome ? "by Neko Tools" : "Neko Finanzas"}</span>`
            : html`<h1 class="header-title">${screen.title}</h1><span class="header-by">Neko Finanzas</span>`}
        </div>
      </div>
      <div class="header-actions">
        ${canPromptInstall() ? html`<button type="button" class="header-btn" data-action="install-app" aria-label="Instalar app" title="Instalar app">${icon("download", 18)}</button>` : ""}
        ${screen.id !== "reportes" ? html`<a class="header-btn" href="#/reportes" aria-label="Reportes" title="Reportes">${icon("chart", 18)}</a>` : ""}
        ${!screen.id.startsWith("ajustes") ? html`<a class="header-btn" href="#/ajustes" aria-label="Configuración" title="Configuración">${icon("settings", 18)}</a>` : ""}
      </div>
    </div>
    ${search
      ? html`<div class="header-toolbar">
          <label class="header-search">
            ${icon("search", 18)}
            <input type="search" value="${search.value}" placeholder="${search.placeholder}" aria-label="${search.placeholder}" data-input="${search.input}" autocomplete="off" />
          </label>
          <button type="button" class="header-filter-btn ${search.filtersOn ? "is-on" : ""}" data-action="${search.filtersAction}" aria-label="Filtros">${icon("filter", 16)}Filtros</button>
        </div>`
      : ""}`
  );
}

// ---------------------------------------------------------------------------
// Tema claro / oscuro (boot.js lo aplica antes de pintar para evitar parpadeo)
// ---------------------------------------------------------------------------

function renderTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === currentScreen.tab;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
}

function render({ animate = false } = {}) {
  const state = store.getState();
  if (!state) return; // todavía cargando los datos guardados
  currentScreen = ROUTES[routeId()];
  document.title = currentScreen.id === DEFAULT_ROUTE ? "Neko Finanzas — by Neko Tools" : `${currentScreen.title} · Neko Finanzas`;
  document.body.classList.toggle("is-wide", Boolean(currentScreen.wide));
  renderHeader();
  renderTabs();
  try {
    setHTML(viewEl, currentScreen.render(state));
  } catch (error) {
    // Red de seguridad: un error inesperado nunca deja la pantalla en blanco
    // ni bloquea el acceso a los datos.
    console.error("[render]", error);
    setHTML(
      viewEl,
      html`<section class="card render-error">
        <h2 class="section-title">Algo no salió bien en esta pantalla</h2>
        <p class="section-sub">Tus datos siguen guardados. Probá volver al inicio; si se repite, exportá un backup desde Configuración.</p>
        <div class="form-actions">
          <a class="btn btn-ghost" href="#/ajustes">Configuración</a>
          <a class="btn btn-primary btn-grow" href="#/inicio">Volver al inicio</a>
        </div>
      </section>`
    );
  }
  viewEl.dataset.screen = currentScreen.id;
  pulseChanges();
  if (animate && !prefersReducedMotion()) {
    viewEl.classList.remove("view-enter");
    void viewEl.offsetWidth; // reinicia la animación
    viewEl.classList.add("view-enter");
  } else {
    viewEl.classList.remove("view-enter");
  }
}

let previousHero = null;
let heroFrame = 0;
let heroTimer = 0;
/** El saldo disponible "cuenta" hasta su valor nuevo cuando cambia. */
function animateHero() {
  const el = viewEl.querySelector(".hero-amount[data-count]");
  if (!el) return;
  const target = Number(el.dataset.count);
  const currency = store.getState().settings.mainCurrency;
  // Si cambió la moneda principal no tiene sentido animar entre valores.
  const from = previousHero?.currency === currency ? previousHero.value : previousHero ? target : target * 0.92;
  previousHero = { value: target, currency };
  if (from === target || isMasked() || prefersReducedMotion()) return;
  const duration = 650;
  let start = null;
  const step = (now) => {
    // El inicio se toma del primer frame: el timestamp de rAF puede ser
    // anterior a performance.now() y daría un progreso negativo.
    start ??= now;
    const t = Math.min(1, Math.max(0, (now - start) / duration));
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatMoney(from + (target - from) * eased, currency);
    if (t < 1) heroFrame = requestAnimationFrame(step);
    else el.textContent = formatMoney(target, currency);
  };
  cancelAnimationFrame(heroFrame);
  clearTimeout(heroTimer);
  heroFrame = requestAnimationFrame(step);
  // Respaldo: si rAF se frena (pestaña en segundo plano), el valor final queda igual.
  heroTimer = setTimeout(() => {
    cancelAnimationFrame(heroFrame);
    el.textContent = formatMoney(target, currency);
  }, duration + 100);
}

// Montos que cambiaron desde la última vez que se vio esta pantalla dan un
// pequeño "latido" (como el total de Neko Lista), así se nota qué se movió.
const lastValues = new Map();

function pulseChanges() {
  for (const el of viewEl.querySelectorAll("[data-pulse]")) {
    const key = `${currentScreen.id}:${el.dataset.pulse}`;
    const value = el.dataset.count ?? el.textContent;
    const before = lastValues.get(key);
    lastValues.set(key, value);
    if (before !== undefined && before !== value && !isMasked()) el.classList.add("pulse");
  }
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function runHandler(kind, el, event) {
  const name = el.dataset[{ actions: "action", changes: "change", inputs: "input" }[kind]];
  const handler = currentScreen[kind]?.[name] || (kind === "actions" ? GLOBAL_ACTIONS[name] : null);
  if (!handler) return;
  const result = handler(el, event);
  if (result === true) {
    render();
    refocus(el);
  }
}

// Al redibujar, el control que se acababa de usar (un switch, una opción de
// tema) se reemplaza por uno nuevo: se le devuelve el foco para no perder
// el lugar navegando con teclado o lector de pantalla.
function refocus(el) {
  if (el !== document.activeElement && !el.contains(document.activeElement) && document.activeElement !== document.body) return;
  const attr = ["data-action", "data-change"].find((a) => el.hasAttribute(a));
  if (!attr) return;
  let selector = `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
  if (el.value && el.type === "radio") selector += `[value="${CSS.escape(el.value)}"]`;
  if (el.dataset.id) selector += `[data-id="${CSS.escape(el.dataset.id)}"]`;
  document.querySelector(selector)?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  runHandler("actions", el, event);
});

// Mientras se escribe (p. ej. el buscador del header) se redibuja solo el
// contenido, así el campo no pierde el foco.
document.addEventListener("input", (event) => {
  const el = event.target.closest("[data-input]");
  if (!el) return;
  const handler = currentScreen.inputs?.[el.dataset.input];
  if (handler?.(el, event) === true) setHTML(viewEl, currentScreen.render(store.getState()));
});

document.addEventListener("change", (event) => {
  const el = event.target.closest("[data-change]");
  if (el) runHandler("changes", el, event);
});

// Una pantalla puede pedir que se redibuje (p. ej. al aplicar filtros desde una hoja).
window.addEventListener("neko:rerender", () => render());

window.addEventListener("hashchange", () => {
  render({ animate: true });
  window.scrollTo({ top: 0 });
  viewEl.focus({ preventScroll: true });
  animateHero();
});

// Guardado fallido (almacenamiento lleno o bloqueado): se avisa siempre.
store.onSaveError(() => {
  toast("No se pudo guardar en este dispositivo. Liberá espacio o exportá un backup para no perder datos.", {
    type: "error",
    duration: 8000,
    sticky: true,
  });
});

// Cambios hechos en otra pestaña (preferencias en localStorage).
window.addEventListener("storage", (event) => {
  // Preferencias cambiadas en otra pestaña: tema y montos ocultos se siguen.
  if (["nekoFinanzas.theme", "nekoFinanzas.palette", "nekoFinanzas.customColor", "nekoFinanzas.bgColor", "nekoFinanzas.bgImage"].includes(event.key)) {
    applySavedTheme();
    showCustomImage();
    if (currentScreen) render();
    return;
  }
  if (event.key === "nekoFinanzas.hideAmounts") {
    setMasked(amountsHidden());
    if (currentScreen) render();
    return;
  }
  // Navegadores sin BroadcastChannel (Safari < 15.4) con datos en localStorage.
  if (event.key !== STORAGE_KEY || event.newValue === null || "BroadcastChannel" in window) return;
  reloadFromOtherTab();
});

// Otra pestaña con la app abierta guardó cambios: se recargan acá para que
// ninguna de las dos pise los datos de la otra.
async function reloadFromOtherTab() {
  if (await store.reloadFromStorage()) toast("Se actualizaron los datos desde otra pestaña", { type: "info" });
}
onRemoteChange(reloadFromOtherTab);

// Al volver a la app otro día (PWA en segundo plano), se recalcula todo con
// la fecha nueva: vencimientos, "Hoy", saldo disponible.
let lastRenderDay = new Date().toDateString();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const day = new Date().toDateString();
  if (day !== lastRenderDay) {
    lastRenderDay = day;
    render();
    store.maybeDailySnapshot();
  }
  fireDue(); // avisos de vencimientos que tocan hoy (si están prendidos)
});

// Avisos de vencimientos: el plan se rearma cuando cambian los datos.
let remindersTimer = 0;
function refreshReminders() {
  clearTimeout(remindersTimer);
  remindersTimer = setTimeout(() => syncPlan(store.getState()).then(() => fireDue()), 800);
}

store.subscribe(() => {
  refreshReminders();
  const y = window.scrollY;
  render();
  window.scrollTo({ top: y });
  animateHero();
});

// El aviso de instalación llega (o se usa) en cualquier momento: se
// actualizan el botón del encabezado y la sección de Configuración.
onInstallChange(() => currentScreen && render());

// Tema automático: si el sistema cambia de modo con la app abierta.
watchSystemTheme(() => currentScreen && render());

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

function hideSplash() {
  const splash = $("#app-splash");
  if (!splash) return 0;
  let seen = false;
  try {
    seen = sessionStorage.getItem("nekoFinanzas.splash") === "1";
    sessionStorage.setItem("nekoFinanzas.splash", "1");
  } catch (error) {
    /* sin sessionStorage: mostramos el splash igual */
  }
  if (seen || prefersReducedMotion()) {
    splash.remove();
    return 0;
  }
  setTimeout(() => splash.classList.add("show-brand"), 650);
  setTimeout(() => splash.classList.add("is-hidden"), 1250);
  setTimeout(() => splash.remove(), 1700);
  return 1700;
}

async function start() {
  setMasked(amountsHidden());
  showCustomImage();
  initBackupFile().then(() => currentScreen?.id === "ajustes-datos" && render());
  try {
    await store.initStore();
  } catch (error) {
    // No se pudieron leer los datos: se avisa en vez de dejar la pantalla de carga para siempre.
    console.error("[inicio]", error);
    $("#app-splash")?.remove();
    setHTML(
      viewEl,
      html`<section class="card render-error">
        <h2 class="section-title">No se pudieron abrir tus datos</h2>
        <p class="section-sub">No se borró nada. Cerrá las otras pestañas de Neko Finanzas y recargá la página. Si sigue igual, probá reiniciar el navegador.</p>
        <div class="form-actions"><button type="button" class="btn btn-primary btn-grow" data-reload>Recargar</button></div>
      </section>`
    );
    viewEl.querySelector("[data-reload]").addEventListener("click", () => location.reload());
    return;
  }
  initChartTooltips();
  render({ animate: true });
  animateHero();
  refreshReminders();
  const splashDelay = hideSplash();
  requestPersistence();
  // Tutorial la primera vez (app nueva o con los datos de ejemplo del
  // inicio). Quien ya tiene datos propios no lo ve de golpe.
  if (!onboardingSeen()) {
    const state = store.getState();
    if (store.isPristineDemo(state) || store.isEmptyState(state)) setTimeout(openOnboarding, splashDelay + 200);
    else markOnboardingSeen();
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((error) => console.warn("[sw] registro fallido", error));
  }
}

start();
