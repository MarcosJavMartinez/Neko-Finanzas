// Facturas y servicios: cuánto reservar, el calendario de vencimientos del
// mes y el estado de cada obligación.

import { msg, tr, dateLocale } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { art, billRow, emptyState } from "../ui/components.js";
import { openSheet } from "../ui/sheet.js";
import { formatMoney } from "../core/money.js";
import { currentMonthKey, formatDate, formatMonth, monthRange, parseISO, shiftMonthKey, todayISO } from "../core/dates.js";
import { billCalendar, billCushion, billReserve, billStatus, toMain } from "../core/finance.js";
import { releaseBillCushion, snapshot, restore } from "../core/store.js";
import { openCushionSheet } from "../ui/forms/leftoverForm.js";
import { getState } from "../core/store.js";
import { billsToICS } from "../core/ics.js";
import { downloadFile } from "../ui/download.js";
import { toast } from "../ui/toast.js";

/** Iniciales de lunes a domingo en el idioma elegido ("L M M J V S D"). El 1/1/2024 fue lunes. */
const weekdays = () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(dateLocale(), { weekday: "narrow" }).toUpperCase());
// Prioridad del color de un día con varias facturas: lo más urgente manda.
const TONE_ORDER = ["overdue", "soon", "later", "paid"];

// Estado de la pantalla (no se guarda: vuelve al mes actual).
const view = { month: currentMonthKey() };

function dayTone(items, today) {
  const tones = items.map((i) =>
    i.status === "pending" ? (Math.round((parseISO(i.dueDate) - parseISO(today)) / 86400000) <= 7 ? "soon" : "later") : i.status
  );
  return TONE_ORDER.find((t) => tones.includes(t));
}

function calendar(state, today) {
  const main = state.settings.mainCurrency;
  const days = billCalendar(state, view.month, today);
  const { start, end } = monthRange(view.month);
  const first = parseISO(start);
  const lastDay = parseISO(end).getDate();
  const offset = (first.getDay() + 6) % 7; // semana que arranca el lunes
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(html`<span class="cal-cell is-empty" aria-hidden="true"></span>`);
  for (let day = 1; day <= lastDay; day++) {
    const iso = `${view.month}-${String(day).padStart(2, "0")}`;
    const items = days[iso];
    const isToday = iso === today;
    if (!items) {
      cells.push(html`<span class="cal-cell ${isToday ? "is-today" : ""}">${day}</span>`);
      continue;
    }
    const tone = dayTone(items, today);
    const label = `${formatDate(iso)}: ${items.map((i) => tr(i.bill.name)).join(", ")}`;
    cells.push(html`<button type="button" class="cal-cell has-due tone-${tone} ${isToday ? "is-today" : ""}" data-action="bills-day" data-date="${iso}" aria-label="${label}" title="${label}">
      ${day}${items.length > 1 ? html`<span class="cal-count">${items.length}</span>` : ""}
    </button>`);
  }
  const all = Object.values(days).flat();
  const total = all.reduce((s, i) => s + i.amountMain, 0);
  const isCurrent = view.month === currentMonthKey();

  return html`<section class="card bill-cal reveal" aria-label="Calendario de vencimientos">
    <div class="cal-head">
      <button type="button" class="icon-btn" data-action="bills-month" data-delta="-1" aria-label="Mes anterior">${icon("chevronLeft", 20)}</button>
      <div class="cal-title">
        <span class="cal-kicker">Vencimientos</span>
        <strong>${formatMonth(view.month)}</strong>
      </div>
      <button type="button" class="icon-btn" data-action="bills-month" data-delta="1" aria-label="Mes siguiente">${icon("chevronRight", 20)}</button>
    </div>
    <div class="cal-grid">
      ${weekdays().map((d) => html`<span class="cal-weekday" aria-hidden="true">${d}</span>`)}
      ${cells}
    </div>
    <div class="cal-foot">
      <span class="cal-legend"><i class="tone-overdue"></i>Vencida</span>
      <span class="cal-legend"><i class="tone-soon"></i>Vence pronto</span>
      <span class="cal-legend"><i class="tone-later"></i>Más adelante</span>
      <span class="cal-legend"><i class="tone-paid"></i>Pagada</span>
    </div>
    <p class="cal-total">${all.length} vencimiento${all.length === 1 ? "" : "s"} en ${formatMonth(view.month).split(" ")[0].toLowerCase()} · <strong>${formatMoney(total, main)}</strong>
      ${isCurrent ? "" : html` · <button type="button" class="link-btn" data-action="bills-today">Volver a hoy</button>`}</p>
  </section>`;
}

/** Al tocar un día del calendario: las facturas que vencen ese día. */
function openDay(date) {
  const state = getState();
  const today = todayISO();
  const items = billCalendar(state, date.slice(0, 7), today)[date] || [];
  if (!items.length) return;
  openSheet({
    title: msg`Vencen el ${formatDate(date, { withYear: true })}`,
    body: html`<div class="card card-flush rows">${items.map((i) => billRow(state, i.bill, { today, dueDate: i.dueDate, status: i.status }))}</div>
      <p class="fine-print">${icon("info", 14)} Toca una factura para ver el detalle. Solo se puede pagar el vencimiento actual de cada una.</p>`,
  });
}

export default {
  id: "facturas",
  tab: "mas",
  title: "Facturas",
  back: "#/mas",
  render(state) {
    const today = todayISO();
    const main = state.settings.mainCurrency;
    if (!state.bills.length) {
      return html`<div class="card">${emptyState({
        art: "neko-durmiendo",
        title: "Todavía no agregaste facturas",
        text: "Agrega luz, gas, internet o tus suscripciones con su fecha de vencimiento y te decimos cuánto reservar.",
        actionLabel: "Agregar factura",
        action: "add-bill",
        mood: "sleepy",
      })}</div>`;
    }
    const reserve = billReserve(state, today);
    const cushion = billCushion(state);
    const withStatus = state.bills.map((b) => ({ bill: b, status: billStatus(b, today) }));
    const byDue = (a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate);
    const overdue = withStatus.filter((x) => x.status === "overdue").sort(byDue);
    const pending = withStatus.filter((x) => x.status === "pending").sort(byDue);
    const paid = withStatus.filter((x) => x.status === "paid").sort(byDue);
    const monthlyTotal = state.bills
      .filter((b) => b.recurring)
      .reduce((s, b) => s + toMain(state, b.amount, b.currency) * monthlyFactor(b.frequency), 0);
    const horizon = state.settings.reserveHorizon === "month" ? "hasta fin de mes" : msg`hasta el ${formatDate(reserve.until)}`;

    const group = (title, list) =>
      list.length ? html`<h2 class="section-title section-title-spaced">${title}</h2><div class="card card-flush rows">${list.map((x) => billRow(state, x.bill, { today }))}</div>` : "";

    return html`
      <section class="summary-card summary-bill has-art reveal">
        ${art("ilus-factura", 84, "summary-art")}
        <div class="summary-text">
          <p class="summary-label">Dinero a reservar para facturas</p>
          <p class="summary-amount">${formatMoney(reserve.amount, main)}</p>
          <p class="summary-sub">${reserve.items.length} vencimiento${reserve.items.length === 1 ? "" : "s"} ${horizon} · ya descontado de tu disponible</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="add-bill">${icon("plus", 18)}Agregar</button>
      </section>
      ${cushion.enabled
        ? html`<section class="card cushion-card reveal">
            <span class="mini-icon">${icon("shield", 20)}</span>
            <div class="row-main">
              <span class="row-title">Fondo de facturas: <strong data-pulse="cushion">${formatMoney(cushion.amount, main)}</strong></span>
              <span class="row-meta">${cushion.amount > 0 ? "Lo que sobró de facturas que vinieron por menos. Está reservado para las próximas." : "Cuando una factura venga por menos de lo esperado, la diferencia se guarda aquí."}</span>
            </div>
            ${cushion.amount > 0
              ? html`<span class="cushion-actions">
                  <button type="button" class="btn btn-sm btn-ghost" data-action="release-cushion">Liberar</button>
                  <button type="button" class="btn btn-sm btn-soft" data-action="cushion-to-goal">Pasar a una meta</button>
                </span>`
              : ""}
          </section>`
        : ""}
      <div class="bills-layout">
        <div class="bills-side">${calendar(state, today)}</div>
        <div class="bills-main">
          ${group("Vencidas", overdue)}
          ${group("Pendientes", pending)}
          ${group("Pagadas este período", paid)}
        </div>
      </div>
      <p class="fine-print center">${icon("repeat", 14)} Tus servicios recurrentes suman ≈ ${formatMoney(monthlyTotal, main)} por mes.</p>
      <section class="card ics-card reveal">
        <span class="mini-icon">${icon("calendar", 20)}</span>
        <div class="row-main">
          <span class="row-title">Lleva los vencimientos a tu calendario</span>
          <span class="row-meta">Google Calendar, iPhone u Outlook te avisan el día antes, sin que abras la app.</span>
        </div>
        <button type="button" class="btn btn-sm btn-soft" data-action="export-ics">${icon("download", 16)} Exportar</button>
      </section>
    `;
  },
  actions: {
    "bills-month"(el) {
      view.month = shiftMonthKey(view.month, Number(el.dataset.delta));
      return true;
    },
    "bills-today"() {
      view.month = currentMonthKey();
      return true;
    },
    "bills-day"(el) {
      openDay(el.dataset.date);
    },
    "cushion-to-goal"() {
      openCushionSheet();
    },
    "release-cushion"() {
      const amount = billCushion(getState()).amount;
      const backup = snapshot();
      releaseBillCushion(amount);
      toast(msg`${formatMoney(amount, getState().settings.mainCurrency)} volvieron a tu disponible`, { type: "info", actionLabel: "Deshacer", onAction: () => restore(backup) });
    },
    "export-ics"() {
      const { ics, count } = billsToICS(getState());
      if (!count) {
        toast("No hay vencimientos pendientes para exportar", { type: "info" });
        return;
      }
      downloadFile(ics, "neko-finanzas-vencimientos.ics", "text/calendar;charset=utf-8");
      toast(msg`Calendario descargado: ${count} factura${count === 1 ? "" : "s"}. Ábrelo para sumarlas a tu calendario.`, { duration: 6000 });
    },
  },
};

/** Equivalente mensual de cada frecuencia (para el total aproximado). */
function monthlyFactor(frequency) {
  return { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, bimonthly: 1 / 2, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12 }[frequency] ?? 1;
}
