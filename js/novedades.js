// Novedades de cada versión (se muestran en Ajustes > Novedades de la versión).
export const NOVEDADES = [
  { v: '2.10.8', t: [
    'Boletos: nuevo movimiento «Devolución» (solo administradores): se registra lo que un encargado devuelve el día de cambio. Al elegir el dispositivo se ve cuántas fichas siguen «En circulación» (usadas − devueltas).',
    'El administrador ve los movimientos de todos los dispositivos y puede anular uno de otro teléfono sin ir hasta él. El teléfono de esa persona lo marca ANULADO la próxima vez que abra la app con Internet.',
    'El comprobante de devolución dice «Recibido de:». No requiere cambios en el Apps Script.'
  ] },
  { v: '2.10.7', t: [
    'Boletos: solo se permite UN saldo por día. Si se registran varios el mismo día, cuenta únicamente el último (ya no se suman).',
    'El saldo pide confirmación y debe llevar todas las fichas (escriba 0 si no sobró).',
    'Un usuario normal no puede repetir el saldo del día; si se equivocó, el administrador lo anula.'
  ] },
  { v: '2.10.6', t: [
    'Boletos: el administrador elige a qué dispositivo entrega las fichas («Entregar a»). La entrega le aparece al encargado como «Recibido» y puede registrar su saldo sin error.',
    'La entrega y el refuerzo muestran «Entregado a:» en el comprobante.',
    'Requiere actualizar también el Apps Script (columna nueva «Destino» en Boletos Movimientos).'
  ] },
  { v: '2.10.5', t: [
    'Boletos: botones ordenados por grupos (Movimientos del día, Consultas y Solo administración). Los usuarios normales solo ven los grupos que pueden usar.'
  ] },
  { v: '2.10.4', t: [
    'Boletos: los usuarios normales solo ven Saldo, Fichas dañadas, Reimprimir y Reportes. Entrega de fichas, Refuerzo, Conteo general y Anular son solo de administradores.',
    'Boletos: la fecha del movimiento queda fija en hoy para los usuarios normales; solo un administrador puede cambiarla.'
  ] },
  { v: '2.10.3', t: [
    'Reportes: mientras se descarga, el ↻ gira, aparece una barra con porcentaje, las cifras brillan y la leyenda inferior se resalta.',
    'Reportes: ojito 👁 en la barra para ocultar los montos de las tarjetas (se recuerda en el dispositivo).',
    'Al arrastrar hacia abajo para actualizar, la app se queda en la pestaña donde estaba (ya no vuelve a Registro).'
  ] },
  { v: '2.10.2', t: [
    'Reportes: tarjetas más pequeñas y limpias. Se toca la tarjeta para entrar; el botón ↻ de la esquina actualiza todo. La fecha de la cosecha y «Actualizado hace…» se leen mejor.',
    'El cambio contra la cosecha anterior sale en verde (sube) o rojo (baja).',
    'Resumen de Registro: el PDF muestra el número de tarjeta enmascarado (el Excel lo trae completo). Los usuarios normales solo comparten el PDF; los administradores PDF y Excel.'
  ] },
  { v: '2.10.1', t: [
    'Resumen de Registro (administradores): ahora se puede escoger un rango de fechas; sale un solo PDF y un solo Excel con todos los días y el total a pagar por día.',
    'Los demás usuarios siguen igual: solo su resumen del día.',
    'El ejemplo del buscador por finca ahora dice «Los Patios, Montecristo».'
  ] },
  { v: '2.10.0', t: [
    'Reportes: una sola tarjeta de Café recibido con cajuelas, adelantos en colones, comparación con la cosecha anterior y mini gráfico.',
    'Filtros nuevos: barra compacta, hoja de filtros, filtros guardados (★) y selector rápido Todos / Interno / Externo. «Agrupar por» quedó aparte.',
    'Ventas de exportación: tarjetas por contrato, pestaña Seguimiento (por entregar, por cobrar, cerrados) con alertas, detalle de cada contrato con PDF y estado de cuenta por comprador. Semáforo único.',
    'Administradores: reimprimir y reenviar recibos o comprobantes de cualquier usuario, dispositivo, fecha y sociedad; corregir la fecha de un comprobante (queda anotado en la hoja «Auditoría»).',
    'Ajustes renovados: estado de la app, estado de conexiones, apariencia (tema, tamaño de texto, pestaña de inicio, sociedad por defecto), recordatorio de respaldo y copia de diagnóstico.'
  ] },
  { v: '2.9.1', t: [
    'Resumen de Registro: se comparte el PDF y el Excel por separado (WhatsApp, correo…).',
    'Cada usuario genera solo sus propios resúmenes; los administradores pueden generar los de cualquier usuario.'
  ] },
  { v: '2.9.0', t: [
    'Nueva sección «Ventas de exportación» en Reportes, leída del archivo Exportaciones (contratos, entregas y pagos).',
    'Reportes con tablas, gráficos y PDF de una sola hoja.'
  ] }
];
