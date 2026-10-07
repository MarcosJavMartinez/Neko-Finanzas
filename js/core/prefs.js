// Preferencias de este dispositivo: tema, vibración y recordatorio de backup.
// Viven aparte de los datos financieros (no viajan en el backup): son del
// teléfono o navegador, no de tus finanzas.

const KEYS = {
  theme: "nekoFinanzas.theme",
  vibration: "nekoFinanzas.vibration",
  backupEvery: "nekoFinanzas.backupEvery",
  lastBackup: "nekoFinanzas.lastBackup",
  backupSnooze: "nekoFinanzas.backupSnooze",
  hideAmounts: "nekoFinanzas.hideAmounts",
  onboardingSeen: "nekoFinanzas.onboardingSeen",
  setupOffered: "nekoFinanzas.setupOffered",
  amountCents: "nekoFinanzas.amountCents",
  iosNoticeSnooze: "nekoFinanzas.iosNoticeSnooze",
  lastAccount: "nekoFinanzas.lastAccount",
  reminders: "nekoFinanzas.reminders",
  reminderDays: "nekoFinanzas.reminderDays",
};

const DAY = 86400000;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) {
    /* sin localStorage: la preferencia dura hasta recargar */
  }
}

function readTime(key) {
  const time = Date.parse(read(key) || "");
  return Number.isFinite(time) ? time : null;
}

// ---------------------------------------------------------------------------
// Tema: "auto" sigue al sistema (es lo que hace boot.js si no hay nada guardado)
// ---------------------------------------------------------------------------

export function getThemePref() {
  const value = read(KEYS.theme);
  return value === "light" || value === "dark" ? value : "auto";
}

export function setThemePref(value) {
  write(KEYS.theme, value === "light" || value === "dark" ? value : null);
}

// ---------------------------------------------------------------------------
// Vibración (activada salvo que la apagues)
// ---------------------------------------------------------------------------

export const canVibrate = () => typeof navigator !== "undefined" && "vibrate" in navigator;
export const vibrationEnabled = () => read(KEYS.vibration) !== "off";
export const setVibration = (on) => write(KEYS.vibration, on ? null : "off");

// ---------------------------------------------------------------------------
// Ocultar montos (para abrir la app en público) y tutorial visto
// ---------------------------------------------------------------------------

export const amountsHidden = () => read(KEYS.hideAmounts) === "1";
export const setAmountsHidden = (on) => write(KEYS.hideAmounts, on ? "1" : null);

export const onboardingSeen = () => read(KEYS.onboardingSeen) === "1";

/**
 * Escribir montos con centavos (los números entran desde los centavos) o sin
 * ellos (se escribe el número entero: 1500 es $ 1.500).
 */
export const amountCents = () => read(KEYS.amountCents) !== "off";
export const setAmountCents = (on) => write(KEYS.amountCents, on ? null : "off");

// Avisos de vencimientos (apagados hasta que la persona los prende).
export const REMINDER_DAYS = [0, 1, 3];
export const remindersEnabled = () => read(KEYS.reminders) === "on";
export const setRemindersEnabled = (on) => write(KEYS.reminders, on ? "on" : null);
/** Cuántos días antes avisar (además del mismo día): 0, 1 o 3. */
export function getReminderDays() {
  const n = Number(read(KEYS.reminderDays));
  return REMINDER_DAYS.includes(n) && read(KEYS.reminderDays) !== null ? n : 1;
}
export const setReminderDays = (n) => write(KEYS.reminderDays, REMINDER_DAYS.includes(Number(n)) ? String(Number(n)) : null);

/** Última cuenta usada al cargar un movimiento (se propone la próxima vez). */
export const getLastAccount = () => read(KEYS.lastAccount) || "";
export const setLastAccount = (id) => write(KEYS.lastAccount, id || null);

/** Aviso de iPhone ("instálala para que no se borren tus datos") pospuesto. */
export function iosNoticeSnoozed(now = Date.now()) {
  const until = readTime(KEYS.iosNoticeSnooze);
  return !!until && until > now;
}
export const snoozeIosNotice = (days = 7) => write(KEYS.iosNoticeSnooze, new Date(Date.now() + days * DAY).toISOString());
export const markOnboardingSeen = () => write(KEYS.onboardingSeen, "1");
/** El cuestionario de inicio ya se ofreció (o se abrió) en este dispositivo. */
export const setupOffered = () => read(KEYS.setupOffered) === "1";
export const markSetupOffered = () => write(KEYS.setupOffered, "1");

// ---------------------------------------------------------------------------
// Recordatorio de backup
// ---------------------------------------------------------------------------

export const BACKUP_INTERVALS = { week: 7, month: 30, never: 0 };
const isInterval = (value) => Object.prototype.hasOwnProperty.call(BACKUP_INTERVALS, value ?? "");

export function getBackupEvery() {
  const value = read(KEYS.backupEvery);
  return isInterval(value) ? value : "month";
}

export function setBackupEvery(value) {
  write(KEYS.backupEvery, isInterval(value) ? value : null);
}

/** Fecha (ms) del último backup exportado desde este dispositivo, o null. */
export function getLastBackup() {
  return readTime(KEYS.lastBackup);
}

export function markBackup() {
  write(KEYS.lastBackup, new Date().toISOString());
  write(KEYS.backupSnooze, null);
}

export function snoozeBackupReminder(days = 7) {
  write(KEYS.backupSnooze, new Date(Date.now() + days * DAY).toISOString());
}

/** Días desde el último backup (o desde que empezaste, si nunca hiciste uno). */
export function daysSinceBackup(state, now = Date.now()) {
  const since = getLastBackup() ?? Date.parse(state.settings.createdAt);
  return Number.isFinite(since) ? Math.max(0, Math.floor((now - since) / DAY)) : 0;
}

/**
 * ¿Toca recordar el backup? Solo con datos propios que valga la pena
 * guardar, cuando pasó el intervalo elegido y no se pospuso.
 */
export function backupReminderDue(state, now = Date.now()) {
  const every = BACKUP_INTERVALS[getBackupEvery()];
  if (!every || (state.settings.isDemo && !state.settings.demoEdited)) return false;
  if (state.transactions.length + state.bills.length + state.goals.length < 5) return false;
  const snooze = readTime(KEYS.backupSnooze);
  if (snooze && snooze > now) return false;
  return daysSinceBackup(state, now) >= every;
}
