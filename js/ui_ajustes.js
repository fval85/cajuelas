// Pestaña «Ajustes»: pantalla simple para el usuario y una zona de administración.
import { h, clear, toast, aviso, confirmar, elegir, dialogo, formulario, normalizar, fmtMoney, plainNumber, parseQty, stampCorto, VERSION } from './util.js';
import { db, cat, bol, syncCfg, guardarSyncCfg, configurado, deviceName, cosechaActiva, aplicarConfigHoja, modoPruebas, cambiarModo, borrarDatosOperativos,
  reemplazarDesdeHoja, reemplazarBoletosDesdeHoja } from './store.js';
import { cuantosPendientes, enviarPendientes, descartarPendientes, probar, descargarCatalogo, alCambiarPendientes, postJson, historicos, exportaciones } from './sync.js';
import { TEMAS, TEXTOS, TABS, ajuste, guardarAjuste, aplicarApariencia } from './apariencia.js';
import { NOVEDADES } from './novedades.js';
import { parseExp } from './exp_calc.js';
import { compartir, descargar } from './files.js';
import { tarjeta, etiqueta, banda, selector, boton, filaAj, grupo, tituloGrupo, cabSub } from './ui.js';
import { pintarUsuarios } from './ui_usuarios.js';
import { pintarPersonas } from './ui_personas.js';
import { pintarPrecios, textoPrecioHoy } from './ui_precios.js';
import { configurarAlertaGuia } from './ui_exp_admin.js';
import { hayControl, sesion, salir, actualizarUsuarios, puede, lista as listaUsuarios, cambiarPin } from './users.js';
import { esComputadora, anchoMm, setAnchoMm, imprimirTiquetes } from './imprimir.js';
import { crearPagina } from './draw.js';
import { MODULOS, modulo, permitidos, listaExplicita, guardarBarraPersonal, borrarBarraPersonal, barraBloqueada, barraDelAdmin, distribucion } from './nav_barra.js';
import { icono } from './ui.js';
import { pendientesAdmin } from './avisos.js';

const cp = (el, permiso) => { el.dataset.permiso = permiso; return el; };

// ---------- Catálogo desde la hoja ----------
let ultimaRevision = 0;
export async function actualizarCatalogo(manual, alCambiar) {
  if (!configurado()) { if (manual) toast('Primero configure la URL y el token en Ajustes > Administración.', 5000); return; }
  if (!manual) {
    if (Date.now() - ultimaRevision < 5 * 60000) return;
  }
  ultimaRevision = Date.now();
  const device = deviceName();
  if (manual) toast('Actualizando catálogo…', 2000);
  const r = await descargarCatalogo(device);
  const av = (t, x) => { if (manual) aviso(t, x); };
  if (!r.ok) return av('No se pudo actualizar', r.message + '\n\nEl catálogo del dispositivo no se modificó.');
  if (![r.estructura, r.personas, r.beneficios, r.diario, r.bolFichas, r.bolOficinas].some((a) => a.length)) {
    return av('El servidor no tiene datos', `No hay filas para el dispositivo «${device}» (ni filas con la columna Dispositivo vacía). El catálogo no se modificó. Revise que el nombre del dispositivo coincida con el de la hoja.`);
  }
  let { cambio, texto } = reemplazarDesdeHoja(r.estructura, r.personas, r.beneficios, r.diario);
  if (aplicarConfigHoja(r.config)) cambio = true;
  if (r.bolDisp.length) db.set('boletos_disp', r.bolDisp);
  if (r.bolFichas.length || r.bolOficinas.length) { texto += '\n\n' + reemplazarBoletosDesdeHoja(r.bolFichas, r.bolOficinas); cambio = true; }
  if (alCambiar) alCambiar();
  if (manual) aviso('Catálogo actualizado', texto);
  else if (cambio) toast('Catálogo actualizado.');
}

export function crearAjustes(nav) {
  const raiz = h('div', { class: 'pagina' });
  const _ap = raiz.append.bind(raiz);
  raiz.append = (...x) => _ap(...x.filter((v) => v !== null && v !== undefined && v !== false));
  let vista = 'inicio';
  let desbloqueado = false;

  const alCatalogo = () => nav.catalogoCambio();

  function pintar() {
    clear(raiz);
    if (vista === 'catalogo') return vistaCatalogo();
    if (vista === 'impresion') return vistaImpresion();
    if (vista === 'conexiones') return vistaConexiones();
    if (vista === 'apariencia') return vistaApariencia();
    if (vista === 'mibarra') return vistaMiBarra();
    if (vista === 'novedades') return vistaNovedades();
    if (vista === 'usuarios') return pintarUsuarios({ raiz, irInicio });
    if (vista === 'personas') return pintarPersonas({ raiz, irInicio });
    if (vista === 'precios') return pintarPrecios({ raiz, irInicio, alGuardar: async () => { const r = await descargarCatalogo(deviceName()); if (r.ok && aplicarConfigHoja(r.config)) alCatalogo(); } });
    vistaInicio();
  }
  const irInicio = () => { vista = 'inicio'; desbloqueado = false; pintar(); };

  // ----- Pantalla principal -----
  const textoPend = (n) => (n ? `⏳ ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar` : '✔ Todo enviado');
  const hace = (t) => { if (!t) return 'sin descargar'; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const cacheT = (k) => { try { const o = JSON.parse(localStorage.getItem(k + (modoPruebas ? '_t' : '')) || 'null'); return o && o.t ? o.t : 0; } catch { return 0; } };
  async function enviarAhora() {
    if (!configurado()) return toast('Falta configurar la sincronización (pida ayuda al administrador).', 5000);
    if (!cuantosPendientes()) return toast('No hay envíos pendientes.');
    toast('Enviando…', 1500);
    const r = await enviarPendientes();
    pintar();
    toast(r.error ? `Se enviaron ${r.enviados}. Quedan ${r.restantes}. ${r.error}` : `Enviados: ${r.enviados}. No quedan pendientes.`, 6000);
  }
  /** Una sola acción: usuarios y catálogo. */
  async function actualizarTodo() {
    if (!configurado()) return toast('Primero configure la URL y el token en Ajustes > Conexión.', 5000);
    toast('Actualizando usuarios y catálogo…', 2500);
    const u = await actualizarUsuarios(true);
    await actualizarCatalogo(true, alCatalogo);
    if (!u.ok) toast('Usuarios: ' + u.message, 5000);
    pintar();
  }
  async function descartarEnvios() {
    const n = cuantosPendientes();
    if (!n) return toast('No hay envíos pendientes.');
    if (await confirmar('Descartar envíos pendientes', `Se borrarán ${n} registros que aún no llegaron al servidor. No se pueden recuperar.\n\n¿Descartarlos?`, { si: 'Descartar', peligro: true })) { descartarPendientes(); pintar(); toast('Pendientes descartados.'); }
  }
  async function copiarDiagnostico() {
    const e = db.get('ultimo_error', null);
    const sUs = hayControl() ? sesion() : null;
    const txt = ['Diagnóstico · Registro de Cajuelas', `Versión: ${VERSION}${modoPruebas ? ' (modo de pruebas)' : ''}`, `Dispositivo: ${deviceName()}`, `Usuario: ${sUs ? sUs.nombre + ' (' + sUs.rol + ')' : 'sin control de acceso'}`,
      `En línea: ${navigator.onLine ? 'sí' : 'no'}`, `Envíos pendientes: ${cuantosPendientes()}`, `Cosecha activa: ${cosechaActiva() || '—'}`,
      `Catálogo: ${cat.actualizado ? new Date(cat.actualizado).toLocaleString('es-CR') : 'sin recibir'}`, `Históricos: ${hace(cacheT('cajuelas_hist'))} · Exportaciones: ${hace(cacheT('cajuelas_exp'))}`,
      `Último error de envío: ${e ? new Date(e.t).toLocaleString('es-CR') + ' · ' + e.m : 'ninguno'}`, `Navegador: ${navigator.userAgent}`].join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Diagnóstico copiado. Péguelo en un mensaje.', 4000); }
    catch { aviso('Diagnóstico', txt); }
  }

  const sep = (...x) => x;
  function tarjetaEstado() {
    const sUs = hayControl() ? sesion() : null;
    const co = cosechaActiva();
    const fila = (ic, t, ok = true) => h('div', { class: 'estado-fila' + (ok ? '' : ' mal') }, h('span', { 'aria-hidden': 'true' }, ic), h('span', null, t));
    const n = cuantosPendientes();
    return h('button', { type: 'button', class: 'tarjeta tarjeta-estado', onclick: () => { vista = 'conexiones'; pintar(); }, 'aria-label': 'Ver el estado de las conexiones' },
      h('b', null, 'Estado de la app'),
      fila('👤', sUs ? `${sUs.nombre} · ${sUs.rol}` : 'Sin control de acceso'),
      fila(navigator.onLine ? '🟢' : '🔴', navigator.onLine ? 'En línea' : 'Sin conexión', navigator.onLine),
      fila(n ? '⏳' : '✔', n ? `${n} ${n === 1 ? 'envío pendiente' : 'envíos pendientes'}` : 'Sin envíos pendientes', !n),
      fila('📋', `Catálogo: ${co ? 'cosecha ' + co : 'sin cosecha'} · ${cat.actualizado ? hace(cat.actualizado) : 'sin recibir'}`),
      fila('📊', `Históricos ${hace(cacheT('cajuelas_hist'))} · Exportaciones ${hace(cacheT('cajuelas_exp'))}`),
      fila('✔', `Versión ${VERSION} · al día`),
      h('small', { class: 'nota' }, 'Toque para ver el estado de las conexiones'));
  }
  function vistaInicio() {
    const sUs = hayControl() ? sesion() : null;
    const co = cosechaActiva();
    const nPend = cuantosPendientes();
    const esAdmin = puede('config');
    const fPend = filaAj({ ic: '☁', t: 'Envíos al servidor', s: textoPend(nPend), onclick: enviarAhora });
    const fAlm = filaAj({ ic: 'ℹ', t: `Versión ${VERSION}`, s: `Dispositivo: ${deviceName()}`, onclick: () => toast(`Versión ${VERSION} · ${deviceName()}`) });
    const fAct = filaAj({ ic: '🔄', t: 'Actualizar catálogo y usuarios', s: `${co ? 'Cosecha ' + co : 'Sin cosecha todavía'} · ${cat.actualizado ? 'actualizado ' + new Date(cat.actualizado).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : 'aún no se ha recibido'}`, onclick: actualizarTodo });
    const fCuenta = sUs ? filaAj({ ic: '👤', t: sUs.nombre, s: `${sUs.rol} · toque para cerrar sesión`, onclick: async () => {
      if (await confirmar('Cerrar sesión', `Sesión de ${sUs.nombre} (${sUs.rol}).\n\n¿Cerrar la sesión?`, { si: 'Cerrar sesión' })) salir();
    } }) : null;
    const fPin = sUs ? filaAj({ ic: '🔑', t: 'Cambiar mi PIN', s: 'Solo usted conoce su PIN', onclick: async () => {
      const v = await formulario('Cambiar mi PIN', [
        { etiqueta: 'PIN actual', tipo: 'password', inputmode: 'numeric' },
        { etiqueta: 'PIN nuevo (4 a 12 números)', tipo: 'password', inputmode: 'numeric' },
        { etiqueta: 'Repita el PIN nuevo', tipo: 'password', inputmode: 'numeric' }
      ], { ok: 'Cambiar PIN', validar: async (x) => {
        if (!x[0] || !x[1]) return 'Escriba el PIN actual y el nuevo.';
        if (x[1] !== x[2]) return 'El PIN nuevo no coincide en las dos casillas.';
        return cambiarPin(x[0], x[1]);
      } });
      if (v) toast('Listo: su PIN se cambió. Úselo la próxima vez que entre.', 5000);
    } }) : null;
    const fApar = filaAj({ ic: '🎨', t: 'Apariencia', s: 'Tema, tamaño de texto y pantalla de inicio', onclick: () => { vista = 'apariencia'; pintar(); } });
    const fBarra = filaAj({ ic: '🧭', t: 'Mi barra de abajo', s: barraBloqueada() ? '🔒 Definida por el administrador' : 'Elija qué módulos ver y en qué orden', onclick: () => { vista = 'mibarra'; pintar(); } });
    const fNov = filaAj({ ic: '✨', t: 'Novedades de la versión', s: `Qué hay de nuevo en ${VERSION}`, onclick: () => { vista = 'novedades'; pintar(); } });
    const fBuscar = filaAj({ ic: '⬆', t: 'Buscar actualización de la app', onclick: () => window.__buscarActualizacion && window.__buscarActualizacion() });
    const fDiag = filaAj({ ic: '📋', t: 'Copiar diagnóstico', s: 'Para enviarlo a quien da soporte', onclick: copiarDiagnostico });
    const head = [banda('Ajustes')];
    if (!esAdmin) {
      // Lista simple para quien no administra.
      raiz.append(...head, grupo(fCuenta, fPin, fAct, fPend), grupo(fApar, fBarra, fNov, fBuscar, fAlm));
      infoAlmacenamiento(fAlm);
    } else {
      const datos = [fAct, fPend, filaAj({ ic: '📚', t: 'Catálogo recibido', s: 'Cosechas, sociedades y fincas', onclick: () => { vista = 'catalogo'; pintar(); } }),
        nPend ? filaAj({ ic: '🗑', t: 'Descartar envíos pendientes', s: `${nPend} ${nPend === 1 ? 'registro' : 'registros'} que no llegaron al servidor`, peligro: true, onclick: descartarEnvios }) : null];
      const conexion = [
        filaAj({ ic: '🔌', t: 'Estado de conexiones', s: 'Probar el servidor, usuarios, catálogo y reportes', onclick: () => { vista = 'conexiones'; pintar(); } })
      ];
      const dispositivo = [fApar, fBarra, esComputadora() ? filaAj({ ic: '🖨', t: 'Impresora de 80 mm', s: `Ancho ${anchoMm()} mm`, onclick: () => { vista = 'impresion'; pintar(); } }) : null, fNov, fBuscar, fDiag, fAlm];
      const pend = pendientesAdmin();
      const tarjetaPend = pend.length ? h('section', { class: 'tarjeta pl-pendientes' }, h('b', null, `Pendientes (${pend.length})`),
        ...pend.map((p) => h('button', { type: 'button', class: 'pend-fila', onclick: () => { if (p.accion === 'enviar') enviarAhora(); else if (p.accion === 'actualizar') window.__buscarActualizacion && window.__buscarActualizacion(); else if (p.accion === 'catalogo') actualizarTodo(); } },
          h('span', { 'aria-hidden': 'true' }, p.ic), h('span', null, p.texto), p.accion ? h('span', { class: 'fl' }, '›') : null))) : null;
      raiz.append(...head, tarjetaPend, tarjetaEstado(), fCuenta ? grupo(fCuenta, fPin) : null,
        tituloGrupo('Administración'), cp(grupo(
          filaAj({ ic: '👥', t: 'Usuarios', s: 'Crear, permisos, PIN y desactivar', onclick: () => { vista = 'usuarios'; pintar(); } }),
          filaAj({ ic: '💲', t: 'Precios del registro', s: textoPrecioHoy(), onclick: () => { vista = 'precios'; pintar(); } }),
          filaAj({ ic: '💳', t: 'Personas con tarjeta', s: 'Agregar, pegar desde Excel o subir archivo', onclick: () => { vista = 'personas'; pintar(); } }),
          filaAj({ ic: '⏰', t: 'Alertas de exportación', s: 'Días sin guía del comprador para avisar', onclick: async () => { const x = await exportaciones(); await configurarAlertaGuia(x && x.diasAlertaGuia); } })), 'todos'),
        tituloGrupo('Datos'), cp(grupo(...datos), 'config'),
        tituloGrupo('Conexión'), cp(grupo(...conexion), 'config'),
        tituloGrupo('Este dispositivo'), grupo(...dispositivo));
      infoAlmacenamiento(fAlm);
    }
    const quitar = alCambiarPendientes(() => { if (!raiz.isConnected || vista !== 'inicio') return quitar(); fPend.cambiarSub(textoPend(cuantosPendientes())); });
  }

  // ----- Estado de conexiones -----
  function vistaConexiones() {
    raiz.append(cabSub('Estado de conexiones', irInicio));
    const items = [['ping', 'Servidor'], ['usuarios', 'Lista de usuarios'], ['catalogo', 'Catálogo'], ['hist', 'Históricos'], ['exp', 'Exportaciones']];
    const filas = {};
    const lista = h('div', { class: 'grupo' });
    items.forEach(([k, t]) => { filas[k] = filaAj({ ic: '•', t, s: 'Sin probar' }); filas[k].querySelector('.fl').textContent = ''; lista.append(filas[k]); });
    const poner = (k, ok, texto, aviso) => { const f = filas[k]; f.querySelector('.ic').textContent = ok === null ? '⏳' : ok ? '✔' : '✖'; f.cambiarSub(texto + (aviso ? '\n⚠ ' + aviso : '')); f.querySelector('small').style.whiteSpace = 'pre-line'; f.classList.toggle('peligro', ok === false); };
    const resumen = h('p', { class: 'nota' }, configurado() ? 'Toque «Probar todas las conexiones» para revisar cada conexión con el servidor.' : 'Sin conexión con el servidor.');
    let probando = false;
    async function probarTodas() {
      if (probando) return;
      if (!configurado()) return toast('Primero configure la URL y el token.', 4000);
      probando = true; btn.disabled = true;
      items.forEach(([k]) => poner(k, null, 'Probando…'));
      const { url, token } = syncCfg();
      const r0 = await postJson(url, { action: 'ping', token }, 20000);
      poner('ping', r0.ok, r0.ok ? 'Responde correctamente' : r0.message);
      const u = await actualizarUsuarios(true);
      const nu = (listaUsuarios() || []).length;
      poner('usuarios', u.ok, u.ok ? (nu ? `${nu} ${nu === 1 ? 'usuario activo' : 'usuarios activos'}` : 'Sin usuarios: la app funciona sin control de acceso') : u.message);
      const c = await descargarCatalogo(deviceName());
      const nfil = c.ok ? c.estructura.length + c.personas.length + c.beneficios.length + c.diario.length + c.bolFichas.length : 0;
      poner('catalogo', c.ok && nfil > 0, c.ok ? `${c.estructura.length} fincas/lotes · ${c.personas.length} personas · ${c.beneficios.length} beneficios · ${c.bolFichas.length} fichas` : c.message, c.ok && !nfil ? `No hay filas para el dispositivo «${deviceName()}»` : '');
      const hi = await historicos();
      poner('hist', !hi.error, hi.error ? hi.error : `${hi.filas.length} filas · cosechas ${hi.cosechas.join(', ')}`, !hi.error && !hi.filas.length ? 'El archivo no tiene filas' : '');
      const ex = await exportaciones();
      if (ex.error) poner('exp', false, ex.error);
      else {
        const d = parseExp(ex);
        poner('exp', true, `${d.contratos.length} contratos · ${d.entregas.length} entregas · ${d.pagos.length} pagos`, d.alertas.sinContrato ? `${d.alertas.sinContrato} registros con «¿Contrato?» en Entregas o Pagos` : d.alertas.lista.length ? `${d.alertas.lista.length} alertas de seguimiento` : '');
      }
      const malas = items.filter(([k]) => filas[k].classList.contains('peligro')).length;
      resumen.textContent = malas ? `${malas} ${malas === 1 ? 'conexión con problemas' : 'conexiones con problemas'}. Revise el mensaje de cada una.` : '✔ Todas las conexiones funcionan.';
      probando = false; btn.disabled = false;
    }
    const btn = boton('Probar todas las conexiones', 'enviar', 'c-azul ancho-total', probarTodas);
    raiz.append(resumen, lista, btn);
  }

  // ----- Mi barra -----
  function vistaMiBarra() {
    raiz.append(cabSub('Mi barra', irInicio));
    const perm = permitidos().map((m) => m.k);
    const bloqueada = barraBloqueada();
    const exp = listaExplicita();
    const dist = distribucion();
    let orden = exp ? [...new Set(exp)].filter((k) => perm.includes(k)) : [...dist.barra, ...dist.mas];
    const en = new Set(exp ? orden : perm);
    const resto = perm.filter((k) => !orden.includes(k));
    orden = [...orden, ...resto];
    const lista = h('div', { class: 'mibarra' });
    const nota = h('p', { class: 'nota' });
    const pintarLista = () => {
      clear(lista);
      const act = orden.filter((k) => en.has(k)), inact = orden.filter((k) => !en.has(k));
      const vis = [...act, ...inact];
      vis.forEach((k) => {
        const m = modulo(k), on = en.has(k), pos = act.indexOf(k);
        const mover = (d) => { const i = orden.indexOf(k); const j = i + d; if (j < 0 || j >= orden.length) return; [orden[i], orden[j]] = [orden[j], orden[i]]; pintarLista(); };
        lista.append(h('div', { class: 'mb-fila' + (on ? '' : ' off') },
          h('span', { class: 'mb-n' }, on ? String(pos + 1) : '–'), icono(m.ic, 22), h('span', { class: 'mb-t' }, m.n),
          bloqueada ? null : h('span', { class: 'mb-mv' }, on ? h('button', { type: 'button', 'aria-label': 'Subir', disabled: pos === 0, onclick: () => { const i = orden.indexOf(act[pos - 1]); const a = orden.indexOf(k); [orden[a], orden[i]] = [orden[i], orden[a]]; pintarLista(); } }, '▲') : null,
            on ? h('button', { type: 'button', 'aria-label': 'Bajar', disabled: pos === act.length - 1, onclick: () => { const i = orden.indexOf(act[pos + 1]); const a = orden.indexOf(k); [orden[a], orden[i]] = [orden[i], orden[a]]; pintarLista(); } }, '▼') : null),
          bloqueada ? null : h('button', { type: 'button', class: 'interruptor' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), onclick: () => { if (on && act.length <= 1) return toast('Deje al menos un módulo en la barra.'); if (on) en.delete(k); else en.add(k); pintarLista(); } })));
      });
      const n = act.length;
      nota.textContent = n > 5 || (n < perm.length && n > 4) ? 'En la barra caben 4 módulos; los demás quedan dentro de «Más».' : n < perm.length ? 'Los módulos apagados quedan dentro de «Más».' : 'Todos los módulos caben en la barra.';
    };
    pintarLista();
    raiz.append(
      bloqueada ? h('p', { class: 'estado aviso' }, '🔒 Su barra fue definida por el administrador y no se puede cambiar.') : h('p', { class: 'nota' }, 'Active los módulos que quiere ver abajo y ordénelos con ▲ ▼. Solo aparecen los módulos que usted tiene permitidos.'),
      lista, nota);
    if (!bloqueada) {
      raiz.append(h('div', { class: 'acciones-g' },
        h('button', { type: 'button', class: 'btn-texto primario', onclick: () => { guardarBarraPersonal(orden.filter((k) => en.has(k))); nav.barraCambio && nav.barraCambio(); toast('Barra guardada.'); irInicio(); } }, 'Guardar'),
        h('button', { type: 'button', class: 'btn-texto', onclick: () => { borrarBarraPersonal(); nav.barraCambio && nav.barraCambio(); toast(barraDelAdmin().length ? 'Volvió al orden del administrador.' : 'Volvió al orden original.'); irInicio(); } }, 'Volver al orden original')));
    }
  }

  // ----- Apariencia -----
  function vistaApariencia() {
    raiz.append(cabSub('Apariencia', irInicio));
    const etq = (lst, k) => (lst.find((x) => x[0] === ajuste(k, lst[0][0])) || lst[0])[1];
    const sociedades = () => [...new Set(cat.cosechas.flatMap((c) => c.sociedades.map((s) => s.nombre)))].sort((a, b) => a.localeCompare(b, 'es'));
    const fTema = filaAj({ ic: '🌓', t: 'Tema', s: etq(TEMAS, 'tema'), onclick: async () => {
      const v = await elegir('Tema', TEMAS.map(([k, t]) => ({ etiqueta: t, valor: k })), { buscar: false });
      if (v === undefined) return; guardarAjuste('tema', v); aplicarApariencia(); pintar();
    } });
    const fTexto = filaAj({ ic: '🔠', t: 'Tamaño de texto', s: etq(TEXTOS, 'texto'), onclick: async () => {
      const v = await elegir('Tamaño de texto', TEXTOS.map(([k, t]) => ({ etiqueta: t, valor: k })), { buscar: false });
      if (v === undefined) return; guardarAjuste('texto', v); aplicarApariencia(); pintar();
    } });
    const fTab = filaAj({ ic: '🏠', t: 'Pestaña de inicio', s: etq(TABS, 'tab_inicio'), onclick: async () => {
      const v = await elegir('Pestaña de inicio', TABS.map(([k, t]) => ({ etiqueta: t, valor: k })), { buscar: false });
      if (v === undefined) return; guardarAjuste('tab_inicio', v); pintar();
    } });
    const fSoc = filaAj({ ic: '🏢', t: 'Sociedad por defecto', s: ajuste('soc', '') || 'Ninguna (la elijo cada vez)', onclick: async () => {
      const ops = [{ etiqueta: 'Ninguna (la elijo cada vez)', valor: '' }, ...sociedades().map((n) => ({ etiqueta: n, valor: n }))];
      const v = await elegir('Sociedad por defecto', ops);
      if (v === undefined) return; guardarAjuste('soc', v); pintar();
    } });
    raiz.append(grupo(fTema, fTexto), grupo(fTab, fSoc),
      h('p', { class: 'nota' }, 'La sociedad por defecto se llena sola en Registro y Diario cuando todavía no ha elegido ninguna. Estos ajustes solo afectan a este dispositivo.'));
  }

  // ----- Novedades -----
  function vistaNovedades() {
    raiz.append(cabSub('Novedades de la versión', irInicio));
    NOVEDADES.forEach((n) => raiz.append(tarjeta(h('h2', null, 'Versión ' + n.v + (n.v === VERSION ? ' · la que tiene' : '')), h('ul', { class: 'novedades' }, ...n.t.map((x) => h('li', null, x))))));
  }

  // ----- Impresora -----
  function vistaImpresion() {
    raiz.append(cabSub('Impresora de 80 mm', irInicio));
    const anchoIn = h('input', { class: 'campo', type: 'number', inputmode: 'decimal', min: '50', max: '82', step: '1', value: String(anchoMm()) });
    raiz.append(tarjeta(
      h('p', { class: 'nota' }, 'En los comprobantes aparece «Imprimir (80 mm)». En el cuadro de impresión elija la impresora térmica con papel de 80 mm y márgenes en «Ninguno».'),
      etiqueta('Ancho de la imagen impresa (mm)'), anchoIn,
      h('p', { class: 'nota' }, 'Normalmente 80. Si la impresora corta los bordes, baje a 72–76.'),
      h('div', { class: 'pila' },
        boton('Guardar ancho', 'emitir', 'c-verde ancho-total', () => { setAnchoMm(anchoIn.value); toast('Guardado.'); }),
        boton('Imprimir prueba', 'imprimir', 'c-teal ancho-total', () => {
          setAnchoMm(anchoIn.value);
          const pg = crearPagina(227, 120, 3.2);
          pg.c.fillStyle = '#000'; pg.c.font = 'bold 14px sans-serif';
          pg.c.fillText('PRUEBA DE IMPRESIÓN', 10, 30); pg.c.font = '10px sans-serif';
          pg.c.fillText('|<-- 10 pt -->|  Registro de Cajuelas', 10, 52);
          pg.c.strokeRect(10, 62, 207, 40);
          imprimirTiquetes([pg]);
        }))));
  }


  async function infoAlmacenamiento(fila) {
    try {
      const persistente = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      if (persistente === false && fila && fila.isConnected) fila.cambiarSub(`Dispositivo: ${deviceName()} · almacenamiento sin protección (mantenga la app instalada y envíe los pendientes)`);
    } catch { /* nada */ }
  }


  // ----- Catálogo (solo lectura) -----
  function vistaCatalogo() {
    raiz.append(cabSub('Catálogo recibido', irInicio));
    if (!cat.cosechas.length && !bol.cosechas.length) { raiz.append(tarjeta(h('p', { class: 'nota' }, 'Todavía no se ha recibido el catálogo. Use «Actualizar catálogo y usuarios».'))); return; }
    const detalle = (resumen, ...hijos) => h('details', null, h('summary', null, resumen), ...hijos);
    const lis = (a) => h('ul', null, ...a.map((x) => h('li', null, x)));
    const socDet = (s, conPersonas) => detalle(`${s.nombre}${s.tipo && !conPersonas ? ' · ' + s.tipo : ''} (${s.fincas.length} fincas${conPersonas ? ', ' + s.personas.length + ' personas' : ''})`,
      ...s.fincas.map((f) => detalle(`${f}${(s.lotes[f] || []).length ? ` (${s.lotes[f].length} lotes)` : ''}`, lis(s.lotes[f] || []))),
      conPersonas && s.personas.length ? detalle(`Personas (${s.personas.length})`, lis(s.personas.map((p) => `${p.nombre}${p.codigo ? ' · ' + p.codigo : ''}${p.deduccion ? ' · ded. ' + fmtMoney(p.deduccion) : ''}`))) : null);
    const nombres = [...new Set([...cat.cosechas.map((c) => c.nombre), ...bol.cosechas.map((c) => c.nombre)])];
    nombres.forEach((n) => {
      const c = cat.cosechas.find((x) => normalizar(x.nombre) === normalizar(n));
      const b = bol.cosechas.find((x) => normalizar(x.nombre) === normalizar(n));
      raiz.append(tarjeta(h('h2', null, 'Cosecha ' + n),
        c ? detalle(`Registro: ${c.sociedades.length} sociedades`, ...c.sociedades.map((s) => socDet(s, true))) : null,
        c && (c.diarioSociedades.length || c.diarioBeneficios.length) ? detalle(`Diario: ${c.diarioSociedades.length} sociedades · ${c.diarioBeneficios.length} beneficios`,
          c.diarioReceptora ? h('p', { class: 'nota' }, 'Hace los recibos: ' + c.diarioReceptora) : null, detalle('Beneficios', lis(c.diarioBeneficios)), ...c.diarioSociedades.map((s) => socDet(s, false))) : null,
        b ? detalle(`Boletos: ${b.sociedades.length} sociedades · ${b.oficinas.length} oficinas`, detalle('Oficinas', lis(b.oficinas)),
          ...b.sociedades.map((s) => detalle(`${s.nombre} (${s.fichas.length} fichas)`, lis(s.fichas.map((f) => `${f.color} · ${f.medida} · inventario ${f.inventario}`))))) : null));
    });
  }


  pintar();
  return { el: raiz, refrescar: pintar, reiniciar() { vista = 'inicio'; desbloqueado = false; pintar(); } };
}
