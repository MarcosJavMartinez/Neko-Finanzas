// Campos de monto: mientras se escribe, la app pone sola los puntos de miles
// y deja una única coma decimal (hasta 2 decimales). El punto no se escribe:
// si el teclado solo trae punto, se convierte en la coma decimal. Así lo que
// se ve en el campo es exactamente lo que la app entiende.

import { amountToInput, parseAmount } from "../core/money.js";

const SELECTOR = 'input[inputmode="decimal"]';
const isKept = (ch) => (ch >= "0" && ch <= "9") || ch === ",";

/** "1350000,5" → "1.350.000,5" (solo dígitos y, como mucho, una coma). */
function group(clean) {
  const [int, dec] = clean.split(",");
  const digits = int.replace(/^0+(?=\d)/, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec === undefined ? grouped : `${grouped || "0"},${dec.slice(0, 2)}`;
}

function format(input, event, before0) {
  let value = input.value;
  let caret = input.selectionStart ?? value.length;

  if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") {
    // Lo pegado puede venir en cualquier formato: se interpreta entero.
    const number = parseAmount(value);
    input.value = Number.isFinite(number) ? amountToInput(Math.round(number * 100) / 100) : "";
    return;
  }

  // Borrar justo sobre un punto de miles se lleva el dígito de al lado: si
  // no, el punto volvería a aparecer y parecería que la tecla no hizo nada.
  const kept = (text) => [...text].filter(isKept).length;
  if (kept(before0) === kept(value) && before0 !== value) {
    if (event.inputType === "deleteContentBackward" && caret > 0) {
      value = value.slice(0, caret - 1) + value.slice(caret);
      caret--;
    } else if (event.inputType === "deleteContentForward") {
      value = value.slice(0, caret) + value.slice(caret + 1);
    }
  }

  const typedSeparator = (event.data === "." || event.data === ",") && (value[caret - 1] === "." || value[caret - 1] === ",");
  const separatorAt = typedSeparator ? caret - 1 : value.indexOf(",");
  let clean = "";
  let before = 0; // dígitos y coma que quedan a la izquierda del cursor
  for (let i = 0; i < value.length; i++) {
    const ch = i === separatorAt ? "," : value[i];
    if (!isKept(ch) || (ch === "," && i !== separatorAt)) continue;
    clean += ch;
    if (i < caret) before++;
  }
  const zeros = clean.match(/^0+(?=\d)/)?.[0].length || 0;
  before = Math.max(0, before - Math.min(before, zeros)) + (clean.startsWith(",") ? 1 : 0);

  // Un "-" adelante se respeta (saldo inicial negativo de una cuenta).
  const sign = value.trimStart().startsWith("-") ? "-" : "";
  const next = sign + group(clean);
  if (next === input.value) return;
  input.value = next;
  let position = sign.length;
  for (let seen = 0; position < next.length && seen < before; position++) if (isKept(next[position])) seen++;
  try {
    input.setSelectionRange(position, position);
  } catch (error) {
    /* el campo no admite selección: queda el cursor al final */
  }
}

// Lo que había antes de la tecla (para saber si se borró un punto de miles).
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
