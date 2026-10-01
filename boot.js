// Se carga antes que el CSS pinte: aplica el tema, el color principal y el
// fondo guardados para evitar el parpadeo al abrir. Archivo aparte (y no
// inline) para poder usar una Content-Security-Policy sin "unsafe-inline".
//
// Paletas (como en Neko Lista): cambian SOLO el color de marca y de acción
// (el cian). Los colores con significado —verde ingresos, coral gastos,
// amarillo facturas, violeta metas— no cambian nunca. Todos los tonos se
// derivan de un único color, buscando que el texto siga siendo legible.
(function () {
  var KEYS = {
    theme: "nekoFinanzas.theme",
    palette: "nekoFinanzas.palette",
    customColor: "nekoFinanzas.customColor",
    bgColor: "nekoFinanzas.bgColor",
    bgImage: "nekoFinanzas.bgImage",
  };
  var PALETTES = {
    cian: null, // el de la app: tokens.css, ajustados a mano
    oceano: "#1c7ed6",
    verde: "#2f9e44",
    atardecer: "#e8590c",
    uva: "#7048c2",
    frambuesa: "#e64980",
    grafito: "#495057",
  };
  var HEX = /^#[0-9a-f]{6}$/i;
  var BRAND_PROPS = [
    "--brand", "--brand-2", "--brand-dark", "--brand-ink", "--brand-soft", "--brand-tint", "--brand-glow",
    "--brand-gradient", "--header-gradient", "--brand-shadow", "--tab-active-ink",
    "--action", "--action-gradient", "--action-glow", "--focus",
  ];

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  // --- Color ---------------------------------------------------------------
  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(c) {
    return "#" + c.map(function (v) {
      return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    }).join("");
  }
  /** mix(a, b, w): w de `a` y (1 − w) de `b`. */
  function mix(a, b, w) {
    var x = rgb(a), y = rgb(b);
    return hex([0, 1, 2].map(function (i) { return x[i] * w + y[i] * (1 - w); }));
  }
  function luminance(h) {
    var c = rgb(h).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  /** Oscurece (o aclara) `color` hacia `toward` hasta lograr el contraste pedido con `against`. */
  function ensure(color, against, ratio, toward) {
    var c = color;
    for (var i = 0; i < 40 && contrast(c, against) < ratio; i++) c = mix(c, toward, 0.93);
    return c;
  }
  function rgba(h, a) {
    var c = rgb(h);
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + a + ")";
  }
  function gradient(a, b, c) {
    return "linear-gradient(135deg, " + a + " 0%, " + b + " 55%, " + c + " 100%)";
  }

  /** Todos los tonos de marca a partir de un color, para claro u oscuro. */
  function brandTokens(base, dark) {
    var t = {};
    if (!dark) {
      var header = ensure(base, "#ffffff", 3, "#000000");
      var action = ensure(base, "#ffffff", 4.5, "#000000");
      t["--brand"] = base;
      t["--brand-2"] = mix(base, "#ffffff", 0.8);
      t["--brand-dark"] = mix(base, "#000000", 0.78);
      t["--brand-ink"] = ensure(base, "#ffffff", 4.6, "#000000");
      t["--brand-soft"] = mix(base, "#ffffff", 0.12);
      t["--brand-tint"] = mix(base, "#ffffff", 0.06);
      t["--brand-glow"] = rgba(base, 0.3);
      t["--brand-gradient"] = gradient(mix(base, "#ffffff", 0.82), base, mix(base, "#000000", 0.86));
      t["--header-gradient"] = gradient(mix(header, "#ffffff", 0.92), header, mix(header, "#000000", 0.88));
      t["--brand-shadow"] = rgba(mix(header, "#000000", 0.6), 0.3);
      t["--tab-active-ink"] = t["--brand-ink"];
      t["--action"] = action;
      t["--action-gradient"] = gradient(mix(action, "#ffffff", 0.9), action, mix(action, "#000000", 0.9));
      t["--action-glow"] = rgba(action, 0.32);
      t["--focus"] = base;
      t.meta = header;
    } else {
      var bg = "#101d1a";
      var brand = ensure(base, bg, 5, "#ffffff");
      var headerD = ensure(mix(base, "#000000", 0.82), "#ffffff", 3.5, "#000000");
      var actionD = ensure(mix(base, "#000000", 0.88), "#ffffff", 3.6, "#000000");
      t["--brand"] = brand;
      t["--brand-2"] = mix(brand, "#ffffff", 0.8);
      t["--brand-dark"] = brand;
      t["--brand-ink"] = ensure(mix(brand, "#ffffff", 0.85), "#172622", 7, "#ffffff");
      t["--brand-soft"] = mix(base, "#172622", 0.24);
      t["--brand-tint"] = mix(base, bg, 0.14);
      t["--brand-glow"] = rgba(brand, 0.25);
      t["--brand-gradient"] = gradient(mix(brand, "#ffffff", 0.82), brand, mix(brand, "#000000", 0.86));
      t["--header-gradient"] = gradient(mix(headerD, "#ffffff", 0.9), headerD, mix(headerD, "#000000", 0.84));
      t["--brand-shadow"] = rgba("#000000", 0.35);
      t["--tab-active-ink"] = ensure(headerD, "#ffffff", 4.6, "#000000");
      t["--action"] = actionD;
      t["--action-gradient"] = gradient(mix(actionD, "#ffffff", 0.88), actionD, mix(actionD, "#000000", 0.9));
      t["--action-glow"] = rgba(actionD, 0.3);
      t["--focus"] = brand;
      t.meta = headerD;
    }
    return t;
  }

  // --- Aplicar -------------------------------------------------------------
  function apply() {
    var root = document.documentElement;
    var theme = read(KEYS.theme);
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    root.setAttribute("data-theme", theme);
    var dark = theme === "dark";

    // Color principal
    var palette = read(KEYS.palette);
    var base = palette === "custom" ? read(KEYS.customColor) : PALETTES[palette];
    var metaColor = dark ? "#087f9a" : "#0898ba";
    BRAND_PROPS.forEach(function (p) { root.style.removeProperty(p); });
    if (base && HEX.test(base)) {
      var tokens = brandTokens(base.toLowerCase(), dark);
      BRAND_PROPS.forEach(function (p) { root.style.setProperty(p, tokens[p]); });
      metaColor = tokens.meta;
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", metaColor);

    // Fondo: patrón (por defecto), sin imagen, imagen propia o color propio
    var bgColor = read(KEYS.bgColor);
    var bgImage = read(KEYS.bgImage);
    if (bgColor && HEX.test(bgColor)) {
      root.style.setProperty("--bg", bgColor);
      bgImage = "none";
    } else {
      root.style.removeProperty("--bg");
    }
    root.setAttribute("data-bg", bgImage === "none" || bgImage === "custom" ? bgImage : "pattern");
    root.toggleAttribute("data-bg-color", !!(bgColor && HEX.test(bgColor)));
  }

  window.NekoAppearance = { apply: apply, palettes: PALETTES };
  apply();
})();
