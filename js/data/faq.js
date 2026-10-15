// Preguntas frecuentes: lo que más se pregunta sobre cómo funciona la app.
// Cada respuesta puede llevar a la pantalla o acción de la que habla.
// Los textos se traducen como cualquier otro (la clave es el español).

export const FAQ = [
  {
    group: "Empezar",
    items: [
      {
        q: "¿Dónde cargo los datos de ejemplo?",
        a: "En Configuración → Tus datos → Cargar datos de ejemplo. Reemplazan lo que tengas, pero antes se guarda una copia automática. Cuando quieras empezar con lo tuyo, toca «Empezar con lo mío» en el Inicio.",
        href: "#/ajustes-datos",
      },
      {
        q: "¿Cómo vuelvo a hacer el asistente de inicio?",
        a: "En Configuración → Asistente de inicio. Te pregunta paso a paso por tus cuentas, tarjeta, pagos del mes, préstamos y metas.",
        action: "setup-wizard",
      },
      {
        q: "Empecé a trabajar hace poco y no me pagaron el mes completo. ¿Cómo lo cargo?",
        a: "Anota como ingreso lo que cobraste de verdad, con su fecha. Después, cuando cobres tu primer sueldo completo, cárgalo con «Repetir: Mensual»: desde ahí la app lo espera todos los meses y te pide confirmarlo.",
        action: "add-income",
      },
      {
        q: "¿Cómo instalo la app en el celular?",
        a: "En Configuración → En este dispositivo → Instalar Neko Finanzas. Se instala sin pasar por ninguna tienda y funciona sin internet. En iPhone se hace desde Safari, con Compartir → Añadir a pantalla de inicio; esa pantalla te muestra los pasos.",
        href: "#/ajustes-dispositivo",
      },
      {
        q: "Subieron una versión nueva y no la veo. ¿Qué hago?",
        a: "Cierra la app del todo (también desde la lista de apps abiertas) y vuelve a abrirla. Si sigue igual, ciérrala y ábrela una vez más.",
      },
    ],
  },
  {
    group: "Tu dinero",
    items: [
      {
        q: "¿Qué es el saldo disponible?",
        a: "Es lo que puedes gastar sin tocar lo comprometido: el dinero de todas tus cuentas, menos lo apartado en metas, menos lo reservado para facturas, cuotas, deudas y presupuestos. Ese dinero sigue en tus cuentas; solo no cuenta como disponible.",
        href: "#/tu-dinero",
      },
      {
        q: "¿Qué es «Hoy puedes gastar» y cómo se calcula?",
        a: "Es tu disponible repartido en los días que faltan hasta tu próximo cobro (el próximo ingreso que se repite) o, si no tienes uno, hasta fin de mes, contando hoy. La comida y el transporte también salen de ahí. Si creas un presupuesto «Por día» (por ejemplo, para gustos), en su lugar ves cuánto tienes acumulado para eso.",
        href: "#/inicio",
      },
      {
        q: "¿Por qué ya se reserva una factura que vence el mes que viene?",
        a: "Porque la app reserva lo que vence en los próximos 30 días. Si prefieres que reserve solo lo que vence hasta fin de mes, cámbialo en Configuración → Cálculo del disponible → Reservar facturas que vencen…",
        href: "#/ajustes-calculo",
      },
      {
        q: "¿Cómo veo a dónde va mi dinero?",
        a: "Toca «¿A dónde va tu dinero?» en el Inicio (o Más → ¿A dónde va tu dinero?). Muestra cómo se calcula tu disponible, todo lo reservado cosa por cosa y lo que pasó este mes en frases simples.",
        href: "#/tu-dinero",
      },
      {
        q: "¿Cómo paso dinero de una cuenta a otra? (por ejemplo, de Mercado Pago a efectivo)",
        a: "Con «Mover dinero»: en el Inicio, en la tarjeta Tus cuentas; en Agregar → Pasar dinero entre cuentas; o en Más → Cuentas. Eliges desde dónde, hacia dónde y el monto. No es un gasto: tu total no cambia. Si las cuentas están en monedas distintas, te pide cuánto llegó a la otra.",
        action: "add-transfer",
      },
      {
        q: "¿Cómo agrego otra cuenta o billetera virtual con su nombre e ícono?",
        a: "En Más → Cuentas → Nueva cuenta. Eliges el tipo (efectivo, banco, billetera, ahorro), el nombre, el ícono y la moneda. También puedes hacerlo en el asistente de inicio.",
        href: "#/cuentas",
      },
      {
        q: "¿La app mueve dinero sola?",
        a: "No. La app te avisa y te propone (pagar una factura, confirmar el sueldo, pasar un sobrante a una meta), pero nada se registra hasta que tú lo confirmas.",
      },
      {
        q: "¿Cómo oculto los montos?",
        a: "Toca el ojo al lado de «Saldo disponible» en el Inicio. Para que siempre empiecen ocultos: Configuración → En este dispositivo.",
        href: "#/inicio",
      },
    ],
  },
  {
    group: "Ingresos y gastos",
    items: [
      {
        q: "¿Cómo cargo el sueldo para que se repita todos los meses?",
        a: "Agrega un ingreso y en «Repetir» elige «Mensual». Cada mes la app te pregunta si lo cobraste y por cuánto, por si cambió.",
        action: "add-income",
      },
      {
        q: "¿Cómo corrijo o borro un movimiento que cargué mal?",
        a: "Tócalo en Transacciones (o en el Inicio): se abre para editarlo. Cambia lo que haga falta y guarda, o toca «Eliminar» abajo de todo.",
        href: "#/transacciones",
      },
      {
        q: "¿Cómo cargo un gasto que se repite? (gimnasio, transporte, una suscripción)",
        a: "Agrega el gasto y en «Repetir» elige cada cuánto (semanal, quincenal o mensual). Cuando llega la fecha, el Inicio te pregunta si ya lo pagaste: tocas «Registrar» (y puedes cambiar el monto) u «Omitir». Mientras tanto, ese monto ya queda reservado.",
        action: "add-expense",
      },
      {
        q: "Las propinas, ¿las cargo como ingreso o en Extras del mes? ¿Cuál es la diferencia?",
        a: "Se guardan igual: un ingreso en la categoría Propinas. Ingreso sirve para anotar una propina suelta en el momento; Extras del mes es un atajo para cargar de una vez todo lo que vino aparte del sueldo (aguinaldo, horas extra, comisión, bono, propinas).",
        action: "add-extras",
      },
      {
        q: "Si anoto propinas durante el mes, ¿se suman?",
        a: "Sí. Todo lo del mes en la categoría Propinas se suma solo: en el Inicio ves «Extras de este mes» y en Extras del mes, «ya registraste». Al empezar el mes siguiente vuelve a contar desde cero; lo anterior queda en Transacciones y Reportes.",
      },
      {
        q: "¿Cómo cargo una compra con tarjeta en cuotas?",
        a: "Agrega un gasto, elige la tarjeta como medio de pago y elige las cuotas. La primera queda en la fecha de la compra y las demás quedan programadas en sus meses (y reservadas a medida que se acercan).",
        action: "add-expense",
      },
      {
        q: "¿Cómo pago la tarjeta de crédito?",
        a: "En Más → Cuentas, toca la tarjeta y luego «Pagar tarjeta». Es mover dinero de tu cuenta a la tarjeta, no un gasto nuevo: las compras ya se contaron como gastos cuando las cargaste.",
        href: "#/cuentas",
      },
      {
        q: "¿Cómo agrego algo que pago todos los meses? (alquiler, luz, internet, suscripciones)",
        a: "En Más → Facturas y servicios → Agregar factura, con su monto y el día en que vence. La app reserva ese dinero cuando se acerca la fecha y te recuerda pagarla.",
        href: "#/facturas",
      },
      {
        q: "Pagué una factura por más o por menos de lo esperado. ¿Qué pasa?",
        a: "Al tocar «Marcar como pagada» escribe en «Monto pagado» lo que pagaste de verdad: eso es lo que cuenta. Si activas «Guardar lo que sobra de las facturas» (en Configuración → Cálculo del disponible), lo que sobre cuando venga por menos queda guardado para cubrir las que vengan por más.",
        href: "#/facturas",
      },
      {
        q: "¿Cómo activo los avisos de vencimientos?",
        a: "En Configuración → En este dispositivo → Avisos de vencimientos. Te llega una notificación unos días antes de que venza una factura, la tarjeta o un préstamo, y eliges cuántos días antes.",
        href: "#/ajustes-dispositivo",
      },
      {
        q: "¿Qué son los presupuestos y qué significa «Reservar este dinero»?",
        a: "Un presupuesto es un límite para un tipo de gasto: por mes, por porcentaje de tus ingresos o por día. Si activas «Reservar este dinero», lo que te falta gastar de ese presupuesto se descuenta de tu disponible, como si estuviera en un sobre (útil para el supermercado). Si a fin de mes sobra, la app te ofrece pasarlo a una meta.",
        href: "#/presupuestos",
      },
      {
        q: "¿Puedo crear o cambiar categorías?",
        a: "Sí. En Más → Categorías puedes crear categorías de gasto o de ingreso, cambiarles el nombre, el ícono y el color, y agregarles subcategorías (por ejemplo, Veterinaria dentro de Mascotas).",
        href: "#/categorias",
      },
    ],
  },
  {
    group: "Metas",
    items: [
      {
        q: "¿Cómo creo una meta y le pongo o le saco dinero?",
        a: "En la pestaña Metas toca «Nueva meta»: pones el nombre, cuánto quieres reunir, la moneda y, si quieres, una fecha. Después, en el detalle de la meta, usa «Depositar» para apartar dinero y «Retirar» para sacarlo. Apartar no es un gasto: el dinero sigue en tu total, pero deja de contar como disponible.",
        href: "#/metas",
      },
    ],
  },
  {
    group: "Préstamos y deudas",
    items: [
      {
        q: "Tengo una deuda que pago en cuotas (por ejemplo, en Mercado Pago). ¿Cómo la cargo?",
        a: "En Más → Préstamos → Préstamo en cuotas (banco o billetera). Pones quién te prestó, cuántas cuotas, de cuánto y cuándo vence la próxima. Si ese dinero ya no está en tus cuentas, activa «Ya lo gasté».",
        href: "#/prestamos",
      },
      {
        q: "Me prestaron dinero pero ya lo gasté. ¿Cómo lo anoto?",
        a: "En Préstamos → Me prestaron, activa «Ya lo gasté». La deuda queda anotada sin sumar dinero a ninguna cuenta: solo te queda pagarla.",
        href: "#/prestamos",
      },
      {
        q: "Le presté dinero a alguien. ¿Cómo lo anoto y cómo registro cuando me lo devuelve?",
        a: "En Más → Préstamos → Le presté: pones a quién, cuánto y de qué cuenta salió. No es un gasto: el dinero vuelve. Cuando te devuelva (todo o una parte), abre el préstamo y toca «Me devolvió».",
        href: "#/prestamos",
      },
      {
        q: "¿Qué pasa si no le pongo fecha para devolver a una deuda?",
        a: "Queda anotada, pero no se reserva nada de tu disponible. Si quieres ir juntando para devolverla, usa «Apartar por mes».",
        href: "#/prestamos",
      },
      {
        q: "¿Cómo junto dinero por mes para devolver una deuda?",
        a: "Edita la deuda y completa «Apartar por mes para devolverlo». Cada mes se reserva ese monto de tu disponible hasta juntar lo que debes, y debajo ves en cuántos meses la juntas. En el detalle de la deuda ves cuánto llevas apartado.",
        href: "#/prestamos",
      },
      {
        q: "Debo en dólares pero cobro en pesos. ¿Cómo junto para pagar?",
        a: "En «Apartar por mes» elige la moneda en la que juntas (por ejemplo, pesos) al lado del monto. La app convierte lo que debes con tu tipo de cambio y te muestra cuánto llevas y cuánto falta; lo que falta cambia si cambia el tipo de cambio.",
        href: "#/prestamos",
      },
      {
        q: "Devolví dólares pero pagué con pesos. ¿Cómo lo registro?",
        a: "En la deuda toca «Devolví» y elige la cuenta en pesos. Aparece «¿Cuánto te costó?» con un monto sugerido: escribe lo que pagaste de verdad. La deuda baja en dólares y tu cuenta baja exactamente esos pesos, aunque después cambie el tipo de cambio.",
        href: "#/prestamos",
      },
    ],
  },
  {
    group: "Monedas e idioma",
    items: [
      {
        q: "¿Puedo usar varias monedas? (ahorrar o deber en dólares, euros…)",
        a: "Sí. En Más → Idioma y monedas eliges tu moneda principal, las otras que usas y a cuánto está cada una. Cuentas, metas y préstamos pueden estar en cualquiera de ellas; los totales se muestran convertidos a tu moneda principal.",
        href: "#/monedas",
      },
      {
        q: "¿Cómo actualizo el tipo de cambio?",
        a: "En Más → Idioma y monedas, escribe a cuánto está hoy cada moneda. La app no lo busca en internet: usa el valor que tú pongas.",
        href: "#/monedas",
      },
      {
        q: "¿Cómo cambio dólares a pesos (o al revés)?",
        a: "En Agregar → Cambiar divisas. Eliges de qué cuenta sale (por ejemplo, Efectivo USD) y a cuál entra (Efectivo o tu billetera en pesos), cuánto entregaste y cuánto te dieron de verdad. No es un gasto: una cuenta baja y la otra sube. Si te cambiaron a otro valor que el que tienes cargado, la app te ofrece usarlo como tu tipo de cambio.",
        action: "exchange-currency",
      },
      {
        q: "¿Cómo cambio el idioma o el país?",
        a: "En Más → Idioma y monedas. La app viene en español, inglés, portugués, turco, ruso, japonés y árabe.",
        href: "#/monedas",
      },
    ],
  },
  {
    group: "Tus datos",
    items: [
      {
        q: "¿Dónde se guardan mis datos? ¿Alguien más los ve?",
        a: "Solo en este dispositivo. No hay cuentas ni registro, y nadie más los ve. Por eso conviene hacer un backup de vez en cuando.",
        href: "#/ajustes-datos",
      },
      {
        q: "¿Cómo paso mis datos a otro celular o a la compu?",
        a: "En Configuración → Tus datos → Pasar a otro dispositivo. En el que tiene los datos toca «Enviar desde aquí»; en el otro, «Recibir aquí» y escanea el QR o escribe el código. Viajan cifrados, el código sirve una sola vez y dura 15 minutos. Es una copia de una vez, no una sincronización.",
        action: "transfer-data",
      },
      {
        q: "¿Cómo hago un backup?",
        a: "En Configuración → Tus datos → Exportar backup. Se guarda un archivo que después puedes importar en este u otro dispositivo. Además, la app guarda copias automáticas para volver a como estaban tus datos un día anterior.",
        href: "#/ajustes-datos",
      },
      {
        q: "¿Cómo paso mis movimientos a Excel o Google Sheets?",
        a: "En Configuración → Tus datos → Exportar a planilla. Se descarga un archivo .csv con tus movimientos que se abre en Excel o en Google Sheets.",
        href: "#/ajustes-datos",
      },
      {
        q: "¿Qué pasa si borro los datos del navegador o desinstalo la app?",
        a: "Se borra todo lo que cargaste en este dispositivo, porque tus datos viven solo aquí. Para no perderlos, haz antes un backup (Configuración → Tus datos → Exportar backup) o pásalos a otro dispositivo.",
        href: "#/ajustes-datos",
      },
      {
        q: "Me equivoqué y quiero volver atrás. ¿Se puede?",
        a: "Sí: en Configuración → Tus datos → Copias automáticas puedes volver a como estaban tus datos un día anterior. Antes de cambios grandes (importar, cargar el ejemplo) también se guarda una copia.",
        action: "open-snapshots",
      },
    ],
  },
];
