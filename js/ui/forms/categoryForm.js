// Categorías y subcategorías: formularios y la lógica compartida por los
// selectores de categoría de otros formularios (movimientos, facturas).

import { html, setHTML } from "../dom.js";
import { icon } from "../icons.js";
import { openSheet, confirmDialog } from "../sheet.js";
import { toast } from "../toast.js";
import { segmented } from "../components.js";
import {
  textField,
  emojiPicker,
  colorPicker,
  formActions,
  readForm,
  fieldError,
  clearErrors,
  replaceCategoryPicker,
  replaceSubcategoryPicker,
} from "./fields.js";
import * as store from "../../core/store.js";

export function openCategoryForm({ category, type = "expense", onSaved } = {}) {
  const isEdit = Boolean(category);
  const current = category || { name: "", icon: type === "income" ? "💵" : "🏷️", color: "", type, subcategories: [] };
  const locked = isEdit && store.isProtectedCategory(category.id);
  // Las subcategorías se editan en una copia local y se guardan junto con la categoría.
  let subs = current.subcategories.map((sub) => ({ ...sub }));

  openSheet({
    title: isEdit ? "Editar categoría" : "Nueva categoría",
    body: html`<form class="form" novalidate>
      ${isEdit
        ? ""
        : segmented("type", [{ value: "expense", label: "Gasto", icon: "arrowUp" }, { value: "income", label: "Ingreso", icon: "arrowDown" }], current.type)}
      ${textField({ name: "name", label: "Nombre", value: current.name, required: true, placeholder: "Ej.: Mascotas", maxlength: 30 })}
      <div class="field">
        <span class="field-label">Subcategorías <span class="optional">(opcional)</span></span>
        <div class="sub-list" data-sub-list></div>
        <div class="sub-add">
          <input type="text" name="newSub" placeholder="Ej.: Veterinaria" maxlength="30" autocomplete="off" aria-label="Nueva subcategoría" />
          <button type="button" class="btn btn-soft btn-sm" data-add-sub>${icon("plus", 16)}Agregar</button>
        </div>
        <p class="field-hint">Sirven para ver más detalle: por ejemplo, dentro de Hogar, “Alquiler” o “Reparaciones”.</p>
      </div>
      ${emojiPicker(current.icon)}
      ${colorPicker(current.color)}
      ${locked ? html`<p class="field-hint">Esta categoría recibe los movimientos de las categorías que borres, por eso no se puede eliminar.</p>` : ""}
      ${formActions({ submitLabel: isEdit ? "Guardar cambios" : "Crear categoría", deletable: isEdit && !locked })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      const list = form.querySelector("[data-sub-list]");

      const renderSubs = () => {
        setHTML(
          list,
          subs.length
            ? html`${subs.map(
                (sub) => html`<span class="sub-item">
                  <button type="button" class="sub-item-main" data-edit-sub="${sub.id}" aria-label="Editar ${sub.name}">${sub.icon ? html`<span aria-hidden="true">${sub.icon}</span>` : ""}${sub.name}</button>
                  <button type="button" class="sub-item-remove" data-remove-sub="${sub.id}" aria-label="Quitar ${sub.name}">${icon("close", 14)}</button>
                </span>`
              )}`
            : html`<span class="muted-text sub-empty">Todavía no tiene subcategorías.</span>`
        );
      };
      renderSubs();

      const addSub = () => {
        const input = form.elements.newSub;
        const name = input.value.trim();
        if (!name) return input.focus();
        if (subs.some((sub) => sub.name.toLowerCase() === name.toLowerCase())) {
          toast(`Ya existe “${name}”`, { type: "info" });
          return;
        }
        // Id provisorio: el definitivo lo mantiene el store al guardar.
        subs.push({ id: `sub-${Date.now().toString(36)}-${subs.length}`, name, icon: "" });
        input.value = "";
        renderSubs();
        input.focus();
      };

      form.elements.newSub.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addSub();
        }
      });

      form.addEventListener("click", async (event) => {
        if (event.target.closest("[data-add-sub]")) return addSub();
        const editId = event.target.closest("[data-edit-sub]")?.dataset.editSub;
        if (editId) {
          const sub = subs.find((x) => x.id === editId);
          openSubcategoryForm({
            sub,
            parentName: form.elements.name.value || current.name,
            onSubmit: (values) => {
              Object.assign(sub, values);
              renderSubs();
            },
          });
          return;
        }
        const removeId = event.target.closest("[data-remove-sub]")?.dataset.removeSub;
        if (removeId) {
          const uses = store.countSubcategoryUsage(removeId);
          if (uses) {
            const sub = subs.find((x) => x.id === removeId);
            const ok = await confirmDialog({
              title: `¿Quitar “${sub.name}”?`,
              text: `Tiene ${uses} movimiento${uses === 1 ? "" : "s"}. No se borran: quedan en la categoría, sin subcategoría.`,
              confirmLabel: "Quitar",
              danger: true,
            });
            if (!ok) return;
          }
          subs = subs.filter((x) => x.id !== removeId);
          renderSubs();
        }
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const name = data.name.trim();
        if (!name) return fieldError(form, "name", "Poné un nombre para la categoría.");
        // Lo que quedó escrito sin tocar "Agregar" también se guarda.
        if (data.newSub?.trim()) addSub();
        const saved = store.saveCategory({
          ...(isEdit ? { id: category.id } : { type: data.type }),
          name,
          icon: data.icon || current.icon,
          color: data.color,
          subcategories: subs,
        });
        toast(isEdit ? "Categoría actualizada" : "Categoría creada");
        close();
        onSaved?.(saved);
      });

      form.querySelector("[data-form-delete]")?.addEventListener("click", async () => {
        const uses = store.countCategoryUsage(category.id);
        const ok = await confirmDialog({
          title: `¿Eliminar “${category.name}”?`,
          text: uses
            ? `Tiene ${uses} movimiento${uses === 1 ? "" : "s"}. No se borran: pasan a “Otros”.`
            : "No tiene movimientos asociados.",
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        const backup = store.snapshot();
        store.deleteCategory(category.id);
        close();
        toast("Categoría eliminada", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
      });
    },
  });
}

/**
 * Nombre e ícono de una subcategoría. No guarda nada por sí mismo:
 * devuelve los valores en `onSubmit` y quien lo abre decide qué hacer.
 */
export function openSubcategoryForm({ sub, parentName = "", onSubmit }) {
  const isEdit = Boolean(sub);
  openSheet({
    title: isEdit ? "Editar subcategoría" : `Nueva subcategoría${parentName ? ` en ${parentName}` : ""}`,
    body: html`<form class="form" novalidate>
      ${textField({ name: "name", label: "Nombre", value: sub?.name || "", required: true, placeholder: "Ej.: Carnicería", maxlength: 30 })}
      ${emojiPicker(sub?.icon || "")}
      ${formActions({ submitLabel: isEdit ? "Guardar" : "Crear subcategoría" })}
    </form>`,
    onMount(panel, close) {
      const form = panel.querySelector("form");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        clearErrors(form);
        const data = readForm(form);
        const name = data.name.trim();
        if (!name) return fieldError(form, "name", "Poné un nombre para la subcategoría.");
        onSubmit({ name, icon: data.icon || sub?.icon || "" });
        close();
      });
    },
  });
}

/**
 * Conecta un selector de categoría + subcategoría dentro de un formulario:
 * al cambiar de categoría se muestran sus subcategorías, y los botones
 * "Nueva" crean categorías o subcategorías sin salir del formulario.
 */
export function bindCategoryPickers(form, getType) {
  form.addEventListener("change", (event) => {
    if (event.target.name === "categoryId") replaceSubcategoryPicker(form, store.getState(), event.target.value);
  });
  form.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-cats]");
    if (toggle) {
      const picker = toggle.closest(".field").querySelector(".cat-picker");
      const expanded = picker.classList.toggle("is-collapsed") === false;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.querySelector("span").textContent = expanded ? "Ver menos" : "Ver todas las categorías";
      return;
    }
    if (event.target.closest("[data-new-category]")) {
      openCategoryForm({
        type: getType(),
        onSaved: (category) => {
          replaceCategoryPicker(form, store.getState(), getType(), category.id);
          replaceSubcategoryPicker(form, store.getState(), category.id);
        },
      });
      return;
    }
    const categoryId = event.target.closest("[data-new-subcategory]")?.dataset.newSubcategory;
    if (categoryId) {
      const category = store.getState().categories.find((c) => c.id === categoryId);
      openSubcategoryForm({
        parentName: category?.name,
        onSubmit: (values) => {
          const sub = store.saveSubcategory(categoryId, values);
          replaceSubcategoryPicker(form, store.getState(), categoryId, sub?.id);
          toast(`Subcategoría “${values.name}” creada`);
        },
      });
    }
  });
}
