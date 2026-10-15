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
        q: "¿Cómo agrego algo que pago todos los meses? (alquiler, luz, internet, suscripciones)",
        a: "En Más → Facturas y servicios → Agregar factura, con su monto y el día en que vence. La app reserva ese dinero cuando se acerca la fecha y te recuerda pagarla.",
        href: "#/facturas",
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
        q: "Me equivoqué y quiero volver atrás. ¿Se puede?",
        a: "Sí: en Configuración → Tus datos → Copias automáticas puedes volver a como estaban tus datos un día anterior. Antes de cambios grandes (importar, cargar el ejemplo) también se guarda una copia.",
        action: "open-snapshots",
      },
    ],
  },
];
