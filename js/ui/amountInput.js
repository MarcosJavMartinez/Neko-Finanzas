// Campos de monto, como en un cajero: se tipean solo números y van entrando
// desde los centavos (0,01 → 0,15 → 1,50 → 15,00 → 150,00). La coma y los
// puntos de miles los pone la app, así que lo que se ve en el campo es
// exactamente lo que se guarda. Borrar saca el último número.
//
// Los campos marcados `data-plain` (un porcentaje) no usan centavos: ahí se
// escribe el número tal cual, con una única coma decimal.

import { amountToInput, parseAmount } from "../core/money.js";

const SELECTOR = 'input[inputmode="decimal"]';
const MAX_DIGITS = 15;
const digitsOf = (text) => text.replace(/\D/g, "");
const isKept = (ch) => (ch >= "0" && ch <= "9") || ch === ",";
const signOf = (text) => (text.trimStart().startsWith("-") ? "-" : "");
const dots = (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function caretToEnd(input) {
  try {
    input.setSelectionRange(input.value.length, input.value.length);
  } catch (error) {
    /* el campo no admite selección */
  }
}

/** "150000" (centavos) → "1.500,00"; sin números, el campo queda vacío. */
function fromCents(digits) {
  const clean = digits.replace(/^0+/, "").slice(0, MAX_DIGITS);
  if (!clean) return "";
  const padded = clean.padStart(3, "0");
  return `${dots(padded.slice(0, -2))},${padded.slice(-2)}`;
}

function formatCents(input, event, before) {
  let digits = digitsOf(input.value);
  // Borrar sobre la coma o un punto no sacó ningún número: se lleva el último.
  if (/^delete/.test(event.inputType) && digits === digitsOf(before) && input.value !== before) digits = digits.slice(0, -1);
  const body = fromCents(digits);
  input.value = body ? signOf(input.value) + body : "";
  caretToEnd(input);
}

/** Número tal cual: solo dígitos y una coma decimal (hasta 2 decimales). */
function formatPlain(input, event) {
  const value = input.value;
  const caret = input.selectionStart ?? value.length;
  const typedSeparator = (event.data === "." || event.data === ",") && (value[caret - 1] === "." || value[caret - 1] === ",");
  const separatorAt = typedSeparator ? caret - 1 : value.indexOf(",");
  let clean = "";
  for (let i = 0; i < value.length; i++) {
    const ch = i === separatorAt ? "," : value[i];
    if (isKept(ch) && (ch !== "," || i === separatorAt)) clean += ch;
  }
  const [int, dec] = clean.split(",");
  const whole = int.replace(/^0+(?=\d)/, "");
  const next = dec === undefined ? whole : `${whole || "0"},${dec.slice(0, 2)}`;
  if (next !== value) {
    input.value = next;
    caretToEnd(input);
  }
}

function format(input, event, before) {
  if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") {
    // Lo pegado puede venir en cualquier formato: se interpreta entero.
    const number = parseAmount(input.value);
    input.value = Number.isFinite(number) ? amountToInput(Math.round(number * 100) / 100) : "";
    return;
  }
  if (input.hasAttribute("data-plain")) formatPlain(input, event);
  else formatCents(input, event, before);
}

// Lo que había antes de la tecla (para saber si se borró un separador).
const previous = new WeakMap();
document.addEventListener("beforeinput", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches(SELECTOR)) previous.set(event.target, event.target.value);
});

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(SELECTOR) || event.isComposing) return;
  if (!/^(insert|delete)/.test(event.inputType || "")) return;
  format(input, event, previous.get(input) ?? input.value);
  previous.set(input, input.value);
});

// Los números entran por la derecha: al entrar al campo, el cursor va al final.
document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(SELECTOR) || input.hasAttribute("data-plain")) return;
  previous.set(input, input.value);
  requestAnimationFrame(() => caretToEnd(input));
});
