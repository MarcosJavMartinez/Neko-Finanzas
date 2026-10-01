// Exportar movimientos a CSV, para abrir en Excel o Google Sheets.
//
// Formato pensado para planillas en español: separador ";" y coma decimal
// (el Excel en español espera eso), con BOM para que los acentos se vean
// bien. Los gastos van en negativo, así una SUMA da el balance.

import { findCategory, findSubcategory, toMain } from "./finance.js";

const HEADERS = ["Fecha", "Hora", "Tipo", "Categoría", "Subcategoría", "Descripción", "Monto", "Moneda"];

/** Número con coma decimal y sin separador de miles: 1234,5 → "1234,50". */
function number(value) {
  return (Math.round(value * 100) / 100).toFixed(2).replace(".", ",");
}

/**
 * Texto seguro para una celda: comillas si hace falta y, si empieza con
 * = + - @, un apóstrofo delante para que la planilla no lo ejecute como
 * fórmula (una descripción tipo "=HYPERLINK(...)" sería peligrosa).
 */
function text(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transactionsToCSV(state) {
  const main = state.settings.mainCurrency;
  const rows = [...state.transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.createdAt.localeCompare(b.createdAt))
    .map((tx) => {
      const category = findCategory(state, tx.categoryId);
      const sub = findSubcategory(category, tx.subcategoryId);
      const sign = tx.type === "expense" ? -1 : 1;
      return [
        tx.date,
        tx.time || "",
        text(tx.type === "expense" ? "Gasto" : "Ingreso"),
        text(category?.name || ""),
        text(sub?.name || ""),
        text(tx.description || ""),
        number(sign * tx.amount),
        tx.currency,
        number(sign * toMain(state, tx.amount, tx.currency)),
      ].join(";");
    });
  const header = [...HEADERS, `Monto en ${main}`].map(text).join(";");
  return "﻿" + [header, ...rows].join("\r\n") + "\r\n";
}
