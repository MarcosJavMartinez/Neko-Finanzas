// Valores iniciales: categorías predeterminadas, paleta, íconos y el estado
// vacío de la app.

export const SCHEMA_VERSION = 5; // 3: cuentas y transferencias · 4 y 5: extras del sueldo

/** Paleta de la versión 1 (verde menta), para migrar colores viejos. */
export const PALETTE_V1 = ["#1f9e74", "#3a86d4", "#e4705f", "#2a9fb0", "#8a63d2", "#d99a2b", "#d65c96", "#7d9a2e"];

/**
 * Colores para categorías, metas y presupuestos. El orden está validado
 * para que colores vecinos se distingan también con daltonismo (se asignan
 * en este orden y se reutilizan en gráficos).
 */
export const PALETTE = [
  "#0aa0c0", // cian (el del ícono)
  "#e4705f", // coral
  "#4a63dd", // azul índigo
  "#1f9e74", // verde menta
  "#8a63d2", // violeta
  "#d99a2b", // ámbar
  "#d65c96", // frambuesa
  "#7d9a2e", // oliva
];

export const EMOJI_OPTIONS = [
  "🛒", "🍔", "☕", "🍕", "⛽", "🚌", "🚕", "👕", "👟", "🎮", "🎬", "🎵",
  "💊", "🏥", "🛍️", "🏠", "🛋️", "💡", "🔥", "💧", "🌐", "📱", "📺", "🤖",
  "📚", "🎓", "✈️", "🏖️", "🐱", "🐶", "🎁", "💼", "💻", "🪙", "💵", "🏦",
  "🔁", "🏷️", "✨", "📦", "🧾", "🛟", "💰", "🎯", "🚗", "🏋️", "💇", "🧸",
];

/**
 * Subcategorías predeterminadas. Son opcionales: un movimiento siempre
 * pertenece a su categoría (lo que usan presupuestos y reportes) y puede
 * además llevar una subcategoría para tener más detalle.
 * Los ids son fijos ("exp-hogar.alquiler") para poder agregarlas a datos
 * existentes sin duplicarlas.
 */
const SUBCATEGORIES = {
  "exp-super": [["almacen", "Almacén", "🥫"], ["carniceria", "Carnicería", "🥩"], ["verduleria", "Verdulería", "🥬"], ["dietetica", "Dietética", "🥜"], ["limpieza", "Limpieza", "🧴"], ["panaderia", "Panadería", "🥖"], ["bebidas", "Bebidas", "🥤"]],
  "exp-comida": [["delivery", "Delivery", "🛵"], ["restaurante", "Restaurante", "🍽️"], ["cafe", "Café", "☕"], ["almuerzo", "Almuerzo", "🥪"], ["kiosco", "Kiosco", "🍫"]],
  "exp-transporte": [["nafta", "Nafta", "⛽"], ["sube", "Colectivo / SUBE", "🚌"], ["taxi", "Taxi / Uber", "🚕"], ["estacionamiento", "Estacionamiento", "🅿️"], ["peajes", "Peajes", "🛣️"], ["mantenimiento", "Mantenimiento del auto", "🔧"]],
  "exp-ropa": [["ropa", "Ropa", "👕"], ["calzado", "Calzado", "👟"], ["accesorios", "Accesorios", "👜"]],
  "exp-entretenimiento": [["cine", "Cine", "🎬"], ["salidas", "Salidas", "🍻"], ["juegos", "Juegos", "🎮"], ["eventos", "Eventos", "🎟️"], ["libros", "Libros", "📖"]],
  "exp-salud": [["farmacia", "Farmacia", "💊"], ["medico", "Médico", "🩺"], ["prepaga", "Obra social / Prepaga", "🏥"], ["gimnasio", "Gimnasio", "🏋️"], ["dentista", "Dentista", "🦷"]],
  "exp-compras": [["tecnologia", "Tecnología", "💻"], ["regalos", "Regalos", "🎁"], ["deco", "Deco", "🪴"], ["online", "Compras online", "📦"]],
  "exp-hogar": [["alquiler", "Alquiler", "🔑"], ["expensas", "Expensas", "🏢"], ["reparaciones", "Reparaciones", "🔧"], ["muebles", "Muebles", "🛋️"], ["articulos", "Artículos para la casa", "🧺"]],
  "exp-servicios": [["luz", "Luz", "💡"], ["gas", "Gas", "🔥"], ["agua", "Agua", "💧"], ["internet", "Internet", "🌐"], ["telefono", "Teléfono", "📱"], ["seguro", "Seguro", "🛡️"]],
  "exp-suscripciones": [["netflix", "Netflix", "📺"], ["prime", "Prime Video", "🎞️"], ["crunchyroll", "Crunchyroll", "🍥"], ["spotify", "Spotify", "🎵"], ["geforce", "GeForce NOW", "🎮"], ["chatgpt", "ChatGPT", "🤖"], ["disney", "Disney+", "🏰"], ["youtube", "YouTube Premium", "▶️"]],
  "exp-educacion": [["cursos", "Cursos", "🎓"], ["cuota", "Cuota", "🏫"], ["libros", "Libros", "📚"], ["materiales", "Materiales", "✏️"]],
  "exp-viajes": [["pasajes", "Pasajes", "✈️"], ["alojamiento", "Alojamiento", "🏨"], ["excursiones", "Excursiones", "🗺️"], ["comida", "Comida en viaje", "🍝"]],
  "inc-sueldo": [["mensual", "Sueldo mensual", "💼"], ["aguinaldo", "Aguinaldo", "🎄"], ["extras", "Horas extra", "⏱️"], ["proporcional", "Sueldo proporcional", "⏳"], ["comision", "Comisiones", "📈"], ["bono", "Bono o premio", "🎁"], ["vacaciones", "Vacaciones", "🏖️"], ["otros", "Otros extras", "✨"]],
  "inc-independiente": [["proyectos", "Proyectos", "🧩"], ["clases", "Clases", "🧑‍🏫"], ["consultoria", "Consultoría", "💬"]],
  "inc-ventas": [["online", "Ventas online", "📦"], ["usados", "Cosas usadas", "♻️"]],
};

export function defaultSubcategories(categoryId) {
  return (SUBCATEGORIES[categoryId] || []).map(([key, name, icon]) => ({ id: `${categoryId}.${key}`, name, icon }));
}

const cat = (id, name, icon, color, type) => ({ id, name, icon, color, type, builtin: true, subcategories: defaultSubcategories(id) });

export const DEFAULT_CATEGORIES = [
  // Gastos
  cat("exp-super", "Supermercado", "🛒", PALETTE[0], "expense"),
  cat("exp-comida", "Comida", "🍔", PALETTE[2], "expense"),
  cat("exp-transporte", "Transporte", "⛽", PALETTE[1], "expense"),
  cat("exp-ropa", "Ropa", "👕", PALETTE[6], "expense"),
  cat("exp-entretenimiento", "Entretenimiento", "🎮", PALETTE[4], "expense"),
  cat("exp-salud", "Salud", "💊", PALETTE[3], "expense"),
  cat("exp-compras", "Compras", "🛍️", PALETTE[5], "expense"),
  cat("exp-hogar", "Hogar", "🏠", PALETTE[7], "expense"),
  cat("exp-servicios", "Servicios", "💡", PALETTE[1], "expense"),
  cat("exp-suscripciones", "Suscripciones", "📺", PALETTE[4], "expense"),
  cat("exp-educacion", "Educación", "📚", PALETTE[3], "expense"),
  cat("exp-viajes", "Viajes", "✈️", PALETTE[0], "expense"),
  cat("exp-otros", "Otros gastos", "📦", "#8b958e", "expense"),
  // Ingresos
  cat("inc-sueldo", "Sueldo", "💼", PALETTE[0], "income"),
  cat("inc-independiente", "Trabajo independiente", "💻", PALETTE[1], "income"),
  cat("inc-propinas", "Propinas", "🪙", PALETTE[5], "income"),
  cat("inc-transferencias", "Transferencias", "🔁", PALETTE[3], "income"),
  cat("inc-bonos", "Bonificaciones", "🎁", PALETTE[4], "income"),
  cat("inc-ventas", "Ventas", "🏷️", PALETTE[6], "income"),
  cat("inc-otros", "Otros ingresos", "✨", "#8b958e", "income"),
];

// ---------------------------------------------------------------------------
// Cuentas: dónde está la plata (efectivo, banco, billetera virtual, ahorro).
// ---------------------------------------------------------------------------

export const ACCOUNT_KINDS = {
  cash: { label: "Efectivo", icon: "💵" },
  bank: { label: "Banco", icon: "🏦" },
  wallet: { label: "Billetera virtual", icon: "📱" },
  savings: { label: "Ahorro", icon: "🐷" },
  // Tarjeta de crédito: su saldo es lo que debés (negativo). Lo que gastás con
  // ella baja tu total en el momento; pagarla es mover plata del banco a la
  // tarjeta (no es un gasto nuevo).
  credit: { label: "Tarjeta de crédito", icon: "💳" },
};

/** Extras que pueden venir junto con el sueldo (cada uno se registra como un ingreso aparte). */
export const INCOME_EXTRAS = [
  { key: "aguinaldo", name: "Aguinaldo", icon: "🎄", categoryId: "inc-sueldo", subcategoryId: "inc-sueldo.aguinaldo" },
  { key: "extras", name: "Horas extra", icon: "⏱️", categoryId: "inc-sueldo", subcategoryId: "inc-sueldo.extras" },
  { key: "comision", name: "Comisión", icon: "📈", categoryId: "inc-sueldo", subcategoryId: "inc-sueldo.comision" },
  { key: "bono", name: "Bono o premio", icon: "🎁", categoryId: "inc-sueldo", subcategoryId: "inc-sueldo.bono" },
  { key: "propinas", name: "Propinas", icon: "🪙", categoryId: "inc-propinas", subcategoryId: "" },
];

/** Cuotas que se ofrecen al comprar con tarjeta. */
export const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 9, 12, 18, 24];

/** La cuenta con la que arranca la app (y a la que va lo de cuentas borradas). */
export const DEFAULT_ACCOUNT_ID = "acc-principal";

export function defaultAccount(currency = "ARS", opening = 0) {
  return { id: DEFAULT_ACCOUNT_ID, name: "Mi plata", icon: "👛", color: "#08a7c8", currency, kind: "cash", opening, archived: false };
}

/** Categorías de respaldo: no se pueden borrar (reciben lo de las borradas). */
export const FALLBACK_CATEGORY = { expense: "exp-otros", income: "inc-otros" };

export function createEmptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      mainCurrency: "ARS",
      reserveHorizon: "30d", // "30d" | "month"
      budgetReference: 0,
      isDemo: false,
      demoEdited: false,
      createdAt: new Date().toISOString(),
    },
    rates: { ARS: 1, USD: 1350, EUR: 1470 },
    ratesUpdatedAt: new Date().toISOString(),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, subcategories: c.subcategories.map((sub) => ({ ...sub })) })),
    accounts: [defaultAccount()],
    transactions: [],
    bills: [],
    goals: [],
    budgets: [],
    loans: [],
  };
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
