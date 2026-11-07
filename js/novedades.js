// Novedades de cada versión (se muestran en Ajustes > Novedades de la versión).
export const NOVEDADES = [
  { v: '2.16.0', t: [
    'Reportes › Café en fruta VOLCAFE: «＋ Cargar» (a mano, pegar o subir archivo) y «⬇ Excel» arriba, el avance contra el máximo, un gráfico de entregas por día (toque una columna para ver sus recibos) y reportes de Avance por tipo, Fincas, Días y Recibos. Todas las fanegas con 2 decimales.',
    'Diario (administradores): «Anular» ahora permite anular un recibo de cualquier día o de otro usuario. Al anularlo ofrece actualizar Históricos de esa fecha (se restan los recibos anulados, con vista previa).',
    'Ajustes › Administración › Precios del registro: el administrador cambia el precio de la cajuela (hoy ₡1 800) sin tocar el servidor. Elige si vale ahora o mañana a las 6:00 a. m. y si reemplaza al anterior o salen los dos. Los recibos ya hechos no cambian. Hay historial.',
    'Ajustes más limpio: se quitaron Modo de pruebas, Sincronización con la hoja, la clave de esa pantalla, Copia de seguridad y Empezar de cero, que ya no hacen falta con el servidor nuevo. «Descartar envíos pendientes» quedó junto a Envíos.'
  ] },
  { v: '2.15.0', t: [
    'Reportes › Café en fruta · VOLCAFE (administradores): control simple de lo entregado. Muestra las fanegas entregadas por tipo contra el máximo del contrato («Faltan …») y las fanegas de cada finca.',
    'Cada recibo lleva Fecha, Tipo, Recibo, Finca, Sociedad y Cajuelas; las fanegas se calculan solas (cajuelas ÷ 20). Se agregan a mano, pegando desde Excel o subiendo la plantilla, siempre con vista previa. Un mismo recibo puede repartirse entre fincas.',
    'El máximo de fanegas de cada tipo se puede cambiar si Capris amplía el contrato. Los recibos se pueden editar o anular.'
  ] },
  { v: '2.14.0', t: [
    'Personas con tarjeta: el administrador puede asignar una persona a más usuarios o quitársela a alguno (dentro de la persona, «Usuarios que la tienen»).',
    'En la lista de un usuario, «Seleccionar varias» permite copiar o pasar varias personas a otro usuario de una vez; reciben código nuevo y los recibos anteriores se conservan.'
  ] },
  { v: '2.13.1', t: [
    'Personas con tarjeta › Pegar desde Excel: también acepta las filas completas copiadas de la plantilla (Usuario, Sociedad, Nombre, Tarjeta); en ese caso respeta el usuario y la sociedad de cada fila.'
  ] },
  { v: '2.13.0', t: [
    'Ajustes › Personas con tarjeta (administradores): agregar personas una por una, pegando filas desde Excel o subiendo un archivo Excel/CSV, eligiendo la sociedad y los usuarios.',
    'Vista previa antes de guardar: muestra las nuevas, las que ya existían (no se duplican) y las que traen error (tarjeta incompleta, usuario o sociedad que no existe). El código de cada persona se asigna solo.',
    'Dentro de cada persona se puede corregir nombre o tarjeta, quitar la deducción cuando ya se cobró, o quitarla de la lista.'
  ] },
  { v: '2.12.3', t: [
    'En computadora, la vista del PDF (contratos, reportes, tiquetes) tiene el botón «⬇ Descargar PDF» para guardarlo directo en Descargas, y el reporte ancho se ve completo en la ventana.',
    'En el teléfono todo sigue igual.'
  ] },
  { v: '2.12.2', t: [
    'Contratos de exportación: la entrega prevista es un mes (por ejemplo nov-26). La alerta de «entrega vencida» solo sale cuando el mes termina.',
    'Financiamiento solo SI o NO. En los contratos financiados el banco recibe todo y nos devuelve un porcentaje (30 % por defecto, editable por contrato): el contrato, cada entrega y «Por cobrar» muestran lo que nos toca y lo que es del banco.',
    'Kilos a favor / contra y su efecto en $ se ven en vivo en el detalle del contrato, entrega por entrega, sin esperar al cierre.',
    'Listas del contrato sin guiones ni opciones repetidas (Certificación, Financiamiento y demás).'
  ] },
  { v: '2.12.1', t: [
    'Ajustes › Usuarios (administradores): crear usuarios con PIN temporal, cambiar rol, personalizar qué ve y qué puede hacer cada uno, restablecer el PIN, desactivar y volver a activar. Nadie puede desactivarse a sí mismo y siempre queda un administrador.',
    'Exportaciones (administradores): ＋ Contrato (con todas las listas del Excel y «Agregar opción nueva»), 🚚 Salida en dos pasos —nuestra boleta al despachar y después la guía del comprador con sus kilos neto—, 💵 Pago, y editar o anular lo que se digitó mal. Todo queda en la auditoría.',
    'Alerta de salidas sin guía del comprador: por defecto a los 3 días; se cambia en Ajustes › Alertas de exportación.'
  ] },
  { v: '2.12.0', t: [
    'Servidor nuevo: toda la información (registros, diario, boletos, históricos y exportaciones) vive ahora en una sola base de datos propia, fuera de Google. Ya no hay hojas de Excel separadas para cada cosa.',
    'Ingreso con usuario y PIN verificado en el servidor, con bloqueo temporal tras varios intentos fallidos. Los permisos de cada usuario se validan en el servidor.',
    'La primera vez hay que entrar de nuevo con su usuario y PIN. Lo que estaba pendiente de enviar se envía solo al servidor nuevo.',
    'Cada usuario puede cambiar su propio PIN en Ajustes > «Cambiar mi PIN».',
    'Excel queda solo para exportar.'
  ] },
  { v: '2.11.1', t: [
    'Cambio automático de dirección: si la hoja de Google se traslada a otra cuenta (nueva dirección /exec), el administrador la anota una sola vez en el Apps Script y cada teléfono se pasa solo la próxima vez que sincronice. Ya no hay que cambiarla teléfono por teléfono.'
  ] },
  { v: '2.11.0', t: [
    'Nueva pestaña «Planillas» (solo con el permiso «planillas»): el encargado registra tarea, horas y extras empleado por empleado, cada uno queda «Listo», y el día solo se envía cuando están todos (si falta alguien avisa quién). Antes de enviar pide confirmación y el día queda bloqueado; solo un administrador puede anularlo. Incluye el resumen semanal con el formato de la planilla actual y, para administradores, los montos de la semana.',
    'Barra inferior por perfil: cada usuario ve solo sus módulos (hasta 4 y el resto en «Más»). Ajustes > «Mi barra de abajo» permite elegir y ordenar; el administrador puede definir y bloquear la barra de cada usuario en la hoja Usuarios (columnas «Barra» y «Bloquear barra»).',
    'La app ya no se amplía con los dedos (evita zooms accidentales); los reportes y PDF tienen el botón «Ampliar». El tamaño del texto sigue en Ajustes > Apariencia.',
    'Recordatorio: a partir de las 7:00 pm aparece un aviso si falta el saldo de boletos del día. Los administradores ven en Ajustes un panel «Pendientes» (envíos, actualización disponible, saldos sin registrar, catálogo viejo, respaldo).'
  ] },
  { v: '2.10.9', t: [
    'Diario, reporte «Simple»: la columna «Flotes» ahora muestra solo los flotes maduros (igual que el tiquete y la planilla). Antes sumaba maduros + secos + broca y repetía los secos y la broca, que ya tienen su propia columna. El total del día también se corrige.'
  ] },
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
