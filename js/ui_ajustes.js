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
import { hayControl, sesion, salir, actualizarUsuarios, puede, lista as listaUsuarios } from './users.js';
import { esComputadora, anchoMm, setAnchoMm, imprimirTiquetes } from './imprimir.js';
import { crearPagina } from './draw.js';

const cp = (el, permiso) => { el.dataset.permiso = permiso; return el; };

// ---------- Clave de administrador ----------
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function derivar(sal, secreto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(sal), iterations: 150000, hash: 'SHA-256' }, k, 256));
}
const aleatorio = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const admin = {
  fallos: 0, bloqueadoHasta: 0,
  puesta: () => !!db.get('admin_hash', ''),
  espera() { const r = this.bloqueadoHasta - Date.now(); return r > 0 ? Math.ceil(r / 1000) : 0; },
  falla() { this.fallos++; if (this.fallos >= 5) { this.fallos = 0; this.bloqueadoHasta = Date.now() + 30000; } },
  async revisar(clave) {
    if (this.espera() > 0) return false;
    const ok = (await derivar(db.get('admin_salt', ''), clave)) === db.get('admin_hash', '');
    if (ok) this.fallos = 0; else this.falla();
    return ok;
  },
  async revisarRecuperacion(codigo) {
    if (this.espera() > 0) return false;
    const limpio = codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const ok = (await derivar(db.get('admin_salt', '') + 'R', limpio)) === db.get('admin_recovery_hash', '');
    if (ok) this.fallos = 0; else this.falla();
    return ok;
  },
  async poner(clave) {
    const sal = aleatorio(16), crudo = aleatorio(6).toUpperCase();
    db.set('admin_salt', sal); db.set('admin_hash', await derivar(sal, clave)); db.set('admin_recovery_hash', await derivar(sal + 'R', crudo));
    return crudo.match(/.{4}/g).join('-');
  }
};

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
    return av('La hoja no tiene datos', `No hay filas para el dispositivo «${device}» (ni filas con la columna Dispositivo vacía). El catálogo no se modificó. Revise que el nombre del dispositivo coincida con el de la hoja.`);
  }
  let { cambio, texto } = reemplazarDesdeHoja(r.estructura, r.personas, r.beneficios, r.diario);
  if (aplicarConfigHoja(r.config)) cambio = true;
  if (r.bolDisp.length) db.set('boletos_disp', r.bolDisp);
  if (r.bolFichas.length || r.bolOficinas.length) { texto += '\n\n' + reemplazarBoletosDesdeHoja(r.bolFichas, r.bolOficinas); cambio = true; }
  if (alCambiar) alCambiar();
  if (manual) aviso('Catálogo actualizado', texto);
  else if (cambio) toast('Catálogo actualizado desde Google Sheets.');
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
    if (vista === 'sync') return vistaSync();
    if (vista === 'catalogo') return vistaCatalogo();
    if (vista === 'impresion') return vistaImpresion();
    if (vista === 'copia') return vistaCopia();
    if (vista === 'conexiones') return vistaConexiones();
    if (vista === 'apariencia') return vistaApariencia();
    if (vista === 'novedades') return vistaNovedades();
    vistaInicio();
  }
  const irInicio = () => { vista = 'inicio'; desbloqueado = false; pintar(); };

  // ----- Pantalla principal -----
  const textoPend = (n) => (n ? `⏳ ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar` : '✔ Todo enviado a Google Sheets');
  const hace = (t) => { if (!t) return 'sin descargar'; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const cacheT = (k) => { try { const o = JSON.parse(localStorage.getItem(k + (modoPruebas ? '_t' : '')) || 'null'); return o && o.t ? o.t : 0; } catch { return 0; } };
  const diasSinRespaldo = () => { const t = db.get('ultimo_respaldo', 0); return t ? Math.floor((Date.now() - t) / 86400000) : null; };
  const textoRespaldo = () => { const d = diasSinRespaldo(); return d === null ? 'Aún no ha hecho ninguna copia de seguridad' : d === 0 ? 'Último respaldo: hoy' : `Último respaldo: hace ${d} ${d === 1 ? 'día' : 'días'}`; };
  const respaldoVencido = () => { const d = diasSinRespaldo(); return d === null || d > 7; };
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
  async function copiarDiagnostico() {
    const e = db.get('ultimo_error', null);
    const sUs = hayControl() ? sesion() : null;
    const txt = ['Diagnóstico · Registro de Cajuelas', `Versión: ${VERSION}${modoPruebas ? ' (modo de pruebas)' : ''}`, `Dispositivo: ${deviceName()}`, `Usuario: ${sUs ? sUs.nombre + ' (' + sUs.rol + ')' : 'sin control de acceso'}`,
      `En línea: ${navigator.onLine ? 'sí' : 'no'}`, `Envíos pendientes: ${cuantosPendientes()}`, `Cosecha activa: ${cosechaActiva() || '—'}`,
      `Catálogo: ${cat.actualizado ? new Date(cat.actualizado).toLocaleString('es-CR') : 'sin recibir'}`, `Históricos: ${hace(cacheT('cajuelas_hist'))} · Exportaciones: ${hace(cacheT('cajuelas_exp'))}`,
      `Último respaldo: ${diasSinRespaldo() === null ? 'nunca' : 'hace ' + diasSinRespaldo() + ' d'}`,
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
      fila(respaldoVencido() ? '⚠' : '💾', textoRespaldo() + (respaldoVencido() ? ' · haga una copia hoy' : ''), !respaldoVencido()),
      fila('✔', `Versión ${VERSION} · al día`),
      h('small', { class: 'nota' }, 'Toque para ver el estado de las conexiones'));
  }
  function vistaInicio() {
    const sUs = hayControl() ? sesion() : null;
    const co = cosechaActiva();
    const nPend = cuantosPendientes();
    const esAdmin = puede('config');
    const fPend = filaAj({ ic: '☁', t: 'Envíos a Google Sheets', s: textoPend(nPend), onclick: enviarAhora });
    const fAlm = filaAj({ ic: 'ℹ', t: `Versión ${VERSION}`, s: `Dispositivo: ${deviceName()}`, onclick: () => toast(`Versión ${VERSION} · ${deviceName()}`) });
    const fAct = filaAj({ ic: '🔄', t: 'Actualizar catálogo y usuarios', s: `${co ? 'Cosecha ' + co : 'Sin cosecha todavía'} · ${cat.actualizado ? 'actualizado ' + new Date(cat.actualizado).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }) : 'aún no se ha recibido'}`, onclick: actualizarTodo });
    const fCuenta = sUs ? filaAj({ ic: '👤', t: sUs.nombre, s: `${sUs.rol} · toque para cerrar sesión`, onclick: async () => {
      if (await confirmar('Cerrar sesión', `Sesión de ${sUs.nombre} (${sUs.rol}).\n\n¿Cerrar la sesión?`, { si: 'Cerrar sesión' })) salir();
    } }) : null;
    const fApar = filaAj({ ic: '🎨', t: 'Apariencia', s: 'Tema, tamaño de texto y pantalla de inicio', onclick: () => { vista = 'apariencia'; pintar(); } });
    const fNov = filaAj({ ic: '✨', t: 'Novedades de la versión', s: `Qué hay de nuevo en ${VERSION}`, onclick: () => { vista = 'novedades'; pintar(); } });
    const fBuscar = filaAj({ ic: '⬆', t: 'Buscar actualización de la app', onclick: () => window.__buscarActualizacion && window.__buscarActualizacion() });
    const fDiag = filaAj({ ic: '📋', t: 'Copiar diagnóstico', s: 'Para enviarlo a quien da soporte', onclick: copiarDiagnostico });
    const head = [banda('Ajustes'), modoPruebas ? h('p', { class: 'estado aviso' }, '🧪 Está en MODO DE PRUEBAS: los datos no son reales.') : null];
    if (!esAdmin) {
      // Lista simple para quien no administra.
      raiz.append(...head, grupo(fCuenta, fAct, fPend), grupo(fApar, fNov, fBuscar, fAlm));
      infoAlmacenamiento(fAlm);
    } else {
      const datos = [fAct, fPend, filaAj({ ic: '📚', t: 'Catálogo recibido', s: 'Cosechas, sociedades y fincas', onclick: () => { vista = 'catalogo'; pintar(); } }),
        filaAj({ ic: '💾', t: 'Copia de seguridad', s: textoRespaldo() + (respaldoVencido() ? ' ⚠' : ''), onclick: () => { vista = 'copia'; pintar(); } })];
      const conexion = [
        filaAj({ ic: '🔌', t: 'Estado de conexiones', s: 'Probar Apps Script, usuarios, catálogo y reportes', onclick: () => { vista = 'conexiones'; pintar(); } }),
        filaAj({ ic: '⚙', t: 'Sincronización con la hoja', s: configurado() ? 'Configurada' : 'Sin configurar: falta la URL y el token', onclick: () => { vista = 'sync'; desbloqueado = false; pintar(); } })
      ];
      const dispositivo = [fApar, esComputadora() ? filaAj({ ic: '🖨', t: 'Impresora de 80 mm', s: `Ancho ${anchoMm()} mm`, onclick: () => { vista = 'impresion'; pintar(); } }) : null, fNov, fBuscar, fDiag, fAlm];
      const riesgo = [
        filaAj({ ic: '🧪', t: 'Modo de pruebas', s: modoPruebas ? 'ACTIVO · los datos no son reales' : 'Practicar sin tocar los datos reales', sw: modoPruebas, onclick: cambiarDeModo }),
        filaAj({ ic: '🧹', t: 'Empezar de cero', s: 'Borra los datos de este dispositivo', peligro: true, onclick: empezarDeCero })
      ];
      raiz.append(...head, tarjetaEstado(), fCuenta ? grupo(fCuenta) : null,
        tituloGrupo('Datos'), cp(grupo(...datos), 'config'),
        tituloGrupo('Conexión'), cp(grupo(...conexion), 'config'),
        tituloGrupo('Este dispositivo'), grupo(...dispositivo),
        tituloGrupo('Zona de riesgo'), cp(grupo(...riesgo), 'config'));
      infoAlmacenamiento(fAlm);
    }
    const quitar = alCambiarPendientes(() => { if (!raiz.isConnected || vista !== 'inicio') return quitar(); fPend.cambiarSub(textoPend(cuantosPendientes())); });
  }

  // ----- Estado de conexiones -----
  function vistaConexiones() {
    raiz.append(cabSub('Estado de conexiones', irInicio));
    const items = [['ping', 'Apps Script'], ['usuarios', 'Lista de usuarios'], ['catalogo', 'Catálogo'], ['hist', 'Históricos'], ['exp', 'Exportaciones']];
    const filas = {};
    const lista = h('div', { class: 'grupo' });
    items.forEach(([k, t]) => { filas[k] = filaAj({ ic: '•', t, s: 'Sin probar' }); filas[k].querySelector('.fl').textContent = ''; lista.append(filas[k]); });
    const poner = (k, ok, texto, aviso) => { const f = filas[k]; f.querySelector('.ic').textContent = ok === null ? '⏳' : ok ? '✔' : '✖'; f.cambiarSub(texto + (aviso ? '\n⚠ ' + aviso : '')); f.querySelector('small').style.whiteSpace = 'pre-line'; f.classList.toggle('peligro', ok === false); };
    const resumen = h('p', { class: 'nota' }, configurado() ? 'Toque «Probar todas las conexiones» para revisar cada enlace con Google.' : 'Falta configurar la URL y el token (Conexión > Sincronización con la hoja).');
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

  // ----- Copia de seguridad -----
  function vistaCopia() {
    raiz.append(cabSub('Copia de seguridad', irInicio), tarjeta(
      h('p', { class: 'nota' }, 'Los datos de este dispositivo (comprobantes, recibos, movimientos y pendientes) se guardan solo en este navegador. La copia contiene el token de la hoja: guárdela en un lugar seguro.'),
      h('div', { class: 'pila' }, boton('Guardar copia de seguridad', 'compartir', 'c-verde ancho-total', exportar), boton('Restaurar una copia', 'enviar', 'c-rojo ancho-total', importar))));
  }

  async function cambiarDeModo() {
    if (admin.puesta() && !(await pedirClaveAdmin())) return;
    const aPruebas = !modoPruebas;
    const ok = await confirmar(aPruebas ? 'Entrar al modo de pruebas' : 'Volver al modo real',
      aPruebas ? 'La app se reiniciará en MODO DE PRUEBAS, con datos separados de los reales. En ese modo debe configurar la hoja de pruebas (Administración > Configurar sincronización).\n\n¿Continuar?'
        : 'La app se reiniciará en el modo REAL, con sus datos de siempre.\n\n¿Continuar?', { si: 'Continuar' });
    if (ok) cambiarModo(aPruebas);
  }
  async function empezarDeCero() {
    if (admin.puesta() && !(await pedirClaveAdmin())) return;
    const pend = cuantosPendientes();
    const r = await formulario('Empezar de cero', [{ etiqueta: 'Para confirmar escriba BORRAR', placeholder: 'BORRAR', autocapitalize: 'characters' }], {
      ok: 'Borrar todo', validar: (v) => (v[0].trim().toUpperCase() !== 'BORRAR' ? 'Escriba la palabra BORRAR para confirmar.' : null),
      detalle: `Se borrarán los comprobantes, recibos y movimientos de este dispositivo${pend ? ` y ${pend} envíos pendientes que NO han llegado a la hoja` : ''}. No se puede deshacer. Si necesita conservar algo, haga primero una copia de seguridad.`
    });
    if (!r) return;
    borrarDatosOperativos();
    try { sessionStorage.setItem('cajuelas.conservar', '1'); } catch { /* nada */ }
    toast('Listo: datos borrados y numeración reiniciada.', 4000);
    setTimeout(() => location.reload(), 900);
  }
  async function pedirClaveAdmin() {
    const r = await formulario('Clave de administrador', [{ etiqueta: 'Clave', tipo: 'password' }], { ok: 'Verificar' });
    if (!r) return false;
    if (admin.espera() > 0) { toast(`Demasiados intentos. Espere ${admin.espera()} s.`); return false; }
    if (await admin.revisar(r[0])) return true;
    toast('Clave incorrecta.'); return false;
  }
  async function infoAlmacenamiento(fila) {
    try {
      const persistente = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      if (persistente === false && fila && fila.isConnected) fila.cambiarSub(`Dispositivo: ${deviceName()} · almacenamiento sin protección (haga copias de seguridad)`);
    } catch { /* nada */ }
  }

  // ----- Sincronización -----
  function vistaSync() {
    const volver = irInicio;
    raiz.append(cabSub('Sincronización', volver));
    if (admin.puesta() && !desbloqueado) return vistaBloqueo(volver);
    const c = syncCfg();
    const url = h('input', { class: 'campo', type: 'url', value: c.url, placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const token = h('input', { class: 'campo', type: 'text', value: c.token, placeholder: 'Token secreto', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const disp = h('input', { class: 'campo', type: 'text', value: c.device, placeholder: deviceName(), autocomplete: 'off' });
    const salida = h('p', { class: 'pre nota' }, '');
    raiz.append(
      tarjeta(etiqueta('URL del Web App (termina en /exec)'), url, etiqueta('Token secreto'), token, etiqueta('Nombre de este dispositivo'), disp,
        h('p', { class: 'nota' }, 'Este nombre identifica al dispositivo en la hoja de Google. Debe coincidir con la columna «Dispositivo» del catálogo.')),
      h('div', { class: 'pila' },
        boton('Guardar', 'emitir', 'c-verde ancho-total', () => { guardarSyncCfg(url.value, token.value, disp.value); salida.textContent = 'Guardado.'; toast('Guardado.'); }),
        boton('Probar conexión', 'enviar', 'c-azul ancho-total', async () => {
          guardarSyncCfg(url.value, token.value, disp.value);
          salida.textContent = 'Probando…'; salida.textContent = await probar();
        })),
      salida,
      tarjeta(h('h2', null, 'Clave de administrador'),
        h('p', { class: 'nota' }, admin.puesta() ? 'Protege esta pantalla (URL, token y nombre del dispositivo).' : 'Opcional: proteja esta pantalla con una clave para que nadie cambie la configuración por error.'),
        boton(admin.puesta() ? 'Cambiar la clave' : 'Crear una clave', 'ajustes', 'c-teal ancho-total', crearClave)),
      tarjeta(h('h2', null, 'Envíos pendientes'), h('p', { class: 'nota' }, `Pendientes: ${cuantosPendientes()}`),
        boton('Descartar los pendientes', 'borrar', 'c-rojo ancho-total', async () => {
          if (!cuantosPendientes()) return toast('No hay envíos pendientes.');
          if (await confirmar('Descartar pendientes', `Se borrarán ${cuantosPendientes()} registros que aún no llegaron a la hoja. No se pueden recuperar.\n\n¿Descartarlos?`, { si: 'Descartar', peligro: true })) { descartarPendientes(); pintar(); }
        }))
    );
  }
  function vistaBloqueo(volver) {
    const clave = h('input', { class: 'campo', type: 'password', placeholder: 'Clave de administrador', autocomplete: 'off', inputmode: 'numeric' });
    const msg = h('p', { class: 'nota' }, '');
    const probarClave = async () => {
      const e = admin.espera();
      if (e > 0) { msg.textContent = `Demasiados intentos. Espere ${e} segundos.`; return; }
      if (await admin.revisar(clave.value)) { desbloqueado = true; pintar(); }
      else { const e2 = admin.espera(); msg.textContent = e2 > 0 ? `Clave incorrecta. Espere ${e2} segundos.` : 'Clave incorrecta.'; clave.value = ''; }
    };
    clave.addEventListener('keydown', (e) => { if (e.key === 'Enter') probarClave(); });
    raiz.append(tarjeta(h('p', { class: 'nota' }, 'Esta pantalla está protegida. Escriba la clave de administrador.'), clave, msg),
      boton('Entrar', 'emitir', 'c-verde ancho-total', probarClave),
      h('button', { type: 'button', class: 'btn-texto', onclick: recuperar }, 'Olvidé la clave'));
    async function recuperar() {
      const r = await formulario('Recuperar acceso', [{ etiqueta: 'Código de recuperación (XXXX-XXXX-XXXX)', placeholder: 'XXXX-XXXX-XXXX' }], { ok: 'Verificar' });
      if (!r) return;
      if (await admin.revisarRecuperacion(r[0])) { desbloqueado = true; toast('Acceso concedido. Cree una clave nueva.'); pintar(); crearClave(); }
      else toast(admin.espera() > 0 ? `Código incorrecto. Espere ${admin.espera()} segundos.` : 'Código incorrecto.');
    }
  }
  async function crearClave() {
    const r = await formulario(admin.puesta() ? 'Cambiar la clave' : 'Crear una clave', [
      { etiqueta: 'Clave nueva (mínimo 4 caracteres)', tipo: 'password' }, { etiqueta: 'Repita la clave', tipo: 'password' }
    ], { ok: 'Guardar', validar: (v) => (v[0].length < 4 ? 'La clave debe tener al menos 4 caracteres.' : v[0] !== v[1] ? 'Las claves no coinciden.' : null) });
    if (!r) return;
    const codigo = await admin.poner(r[0]);
    dialogo({ titulo: 'Código de recuperación', cuerpo: [h('p', { class: 'pre' }, 'Anote este código y guárdelo en un lugar seguro. Solo se muestra una vez y sirve para recuperar el acceso si olvida la clave.'), h('p', { class: 'codigo' }, codigo)], botones: [{ texto: 'Ya lo anoté', clase: 'primario' }] });
    pintar();
  }

  // ----- Catálogo (solo lectura) -----
  function vistaCatalogo() {
    raiz.append(cabSub('Catálogo recibido', irInicio));
    if (!cat.cosechas.length && !bol.cosechas.length) { raiz.append(tarjeta(h('p', { class: 'nota' }, 'Todavía no se ha recibido el catálogo. Use «Recibir catálogo de Google Sheets».'))); return; }
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

  // ----- Copia de seguridad -----
  async function exportar() {
    const blob = new Blob([JSON.stringify({ app: 'registro-cajuelas', version: VERSION, fecha: new Date().toISOString(), datos: db.todo() })], { type: 'application/json' });
    const r = await compartir([{ blob, nombre: `copia_cajuelas_${stampCorto()}.json` }], 'Copia de seguridad de Registro de Cajuelas');
    if (r === 'descargado') toast('Se descargó la copia de seguridad.');
    if (r === 'descargado' || r === 'compartido') db.set('ultimo_respaldo', Date.now());
  }
  function importar() {
    const f = h('input', { type: 'file', accept: '.json,application/json' });
    f.addEventListener('change', async () => {
      const file = f.files && f.files[0]; if (!file) return;
      try {
        const o = JSON.parse(await file.text());
        if (!o || o.app !== 'registro-cajuelas' || !o.datos) throw new Error('Este archivo no es una copia de seguridad de la aplicación.');
        if (!(await confirmar('Restaurar copia', 'Se reemplazarán TODOS los datos de este dispositivo por los de la copia. Lo que haya hecho después de la copia se perderá.\n\n¿Restaurar?', { si: 'Restaurar', peligro: true }))) return;
        if (!db.reemplazarTodo(o.datos)) throw new Error('No se pudo guardar en este dispositivo.');
        try { sessionStorage.setItem('cajuelas.conservar', '1'); } catch { /* nada */ }
        location.reload();
      } catch (e) { aviso('No se pudo restaurar', e.message || String(e)); }
    });
    f.click();
  }

  pintar();
  return { el: raiz, refrescar: pintar, reiniciar() { vista = 'inicio'; desbloqueado = false; pintar(); } };
}
