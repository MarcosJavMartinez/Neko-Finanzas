// Campos de monto, como en un cajero: se tipean solo números y van entrando
// desde los centavos (0,01 → 0,15 → 1,50 → 15,00 → 150,00). El separador
// decimal y el de miles los pone la app según la región elegida (1.500,00 en
// Argentina, 1,500.00 en Estados Unidos), así que lo que se ve en el campo es
// exactamente lo que se guarda. Borrar saca el último número.
//
// Los campos marcados `data-plain` (un porcentaje) no usan centavos: ahí se
// escribe el número tal cual, con un único separador decimal.
//
// Con "Cargar montos con centavos" apagado (Configuración), o en una región
// cuya moneda no tiene centavos (yenes), se escriben enteros: 1-5-0-0 es
// 1.500. Un monto que ya traía centavos se sigue editando con centavos, para
// no perderlos.

import { amountToInput, parseAmount, separators, usesCents, zeroAmount, formatNumber } from "../core/money.js";
import { amountCents } from "../core/prefs.js";

const SELECTOR = 'input[inputmode="decimal"]';
const MAX_DIGITS = 15;
const digitsOf = (text) => text.replace(/\D/g, "");
const signOf = (text) => (text.trimStart().startsWith("-") ? "-" : "");
const withCents = () => amountCents() && usesCents();

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
  return clean ? formatNumber(Number(clean) / 100, 2) : "";
}

function formatCents(input, event, before) {
  let digits = digitsOf(input.value);
  // Borrar sobre un separador no sacó ningún número: se lleva el último.
  if (/^delete/.test(event.inputType) && digits === digitsOf(before) && input.value !== before) digits = digits.slice(0, -1);
  const body = fromCents(digits);
  input.value = body ? signOf(input.value) + body : "";
  caretToEnd(input);
}

/** Enteros con separador de miles: "1500" → "1.500". */
function formatWhole(input) {
  const [int, dec] = input.value.split(separators().decimal);
  let digits = digitsOf(int);
  // Si quedó un ",00" a la vista, lo tipeado o borrado después de él cuenta igual.
  if (dec !== undefined) {
    const extra = digitsOf(dec);
    digits = extra.length > 2 ? digits + extra.slice(2) : extra.length < 2 ? digits.slice(0, -1) : digits;
  }
  digits = digits.replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS - 2);
  input.value = digits ? signOf(input.value) + formatNumber(Number(digits), 0) : "";
  caretToEnd(input);
}

/** El monto del campo trae centavos de verdad (no un ",00"): se edita con centavos. */
const keepsCents = (text) => {
  const dec = text.split(separators().decimal)[1];
  return dec !== undefined && /[1-9]/.test(digitsOf(dec).slice(0, 2));
};

/** Número tal cual: solo dígitos y un separador decimal (hasta 2 decimales). */
function formatPlain(input, event) {
  const decimal = separators().decimal;
  const value = input.value;
  const caret = input.selectionStart ?? value.length;
  const isSep = (ch) => ch === "." || ch === ",";
  const typedSeparator = isSep(event.data || "") && isSep(value[caret - 1] || "");
  const separatorAt = typedSeparator ? caret - 1 : value.indexOf(decimal);
  let int = "";
  let dec = null;
  for (let i = 0; i < value.length; i++) {
    if (i === separatorAt) dec = "";
    else if (value[i] >= "0" && value[i] <= "9") dec === null ? (int += value[i]) : (dec += value[i]);
  }
  const whole = int.replace(/^0+(?=\d)/, "");
  const next = dec === null ? whole : `${whole || "0"}${decimal}${dec.slice(0, 2)}`;
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
  else if (!withCents() && !keepsCents(input.value)) formatWhole(input);
  else formatCents(input, event, before);
}

// Lo que había antes de la tecla (para saber si se borró un separador).
const previous = new WeakMap();
document.addEventListener("beforeinput", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches(SELECTOR)) previous.set(event.target, event.target.value);
});

// En fase de captura: el campo queda acomodado antes de que lo lean los
// formularios (la vista previa de las cuotas, la conversión de una
// transferencia, el aviso al depositar en una meta).
document.addEventListener(
  "input",
  (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(SELECTOR) || event.isComposing) return;
    if (!/^(insert|delete)/.test(event.inputType || "")) return;
    format(input, event, previous.get(input) ?? input.value);
    previous.set(input, input.value);
  },
  true
);

// Los números entran por la derecha: al entrar al campo, el cursor va al final.
document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(SELECTOR) || input.hasAttribute("data-plain")) return;
  // Sin centavos: los decimales en cero de un monto ya cargado no se editan.
  if (!withCents() && !keepsCents(input.value)) input.value = input.value.split(separators().decimal)[0];
  if (/^0([.,]00)?$/.test(input.placeholder)) input.placeholder = withCents() ? zeroAmount() : "0";
  previous.set(input, input.value);
  requestAnimationFrame(() => caretToEnd(input));
});
