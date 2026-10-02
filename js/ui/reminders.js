// Avisos de vencimientos (notificaciones del sistema), que se pueden apagar.
//
// La app no tiene servidor, así que no puede "mandar" avisos con la app
// cerrada. Lo que sí hace:
//   - Al abrir la app (o al volver a ella), avisa lo que vence.
//   - En Android con la app instalada, Chrome puede despertar al service
//     worker cada tanto (periodic background sync) y avisar aunque la app
//     esté cerrada. Cuándo lo hace lo decide Chrome.
//
// Para eso se guarda en IndexedDB un "plan" chico con los avisos de los
// próximos días (qué decir cada día) y cuáles ya se mostraron. El service
// worker solo lee ese plan: no necesita la lógica financiera.

import { withStore } from "../core/db.js";
import { cardStatus, loanOutstanding } from "../core/finance.js";
import { formatMoney } from "../core/money.js";
import { addDays, daysBetween, todayISO } from "../core/dates.js";
import { amountsHidden, getReminderDays, remindersEnabled, setRemindersEnabled } from "../core/prefs.js";

const KEY = "reminders";
const SYNC_TAG = "neko-vencimientos";
const AFTER_DAYS = 3; // un vencimiento se sigue avisando hasta 3 días después

export const remindersSupported = () => "Notification" in window && "serviceWorker" in navigator;
export const reminderPermission = () => (remindersSupported() ? Notification.permission : "unsupported");

/** Qué decir según cuántos días faltan (o pasaron). */
function title(kind, name, diff) {
  const when = diff > 1 ? `En ${diff} días` : diff === 1 ? "Mañana" : diff === 0 ? "Hoy" : null;
  const ago = diff === -1 ? "ayer" : `hace ${-diff} días`;
  if (kind === "card") return when ? `${when} vence el resumen de ${name}` : `El resumen de ${name} venció ${ago}`;
  if (kind === "debt") return when ? `${when} le tenés que devolver a ${name}` : `Tenías que devolverle a ${name} ${ago}`;
  if (kind === "lent") return when ? `${when} ${name} te tiene que devolver` : `${name} te tenía que devolver ${ago}`;
  return when ? `${when} vence ${name}` : `${name} venció ${ago}`;
}

/**
 * Avisos de los próximos vencimientos: facturas, tarjetas con deuda y
 * préstamos con fecha. Cada vencimiento tiene hasta dos avisos: uno "antes"
 * (los días previos elegidos) y otro "el día" (y hasta 3 días después).
 */
export function buildPlan(state, today = todayISO(), daysBefore = getReminderDays()) {
  const hide = amountsHidden(); // con los montos ocultos, el aviso tampoco los muestra
  const items = [];
  const add = (id, due, name, amount, kind) => {
    if (!due || due < addDays(today, -AFTER_DAYS)) return;
    const body = hide || !amount ? "Tocá para abrir Neko Finanzas" : `${amount} · Tocá para abrir Neko Finanzas`;
    const stage = (tag, from, until) => {
      const titles = {};
      for (let day = from; day <= until; day = addDays(day, 1)) titles[day] = title(kind, name, daysBetween(day, due));
      items.push({ tag: `${id}:${due}:${tag}`, from, until, titles, body });
    };
    if (daysBefore > 0) stage("antes", addDays(due, -daysBefore), addDays(due, -1));
    stage("dia", due, addDays(due, AFTER_DAYS));
  };
  const money = (amount, currency) => formatMoney(amount, currency, { reveal: true });

  for (const bill of state.bills) {
    if (bill.recurring || bill.status === "pending") add(`factura:${bill.id}`, bill.dueDate, bill.name, money(bill.amount, bill.currency), "bill");
  }
  for (const account of state.accounts) {
    if (account.kind !== "credit" || account.archived) continue;
    const card = cardStatus(state, account, today);
    if (card.debt > 0) add(`tarjeta:${account.id}`, card.due, account.name, money(card.debt, account.currency), "card");
  }
  for (const loan of state.loans || []) {
    const outstanding = loanOutstanding(loan);
    if (outstanding > 0 && loan.dueDate) add(`prestamo:${loan.id}`, loan.dueDate, loan.person, money(outstanding, loan.currency), loan.direction === "borrowed" ? "debt" : "lent");
  }
  return items;
}

async function readRecord() {
  try {
    return (await withStore("assets", "readonly", (s) => s.get(KEY))) || {};
  } catch (error) {
    return {};
  }
}

async function writeRecord(record) {
  try {
    await withStore("assets", "readwrite", (s) => s.put(record, KEY));
  } catch (error) {
    /* sin IndexedDB no hay avisos en segundo plano; al abrir la app igual se intenta */
  }
}

/** Guarda el plan de avisos según los datos de ahora (o lo vacía si están apagados). */
export async function syncPlan(state) {
  const record = await readRecord();
  if (!remindersEnabled()) {
    if (record.enabled || record.items?.length) await writeRecord({ enabled: false, items: [], shown: {} });
    return;
  }
  const items = buildPlan(state);
  const tags = new Set(items.map((i) => i.tag));
  const shown = Object.fromEntries(Object.entries(record.shown || {}).filter(([tag]) => tags.has(tag)));
  await writeRecord({ enabled: true, items, shown });
}

async function show(titleText, options) {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) return registration.showNotification(titleText, options);
  return new Notification(titleText, options); // sin service worker (por ejemplo, abierto como archivo)
}

/** Muestra los avisos que tocan hoy y todavía no se mostraron. Devuelve cuántos. */
export async function fireDue(today = todayISO()) {
  if (!remindersEnabled() || reminderPermission() !== "granted") return 0;
  const record = await readRecord();
  const shown = record.shown || {};
  let count = 0;
  for (const item of record.items || []) {
    if (shown[item.tag] || item.from > today || item.until < today || !item.titles?.[today]) continue;
    try {
      await show(item.titles[today], { body: item.body, tag: item.tag, icon: "img/icon-192.png", badge: "img/icon-192.png", data: { url: "#/facturas" } });
      shown[item.tag] = today;
      count++;
    } catch (error) {
      /* el navegador no dejó mostrarlo: se reintenta la próxima vez */
    }
  }
  if (count) await writeRecord({ ...record, shown });
  return count;
}

/** Pide permiso y prende los avisos. Devuelve "granted", "denied" o "unsupported". */
export async function enableReminders(state) {
  if (!remindersSupported()) return "unsupported";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission;
  setRemindersEnabled(true);
  await syncPlan(state);
  await fireDue();
  // Android con la app instalada: avisos aunque la app esté cerrada (si Chrome lo permite).
  try {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
    await registration?.periodicSync?.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
  } catch (error) {
    /* sin permiso para segundo plano: los avisos salen al abrir la app */
  }
  return "granted";
}

export async function disableReminders(state) {
  setRemindersEnabled(false);
  await syncPlan(state);
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.periodicSync?.unregister(SYNC_TAG);
    (await registration?.getNotifications())?.forEach((n) => n.close());
  } catch (error) {
    /* nada que apagar */
  }
}

/** Un aviso de prueba, para ver cómo se ven. */
export async function testReminder() {
  if (reminderPermission() !== "granted") return false;
  await show("Así se ven los avisos de Neko Finanzas", { body: "Te avisamos cuando se acerque un vencimiento.", tag: "prueba", icon: "img/icon-192.png", badge: "img/icon-192.png" });
  return true;
}
