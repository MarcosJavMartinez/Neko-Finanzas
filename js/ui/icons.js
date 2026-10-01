// Íconos de interfaz: trazos simples de 24px, redondeados, en currentColor.
// (Las categorías usan emoji para que el usuario pueda elegir libremente.)

import { raw } from "./dom.js";

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
  wallet: '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/><circle cx="16" cy="14" r="1.3"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  filter: '<path d="M3.5 5h17l-6.5 7.5V19l-4 2v-8.5z"/>',
  coinStack: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 10v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4M5 14v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 13.3 7.6 4.4M15.8 6.3l-7.6 4.4"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  table: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5V20"/>',
  vibrate: '<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.5 8v8M19.5 8v8M2 10.5v3M22 10.5v3"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.2C3.9 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 1-1 1.7v.5M12 17v.01"/>',
};

export function icon(name, size = 20, extraClass = "") {
  const body = PATHS[name] || PATHS.info;
  return raw(
    `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/**
 * El gatito de Neko Finanzas para estados vacíos y el splash: una carita
 * simple sosteniendo una moneda. `mood` cambia la expresión.
 */
export function nekoArt({ size = 112, mood = "happy", accent = "#12b3c8" } = {}) {
  const eyes =
    mood === "sleepy"
      ? '<path d="M44 60q6 4 12 0M72 60q6 4 12 0" stroke="#24463a" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
      : '<path d="M44 62q6-7 12 0M72 62q6-7 12 0" stroke="#24463a" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
  return raw(`<svg class="neko-art" width="${size}" height="${size}" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
    <ellipse cx="64" cy="118" rx="36" ry="5" fill="#000" opacity=".05"/>
    <path d="M30 50 L32 18 L56 34 Z M98 50 L96 18 L72 34 Z" fill="${accent}" stroke="${accent}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M37 38 L38 26 L48 33 Z M91 38 L90 26 L80 33 Z" fill="#d4fbf7" stroke="#d4fbf7" stroke-width="4" stroke-linejoin="round"/>
    <rect x="18" y="30" width="92" height="80" rx="34" fill="${accent}"/>
    <ellipse cx="64" cy="80" rx="30" ry="22" fill="#e8fafb"/>
    ${eyes}
    <path d="M60 72q4 3 8 0" stroke="#24463a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="40" cy="74" r="4.5" fill="#f7a8a0" opacity=".7"/><circle cx="88" cy="74" r="4.5" fill="#f7a8a0" opacity=".7"/>
    <path d="M8 66h14M10 76l12-3M120 66h-14M118 76l-12-3" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <g transform="translate(64 96)">
      <circle r="15" fill="#f6c453" stroke="#fff" stroke-width="3"/>
      <circle r="10" fill="none" stroke="#e7a92e" stroke-width="2"/>
      <path d="M3 -4.5q-1.5-2-4-2q-3.5 0-3.5 2.6q0 5.4 7.5 3.8q3.5.2 3.5 3q0 3-4 3q-3 0-4.5-2.2M0 -9v18" stroke="#b77c14" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>
  </svg>`);
}
