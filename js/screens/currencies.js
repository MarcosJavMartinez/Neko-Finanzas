// Monedas: moneda principal y tipos de cambio manuales.

import { html } from "../ui/dom.js";
import { art } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { CURRENCIES, PIVOT, amountToInput, formatMoney, parseAmount } from "../core/money.js";
import { formatDate, toISO } from "../core/dates.js";
import * as store from "../core/store.js";

export default {
  id: "monedas",
  tab: "mas",
  title: "Monedas",
  back: "#/mas",
  render(state) {
    const main = state.settings.mainCurrency;
    const updated = state.ratesUpdatedAt ? formatDate(toISO(new Date(state.ratesUpdatedAt)), { withYear: true }) : "";
    return html`
      <section class="card reveal">
        <h2 class="section-title section-title-art">${art("ilus-monedas", 48)}Moneda principal</h2>
        <p class="section-sub">Todos los totales se muestran en esta moneda.</p>
        <div class="currency-choices">
          ${Object.values(CURRENCIES).map(
            (c) => html`<label class="currency-choice">
              <input type="radio" name="main-currency" value="${c.code}" ${c.code === main ? "checked" : ""} data-change="set-main" />
              <span class="cur-badge">${c.symbol}</span>
              <span class="currency-text"><strong>${c.code}</strong><span>${c.name}</span></span>
              ${icon("check", 18, "currency-check")}
            </label>`
          )}
        </div>
      </section>

      <section class="card reveal">
        <h2 class="section-title">Tipo de cambio</h2>
        <p class="section-sub">Cargalo a mano, con el valor que uses vos (oficial, MEP, blue…).</p>
        <form class="rates-form" data-rates-form novalidate>
          ${Object.values(CURRENCIES)
            .filter((c) => c.code !== PIVOT)
            .map(
              (c) => html`<label class="rate-edit">
                <span class="rate-edit-left"><span class="cur-badge">${c.symbol}</span><span>1 ${c.code} =</span></span>
                <span class="amount-input amount-input-sm">
                  <span class="amount-currency amount-currency-static">$</span>
                  <input name="${c.code}" type="text" inputmode="decimal" value="${amountToInput(state.rates[c.code])}" aria-label="Valor de 1 ${c.code} en pesos" data-change="save-rate" />
                  <span class="amount-suffix">ARS</span>
                </span>
              </label>`
            )}
        </form>
        <p class="fine-print">${icon("info", 14)} Las conversiones (≈) usan estos valores. No consultamos ningún servidor: si cambia la cotización, actualizala acá.${updated ? ` Última actualización: ${updated}.` : ""}</p>
        ${main !== PIVOT
          ? html`<p class="fine-print">${icon("swap", 14)} Equivale a 1 ${main} = ${formatMoney(state.rates[main], PIVOT)}${Object.keys(CURRENCIES)
              .filter((c) => c !== main && c !== PIVOT)
              .map((c) => ` · 1 ${c} = ${formatMoney(state.rates[c] / state.rates[main], main)}`)
              .join("")}</p>`
          : ""}
      </section>
    `;
  },
  changes: {
    "set-main"(el) {
      store.setMainCurrency(el.value);
      toast(`Moneda principal: ${el.value}`);
    },
    "save-rate"(el) {
      const value = parseAmount(el.value);
      if (!(value > 0)) {
        toast("Ingresá un valor mayor a cero", { type: "error" });
        el.value = amountToInput(store.getState().rates[el.name]);
        return;
      }
      store.setRate(el.name, value);
      toast(`1 ${el.name} = ${formatMoney(value, PIVOT)} guardado`);
    },
  },
};
