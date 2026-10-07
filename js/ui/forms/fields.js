// Campos de formulario compartidos por todas las hojas.

import { tr } from "../../core/i18n.js";
import { html, setHTML } from "../dom.js";
import { icon } from "../icons.js";
import { amountToInput, parseAmount, CURRENCY_CODES, zeroAmount, currencyChoices, symbolOf, CURRENCIES } from "../../core/money.js";
import { MAX_AMOUNT } from "../../core/sanitize.js";
import { EMOJI_OPTIONS, LISTA_ICONS, PALETTE } from "../../data/defaults.js";

/** Monto grande con la moneda como cápsulas (ARS | USD | EUR). */
export function amountField({ name = "amount", value, currency, label = "Monto", autofocus = true, tone = "" }) {
  return html`<div class="field field-amount ${tone}">
    <div class="amount-head">
      <label class="field-label" for="f-${name}">${label}</label>
      <div class="currency-seg" role="radiogroup" aria-label="Moneda">
        ${currencyChoices(currency).map(
          (code) => html`<label class="currency-seg-option"><input type="radio" name="currency" value="${code}" ${code === currency ? "checked" : ""} aria-label="${CURRENCIES[code].name}" /><span title="${CURRENCIES[code].name}">${symbolOf(code)}</span></label>`
        )}
      </div>
    </div>
    <div class="amount-input amount-input-xl">
      <input id="f-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" placeholder="${zeroAmount()}"
        value="${value ? amountToInput(value) : ""}" ${autofocus ? "data-autofocus" : ""} required />
    </div>
    <p class="field-error" data-error-for="${name}"></p>
  </div>`;
}

export function textField({ name, label, value = "", placeholder = "", required = false, maxlength = 60, hint = "" }) {
  return html`<div class="field">
    <label class="field-label" for="f-${name}">${label}${required ? "" : html` <span class="optional">(opcional)</span>`}</label>
    <input id="f-${name}" name="${name}" type="text" value="${value}" placeholder="${placeholder}" maxlength="${maxlength}" ${required ? "required" : ""} autocomplete="off" />
    ${hint ? html`<p class="field-hint">${hint}</p>` : ""}
    <p class="field-error" data-error-for="${name}"></p>
  </div>`;
}

export function dateField({ name = "date", label = "Fecha", value = "", required = true }) {
  return html`<div class="field">
    <label class="field-label" for="f-${name}">${label}${required ? "" : html` <span class="optional">(opcional)</span>`}</label>
    <input id="f-${name}" name="${name}" type="date" value="${value}" ${required ? "required" : ""} />
    <p class="field-error" data-error-for="${name}"></p>
  </div>`;
}

export function selectField({ name, label, options, value }) {
  return html`<div class="field">
    <label class="field-label" for="f-${name}">${label}</label>
    <select id="f-${name}" name="${name}">
      ${options.map((o) => html`<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)}
    </select>
  </div>`;
}

export function toggleField({ name, label, checked, hint = "" }) {
  return html`<label class="toggle-field">
    <span><span class="toggle-label">${label}</span>${hint ? html`<span class="field-hint">${hint}</span>` : ""}</span>
    <input type="checkbox" name="${name}" class="switch" ${checked ? "checked" : ""} />
  </label>`;
}

/** Grilla de categorías (radio). Incluye un botón para crear una nueva. */
/** Categorías más usadas de un tipo (por cantidad de movimientos). */
function frequentCategoryIds(state, type, limit) {
  const counts = new Map();
  for (const tx of state.transactions) if (tx.type === type) counts.set(tx.categoryId, (counts.get(tx.categoryId) || 0) + 1);
  for (const bill of state.bills) if (type === "expense") counts.set(bill.categoryId, (counts.get(bill.categoryId) || 0) + 1);
  const ordered = state.categories
    .filter((c) => c.type === type)
    .map((c, index) => ({ id: c.id, count: counts.get(c.id) || 0, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index);
  return ordered.slice(0, limit).map((x) => x.id);
}

/**
 * Grilla de categorías. Con `limit`, muestra primero solo las más usadas
 * (y la elegida) y el resto aparece con "Ver todas las categorías".
 */
export function categoryPicker(state, type, selectedId, { name = "categoryId", multiple = false, selectedIds = [], limit = 0 } = {}) {
  const categories = state.categories.filter((c) => c.type === type);
  const visible = new Set(limit && !multiple ? frequentCategoryIds(state, type, limit) : categories.map((c) => c.id));
  if (selectedId) visible.add(selectedId);
  const hasMore = categories.some((c) => !visible.has(c.id));
  return html`<div class="field">
    <span class="field-label">${limit ? "Categorías frecuentes" : "Categoría"}</span>
    <div class="cat-picker ${hasMore ? "is-collapsed" : ""}" data-cat-picker="${type}">
      ${categories.map((c) => {
        const checked = multiple ? selectedIds.includes(c.id) : c.id === selectedId;
        return html`<label class="cat-option ${visible.has(c.id) ? "" : "is-extra"}" style="--c:${c.color}">
          <input type="${multiple ? "checkbox" : "radio"}" name="${name}" value="${c.id}" ${checked ? "checked" : ""} />
          <span class="cat-option-icon" aria-hidden="true">${c.icon}</span>
          <span class="cat-option-name">${c.name}</span>
        </label>`;
      })}
      ${multiple ? "" : html`<button type="button" class="cat-option cat-option-new ${hasMore ? "is-extra" : ""}" data-new-category="${type}">
        <span class="cat-option-icon">${icon("plus", 18)}</span><span class="cat-option-name">Nueva</span>
      </button>`}
    </div>
    ${hasMore ? html`<button type="button" class="see-all" data-toggle-cats aria-expanded="false"><span>Ver todas las categorías</span>${icon("chevronRight", 16)}</button>` : ""}
    <p class="field-error" data-error-for="${name}"></p>
  </div>`;
}

/**
 * Subcategorías de la categoría elegida, como chips. Es opcional: "Ninguna"
 * deja el movimiento solo en la categoría.
 */
export function subcategoryPicker(category, selectedId = "") {
  return html`<div class="field" data-sub-field>
    <span class="field-label">Subcategoría <span class="optional">(opcional)</span></span>
    ${category
      ? html`<div class="sub-picker" style="--c:${category.color}">
          <label class="sub-chip"><input type="radio" name="subcategoryId" value="" ${selectedId ? "" : "checked"} /><span>Ninguna</span></label>
          ${category.subcategories.map(
            (sub) => html`<label class="sub-chip"><input type="radio" name="subcategoryId" value="${sub.id}" ${sub.id === selectedId ? "checked" : ""} /><span>${sub.icon ? html`<span aria-hidden="true">${sub.icon}</span>` : ""}${sub.name}</span></label>`
          )}
          <button type="button" class="sub-chip sub-chip-new" data-new-subcategory="${category.id}">${icon("plus", 14)}Nueva</button>
        </div>`
      : html`<p class="field-hint">Elige una categoría para ver sus subcategorías.</p>`}
  </div>`;
}

export function emojiPicker(selected, { name = "icon", choices = EMOJI_OPTIONS } = {}) {
  // Primero los íconos propios del formulario; después, todos los de Neko Lista.
  const all = [...new Set([...choices, ...LISTA_ICONS])];
  const options = all.includes(selected) || !selected ? all : [selected, ...all];
  return html`<div class="field">
    <span class="field-label">Ícono</span>
    <div class="emoji-picker">
      ${options.map(
        (e) => html`<label class="emoji-option"><input type="radio" name="${name}" value="${e}" ${e === selected ? "checked" : ""} /><span>${e}</span></label>`
      )}
    </div>
  </div>`;
}

export function colorPicker(selected, name = "color") {
  const colors = !selected || PALETTE.includes(selected) ? PALETTE : [selected, ...PALETTE];
  return html`<div class="field">
    <span class="field-label">Color</span>
    <div class="color-picker">
      ${colors.map(
        (c, i) => html`<label class="color-option" style="--c:${c}">
          <input type="radio" name="${name}" value="${c}" ${c === selected || (!selected && i === 0) ? "checked" : ""} aria-label="Color ${i + 1}" />
          <span>${icon("check", 16)}</span>
        </label>`
      )}
    </div>
  </div>`;
}

export function formActions({ submitLabel = "Guardar", deletable = false, extra = "" } = {}) {
  return html`<div class="form-actions">
    ${deletable ? html`<button type="button" class="btn btn-ghost btn-danger-text" data-form-delete>${icon("trash", 18)}Eliminar</button>` : ""}
    ${extra}
    <button type="submit" class="btn btn-primary btn-grow">${icon("check", 18)}${submitLabel}</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Lectura y validación
// ---------------------------------------------------------------------------

export function readForm(form) {
  const data = {};
  for (const [key, value] of new FormData(form)) {
    if (key in data) data[key] = [].concat(data[key], value);
    else data[key] = value;
  }
  form.querySelectorAll("input[type=checkbox].switch").forEach((el) => {
    data[el.name] = el.checked;
  });
  return data;
}

/** Monto del campo, redondeado a centavos. NaN si no es válido o es absurdo. */
export function readAmount(form, name = "amount") {
  const value = parseAmount(form.elements[name]?.value);
  if (!Number.isFinite(value) || Math.abs(value) > MAX_AMOUNT) return NaN;
  return Math.round(value * 100) / 100;
}

export function fieldError(form, name, message) {
  const el = form.querySelector(`[data-error-for="${name}"]`);
  if (el) {
    el.textContent = tr(message);
    el.closest(".field")?.classList.add("has-error");
  }
  const input = form.elements[name];
  (input?.focus ? input : input?.[0])?.focus?.();
}

export function clearErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
}

/** Reemplaza el selector de subcategorías cuando cambia la categoría elegida. */
export function replaceSubcategoryPicker(form, state, categoryId, selectedId = "") {
  const current = form.querySelector("[data-sub-field]");
  if (!current) return;
  const wrapper = document.createElement("div");
  setHTML(wrapper, subcategoryPicker(state.categories.find((c) => c.id === categoryId), selectedId));
  current.replaceWith(wrapper.firstElementChild);
}

/** Reemplaza el selector de categorías (p. ej. al cambiar Ingreso/Gasto). */
export function replaceCategoryPicker(form, state, type, selectedId) {
  const current = form.querySelector("[data-cat-picker]")?.closest(".field");
  if (!current) return;
  const wrapper = document.createElement("div");
  setHTML(wrapper, categoryPicker(state, type, selectedId, { limit: 6 }));
  current.replaceWith(wrapper.firstElementChild);
}
