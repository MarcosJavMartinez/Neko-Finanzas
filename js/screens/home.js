// Inicio: responde en segundos "¿cuánto puedo gastar realmente?". El saldo
// disponible es el protagonista; después el resumen del mes, las acciones
// rápidas y lo reciente. En escritorio es un tablero: el saldo arriba, los
// gráficos del mes y el resto en una grilla (ver styles/layout.css).

import { msg, tr } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { sectionHeader, billRow, goalCard, emptyState, progressBar, appFooter, txRow, chartSize } from "../ui/components.js";
import { barChart, donutChart } from "../ui/charts.js";
import { PALETTE } from "../data/defaults.js";
import { formatMoney, CURRENCIES, isMasked, symbolOf } from "../core/money.js";
import { daysBetween, formatDate, formatMonth, currentMonthKey, shiftMonthKey, todayISO } from "../core/dates.js";
import { accountRow } from "./accounts.js";
import { ratePair } from "./currencies.js";
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
  monthlySeries,
  monthToDate,
  expensesByCategory,
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
  const names = parts.map(tr);
  return names.length > 1 ? msg`${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0];
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

    // Contra el mes pasado a esta misma altura (no contra el mes entero).
    const dayOfMonth = Number(today.slice(8));
    const prevKey = shiftMonthKey(currentMonthKey(), -1);
    const prevName = formatMonth(prevKey, { short: true }).toLowerCase().replace(".", "");
    const soFar = monthToDate(state, currentMonthKey(), dayOfMonth);
    const before = monthToDate(state, prevKey, dayOfMonth);
    const versus = (now, then) => {
      if (!(then > 0) || !(now > 0)) return "";
      const change = Math.round(((now - then) / then) * 100);
      if (!change) return html`<span class="mini-vs" title="Igual que el mismo día de ${prevName}">= que en ${prevName}</span>`;
      return html`<span class="mini-vs" title="Comparado con lo que llevabas el mismo día de ${prevName}">${change > 0 ? "+" : "−"}${Math.abs(change)}% vs. ${prevName}</span>`;
    };
    const trio = html`<div class="trio" aria-label="Resumen del mes">
      <a class="mini mini-income" href="#/transacciones">
        <span class="mini-icon">${icon("arrowDown", 18)}</span>
        <span class="mini-label">Ingresos</span>
        <span class="mini-value" data-pulse="income">${m(month.income)}</span>
        <span class="mini-sub">este mes</span>
        ${versus(soFar.income, before.income)}
      </a>
      <a class="mini mini-expense" href="#/transacciones">
        <span class="mini-icon">${icon("arrowUp", 18)}</span>
        <span class="mini-label">Gastos</span>
        <span class="mini-value" data-pulse="expense">${m(month.expense)}</span>
        <span class="mini-sub">este mes</span>
        ${versus(soFar.expense, before.expense)}
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
    const nearPayday = state.transactions.some((t) => {
      if (t.type !== "income" || !t.recurrence) return false;
      const sinceLast = daysBetween(t.date, today);
      const untilNext = daysBetween(today, t.recurrence.nextDate);
      return (sinceLast >= 0 && sinceLast <= 7) || (untilNext >= 0 && untilNext <= 3) || t.recurrence.nextDate <= today;
    });
    const showExtras = !isEmpty && (extrasTotal > 0 || nearPayday);
    const extrasLine = html`<p class="extras-line reveal">
      ${icon("sparkle", 15)}
      <span>${extrasTotal > 0 ? html`Extras de este mes: <strong>${m(extrasTotal)}</strong>` : "¿Tuviste paga extra (aguinaldo), horas extra, comisión o propinas?"}</span>
      <button type="button" class="chip chip-action" data-action="add-extras">${icon("plus", 12)}Agregar extras</button>
    </p>`;

    const savings = html`${month.income || month.expense
      ? html`<p class="savings-pill savings-in-hero ${month.saved < 0 ? "is-negative" : ""}">
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
        ? html`<p class="hero-alert">${icon("alert", 15)} Lo apartado y reservado supera lo que tienes. Revisa metas, facturas, cuotas o deudas.</p>`
        : isEmpty
          ? html`<p class="hero-alert hero-alert-info">Para empezar, <button type="button" class="inline-link" data-action="setup-wizard">completa todo con el asistente</button> o registra un ingreso.</p>`
          : html`<div class="avail">
              <div class="avail-bar">
                ${progressBar(availablePct, { color: "var(--brand)", label: "Porcentaje disponible del total" })}
                <span class="avail-pct">${Math.round(availablePct)}%</span>
              </div>
              <a href="#/facturas" class="avail-reserve" data-pulse="reserve" title="Lo que vence en los ${horizonLabel}">${icon("receipt", 14)}${m(summary.reserved)} reservados para ${reserveLabel(summary)}</a>
            </div>`}
      ${trio}
      ${savings}
    </section>`;

    // Para los gustos del día (un café, un helado). Con un presupuesto "por
    // día" se muestra lo acumulado; si no, el disponible repartido por día.
    const treats = treatAllowance(state, today);
    const daily = dailyAllowance(state, today);
    const untilText = daily.reason === "income" ? msg`hasta que cobres, el ${formatDate(daily.until)}` : "hasta fin de mes";
    const dailyCard = isEmpty
      ? ""
      : treats
        ? html`<section class="daily-card reveal ${treats.accumulated < 0 ? "is-over" : ""}" aria-label="Gustos de hoy">
            <span class="daily-icon" aria-hidden="true">${treats.budget.icon}</span>
            <div class="daily-text">
              ${treats.accumulated >= 0
                ? html`<p class="daily-main">Para gustos tienes <strong data-pulse="daily">${m(treats.accumulated)}</strong></p>`
                : html`<p class="daily-main">En gustos te pasaste por <strong data-pulse="daily">${m(-treats.accumulated)}</strong></p>`}
              <p class="daily-sub">${m(treats.perDay)} por día${treats.spentToday > 0 ? msg` · hoy llevas ${m(treats.spentToday)}` : ""}</p>
              <p class="daily-note">${treats.accumulated >= 0 ? "Lo que no gastas hoy se acumula para mañana." : "Se va recuperando con los días que no gastes."} Cuenta: ${treats.budget.name}.</p>
            </div>
          </section>`
        : daily.available > 0
          ? html`<section class="daily-card reveal ${daily.leftToday < 0 ? "is-over" : ""}" aria-label="Para gastar hoy">
              <span class="daily-icon" aria-hidden="true">☕</span>
              <div class="daily-text">
                ${daily.leftToday >= 0
                  ? html`<p class="daily-main">Hoy puedes gastar <strong data-pulse="daily">${m(daily.leftToday)}</strong></p>`
                  : html`<p class="daily-main">Hoy ya te pasaste por <strong data-pulse="daily">${m(-daily.leftToday)}</strong></p>`}
                <p class="daily-sub">${m(daily.perDay)} por día ${untilText}${daily.spentToday > 0 ? msg` · hoy llevas ${m(daily.spentToday)}` : ""}</p>
                <p class="daily-note">${daily.days === 1
                  ? msg`Es todo tu disponible: ${daily.reason === "income" ? "mañana cobras" : "hoy termina el mes"}. La comida`
                  : msg`Es tu disponible repartido en los ${daily.days} días que faltan ${daily.reason === "income" ? "para tu próximo cobro" : "para terminar el mes"}, contando hoy: la comida`} y el transporte también salen de aquí. <button type="button" class="inline-link" data-action="add-treats">Ponte un límite de gustos por día</button> y lo que no gastes se acumula.</p>
              </div>
            </section>`
          : "";

    // Sobrantes del mes pasado en presupuestos reservados: se ofrece pasarlos a una meta.
    const leftovers = budgetLeftovers(state, today).map(
      (l) => html`<div class="card card-soft card-pending reveal">
        <span class="mini-icon mini-icon-income">${icon("sparkle", 18)}</span>
        <div class="row-main">
          <span class="row-title">Te sobraron ${m(l.amount)} de ${l.budget.name}</span>
          <span class="row-meta">De ${formatMonth(l.month).toLowerCase()}. ¿Lo pasas a tus ahorros?</span>
        </div>
        <div class="card-pending-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-action="leftover-keep" data-id="${l.budget.id}" data-month="${l.month}">Dejarlo disponible</button>
          <button type="button" class="btn btn-sm btn-primary" data-action="leftover-to-goal" data-id="${l.budget.id}">Pasar a una meta</button>
        </div>
      </div>`
    );

    const actions = html`<nav class="quick-actions card reveal" aria-label="Acciones rápidas">
      <button type="button" class="qa qa-primary" data-action="add-any"><span class="qa-icon">${icon("plus", 22)}</span><span>Agregar</span></button>
      <button type="button" class="qa qa-expense" data-action="add-expense"><span class="qa-icon">${icon("arrowUp", 20)}</span><span>Gasto</span></button>
      <button type="button" class="qa qa-income" data-action="add-income"><span class="qa-icon">${icon("arrowDown", 20)}</span><span>Ingreso</span></button>
      <a class="qa qa-bill" href="#/facturas"><span class="qa-icon">${icon("receipt", 20)}</span><span>Pagar<br />factura</span></a>
    </nav>`;

    const pending = pendingIncomes.map(
      (tx) => html`<div class="card card-soft card-pending reveal">
        <span class="mini-icon ${tx.type === "expense" ? "mini-icon-expense" : "mini-icon-income"}">${icon("repeat", 18)}</span>
        <div class="row-main">
          <span class="row-title">${tx.type === "expense" ? msg`¿Ya pagaste “${tx.description || state.categories.find((c) => c.id === tx.categoryId)?.name || "tu gasto"}”?` : msg`¿Ya cobraste “${tx.description || "tu ingreso"}”?`}</span>
          <span class="row-meta">${formatMoney(tx.recurrence.amount || tx.amount, tx.currency)} · esperado el ${formatDate(tx.recurrence.nextDate)}</span>
        </div>
        <div class="card-pending-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-action="skip-recurring" data-id="${tx.id}">Omitir</button>
          <button type="button" class="btn btn-sm btn-primary" data-action="confirm-recurring" data-id="${tx.id}">Registrar</button>
        </div>
      </div>`
    );

    const recents = html`<section class="card home-recents reveal">
      ${sectionHeader("Recientes", { href: "#/transacciones", linkText: "Ver todos" })}
      ${recent.length
        ? html`<div class="tx-list">${recent.map((tx) => txRow(state, tx, { withDate: true }))}</div>`
        : emptyState({ art: "neko-anotando", title: "Todavía no hay movimientos", text: "Registra tu primer ingreso o gasto y va a aparecer aquí.", actionLabel: "Agregar transacción", action: "add-expense", compact: true, mood: "sleepy" })}
    </section>`;

    // Con más de una cuenta: cuánto hay en cada una.
    const activeAccounts = accountBalances(state, today).filter((e) => !e.account.archived);
    const accountsCard = activeAccounts.length > 1
      ? html`<section class="card home-accounts reveal">
          ${sectionHeader("Tus cuentas", { href: "#/cuentas", linkText: "Ver todas" })}
          <div class="rows rows-plain">${activeAccounts.slice(0, 6).map((e) => accountRow(state, e))}</div>
          <button type="button" class="btn btn-soft btn-sm btn-block" data-action="add-transfer">${icon("swap", 16)} Mover dinero entre cuentas</button>
        </section>`
      : "";

    // Préstamos abiertos: quién te debe y a quién le debes.
    const openLoans = loansSummary(state).items.filter((i) => i.outstanding > 0);
    const loansCard = openLoans.length
      ? html`<section class="card home-loans reveal">
          ${sectionHeader("Préstamos", { href: "#/prestamos", linkText: "Ver todos" })}
          <div class="rows rows-plain">${openLoans.slice(0, 3).map((i) => loanRow(i, today))}</div>
        </section>`
      : "";

    const billsCard = html`<section class="card home-bills reveal">
      ${sectionHeader("Próximas facturas", { href: "#/facturas", linkText: "Ver todas" })}
      ${bills.length
        ? html`<div class="rows">${bills.map((b) => billRow(state, b, { today, compact: true }))}</div>`
        : emptyState({ art: "neko-durmiendo", title: "Sin facturas registradas", text: "Suma luz, internet o suscripciones y te decimos cuánto reservar.", actionLabel: "Agregar factura", action: "add-bill", compact: true, mood: "sleepy" })}
    </section>`;

    const budgetsCard = budgetAlerts.length
      ? html`<section class="card home-budgets reveal">
          ${sectionHeader("Presupuestos para mirar", { href: "#/presupuestos", linkText: "Ver" })}
          ${budgetAlerts.slice(0, 3).map(
            (b) => html`<div class="budget-mini">
              <span class="budget-mini-name">${b.budget.icon} ${b.budget.name}</span>
              <span class="budget-mini-val">${b.level === "over" ? msg`Superado por ${m(-b.remaining)}` : msg`Quedan ${m(b.remaining)}`}</span>
              ${progressBar(b.pct, { color: b.budget.color, level: b.level })}
            </div>`
          )}
        </section>`
      : "";

    const goalsCard = html`<section class="card home-goals reveal">
      ${sectionHeader("Metas de ahorro", { href: "#/metas", linkText: "Ver todas" })}
      ${state.goals.length
        ? html`<div class="goal-list">${state.goals.slice(0, 3).map((g) => goalCard(state, g, { compact: true }))}</div>`
        : emptyState({ art: "neko-ahorrando", title: "Todavía no tienes metas", text: "Crea una y empieza a separar dinero para eso que quieres.", actionLabel: "Crear meta", action: "add-goal", compact: true })}
    </section>`;

    const usesOtherCurrency = [...state.accounts, ...state.transactions, ...state.bills, ...state.goals, ...(state.loans || [])].some((x) => x.currency && x.currency !== main);
    const ratesCard = !usesOtherCurrency ? "" : html`<section class="card home-rates reveal">
      ${sectionHeader("Tipo de cambio", { href: "#/monedas", linkText: "Editar" })}
      <div class="rates-row">
        ${state.settings.currencies
          .filter((code) => code !== main)
          .map((code) => {
            const pair = ratePair(state, code);
            return html`<a class="rate-pill" href="#/monedas">
              <span class="cur-badge">${symbolOf(code)}</span>
              <span class="rate-text">1 ${pair.from} = <strong>${formatMoney(pair.value, pair.to)}</strong></span>
            </a>`;
          })}
      </div>
      <p class="fine-print">${icon("info", 14)} Valores que ingresaste tú. Se usan para convertir montos a ${main}.</p>
    </section>`;

    // En escritorio el Inicio es un tablero: suma el resumen de los últimos
    // meses y en qué se fue el dinero este mes (los mismos datos de Reportes).
    const series = monthlySeries(state, 6, currentMonthKey());
    const byCategory = expensesByCategory(state, currentMonthKey());
    const topCats = byCategory.slice(0, 5);
    const restCats = byCategory.slice(5).reduce((s, x) => s + x.amount, 0);
    const usedColors = new Set();
    const slices = [
      ...topCats.map((x) => {
        const base = x.category?.color || "#8b958e";
        const color = usedColors.has(base) ? PALETTE.find((c) => !usedColors.has(c)) || base : base;
        usedColors.add(color);
        return { label: `${x.category?.icon || ""} ${tr(x.category?.name || "Sin categoría")}`, value: x.amount, color };
      }),
      ...(restCats > 0 ? [{ label: "Otras", value: restCats, color: "#9aa39d" }] : []),
    ];
    const barsCard = html`<section class="card home-chart home-bars reveal">
      ${sectionHeader("Resumen de los últimos meses", { href: "#/reportes", linkText: "Ver reportes" })}
      ${barChart(series.map((s) => ({ label: formatMonth(s.key, { short: true }), income: s.income, expense: s.expense, current: s.key === currentMonthKey() })), { currency: main, ...chartSize("bars") })}
    </section>`;
    const donutCard = html`<section class="card home-chart home-donut reveal">
      ${sectionHeader("Gastos por categoría", { href: "#/reportes", linkText: "Ver detalle" })}
      ${slices.length
        ? html`${donutChart(slices, { currency: main, centerLabel: "Este mes", centerValue: formatMoney(month.expense, main) })}
            <ul class="cat-breakdown">
              ${slices.map((s) => html`<li class="cb-row"><span class="legend-swatch" style="--c:${s.color}"></span><span class="cb-name">${s.label}</span><span class="cb-pct">${Math.round(percent(s.value, month.expense))}%</span><span class="cb-amount">${m(s.value)}</span></li>`)}
            </ul>`
        : html`<p class="muted-text">Cuando registres gastos este mes, vas a ver aquí cómo se reparten.</p>`}
    </section>`;

    return html`
      ${state.settings.isDemo
        ? html`<div class="demo-banner reveal">
            <span class="demo-banner-icon">${icon("sparkle", 16)}</span>
            <span class="demo-banner-text"><strong>Datos de ejemplo.</strong> Explora con calma; cuando quieras, empieza con los tuyos.</span>
            <button type="button" class="btn btn-sm btn-soft" data-action="start-fresh">Empezar con lo mío</button>
          </div>`
        : ""}
      ${needsIosInstall() && !iosNoticeSnoozed()
        ? html`<div class="demo-banner backup-banner ios-banner reveal" role="status">
            <span class="demo-banner-icon">${icon("phone", 16)}</span>
            <span class="demo-banner-text"><strong>Instala la app en tu iPhone.</strong> Si no la abres en 7 días, Safari puede borrar tus datos. Instalada en la pantalla de inicio, no pasa.</span>
            <span class="backup-banner-actions">
              <button type="button" class="btn btn-sm btn-ghost" data-action="snooze-ios-notice">Ahora no</button>
              <button type="button" class="btn btn-sm btn-primary" data-action="install-help">Cómo instalar</button>
            </span>
          </div>`
        : ""}
      ${backupReminderDue(state)
        ? html`<div class="demo-banner backup-banner reveal" role="status">
            <span class="demo-banner-icon">${icon("shield", 16)}</span>
            <span class="demo-banner-text"><strong>${getLastBackup() ? msg`Tu último backup fue hace ${daysSinceBackup(state)} días.` : "Todavía no hiciste ningún backup."}</strong>
              Guarda una copia fuera de este dispositivo (Drive, iCloud, tu correo) por si cambias de teléfono o se borran los datos del navegador.</span>
            <span class="backup-banner-actions">
              <button type="button" class="btn btn-sm btn-ghost" data-action="snooze-backup">Ahora no</button>
              <button type="button" class="btn btn-sm btn-primary" data-action="export-data">Guardar copia</button>
            </span>
          </div>`
        : ""}
      <div class="home-grid">
        <div class="home-top">
          <div class="home-main">${hero}</div>
          <div class="home-side">${dailyCard}${showExtras ? extrasLine : ""}</div>
        </div>
        ${actions}${leftovers}${pending}
        <div class="home-board">${isEmpty ? "" : barsCard}${isEmpty ? "" : donutCard}${accountsCard}${recents}${billsCard}${loansCard}${budgetsCard}${goalsCard}${ratesCard}</div>
      </div>
      <p class="privacy-note">${icon("lock", 14)} Tus datos se guardan solo en este dispositivo.</p>
      ${appFooter()}
    `;
  },
};
