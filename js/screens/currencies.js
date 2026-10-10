// País y monedas: cómo se escriben los números, la moneda principal, las
// otras monedas que se usan y sus tipos de cambio (cargados a mano).

import { LANGUAGES, getLanguage, msg, saveLanguage } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { art } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { CURRENCIES, REGIONS, amountToInput, formatMoney, formatNumber, parseAmount, symbolOf } from "../core/money.js";
import { formatDate, toISO } from "../core/dates.js";
import * as store from "../core/store.js";

/**
 * Un tipo de cambio se muestra en el sentido en que el número es cómodo de
 * leer: "1 USD = 1.350 ARS", no "1 ARS = 0,0007 USD". `inverse` indica que
 * la moneda principal va a la izquierda.
 */
export function ratePair(state, code) {
  const main = state.settings.mainCurrency;
  const inMain = state.rates[code] / state.rates[main];
  return inMain >= 1 ? { from: code, to: main, value: inMain, inverse: false } : { from: main, to: code, value: 1 / inMain, inverse: true };
}

/** Monedas que no se pueden sacar: la principal y las que ya tienen datos. */
function lockedCurrencies(state) {
  const used = [...state.accounts, ...state.transactions, ...state.bills, ...state.goals, ...(state.loans || []), ...state.budgets].map((x) => x.currency);
  return new Set([state.settings.mainCurrency, ...used]);
}

export default {
  id: "monedas",
  tab: "mas",
  title: "Idioma y monedas",
  back: "#/mas",
  render(state) {
    const main = state.settings.mainCurrency;
    const active = state.settings.currencies;
    const locked = lockedCurrencies(state);
    const others = active.filter((c) => c !== main);
    const updated = state.ratesUpdatedAt ? formatDate(toISO(new Date(state.ratesUpdatedAt)), { withYear: true }) : "";
    return html`
      <section class="card reveal">
        <h2 class="section-title">Idioma</h2>
        <div class="field form">
          <label class="field-label" for="f-language">¿En qué idioma quieres la app?</label>
          <select id="f-language" name="language" data-change="set-language">
            ${Object.entries(LANGUAGES).map(([code, l]) => html`<option value="${code}" ${code === getLanguage() ? "selected" : ""}>${l.name}</option>`)}
          </select>
        </div>
      </section>

      <section class="card reveal">
        <h2 class="section-title">País</h2>
        <p class="section-sub">Define cómo se escriben los números. No cambia tus montos ni tu moneda.</p>
        <div class="field form">
          <label class="field-label" for="f-region">¿Dónde usas la app?</label>
          <select id="f-region" name="region" data-change="set-region">
            ${Object.values(REGIONS).map((r) => html`<option value="${r.code}" ${r.code === state.settings.region ? "selected" : ""}>${r.name}</option>`)}
          </select>
          <p class="field-hint">Así se ve un monto: <strong>${formatNumber(1234567.5, 2)}</strong></p>
        </div>
      </section>

      <section class="card reveal">
        <h2 class="section-title section-title-art">${art("ilus-monedas", 48)}Moneda principal</h2>
        <p class="section-sub">Todos los totales se muestran en esta moneda.</p>
        <div class="currency-choices">
          ${Object.values(CURRENCIES).map(
            (c) => html`<label class="currency-choice">
              <input type="radio" name="main-currency" value="${c.code}" ${c.code === main ? "checked" : ""} data-change="set-main" />
              <span class="cur-badge">${symbolOf(c.code)}</span>
              <span class="currency-text"><strong>${c.code}</strong><span>${c.name}</span></span>
              ${icon("check", 18, "currency-check")}
            </label>`
          )}
        </div>
      </section>

      <section class="card reveal">
        <h2 class="section-title">Otras monedas que usas</h2>
        <p class="section-sub">Las que marques aparecen al registrar un movimiento, una cuenta o una meta.</p>
        <div class="currency-toggles">
          ${Object.values(CURRENCIES)
            .filter((c) => c.code !== main)
            .map(
              (c) => html`<label class="chip-check ${locked.has(c.code) ? "is-locked" : ""}" title="${locked.has(c.code) ? "Ya tienes algo registrado en esta moneda" : c.name}">
                <input type="checkbox" value="${c.code}" ${active.includes(c.code) ? "checked" : ""} ${locked.has(c.code) ? "disabled" : ""} data-change="toggle-currency" />
                <span>${symbolOf(c.code)} ${c.code}</span>
              </label>`
            )}
        </div>
      </section>

      ${others.length
        ? html`<section class="card reveal">
            <h2 class="section-title">Tipo de cambio</h2>
            <p class="section-sub">Ingrésalo a mano, con el valor que tú uses.</p>
            <form class="rates-form" data-rates-form novalidate>
              ${others.map((code) => {
                const pair = ratePair(state, code);
                return html`<label class="rate-edit">
                  <span class="rate-edit-left"><span class="cur-badge">${symbolOf(code)}</span><span>1 ${pair.from} =</span></span>
                  <span class="amount-input amount-input-sm">
                    <input name="${code}" type="text" inputmode="decimal" data-plain value="${amountToInput(Math.round(pair.value * 100) / 100)}" aria-label="Valor de 1 ${pair.from} en ${pair.to}" data-inverse="${pair.inverse ? "1" : ""}" data-change="save-rate" />
                    <span class="amount-suffix">${pair.to}</span>
                  </span>
                </label>`;
              })}
            </form>
            <p class="fine-print">${icon("info", 14)} Las conversiones (≈) usan estos valores. No consultamos ningún servidor: si cambia la cotización, actualízala aquí.${updated ? msg` Última actualización: ${updated}.` : ""}</p>
          </section>`
        : ""}
    `;
  },
  changes: {
    "set-language"(el) {
      // Se recarga: así también cambian los textos fijos y los que ya estaban armados.
      saveLanguage(el.value);
      location.reload();
    },
    "set-region"(el) {
      store.setRegion(el.value);
      toast(msg`Formato de ${REGIONS[el.value]?.name || ""}: ${formatNumber(1234567.5, 2)}`);
    },
    "set-main"(el) {
      store.setMainCurrency(el.value);
      toast(msg`Moneda principal: ${el.value}`);
    },
    "toggle-currency"(el) {
      store.toggleCurrency(el.value, el.checked);
      if (el.checked) toast(msg`Revisa el tipo de cambio de ${el.value}: el valor inicial es aproximado`, { type: "info", duration: 6000 });
    },
    "save-rate"(el) {
      const value = parseAmount(el.value);
      const state = store.getState();
      if (!(value > 0)) {
        toast("Ingresa un valor mayor a cero", { type: "error" });
        el.value = amountToInput(Math.round(ratePair(state, el.name).value * 100) / 100);
        return;
      }
      const main = state.settings.mainCurrency;
      const inverse = el.dataset.inverse === "1";
      store.setRateInMain(el.name, inverse ? 1 / value : value);
      toast(inverse ? msg`1 ${main} = ${formatMoney(value, el.name)} guardado` : msg`1 ${el.name} = ${formatMoney(value, main)} guardado`);
    },
  },
};
