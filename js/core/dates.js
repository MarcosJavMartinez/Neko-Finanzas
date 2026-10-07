// Fechas como strings "YYYY-MM-DD" en hora local. Trabajar con strings (y no
// con Date/UTC) evita los corrimientos de un día que aparecen al cruzar
// zonas horarias, y además se ordenan y comparan como texto.

import { dateLocale, msg } from "./i18n.js";

const pad = (n) => String(n).padStart(2, "0");

export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/**
 * Suma meses respetando el día preferido: un vencimiento "día 31" cae el 30
 * en abril y vuelve al 31 en mayo, en vez de ir corriéndose mes a mes.
 */
export function addMonths(iso, months, preferredDay) {
  const d = parseISO(iso);
  const day = preferredDay || d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return toISO(target);
}

export function daysBetween(fromISO, toISOString) {
  const ms = parseISO(toISOString) - parseISO(fromISO);
  return Math.round(ms / 86400000);
}

/** "2026-09" */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function currentMonthKey() {
  return monthKey(todayISO());
}

export function shiftMonthKey(key, delta) {
  return monthKey(addMonths(`${key}-01`, delta));
}

export function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return { start: `${key}-01`, end: `${key}-${pad(daysInMonth(y, m - 1))}` };
}

/** Lista de claves de mes que terminan en `endKey`, de la más vieja a la más nueva. */
export function lastMonthKeys(count, endKey = currentMonthKey()) {
  const keys = [];
  for (let i = count - 1; i >= 0; i--) keys.push(shiftMonthKey(endKey, -i));
  return keys;
}

export function formatMonth(key, { short = false } = {}) {
  const [y, m] = key.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString(dateLocale(), {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  });
  return capitalize(label.replace(".", "").replace(" de ", " "));
}

export function formatDate(iso, { withYear = false, weekday = false } = {}) {
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d
    .toLocaleDateString(dateLocale(), {
      day: "numeric",
      month: "short",
      ...(withYear || !sameYear ? { year: "numeric" } : {}),
      ...(weekday ? { weekday: "long" } : {}),
    })
    .replace(".", "");
}

/** Encabezado de día para listas: "Hoy", "Ayer" o "Lunes 21 sep". */
export function formatDayHeading(iso, today = todayISO()) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff === -1) return "Mañana";
  return capitalize(formatDate(iso, { weekday: true }).replace(",", ""));
}

/** Texto amigable para vencimientos. */
export function formatDue(iso, today = todayISO()) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Vence hoy";
  if (diff === 1) return "Vence mañana";
  if (diff > 1 && diff <= 14) return msg`Vence en ${diff} días`;
  if (diff > 14) return msg`Vence el ${formatDate(iso)}`;
  if (diff === -1) return "Venció ayer";
  return msg`Venció hace ${-diff} días`;
}

export function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Frecuencias disponibles para facturas e ingresos recurrentes. */
export const FREQUENCIES = {
  weekly: { label: "Semanal", next: (iso) => addDays(iso, 7) },
  biweekly: { label: "Quincenal", next: (iso) => addDays(iso, 14) },
  monthly: { label: "Mensual", next: (iso, day) => addMonths(iso, 1, day) },
  bimonthly: { label: "Bimestral", next: (iso, day) => addMonths(iso, 2, day) },
  quarterly: { label: "Trimestral", next: (iso, day) => addMonths(iso, 3, day) },
  semiannual: { label: "Semestral", next: (iso, day) => addMonths(iso, 6, day) },
  yearly: { label: "Anual", next: (iso, day) => addMonths(iso, 12, day) },
};

export function nextDate(iso, frequency, preferredDay) {
  const freq = FREQUENCIES[frequency] || FREQUENCIES.monthly;
  return freq.next(iso, preferredDay);
}
