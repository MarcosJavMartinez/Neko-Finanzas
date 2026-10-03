// Service worker de Neko Finanzas.
// Al instalarse guarda toda la app, así funciona sin conexión desde la
// primera visita. Después usa "red primero": con internet trae siempre la
// última versión publicada; sin internet responde desde el cache.
// Subí CACHE_VERSION cuando cambie la lista de archivos.

const CACHE_VERSION = "neko-finanzas-v30";
const APP_SHELL = [
  "./",
  "index.html",
  "boot.js",
  "manifest.json",
  "styles/fonts.css",
  "fonts/inter-latin.woff2",
  "fonts/inter-latin-ext.woff2",
  "fonts/outfit-latin.woff2",
  "fonts/outfit-latin-ext.woff2",
  "fonts/nunito-latin.woff2",
  "fonts/nunito-latin-ext.woff2",
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
  "js/ui/backupFile.js",
  "js/ui/reminders.js",
  "js/ui/snapshots.js",
  "js/ui/forms/accountForms.js",
  "js/ui/forms/billForms.js",
  "js/ui/forms/budgetForm.js",
  "js/ui/forms/categoryForm.js",
  "js/ui/forms/fields.js",
  "js/ui/forms/goalForms.js",
  "js/ui/forms/incomeConfirm.js",
  "js/ui/forms/loanForms.js",
  "js/ui/forms/setupForm.js",
  "js/ui/forms/transactionForm.js",
  "js/screens/bills.js",
  "js/screens/budgets.js",
  "js/screens/accounts.js",
  "js/screens/loans.js",
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
  // Solo archivos de la app: no hay pedidos a otros servidores.
  if (url.origin !== self.location.origin) return;

  // Fuentes: cache primero (no cambian nunca).
  if (url.pathname.includes("/fonts/")) {
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

// ---------------------------------------------------------------------------
// Avisos de vencimientos
//
// La app deja en IndexedDB un plan con los avisos de los próximos días (ver
// js/ui/reminders.js). Cuando el navegador despierta al service worker en
// segundo plano (Android con la app instalada), se muestran los de hoy que
// todavía no se mostraron. Si los avisos están apagados, el plan está vacío.
// ---------------------------------------------------------------------------

const REMINDERS_KEY = "reminders";

function remindersStore(mode) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("nekoFinanzas");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("assets")) {
        db.close();
        return reject(new Error("sin datos"));
      }
      const tx = db.transaction("assets", mode);
      tx.oncomplete = () => db.close();
      resolve(tx.objectStore("assets"));
    };
  });
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function showDueReminders() {
  if (self.Notification && Notification.permission !== "granted") return;
  const record = await request((await remindersStore("readonly")).get(REMINDERS_KEY));
  if (!record || !record.enabled) return;
  const today = localToday();
  const shown = record.shown || {};
  let changed = false;
  for (const item of record.items || []) {
    if (shown[item.tag] || item.from > today || item.until < today || !item.titles || !item.titles[today]) continue;
    await self.registration.showNotification(item.titles[today], { body: item.body, tag: item.tag, icon: "img/icon-192.png", badge: "img/icon-192.png", data: { url: "#/facturas" } });
    shown[item.tag] = today;
    changed = true;
  }
  if (changed) await request((await remindersStore("readwrite")).put({ ...record, shown }, REMINDERS_KEY));
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "neko-vencimientos") event.waitUntil(showDueReminders().catch(() => {}));
});

// Tocar un aviso abre la app (o la trae al frente) en Facturas.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || "#/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      if (open) {
        open.navigate && open.navigate(new URL(hash, self.registration.scope).href).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(new URL(hash, self.registration.scope).href);
    })
  );
});
