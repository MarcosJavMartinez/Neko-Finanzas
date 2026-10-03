// Monedas, conversión y formato de montos.
//
// Los tipos de cambio los define el usuario a mano y se guardan como
// "cuántos ARS vale 1 unidad" ({ ARS: 1, USD: 1350, EUR: 1470 }). ARS funciona
// solo como moneda pivote interna: cualquier conversión pasa por ahí, así que
// la moneda principal puede ser cualquiera sin cambiar el formato guardado.

export const CURRENCIES = {
  ARS: { code: "ARS", name: "Peso argentino", symbol: "$" },
  USD: { code: "USD", name: "Dólar estadounidense", symbol: "US$" },
  EUR: { code: "EUR", name: "Euro", symbol: "€" },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);
export const PIVOT = "ARS";

export function convert(amount, from, to, rates) {
  if (!amount || from === to) return amount || 0;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return (amount * fromRate) / toRate;
}

const formatters = new Map();
function numberFormatter(decimals) {
  if (!formatters.has(decimals)) {
    formatters.set(
      decimals,
      new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    );
  }
  return formatters.get(decimals);
}

/**
 * "$ 470.250", "US$ 20,50", "−€ 12".
 * Los montos grandes o enteros van sin decimales; los chicos con centavos
 * muestran dos, así una suscripción de US$ 9,99 no queda como "US$ 10".
 */
export function formatMoney(amount, currency = PIVOT, { sign = false, reveal = false } = {}) {
  if (masked && !reveal) return maskedMoney(currency);
  const value = Number(amount) || 0;
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 100) / 100;
  const decimals = Number.isInteger(rounded) || rounded >= 10000 ? 0 : 2;
  const symbol = CURRENCIES[currency]?.symbol ?? currency;
  // Sin decimales se redondea el valor original (no el ya redondeado a
  // centavos): 733.562,4996 es "$ 733.562", no "$ 733.563".
  const number = numberFormatter(decimals).format(decimals ? rounded : Math.round(abs));
  // Un monto que redondea a 0 no lleva signo ("−$ 0" confunde).
  const prefix = rounded === 0 ? "" : value < 0 ? "−" : sign && value > 0 ? "+" : "";
  return `${prefix}${symbol} ${number}`;
}

// ---------------------------------------------------------------------------
// Montos ocultos: con el "ojito" apagado todos los montos se muestran como
// "$ •••••" (los campos para editar siguen mostrando el valor real).
// ---------------------------------------------------------------------------

let masked = false;

export function setMasked(value) {
  masked = !!value;
}

export const isMasked = () => masked;

function maskedMoney(currency) {
  return `${CURRENCIES[currency]?.symbol ?? currency} •••••`;
}

/** Versión compacta para ejes de gráficos: "$ 1,2 M", "$ 850 mil". */
export function formatCompact(amount, currency = PIVOT) {
  if (masked) return maskedMoney(currency);
  const symbol = CURRENCIES[currency]?.symbol ?? currency;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}${symbol} ${numberFormatter(1).format(abs / 1e6).replace(",0", "")} M`;
  if (abs >= 1e4) return `${sign}${symbol} ${Math.round(abs / 1000)} mil`;
  return formatMoney(amount, currency);
}

/**
 * Interpreta lo que escribe el usuario: "470.250", "470250,5", "1.350,75",
 * "20.5". Con coma, el punto es separador de miles (formato argentino); sin
 * coma, un único punto seguido de exactamente 3 dígitos también se toma
 * como miles ("1.350" = mil trescientos cincuenta).
 */
export function parseAmount(input) {
  if (typeof input === "number") return input;
  let text = String(input || "").replace(/[^\d.,-]/g, "");
  if (!text) return NaN;
  if (text.includes(",")) {
    // Varias comas y ningún punto: miles a la inglesa ("1,350,000").
    if (!text.includes(".") && text.split(",").length > 2) text = text.replace(/,/g, "");
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = text.split(".").length - 1;
    // "1.350" son mil trescientos cincuenta; "0.350" sigue siendo 0,35.
    if (dots > 1 || /^-?[1-9]\d{0,2}\.\d{3}$/.test(text)) text = text.replace(/\./g, "");
  }
  return Number.parseFloat(text);
}

/** Muestra un número en un input con el formato local, sin símbolo. */
export function amountToInput(amount) {
  if (!amount && amount !== 0) return "";
  return numberFormatter(Number.isInteger(amount) ? 0 : 2).format(amount);
}
