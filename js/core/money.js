import { isRTL, setDateRegion, msg } from "./i18n.js";
// Monedas, conversión y formato de montos.
//
// Los tipos de cambio los define el usuario a mano y se guardan como
// "cuántos ARS vale 1 unidad" ({ ARS: 1, USD: 1350, EUR: 1470 }). ARS funciona
// solo como moneda pivote interna: cualquier conversión pasa por ahí, así que
// la moneda principal puede ser cualquiera sin cambiar el formato guardado.

export const CURRENCIES = {
  // `local` es el símbolo dentro del propio país ("$"); afuera se usa `symbol`, que no se confunde.
  ARS: { code: "ARS", name: "Peso argentino", symbol: "AR$", local: "$" },
  USD: { code: "USD", name: "Dólar estadounidense", symbol: "US$", local: "$" },
  EUR: { code: "EUR", name: "Euro", symbol: "€" },
  BRL: { code: "BRL", name: "Real brasileño", symbol: "R$" },
  GBP: { code: "GBP", name: "Libra esterlina", symbol: "£" },
  JPY: { code: "JPY", name: "Yen japonés", symbol: "¥", decimals: 0 },
  RUB: { code: "RUB", name: "Rublo ruso", symbol: "₽" },
  TRY: { code: "TRY", name: "Lira turca", symbol: "₺" },
  MXN: { code: "MXN", name: "Peso mexicano", symbol: "MX$", local: "$" },
  CLP: { code: "CLP", name: "Peso chileno", symbol: "CLP$", local: "$", decimals: 0 },
  COP: { code: "COP", name: "Peso colombiano", symbol: "COL$", local: "$" },
  PEN: { code: "PEN", name: "Sol peruano", symbol: "S/" },
  UYU: { code: "UYU", name: "Peso uruguayo", symbol: "$U", local: "$" },
  VES: { code: "VES", name: "Bolívar venezolano", symbol: "Bs." },
  CUP: { code: "CUP", name: "Peso cubano", symbol: "CUP$", local: "$" },
  EGP: { code: "EGP", name: "Libra egipcia", symbol: "E£" },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);
export const PIVOT = "ARS";

/**
 * Valores de arranque de los tipos de cambio (cuántos ARS vale 1 unidad). Son
 * solo un punto de partida aproximado: la app no consulta cotizaciones, cada
 * persona carga las suyas en Monedas.
 */
export const DEFAULT_RATES = { ARS: 1, USD: 1350, EUR: 1470, BRL: 245, GBP: 1730, JPY: 9, RUB: 15, TRY: 34, MXN: 72, CLP: 1.4, COP: 0.33, PEN: 365, UYU: 33, VES: 7, CUP: 11, EGP: 27 };

/**
 * Regiones: cómo se escriben los números (1.500,50 o 1,500.50) y qué moneda
 * se propone al empezar. El código es el "locale" que usa el navegador.
 */
export const REGIONS = {
  "es-AR": { code: "es-AR", name: "Argentina", currency: "ARS" },
  "es-ES": { code: "es-ES", name: "España", currency: "EUR" },
  "pt-BR": { code: "pt-BR", name: "Brasil", currency: "BRL" },
  "en-US": { code: "en-US", name: "Estados Unidos", currency: "USD" },
  "en-GB": { code: "en-GB", name: "Reino Unido", currency: "GBP" },
  "ja-JP": { code: "ja-JP", name: "Japón", currency: "JPY" },
  "ru-RU": { code: "ru-RU", name: "Rusia", currency: "RUB" },
  "tr-TR": { code: "tr-TR", name: "Turquía", currency: "TRY" },
  "es-MX": { code: "es-MX", name: "México", currency: "MXN" },
  "es-CL": { code: "es-CL", name: "Chile", currency: "CLP" },
  "es-CO": { code: "es-CO", name: "Colombia", currency: "COP" },
  "es-PE": { code: "es-PE", name: "Perú", currency: "PEN" },
  "es-UY": { code: "es-UY", name: "Uruguay", currency: "UYU" },
  "es-VE": { code: "es-VE", name: "Venezuela", currency: "VES" },
  "es-CU": { code: "es-CU", name: "Cuba", currency: "CUP" },
  "en-EG": { code: "en-EG", name: "Egipto", currency: "EGP" },
};
export const DEFAULT_REGION = "es-AR";

/** Región según el idioma del dispositivo (para una instalación nueva). */
export function detectRegion() {
  const langs = typeof navigator === "undefined" ? [] : [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const lang of langs) {
    if (REGIONS[lang]) return lang;
    const [base, country] = String(lang).toLowerCase().split("-");
    // El país manda sobre el idioma: un teléfono en árabe de Egipto ("ar-EG") es Egipto.
    const sameCountry = country && Object.keys(REGIONS).find((code) => code.toLowerCase().endsWith("-" + country));
    if (sameCountry) return sameCountry;
    if (base === "es") return String(lang).toLowerCase() === "es-es" ? "es-ES" : "es-AR";
    const match = { pt: "pt-BR", en: String(lang).toLowerCase() === "en-gb" ? "en-GB" : "en-US", ja: "ja-JP", ru: "ru-RU", tr: "tr-TR" }[base];
    if (match) return match;
  }
  // Un idioma que no conocemos: inglés con dólares, que se entiende en cualquier lado.
  return langs.length ? "en-US" : DEFAULT_REGION;
}

/**
 * Símbolo de una moneda, como se escribe en el país de la persona: "$" es la
 * moneda propia en Argentina, México, Chile o Estados Unidos; las demás llevan
 * su prefijo ("US$", "AR$", "MX$") para que nunca se confundan.
 */
export function symbolOf(code) {
  const currency = CURRENCIES[code];
  if (!currency) return code;
  return currency.local && REGIONS[region]?.currency === code ? currency.local : currency.symbol;
}

/** Monedas con las que se arranca en una región: la propia, dólares y, en Argentina, euros. */
export function startingCurrencies(region) {
  const own = REGIONS[region]?.currency || "ARS";
  return [...new Set([own, "USD", ...(own === "ARS" ? ["EUR"] : [])])];
}

// La región y las monedas en uso vienen de los datos (settings): el store
// avisa aquí cada vez que cambian.
let region = DEFAULT_REGION;
let active = ["ARS", "USD", "EUR"];
let seps = null;

export function configureMoney({ region: nextRegion, currencies } = {}) {
  region = REGIONS[nextRegion] ? nextRegion : DEFAULT_REGION;
  if (Array.isArray(currencies) && currencies.length) active = currencies.filter((c) => CURRENCIES[c]);
  formatters.clear();
  seps = null;
  setDateRegion(region);
}

export const getRegion = () => region;
/** Monedas que la persona usa: las que se ofrecen en los formularios. */
export const activeCurrencies = () => active;

/** Las monedas en uso más la que ya tiene el dato que se está editando. */
export const currencyChoices = (current) => (current && !active.includes(current) && CURRENCIES[current] ? [...active, current] : active);

/** Separadores de la región: { group: ".", decimal: "," } en Argentina. */
export function separators() {
  if (!seps) {
    const parts = new Intl.NumberFormat(region, { minimumFractionDigits: 2 }).formatToParts(1234567.5);
    seps = { group: parts.find((p) => p.type === "group")?.value || "", decimal: parts.find((p) => p.type === "decimal")?.value || "," };
  }
  return seps;
}

/** ¿Los montos de esta región llevan centavos? (los yenes y los pesos chilenos no). */
export const usesCents = () => CURRENCIES[REGIONS[region]?.currency]?.decimals !== 0;

/** Cómo se ve "cero" en un campo de monto: "0,00", "0.00" o "0". */
export const zeroAmount = () => (usesCents() ? `0${separators().decimal}00` : "0");

/** Un número con el formato de la región y esa cantidad de decimales. */
export const formatNumber = (value, decimals = 0) => numberFormatter(decimals).format(value);

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
      new Intl.NumberFormat(region, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    );
  }
  return formatters.get(decimals);
}

/**
 * "$ 470.250", "US$ 20,50", "−€ 12".
 * Los montos grandes o enteros van sin decimales; los chicos con centavos
 * muestran dos, así una suscripción de US$ 9,99 no queda como "US$ 10".
 */
/** Marca invisible que fija el orden de un monto dentro de un texto de derecha a izquierda. */
const ltr = () => (isRTL() ? "\u200E" : "");

export function formatMoney(amount, currency = PIVOT, { sign = false, reveal = false } = {}) {
  if (masked && !reveal) return maskedMoney(currency);
  const value = Number(amount) || 0;
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 100) / 100;
  const decimals = CURRENCIES[currency]?.decimals === 0 || Number.isInteger(rounded) || rounded >= 10000 ? 0 : 2;
  const symbol = symbolOf(currency);
  // Sin decimales se redondea el valor original (no el ya redondeado a
  // centavos): 733.562,4996 es "$ 733.562", no "$ 733.563".
  const number = numberFormatter(decimals).format(decimals ? rounded : Math.round(abs));
  // Un monto que redondea a 0 no lleva signo ("−$ 0" confunde).
  const prefix = rounded === 0 ? "" : value < 0 ? "−" : sign && value > 0 ? "+" : "";
  return `${ltr()}${prefix}${symbol} ${number}`;
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
  return `${ltr()}${symbolOf(currency)} •••••`;
}

/** Versión compacta para ejes de gráficos: "$ 1,2 M", "$ 850 mil". */
export function formatCompact(amount, currency = PIVOT) {
  if (masked) return maskedMoney(currency);
  const symbol = symbolOf(currency);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1e6) return `${ltr()}${sign}${symbol} ${numberFormatter(1).format(abs / 1e6).replace(/[.,]0$/, "")} M`;
  if (abs >= 1e4) return msg`${sign}${symbol} ${Math.round(abs / 1000)} mil`;
  return formatMoney(amount, currency);
}

/**
 * Interpreta lo que escribe el usuario según la región.
 *
 * Con coma decimal (Argentina, España, Brasil, Rusia, Turquía): "470.250",
 * "470250,5", "1.350,75", "20.5". Con coma, el punto es separador de miles;
 * sin coma, un único punto seguido de exactamente 3 dígitos también se toma
 * como miles ("1.350" = mil trescientos cincuenta).
 *
 * Con punto decimal (Estados Unidos, Reino Unido, Japón) es al revés:
 * "1,350.75", "470,250", "20.5".
 */
export function parseAmount(input) {
  if (typeof input === "number") return input;
  let text = String(input || "").replace(/[^\d.,-]/g, "");
  if (!text) return NaN;
  if (separators().decimal === ".") {
    if (text.includes(".")) text = text.replace(/,/g, "");
    else {
      const commas = text.split(",").length - 1;
      // "1,350" son mil trescientos cincuenta; "1,5" es uno y medio.
      text = commas > 1 || /^-?[1-9]\d{0,2},\d{3}$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
    }
    return Number.parseFloat(text);
  }
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

/** Muestra un monto en un input: formato local, siempre con centavos, sin símbolo. */
export function amountToInput(amount) {
  if (!amount && amount !== 0) return "";
  // Sin centavos (yenes) no se muestran decimales, salvo que el monto los tenga.
  return numberFormatter(usesCents() || !Number.isInteger(Math.round(amount * 100) / 100) ? 2 : 0).format(amount);
}
