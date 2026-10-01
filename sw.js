// Service worker de Neko Finanzas.
// Al instalarse guarda toda la app, así funciona sin conexión desde la
// primera visita. Después usa "red primero": con internet trae siempre la
// última versión publicada; sin internet responde desde el cache.
// Subí CACHE_VERSION cuando cambie la lista de archivos.

const CACHE_VERSION = "neko-finanzas-v18";
const APP_SHELL = [
  "./",
  "index.html",
  "boot.js",
  "manifest.json",
  "styles/tokens.css",
  "styles/base.css",
  "styles/components.css",
  "styles/screens.css",
  "js/app.js",
  "js/core/dates.js",
  "js/core/finance.js",
  "js/core/money.js",
  "js/core/sanitize.js",
  "js/core/prefs.js",
  "js/core/csv.js",
  "js/core/db.js",
  "js/core/ics.js",
  "js/core/storage.js",
  "js/core/store.js",
  "js/data/defaults.js",
  "js/data/demo.js",
  "js/ui/charts.js",
  "js/ui/components.js",
  "js/ui/dom.js",
  "js/ui/icons.js",
  "js/ui/sheet.js",
  "js/ui/toast.js",
  "js/ui/theme.js",
  "js/ui/install.js",
  "js/ui/download.js",
  "js/ui/onboarding.js",
  "js/ui/summaryImage.js",
  "js/ui/background.js",
  "js/ui/snapshots.js",
  "js/ui/forms/billForms.js",
  "js/ui/forms/budgetForm.js",
  "js/ui/forms/categoryForm.js",
  "js/ui/forms/fields.js",
  "js/ui/forms/goalForms.js",
  "js/ui/forms/setupForm.js",
  "js/ui/forms/transactionForm.js",
  "js/screens/bills.js",
  "js/screens/budgets.js",
  "js/screens/categories.js",
  "js/screens/currencies.js",
  "js/screens/goals.js",
  "js/screens/home.js",
  "js/screens/more.js",
  "js/screens/reports.js",
  "js/screens/settings.js",
  "js/screens/transactions.js",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/icon-maskable-512.png",
  "img/apple-touch-icon.png",
  "img/favicon-32.png",
  "img/favicon-16.png",
  "img/logo-header.png",
  "img/neko-tools-mark-v2.png",
  "img/bg-pattern-light.jpg",
  "img/bg-pattern-dark.jpg",
  "img/hero-wallet.png",
];

// Las fuentes de Google también se guardan para que offline se vea igual.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return;

  // Fuentes: cache primero (no cambian nunca).
  if (isFont) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // App: red primero, cache como respaldo.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then((cached) => cached || (request.mode === "navigate" ? caches.match("index.html") : undefined))
      )
  );
});
