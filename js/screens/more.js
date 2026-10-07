// Más: acceso a las secciones secundarias.

import { msg, tr } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { appFooter } from "../ui/components.js";
import { formatMoney } from "../core/money.js";
import { toast } from "../ui/toast.js";
import { billReserve, budgetsOverview, loansSummary } from "../core/finance.js";
import { currentMonthKey } from "../core/dates.js";

const SHARE_URL = "https://nekotools.site/finanzas.html";

function loanSub(state) {
  const l = loansSummary(state);
  const main = state.settings.mainCurrency;
  if (!l.open) return "Lo que te deben y lo que debes";
  return [l.lent > 0 && msg`Te deben ${formatMoney(l.lent, main)}`, l.borrowed > 0 && msg`debes ${formatMoney(l.borrowed, main)}`].filter(Boolean).join(" · ");
}

export default {
  id: "mas",
  tab: "mas",
  title: "Más",
  render(state) {
    const main = state.settings.mainCurrency;
    const reserve = billReserve(state);
    const budgets = budgetsOverview(state, currentMonthKey());
    const alerts = budgets.items.filter((b) => b.level === "near" || b.level === "over").length;
    const activeAccounts = state.accounts.filter((a) => !a.archived).length;
    const groups = [
      { title: "Tu dinero", items: [
      { href: "#/cuentas", icon: "wallet", title: "Cuentas", sub: activeAccounts > 1 ? msg`${activeAccounts} cuentas · efectivo, banco, billeteras` : "Efectivo, banco, billeteras virtuales" },
      { href: "#/presupuestos", icon: "pie", title: "Presupuestos", sub: state.budgets.length ? msg`${state.budgets.length} activos${alerts ? msg` · ${alerts} para revisar` : ""}` : "Reparte tus ingresos" },
      { href: "#/prestamos", icon: "swap", title: "Préstamos", sub: loanSub(state) },
      { href: "#/facturas", icon: "receipt", title: "Facturas y servicios", sub: state.bills.length ? msg`${formatMoney(reserve.amount, main)} a reservar` : "Luz, internet, suscripciones…" },
      { href: "#/reportes", icon: "chart", title: "Reportes", sub: "Tu mes de un vistazo" },
      ] },
      { title: "Ajustes", items: [
      { href: "#/categorias", icon: "tag", title: "Categorías", sub: msg`${state.categories.length} categorías` },
      { href: "#/monedas", icon: "coins", title: "Idioma y monedas", sub: msg`Principal: ${main}` },
      { href: "#/ajustes", icon: "settings", title: "Configuración", sub: "Apariencia, tus datos, instalar la app" },
      ] },
      { title: "Ayuda", items: [
      { action: "show-onboarding", icon: "help", title: "Cómo funciona", sub: "Un repaso rápido en 4 pasos" },
      { action: "share-app", icon: "share", title: "Compartir Neko Finanzas", sub: "Pásale la app a alguien" },
      ] },
    ];
    return html`
      ${groups.map(
        (group) => html`<h2 class="more-heading reveal">${group.title}</h2>
      <nav class="more-grid" aria-label="${group.title}">
        ${group.items.map(
          (i) => {
            const inner = html`<span class="more-icon">${icon(i.icon, 22)}</span>
              <span class="more-text"><span class="more-title">${i.title}</span><span class="more-sub">${i.sub}</span></span>
              ${icon("chevronRight", 18, "more-chevron")}`;
            return i.href
              ? html`<a class="more-item reveal" href="${i.href}">${inner}</a>`
              : html`<button type="button" class="more-item reveal" data-action="${i.action}">${inner}</button>`;
          }
        )}
      </nav>`
      )}
      <a class="brand-card reveal" href="https://nekotools.site" target="_blank" rel="noopener">
        <img src="img/neko-tools-mark-v2.png" alt="" width="44" height="44" />
        <span><strong>Neko Finanzas</strong> es parte de <strong>Neko Tools</strong><br /><span class="muted-text">Pequeñas herramientas simples, gratis y privadas.</span></span>
      </a>
      ${appFooter()}
    `;
  },
};

/**
 * Compartir la app. El link apunta a la página de Neko Finanzas en Neko Tools
 * (no directo a la app), como en Neko Lista: quien lo recibe conoce la marca
 * primero.
 */
export async function shareApp() {
  const data = { title: "Neko Finanzas", text: tr("Neko Finanzas: tus finanzas claras, gratis y privadas. Sin cuentas ni publicidad."), url: SHARE_URL };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(SHARE_URL);
    toast("Link copiado. Pégalo donde quieras compartirlo");
  } catch (error) {
    window.prompt("Copia este link para compartirlo:", SHARE_URL);
  }
}
