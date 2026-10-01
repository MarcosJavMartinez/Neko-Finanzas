# Neko Finanzas

Finanzas personales simples y privadas. De un vistazo te responde cuatro preguntas: **¿cuánto dinero tengo?, ¿cuánto tengo que reservar?, ¿cuánto puedo gastar? y ¿cuánto estoy ahorrando?** Sin cuenta, sin anuncios y gratis.

La segunda herramienta de [Neko Tools](https://nekotools.site), después de [Neko Lista](https://neko-lista.vercel.app/).

## ✨ Funcionalidades

- **Saldo disponible real**: dinero total menos lo que hay que reservar para facturas y lo apartado en metas.
- **Ingresos y gastos** con categorías propias (ícono y color), fecha, hora opcional y descripción. Los ingresos pueden repetirse (la app te recuerda registrarlos; nunca los suma sola).
- **Facturas y servicios** recurrentes (semanal a anual): la app calcula cuánto reservar, y al pagarlas registra el gasto y pasa al próximo vencimiento.
- **Presupuestos** mensuales por porcentaje de los ingresos o monto fijo, aplicados a categorías, a una meta o "al resto", con avisos suaves.
- **Metas de ahorro** con depósitos, retiros e historial.
- **Monedas**: ARS, USD y EUR, con tipo de cambio manual (sin depender de ninguna API).
- **Reportes**: resumen del mes, gastos por categoría, ingresos contra gastos y evolución del dinero.
- **Deshacer** en todas las acciones que borran o mueven plata.
- **PWA** instalable que funciona sin conexión.
- Datos de ejemplo para explorar y un botón para empezar de cero.

## 🧮 Cómo se calcula el disponible

```
Dinero total  = saldo inicial + ingresos − gastos (con fecha hasta hoy)
A reservar    = facturas pendientes que vencen en los próximos 30 días (o hasta fin de mes) + vencidas
En metas      = lo apartado en cada meta (no es un gasto: sigue en tu dinero total)
Disponible    = Dinero total − A reservar − En metas
```

La lógica completa está documentada en [`js/core/finance.js`](js/core/finance.js).

## 🛠️ Stack

HTML, CSS y JavaScript puro (módulos ES), sin frameworks ni build. PWA con service worker. Los datos se guardan en `localStorage`, aislados en [`js/core/storage.js`](js/core/storage.js) para poder pasar a IndexedDB o sumar sincronización más adelante.

```
index.html            estructura, header, barra inferior, splash
styles/               tokens (colores/semántica), base, componentes, pantallas
js/app.js             router por hash, delegación de eventos, arranque
js/core/              fechas, monedas, lógica financiera, estado y acciones, persistencia
js/data/              categorías predeterminadas, paleta y datos de ejemplo
js/ui/                helpers de DOM, íconos, componentes, gráficos SVG, hojas y avisos
js/ui/forms/          formularios (movimientos, facturas, metas, presupuestos, categorías)
js/screens/           una pantalla por archivo
tools/                ícono original (icon-source.png) y script que genera los PNG
tests/                pruebas: lógica, flujos en el navegador, sin conexión
```

Para correrla localmente: `node tests/serve.mjs` (o cualquier servidor estático, por ejemplo `npx serve .`). Al agregar archivos nuevos, sumalos a `APP_SHELL` en `sw.js` y subí `CACHE_VERSION`. Si cambia el ícono, reemplazá `tools/icon-source.png` y regenerá los PNG con `node tools/render-icons.js` (necesita Chrome o Edge instalados).

## ✅ Pruebas

```
node tests/run.mjs          # todo (lógica + navegador, unos minutos; necesita Chrome)
node tests/run.mjs --fast   # solo la lógica, en segundos
```

- **Lógica**: unitarias, propiedades (miles de estados al azar) y operaciones al azar sobre el store.
- **Navegador** (Chrome headless): backup y CSV, tutorial, ocultar montos, apariencia, seguridad de los datos de ejemplo, accesibilidad, 10.000 movimientos y tres rondas de toques al azar.
- **Tiempo real**: la app sin conexión con el service worker y la imagen de fondo en IndexedDB.

Si Chrome no está en la ruta de siempre: `CHROME=/ruta/a/chrome node tests/run.mjs`.

## 🔒 Privacidad

Sin registro, sin publicidad y sin servidores: toda la información financiera queda en el navegador del dispositivo. Desde Configuración se puede exportar e importar un backup en JSON, exportar los movimientos a CSV (Excel/Google Sheets) y elegir cada cuánto recordar el backup. Las preferencias del dispositivo (tema, vibración, recordatorio) viven en [`js/core/prefs.js`](js/core/prefs.js) y no viajan en el backup. También: tutorial «Cómo funciona» (la primera vez y desde Más), ocultar montos con el ojito del inicio, compartir la app y compartir el resumen del mes como imagen (se genera en el dispositivo, [`js/ui/summaryImage.js`](js/ui/summaryImage.js)). Apariencia como en Neko Lista: tema, color principal (7 paletas o uno propio; solo cambia la marca, los colores de ingresos/gastos/facturas/metas quedan fijos) y fondo (patrón, sin imagen, color o foto propia guardada en IndexedDB, [`js/ui/background.js`](js/ui/background.js)); el motor está en [`boot.js`](boot.js) para aplicarse antes de pintar.

## 👤 Autor

Desarrollado por [Marcos Martínez](https://github.com/MarcosJavMartinez), bajo la marca [Neko Tools](https://nekotools.site).
