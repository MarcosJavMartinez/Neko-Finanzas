// Selector de opciones (Ingreso/Gasto, Semanal/Mensual…): una píldora que se
// desliza hasta la opción elegida, en vez de que el fondo salte de golpe.
// Funciona en pantallas y en hojas: cada selector nuevo se prepara solo.

const ready = new WeakSet();
// Dónde quedó la píldora de cada selector (por nombre): cuando una pantalla se
// redibuja al elegir, la nueva arranca donde estaba la vieja y se desliza.
const lastPos = new Map();
const keyOf = (group) => group.querySelector("input")?.name || "";
const sizes = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => entries.forEach((e) => place(e.target))) : null;

/** Mueve la píldora a la opción elegida (o la esconde si no hay ninguna). */
function place(group, animate = true) {
  const pill = group.querySelector(":scope > .seg-pill");
  const checked = group.querySelector("input:checked");
  const span = checked?.closest(".segmented-option")?.querySelector("span");
  if (!pill) return;
  if (!span || !span.offsetWidth) {
    pill.style.opacity = "0";
    return;
  }
  if (!animate) pill.classList.add("no-slide");
  pill.style.opacity = "1";
  pill.style.width = `${span.offsetWidth}px`;
  pill.style.height = `${span.offsetHeight}px`;
  // La opción está posicionada: su lugar dentro del selector + el del texto dentro de ella.
  const option = span.closest(".segmented-option");
  pill.style.transform = `translate(${option.offsetLeft + span.offsetLeft}px, ${option.offsetTop + span.offsetTop}px)`;
  lastPos.set(keyOf(group), { transform: pill.style.transform, width: pill.style.width });
  if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.remove("no-slide")));
}

function prepare(group) {
  if (ready.has(group)) return;
  ready.add(group);
  const pill = document.createElement("span");
  pill.className = "seg-pill";
  pill.setAttribute("aria-hidden", "true");
  group.prepend(pill);
  group.classList.add("has-pill");
  const prev = lastPos.get(keyOf(group));
  if (prev && group.isConnected) {
    pill.classList.add("no-slide");
    Object.assign(pill.style, { opacity: "1", transform: prev.transform, width: prev.width });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pill.classList.remove("no-slide");
      place(group);
    }));
  } else place(group, false);
  sizes?.observe(group);
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches(".segmented")) prepare(root);
  root.querySelectorAll?.(".segmented").forEach(prepare);
}

export function startSegmentedPills() {
  scan(document.body);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("change", (event) => {
    const group = event.target.closest?.(".segmented.has-pill");
    if (group) place(group);
  });
}
