// Vencimientos de facturas como calendario (.ics): se abre con Google
// Calendar, el calendario del iPhone u Outlook y quedan los avisos, sin
// servidor ni notificaciones de la app.
//
// Cada factura es un evento de día completo en su próximo vencimiento; las
// recurrentes llevan la regla de repetición (RRULE) equivalente. Avisos: el
// día anterior a las 9 y el mismo día a las 9.

import { msg } from "./i18n.js";
import { formatMoney } from "./money.js";
import { todayISO } from "./dates.js";

const RULES = {
  weekly: "FREQ=WEEKLY",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
  bimonthly: "FREQ=MONTHLY;INTERVAL=2",
  quarterly: "FREQ=MONTHLY;INTERVAL=3",
  semiannual: "FREQ=MONTHLY;INTERVAL=6",
  yearly: "FREQ=YEARLY",
};

/** Texto seguro para iCalendar: escapa \ ; , y saltos de línea. */
function text(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Corta líneas a 75 bytes como pide el estándar (sin partir caracteres). */
function fold(line) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length ? 74 : 75; // las de continuación empiezan con un espacio
    if (bytes.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const ymd = (iso) => iso.replace(/-/g, "");

/**
 * Regla mensual: el día 29, 30 o 31 en meses más cortos cae en el último
 * día, igual que en la app ("el 31" → 30 de abril, 28 de febrero).
 */
function rule(bill) {
  const base = RULES[bill.frequency] || RULES.monthly;
  const day = bill.dueDay || Number(bill.dueDate.slice(8));
  if (!base.startsWith("FREQ=MONTHLY") || day < 29) return base;
  const days = [];
  for (let d = 28; d <= day; d++) days.push(d);
  return `${base};BYMONTHDAY=${days.join(",")};BYSETPOS=-1`;
}

export function billsToICS(state, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const today = todayISO();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Neko Tools//Neko Finanzas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Vencimientos · Neko Finanzas",
  ];
  let count = 0;
  for (const bill of state.bills) {
    // Una factura única ya pagada no tiene más vencimientos.
    if (!bill.recurring && bill.status === "paid") continue;
    const start = bill.dueDate;
    const end = new Date(`${start}T12:00:00`);
    end.setDate(end.getDate() + 1);
    const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    const amount = formatMoney(bill.amount, bill.currency, { reveal: true });
    const title = msg`${bill.icon ? `${bill.icon} ` : ""}Vence ${bill.name} · ${amount}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${bill.id}@neko-finanzas`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(endISO)}`,
      `SUMMARY:${text(title)}`,
      `DESCRIPTION:${text(msg`Factura de ${amount}${start < today ? " (vencida)" : ""}. Registra el pago en Neko Finanzas para que deje de estar reservada.`)}`,
      "TRANSP:TRANSPARENT",
      ...(bill.recurring ? [`RRULE:${rule(bill)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${text(msg`Mañana vence ${bill.name}`)}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${text(msg`Hoy vence ${bill.name}`)}`,
      "TRIGGER:PT9H",
      "END:VALARM",
      "END:VEVENT"
    );
    count++;
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.map(fold).join("\r\n") + "\r\n", count };
}
