// Categorías: predeterminadas y propias, para gastos e ingresos.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { catBubble, segmented } from "../ui/components.js";
import { countCategoryUsage } from "../core/store.js";

const view = { type: "expense" };

export default {
  id: "categorias",
  tab: "mas",
  title: "Categorías",
  back: "#/mas",
  render(state) {
    const list = state.categories.filter((c) => c.type === view.type);
    return html`
      ${segmented("cat-type", [{ value: "expense", label: "Gastos", icon: "arrowUp" }, { value: "income", label: "Ingresos", icon: "arrowDown" }], view.type, { action: "cat-type" })}
      <div class="card card-flush rows reveal">
        ${list.map(
          (c) => html`<button type="button" class="row" data-action="edit-category" data-id="${c.id}">
            ${catBubble(c)}
            <span class="row-main">
              <span class="row-title">${c.name}</span>
              <span class="row-meta">${c.builtin ? "Predeterminada" : "Personalizada"} · ${countCategoryUsage(c.id)} movimientos</span>
              ${c.subcategories.length
                ? html`<span class="sub-preview">${c.subcategories.slice(0, 4).map((sub) => sub.name).join(" · ")}${c.subcategories.length > 4 ? ` · +${c.subcategories.length - 4}` : ""}</span>`
                : ""}
            </span>
            ${icon("edit", 18, "row-chevron")}
          </button>`
        )}
      </div>
      <button type="button" class="btn btn-soft btn-block reveal" data-action="add-category" data-type="${view.type}">${icon("plus", 18)}Nueva categoría de ${view.type === "expense" ? "gasto" : "ingreso"}</button>
    `;
  },
  changes: {
    "cat-type"(el) {
      view.type = el.value;
      return true;
    },
  },
};
