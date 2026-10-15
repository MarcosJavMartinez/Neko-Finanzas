// Festejo al cumplir una meta: confeti que cae y el Neko festejando con el
// nombre de la meta. Se va solo (o al tocarlo). Quien pide menos movimiento
// ve solo el cartel, sin confeti.

import { html, setHTML, haptic, prefersReducedMotion } from "./dom.js";

const COLORS = ["var(--brand)", "var(--goal)", "var(--income)", "var(--bill)", "var(--expense)", "#ffd84d"];

export function celebrateGoal(goal) {
  document.querySelector(".celebrate")?.remove();
  const root = document.createElement("div");
  root.className = "celebrate";
  root.setAttribute("role", "status");
  const calm = prefersReducedMotion();
  setHTML(
    root,
    html`${calm ? "" : html`<div class="confetti" aria-hidden="true"></div>`}
      <div class="celebrate-card">
        <img src="img/neko-festejando.webp" alt="" width="120" height="120" />
        <p class="celebrate-title">¡Cumpliste tu meta!</p>
        <p class="celebrate-name">${goal.icon} ${goal.name}</p>
      </div>`
  );
  if (!calm) {
    // Piezas al azar: posición, color, tamaño, giro y demora distintos.
    const box = root.querySelector(".confetti");
    for (let i = 0; i < 70; i++) {
      const piece = document.createElement("i");
      piece.style.setProperty("--x", `${Math.random() * 100}vw`);
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 30}vw`);
      piece.style.setProperty("--spin", `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`);
      piece.style.setProperty("--delay", `${Math.random() * 350}ms`);
      piece.style.setProperty("--fall", `${1500 + Math.random() * 1100}ms`);
      piece.style.setProperty("--c", COLORS[i % COLORS.length]);
      piece.style.width = `${6 + Math.random() * 6}px`;
      piece.style.height = `${8 + Math.random() * 8}px`;
      if (i % 3 === 0) piece.style.borderRadius = "50%";
      box.append(piece);
    }
  }
  document.body.append(root);
  haptic();
  requestAnimationFrame(() => root.classList.add("is-on"));
  const close = () => {
    root.classList.remove("is-on");
    setTimeout(() => root.remove(), 400);
  };
  root.addEventListener("click", close);
  setTimeout(close, 3000);
}
