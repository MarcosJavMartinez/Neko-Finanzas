// Piezas de interfaz reutilizables. Todas devuelven HTML (vía `html`) y no
// tienen lógica propia: los eventos se manejan por delegación con
// atributos data-action (ver app.js).

import { html } from "./dom.js";
import { icon, nekoArt } from "./icons.js";
import { formatMoney, CURRENCIES } from "../core/money.js";
import { currentMonthKey, daysBetween, formatDate, formatDue, formatMonth, parseISO, todayISO, FREQUENCIES } from "../core/dates.js";
import { billStatus, findCategory, findSubcategory, goalProgress, toMain } from "../core/finance.js";

export function money(amount, currency, { sign = false, className = "" } = {}) {
  return html`<span class="money ${className}">${formatMoney(amount, currency, { sign })}</span>`;
}

/** "≈ $ 2.700.000" cuando la moneda no es la principal. */
export function approx(state, amount, currency) {
  const main = state.settings.mainCurrency;
  if (currency === main) return "";
  return html`<span class="approx" title="Según tu tipo de cambio">≈ ${formatMoney(toMain(state, amount, currency), main)}</span>`;
}

/** Burbuja con el ícono de la categoría (o el de la subcategoría, si tiene). */
export function catBubble(category, size = "md", sub) {
  const color = category?.color || "#8b958e";
  return html`<span class="cat-bubble cat-bubble-${size}" style="--c:${color}" aria-hidden="true">${sub?.icon || category?.icon || "📦"}</span>`;
}

export function progressBar(pct, { color, level = "ok", label = "" } = {}) {
  const width = Math.max(0, Math.min(100, pct));
  return html`<div class="progress progress-${level}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" ${label ? html`aria-label="${label}"` : ""}>
    <div class="progress-fill" style="--w:${width}%;${color ? `--c:${color}` : ""}"></div>
  </div>`;
}

export function sectionHeader(title, { href, linkText = "Ver todo", action } = {}) {
  return html`<div class="section-head">
    <h2 class="section-title">${title}</h2>
    ${href ? html`<a class="section-link" href="${href}">${linkText}${icon("chevronRight", 16)}</a>` : ""}
    ${action ? html`<button type="button" class="section-link" data-action="${action.name}">${action.icon ? icon(action.icon, 16) : ""}${action.label}</button>` : ""}
  </div>`;
}

export function emptyState({ title, text, actionLabel, action, mood = "happy", compact = false }) {
  return html`<div class="empty ${compact ? "empty-compact" : ""}">
    ${nekoArt({ size: compact ? 76 : 112, mood })}
    <p class="empty-title">${title}</p>
    ${text ? html`<p class="empty-text">${text}</p>` : ""}
    ${actionLabel ? html`<button type="button" class="btn btn-primary btn-sm" data-action="${action}">${icon("plus", 18)}${actionLabel}</button>` : ""}
  </div>`;
}

export function segmented(name, options, value, { action = "", size = "" } = {}) {
  return html`<div class="segmented ${size}" role="radiogroup">
    ${options.map(
      (o) => html`<label class="segmented-option">
        <input type="radio" name="${name}" value="${o.value}" ${o.value === value ? "checked" : ""} ${action ? html`data-change="${action}"` : ""} />
        <span>${o.icon ? icon(o.icon, 16) : ""}${o.label}</span>
      </label>`
    )}
  </div>`;
}

export function statusChip(level, text) {
  const icons = { ok: "check", near: "alert", over: "alert", done: "sparkle", overdue: "alert", pending: "calendar", paid: "check" };
  return html`<span class="chip chip-${level}">${icon(icons[level] || "info", 14)}${text}</span>`;
}

/** Selector de mes: ‹ Septiembre 2026 › (no deja ir al futuro). */
export function monthNav(key, action) {
  const isCurrent = key === currentMonthKey();
  return html`<div class="month-nav">
    <button type="button" class="icon-btn" data-action="${action}" data-delta="-1" aria-label="Mes anterior">${icon("chevronLeft", 20)}</button>
    <span class="month-nav-label">${formatMonth(key)}</span>
    <button type="button" class="icon-btn" data-action="${action}" data-delta="1" aria-label="Mes siguiente" ${isCurrent ? "disabled" : ""}>${icon("chevronRight", 20)}</button>
  </div>`;
}

/** Pie de página de Neko Tools (mismo que Neko Lista). */
export function appFooter() {
  return html`<footer class="app-footer">
    <p class="app-footer-line">Hecho con ❤️ por Neko Tools</p>
    <a class="app-footer-support-btn" href="https://ko-fi.com/nekotools" target="_blank" rel="noopener">❤️ Apoyar el proyecto</a>
    <p class="app-footer-links">
      <a class="app-footer-link" href="https://nekotools.site" target="_blank" rel="noopener">Más herramientas</a>
      <span aria-hidden="true">·</span>
      <a class="app-footer-link" href="https://nekotools.site/privacidad.html" target="_blank" rel="noopener">Privacidad</a>
    </p>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Filas de listas
// ---------------------------------------------------------------------------

/**
 * Fila de movimiento al estilo Neko Lista: nombre, línea punteada y monto
 * en una línea; categoría (y fecha/hora) debajo. Van todas dentro de una
 * misma superficie (.tx-list), no como tarjetas sueltas.
 */
export function txRow(state, tx, { withDate = false, hideAccount = false } = {}) {
  if (tx.type === "transfer") return transferRow(state, tx, { withDate });
  if (tx.type === "loan") return loanRow(state, tx, { withDate, hideAccount });
  const category = findCategory(state, tx.categoryId);
  const sub = findSubcategory(category, tx.subcategoryId);
  const isIncome = tx.type === "income";
  const title = tx.description || sub?.name || category?.name || (isIncome ? "Ingreso" : "Gasto");
  // "Hogar · Alquiler", salvo que el título ya sea el nombre de la subcategoría.
  const where = sub && title !== sub.name ? `${category.name} · ${sub.name}` : category?.name;
  const when = withDate ? [shortDay(tx.date), tx.time].filter(Boolean).join(" ") : tx.time;
  // Con más de una cuenta, se ve de dónde salió o a dónde entró la plata.
  const account = state.accounts.length > 1 && !hideAccount ? state.accounts.find((a) => a.id === tx.accountId) : null;
  const meta = [where, account && `${account.icon} ${account.name}`, when].filter(Boolean).join(" · ");
  // Recién cargado: entra con la animación de "producto nuevo" de Neko Lista.
  const isNew = tx.createdAt.includes("T") && Date.now() - Date.parse(tx.createdAt) < 2500;
  return html`<button type="button" class="tx-row ${isNew ? "is-new" : ""}" data-action="edit-tx" data-id="${tx.id}">
    ${catBubble(category, "md", sub)}
    <span class="tx-body">
      <span class="tx-top">
        <span class="tx-name">${title}</span>
        ${tx.billId ? html`<span class="tag tag-bill">${icon("receipt", 12)}Factura</span>` : ""}
        ${tx.installment ? html`<span class="tag tag-installment" title="Cuota ${tx.installment.n} de ${tx.installment.of}">${tx.installment.n}/${tx.installment.of}</span>` : ""}
        ${tx.recurrence ? html`<span class="tag" title="Se repite">${icon("repeat", 12)}</span>` : ""}
        ${tx.date > todayISO() ? html`<span class="tag tag-future" title="Fecha futura: todavía no cuenta en tu saldo">Programado</span>` : ""}
        <span class="tx-leader" aria-hidden="true"></span>
        <span class="tx-amount ${isIncome ? "is-income" : "is-expense"}">${formatMoney(isIncome ? tx.amount : -tx.amount, tx.currency, { sign: true })}</span>
      </span>
      <span class="tx-bottom">
        <span class="tx-meta">${meta}</span>
        ${approx(state, tx.amount, tx.currency)}
      </span>
    </span>
  </button>`;
}

/** Transferencia entre cuentas: no es ingreso ni gasto (monto en neutro). */
function transferRow(state, tx, { withDate }) {
  const from = state.accounts.find((a) => a.id === tx.accountId);
  const to = state.accounts.find((a) => a.id === tx.toAccountId);
  const when = withDate ? [shortDay(tx.date), tx.time].filter(Boolean).join(" ") : tx.time;
  const meta = [`${from?.name || "?"} → ${to?.name || "?"}`, when].filter(Boolean).join(" · ");
  const isNew = tx.createdAt.includes("T") && Date.now() - Date.parse(tx.createdAt) < 2500;
  const fx = tx.currency !== tx.toCurrency ? html`<span class="approx">→ ${formatMoney(tx.toAmount, tx.toCurrency)}</span>` : "";
  return html`<button type="button" class="tx-row tx-transfer ${isNew ? "is-new" : ""}" data-action="edit-transfer" data-id="${tx.id}">
    <span class="cat-bubble cat-bubble-md transfer-bubble" aria-hidden="true">${icon("swap", 18)}</span>
    <span class="tx-body">
      <span class="tx-top">
        <span class="tx-name">${tx.description || "Transferencia"}</span>
        ${tx.date > todayISO() ? html`<span class="tag tag-future" title="Fecha futura: todavía no cuenta en tu saldo">Programado</span>` : ""}
        <span class="tx-leader" aria-hidden="true"></span>
        <span class="tx-amount is-transfer">${formatMoney(tx.amount, tx.currency)}</span>
      </span>
      <span class="tx-bottom">
        <span class="tx-meta">${meta}</span>
        ${fx}
      </span>
    </span>
  </button>`;
}

/** Plata de un préstamo: entra o sale de la cuenta, pero no es ingreso ni gasto. */
function loanRow(state, tx, { withDate, hideAccount }) {
  const account = state.accounts.length > 1 && !hideAccount ? state.accounts.find((a) => a.id === tx.accountId) : null;
  const when = withDate ? [shortDay(tx.date), tx.time].filter(Boolean).join(" ") : tx.time;
  const meta = ["Préstamo", account && `${account.icon} ${account.name}`, when].filter(Boolean).join(" · ");
  const isNew = tx.createdAt.includes("T") && Date.now() - Date.parse(tx.createdAt) < 2500;
  return html`<button type="button" class="tx-row tx-loan ${isNew ? "is-new" : ""}" data-action="loan-detail" data-id="${tx.loanId}">
    <span class="cat-bubble cat-bubble-md loan-bubble" aria-hidden="true">🤝</span>
    <span class="tx-body">
      <span class="tx-top">
        <span class="tx-name">${tx.description || "Préstamo"}</span>
        <span class="tx-leader" aria-hidden="true"></span>
        <span class="tx-amount is-transfer">${formatMoney(tx.flow === "in" ? tx.amount : -tx.amount, tx.currency, { sign: true })}</span>
      </span>
      <span class="tx-bottom">
        <span class="tx-meta">${meta}</span>
        ${approx(state, tx.amount, tx.currency)}
      </span>
    </span>
  </button>`;
}

/** "Hoy", "Ayer" o "24 sep". */
function shortDay(iso) {
  const today = todayISO();
  if (iso === today) return "Hoy";
  if (daysBetween(iso, today) === 1) return "Ayer";
  return formatDate(iso);
}

/**
 * Hojita de calendario con la fecha de vencimiento ("29 / SEP"). El color
 * dice el estado: vencida, vence en 7 días o menos, más adelante o pagada.
 */
export function dueTile(dueDate, status, today = todayISO()) {
  const tone = status === "paid" ? "paid" : status === "overdue" ? "overdue" : daysBetween(today, dueDate) <= 7 ? "soon" : "later";
  const d = parseISO(dueDate);
  const month = d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
  return html`<span class="due-tile due-tile-${tone}" aria-hidden="true">
    <span class="due-tile-month">${month}</span>
    <span class="due-tile-day">${d.getDate()}</span>
  </span>`;
}

export function billRow(state, bill, { today = todayISO(), dueDate = bill.dueDate, compact = false, status: forced } = {}) {
  const isCurrent = dueDate === bill.dueDate;
  const status = forced || (isCurrent ? billStatus(bill, today) : "pending");
  const label = status === "paid" ? "Pagada" : status === "overdue" ? "Vencida" : "Pendiente";
  // Pagada: la hojita muestra el próximo vencimiento y el texto lo aclara.
  const sub =
    status === "paid"
      ? isCurrent || bill.dueDate <= dueDate ? `Pagada · próxima ${formatDate(bill.dueDate)}` : "Pagada"
      : formatDue(dueDate, today);
  const freq = bill.recurring ? FREQUENCIES[bill.frequency]?.label : "Única vez";
  return html`<div class="row row-bill status-${status}">
    <button type="button" class="row-hit" data-action="bill-detail" data-id="${bill.id}" aria-label="Ver ${bill.name}, ${label.toLowerCase()}, vence el ${formatDate(dueDate, { withYear: true })}"></button>
    ${dueTile(dueDate, status, today)}
    <span class="row-main">
      <span class="row-title"><span class="bill-emoji" aria-hidden="true">${bill.icon || "🧾"}</span>${bill.name}</span>
      <span class="row-meta"><span class="due due-${status}">${sub}</span>${compact ? "" : html` · ${freq}`}</span>
    </span>
    <span class="row-end">
      <span class="row-amount">${formatMoney(bill.amount, bill.currency)}</span>
      ${status === "paid" && !compact ? statusChip(status, label) : approx(state, bill.amount, bill.currency)}
    </span>
    ${status !== "paid" && isCurrent
      ? html`<button type="button" class="row-quick" data-action="pay-bill" data-id="${bill.id}" aria-label="Marcar ${bill.name} como pagada" title="Marcar como pagada">${icon("check", 15)}Pagar</button>`
      : ""}
  </div>`;
}

export function goalCard(state, goal, { compact = false } = {}) {
  const p = goalProgress(goal);
  return html`<button type="button" class="goal-card ${compact ? "goal-card-compact" : ""}" data-action="goal-detail" data-id="${goal.id}" style="--c:${goal.color}">
    <span class="goal-top">
      <span class="cat-bubble cat-bubble-md is-tinted" style="--c:${goal.color}" aria-hidden="true">${goal.icon}</span>
      <span class="row-main">
        <span class="row-title">${goal.name}</span>
        <span class="row-meta">${p.done ? "¡Meta cumplida! 🎉" : goal.targetDate ? `Para el ${formatDate(goal.targetDate, { withYear: true })}` : `Faltan ${formatMoney(p.remaining, goal.currency)}`}</span>
      </span>
      <span class="goal-pct">${Math.floor(p.pct)}%</span>
    </span>
    ${progressBar(p.pct, { color: goal.color, level: p.done ? "done" : "ok", label: `Progreso de ${goal.name}` })}
    <span class="goal-amounts">
      <span><strong>${formatMoney(p.saved, goal.currency)}</strong> / ${formatMoney(goal.target, goal.currency)}</span>
      ${approx(state, goal.target, goal.currency)}
    </span>
  </button>`;
}

export function currencyOptions(selected) {
  return Object.values(CURRENCIES).map(
    (c) => html`<option value="${c.code}" ${c.code === selected ? "selected" : ""}>${c.code}</option>`
  );
}
