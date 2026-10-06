// Inicio: responde en segundos "¿cuánto puedo gastar realmente?". El saldo
// disponible es el protagonista; después el resumen del mes, las acciones
// rápidas y lo reciente. En escritorio se reparte en dos columnas.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { sectionHeader, billRow, goalCard, emptyState, progressBar, appFooter, txRow } from "../ui/components.js";
import { formatMoney, CURRENCIES, isMasked } from "../core/money.js";
import { formatDate, formatMonth, currentMonthKey, todayISO } from "../core/dates.js";
import { accountRow } from "./accounts.js";
import { loanRow } from "./loans.js";
import {
  accountBalances,
  balanceSummary,
  budgetLeftovers,
  dailyAllowance,
  treatAllowance,
  loansSummary,
  monthlyTotals,
  pendingRecurringIncomes,
  upcomingBills,
  budgetsOverview,
  percent,
} from "../core/finance.js";
import { backupReminderDue, daysSinceBackup, getLastBackup, iosNoticeSnoozed } from "../core/prefs.js";
import { needsIosInstall } from "../ui/install.js";
import { extrasOfMonth } from "../ui/forms/incomeExtras.js";

const RECENT_COUNT = 5;

/** Montos largos (millones) achican la letra para no partirse en dos líneas. */
function heroSize(text) {
  return text.length > 13 ? "is-xlong" : text.length > 10 ? "is-long" : "";
}

/** "facturas", "facturas y cuotas", "facturas, cuotas y deudas"… */
function reserveLabel(summary) {
  const parts = ["facturas", summary.scheduled.amount > 0 && "cuotas", summary.debts.amount > 0 && "deudas", summary.envelopes.amount > 0 && "gastos del mes"].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}` : parts[0];
}

export default {
  id: "inicio",
  tab: "inicio",
  title: "Inicio",
  wide: true,
  render(state) {
    const today = todayISO();
    const main = state.settings.mainCurrency;
    const m = (v, opts) => formatMoney(v, main, opts);
    const summary = balanceSummary(state, today);
    const month = monthlyTotals(state, currentMonthKey());
    const pendingIncomes = pendingRecurringIncomes(state, today);
    const bills = upcomingBills(state, today, 4);
    const budgetAlerts = budgetsOverview(state, currentMonthKey()).items.filter((b) => b.level === "near" || b.level === "over");
    const recent = [...state.transactions]
      .filter((tx) => tx.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "") || b.createdAt.localeCompare(a.createdAt))
      .slice(0, RECENT_COUNT);
    const negative = summary.available < 0;
    const isEmpty = !state.transactions.length && state.accounts.every((a) => !a.opening);
    const availablePct = summary.total > 0 ? Math.max(0, Math.min(100, percent(summary.available, summary.total))) : 0;
    const horizonLabel = state.settings.reserveHorizon === "month" ? "hasta fin de mes" : "próximos 30 días";

    const trio = html`<div class="trio" aria-label="Resumen del mes">
      <a class="mini mini-income" href="#/transacciones">
        <span class="mini-icon">${icon("arrowDown", 18)}</span>
        <span class="mini-label">Ingresos</span>
        <span class="mini-value" data-pulse="income">${m(month.income)}</span>
        <span class="mini-sub">este mes</span>
      </a>
      <a class="mini mini-expense" href="#/transacciones">
        <span class="mini-icon">${icon("arrowUp", 18)}</span>
        <span class="mini-label">Gastos</span>
        <span class="mini-value" data-pulse="expense">${m(month.expense)}</span>
        <span class="mini-sub">este mes</span>
      </a>
      <a class="mini mini-goal" href="#/metas">
        <span class="mini-icon">${icon("flag", 18)}</span>
        <span class="mini-label">Metas</span>
        <span class="mini-value" data-pulse="goals">${m(summary.inGoals)}</span>
        <span class="mini-sub">${state.goals.length} meta${state.goals.length === 1 ? "" : "s"}</span>
      </a>
    </div>`;

    // Sueldo y extras son dos líneas distintas: lo fijo y lo variable del mes.
    const extrasTotal = extrasOfMonth(state, currentMonthKey()).reduce((s, e) => s + e.total, 0);
    const extrasLine = html`<p class="extras-line reveal">
      ${icon("sparkle", 15)}
      <span>${extrasTotal > 0 ? html`Extras de este mes: <strong>${m(extrasTotal)}</strong>` : "¿Tuviste aguinaldo, horas extra, comisión o propinas?"}</span>
      <button type="button" class="chip chip-action" data-action="add-extras">${icon("plus", 12)}Cargar extras</button>
    </p>`;

    const savings = html`${month.income || month.expense
      ? html`<p class="savings-pill reveal ${month.saved < 0 ? "is-negative" : ""}">
          ${icon(month.saved >= 0 ? "sparkle" : "alert", 15)}
          ${month.saved >= 0 ? "Este mes estás ahorrando" : "Este mes gastaste más de lo que entró:"}
          <strong>${m(Math.abs(month.saved))}</strong>${month.income > 0 && month.saved > 0 ? html` <span>(${Math.round(month.savingsRate)}%)</span>` : ""}
        </p>`
      : ""}`;

    const hero = html`<section class="hero-card reveal" aria-labelledby="hero-label">
      <div class="hero-top">
        <div class="hero-text">
          <div class="hero-label-row">
            <p id="hero-label" class="hero-label">Saldo disponible</p>
            <button type="button" class="hero-eye" data-action="toggle-amounts" aria-pressed="${isMasked() ? "true" : "false"}" aria-label="${isMasked() ? "Mostrar montos" : "Ocultar montos"}" title="${isMasked() ? "Mostrar montos" : "Ocultar montos"}">${icon(isMasked() ? "eyeOff" : "eye", 18)}</button>
          </div>
          <p class="hero-amount ${negative ? "is-negative" : ""} ${heroSize(m(summary.available))}" data-pulse="hero" data-count="${isMasked() ? 0 : summary.available}">${m(summary.available)}</p>
          <p class="hero-sub">de <strong>${m(summary.total)}</strong> totales</p>
        </div>
        <img class="hero-art ${negative ? "hero-art-neko" : ""}" src="img/${negative ? "neko-preocupado" : "hero-wallet"}.webp" alt="" width="120" height="${negative ? 120 : 129}" />
      </div>
      ${negative
        ? html`<p class="hero-alert">${icon("alert", 15)} Lo apartado y reservado supera lo que tenés. Revisá metas, facturas, cuotas o deudas.</p>`
        : isEmpty
          ? html`<p class="hero-alert hero-alert-info">Para empezar, <button type="button" class="inline-link" data-action="setup-wizard">cargá todo con el asistente</button> o registrá un ingreso.</p>`
          : html`<div class="avail">
              <div class="avail-bar">
                ${progressBar(availablePct, { color: "var(--brand)", label: "Porcentaje disponible del total" })}
                <span class="avail-pct">${Math.round(availablePct)}%</span>
              </div>
              <a href="#/facturas" class="avail-reserve" data-pulse="reserve" title="Lo que vence en los ${horizonLabel}">${icon("receipt", 14)}${m(summary.reserved)} reservados para ${reserveLabel(summary)}</a>
            </div>`}
      ${trio}
    </section>`;

    // Para los gustos del día (un café, un alfajor). Con un presupuesto "por
    // día" se muestra lo acumulado; si no, el disponible repartido por día.
    const treats = treatAllowance(state, today);
    const daily = dailyAllowance(state, today);
    const untilText = daily.reason === "income" ? `hasta que cobres, el ${formatDate(daily.until)}` : "hasta fin de mes";
    const dailyCard = isEmpty
      ? ""
      : treats
        ? html`<section class="daily-card reveal ${treats.accumulated < 0 ? "is-over" : ""}" aria-label="Gustos de hoy">
            <span class="daily-icon" aria-hidden="true">${treats.budget.icon}</span>
            <div class="daily-text">
              ${treats.accumulated >= 0
                ? html`<p class="daily-main">Para gustos tenés <strong data-pulse="daily">${m(treats.accumulated)}</strong></p>`
                : html`<p class="daily-main">En gustos te pasaste por <strong data-pulse="daily">${m(-treats.accumulated)}</strong></p>`}
              <p class="daily-sub">${m(treats.perDay)} por día${treats.spentToday > 0 ? ` · hoy llevás ${m(treats.spentToday)}` : ""}</p>
              <p class="daily-note">${treats.accumulated >= 0 ? "Lo que no gastás hoy se acumula para mañana." : "Se va recuperando con los días que no gastes."} Cuenta: ${treats.budget.name}.</p>
            </div>
          </section>`
        : daily.available > 0
          ? html`<section class="daily-card reveal ${daily.leftToday < 0 ? "is-over" : ""}" aria-label="Para gastar hoy">
              <span class="daily-icon" aria-hidden="true">☕</span>
              <div class="daily-text">
                ${daily.leftToday >= 0
                  ? html`<p class="daily-main">Hoy podés gastar <strong data-pulse="daily">${m(daily.leftToday)}</strong></p>`
                  : html`<p class="daily-main">Hoy ya te pasaste por <strong data-pulse="daily">${m(-daily.leftToday)}</strong></p>`}
                <p class="daily-sub">${m(daily.perDay)} por día ${untilText}${daily.spentToday > 0 ? ` · hoy llevás ${m(daily.spentToday)}` : ""}</p>
                <p class="daily-note">${daily.days === 1
                  ? `Es todo tu disponible: ${daily.reason === "income" ? "mañana cobrás" : "hoy termina el mes"}. La comida`
                  : `Es tu disponible repartido en los ${daily.days} días que faltan ${daily.reason === "income" ? "para tu próximo cobro" : "para terminar el mes"}, contando hoy: la comida`} y el transporte también salen de acá. <button type="button" class="inline-link" data-action="add-treats">Ponete un límite de gustos por día</button> y lo que no gastes se acumula.</p>
              </div>
            </section>`
          : "";

    // Sobrantes del mes pasado en presupuestos reservados: se ofrece pasarlos a una meta.
    const leftovers = budgetLeftovers(state, today).map(
      (l) => html`<div class="card card-soft card-pending reveal">
        <span class="mini-icon mini-icon-income">${icon("sparkle", 18)}</span>
        <div class="row-main">
          <span class="row-title">Te sobraron ${m(l.amount)} de ${l.budget.name}</span>
          <span class="row-meta">De ${formatMonth(l.month).toLowerCase()}. ¿Lo pasás a tus ahorros?</span>
        </div>
        <div class="card-pending-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-action="leftover-keep" data-id="${l.budget.id}" data-month="${l.month}">Dejarlo disponible</button>
          <button type="button" class="btn btn-sm btn-primary" data-action="leftover-to-goal" data-id="${l.budget.id}">Pasar a una meta</button>
        </div>
      </div>`
    );

    const actions = html`<nav class="quick-actions card reveal" aria-label="Acciones rápidas">
      <button type="button" class="qa qa-primary" data-action="add-expense"><span class="qa-icon">${icon("plus", 22)}</span><span>Agregar<br />transacción</span></button>
      <button type="button" class="qa qa-income" data-action="add-income"><span class="qa-icon">${icon("arrowDown", 20)}</span><span>Ingresar<br />dinero</span></button>
      <a class="qa qa-bill" href="#/facturas"><span class="qa-icon">${icon("receipt", 20)}</span><span>Pago de<br />factura</span></a>
      <button type="button" class="qa qa-goal" data-action="add-goal"><span class="qa-icon">${icon("flag", 20)}</span><span>Nueva<br />meta</span></button>
    </nav>`;

    const pending = pendingIncomes.map(
      (tx) => html`<div class="card card-soft card-pending reveal">
        <span class="mini-icon mini-icon-income">${icon("repeat", 18)}</span>
        <div class="row-main">
          <span class="row-title">¿Ya cobraste “${tx.description || "tu ingreso"}”?</span>
          <span class="row-meta">${formatMoney(tx.recurrence.amount || tx.amount, tx.currency)} · esperado el ${formatDate(tx.recurrence.nextDate)}</span>
        </div>
        <div class="card-pending-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-action="skip-recurring" data-id="${tx.id}">Omitir</button>
          <button type="button" class="btn btn-sm btn-primary" data-action="confirm-recurring" data-id="${tx.id}">Registrar</button>
        </div>
      </div>`
    );

    const recents = html`<section class="card reveal">
      ${sectionHeader("Recientes", { href: "#/transacciones", linkText: "Ver todos" })}
      ${recent.length
        ? html`<div class="tx-list">${recent.map((tx) => txRow(state, tx, { withDate: true }))}</div>`
        : emptyState({ art: "neko-anotando", title: "Todavía no hay movimientos", text: "Registrá tu primer ingreso o gasto y va a aparecer acá.", actionLabel: "Agregar transacción", action: "add-expense", compact: true, mood: "sleepy" })}
    </section>`;

    // Con más de una cuenta: cuánto hay en cada una.
    const activeAccounts = accountBalances(state, today).filter((e) => !e.account.archived);
    const accountsCard = activeAccounts.length > 1
      ? html`<section class="card reveal">
          ${sectionHeader("Tus cuentas", { href: "#/cuentas", linkText: "Ver todas" })}
          <div class="rows rows-plain">${activeAccounts.slice(0, 6).map((e) => accountRow(state, e))}</div>
          <button type="button" class="btn btn-soft btn-sm btn-block" data-action="add-transfer">${icon("swap", 16)} Mover plata entre cuentas</button>
        </section>`
      : "";

    // Préstamos abiertos: quién te debe y a quién le debés.
    const openLoans = loansSummary(state).items.filter((i) => i.outstanding > 0);
    const loansCard = openLoans.length
      ? html`<section class="card reveal">
          ${sectionHeader("Préstamos", { href: "#/prestamos", linkText: "Ver todos" })}
          <div class="rows rows-plain">${openLoans.slice(0, 3).map((i) => loanRow(i, today))}</div>
        </section>`
      : "";

    const billsCard = html`<section class="card reveal">
      ${sectionHeader("Próximas facturas", { href: "#/facturas", linkText: "Ver todas" })}
      ${bills.length
        ? html`<div class="rows">${bills.map((b) => billRow(state, b, { today, compact: true }))}</div>`
        : emptyState({ art: "neko-durmiendo", title: "Sin facturas cargadas", text: "Sumá luz, internet o suscripciones y te decimos cuánto reservar.", actionLabel: "Agregar factura", action: "add-bill", compact: true, mood: "sleepy" })}
    </section>`;

    const budgetsCard = budgetAlerts.length
      ? html`<section class="card reveal">
          ${sectionHeader("Presupuestos para mirar", { href: "#/presupuestos", linkText: "Ver" })}
          ${budgetAlerts.slice(0, 3).map(
            (b) => html`<div class="budget-mini">
              <span class="budget-mini-name">${b.budget.icon} ${b.budget.name}</span>
              <span class="budget-mini-val">${b.level === "over" ? `Superado por ${m(-b.remaining)}` : `Quedan ${m(b.remaining)}`}</span>
              ${progressBar(b.pct, { color: b.budget.color, level: b.level })}
            </div>`
          )}
        </section>`
      : "";

    const goalsCard = html`<section class="card reveal">
      ${sectionHeader("Metas de ahorro", { href: "#/metas", linkText: "Ver todas" })}
      ${state.goals.length
        ? html`<div class="goal-list">${state.goals.slice(0, 3).map((g) => goalCard(state, g, { compact: true }))}</div>`
        : emptyState({ art: "neko-ahorrando", title: "Todavía no tenés metas", text: "Creá una y empezá a separar dinero para eso que querés.", actionLabel: "Crear meta", action: "add-goal", compact: true })}
    </section>`;

    const ratesCard = html`<section class="card reveal">
      ${sectionHeader("Tipo de cambio", { href: "#/monedas", linkText: "Editar" })}
      <div class="rates-row">
        ${Object.values(CURRENCIES)
          .filter((c) => c.code !== main)
          .map(
            (c) => html`<a class="rate-pill" href="#/monedas">
              <span class="cur-badge">${c.symbol}</span>
              <span class="rate-text">1 ${c.code} = <strong>${formatMoney(state.rates[c.code] / (state.rates[main] || 1), main)}</strong></span>
            </a>`
          )}
      </div>
      <p class="fine-print">${icon("info", 14)} Valores que cargaste vos. Se usan para convertir montos a ${main}.</p>
    </section>`;

    return html`
      ${state.settings.isDemo
        ? html`<div class="demo-banner reveal">
            <span class="demo-banner-icon">${icon("sparkle", 16)}</span>
            <span class="demo-banner-text"><strong>Datos de ejemplo.</strong> Explorá tranquilo; cuando quieras, empezá con los tuyos.</span>
            <button type="button" class="btn btn-sm btn-soft" data-action="start-fresh">Empezar con lo mío</button>
          </div>`
        : ""}
      ${needsIosInstall() && !iosNoticeSnoozed()
        ? html`<div class="demo-banner backup-banner ios-banner reveal" role="status">
            <span class="demo-banner-icon">${icon("phone", 16)}</span>
            <span class="demo-banner-text"><strong>Instalá la app en tu iPhone.</strong> Si no la abrís en 7 días, Safari puede borrar tus datos. Instalada en la pantalla de inicio, no pasa.</span>
            <span class="backup-banner-actions">
              <button type="button" class="btn btn-sm btn-ghost" data-action="snooze-ios-notice">Ahora no</button>
              <button type="button" class="btn btn-sm btn-primary" data-action="install-help">Cómo instalar</button>
            </span>
          </div>`
        : ""}
      ${backupReminderDue(state)
        ? html`<div class="demo-banner backup-banner reveal" role="status">
            <span class="demo-banner-icon">${icon("shield", 16)}</span>
            <span class="demo-banner-text"><strong>${getLastBackup() ? `Tu último backup fue hace ${daysSinceBackup(state)} días.` : "Todavía no hiciste ningún backup."}</strong>
              Guardá una copia por si cambiás de celular o se borran los datos del navegador.</span>
            <span class="backup-banner-actions">
              <button type="button" class="btn btn-sm btn-ghost" data-action="snooze-backup">Ahora no</button>
              <button type="button" class="btn btn-sm btn-primary" data-action="export-data">Hacer backup</button>
            </span>
          </div>`
        : ""}
      <div class="home-grid">
        <div class="home-col">${hero}${dailyCard}${savings}${actions}${leftovers}${pending}${isEmpty ? "" : extrasLine}</div>
        <div class="home-col">${accountsCard}${recents}${billsCard}${loansCard}${budgetsCard}${goalsCard}${ratesCard}</div>
      </div>
      <p class="privacy-note">${icon("lock", 14)} Tus datos se guardan solo en este dispositivo.</p>
      ${appFooter()}
    `;
  },
};
