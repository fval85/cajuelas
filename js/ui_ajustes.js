// Pestaña «Ajustes»: pantalla simple para el usuario y una zona de administración.
import { h, clear, toast, aviso, confirmar, elegir, dialogo, formulario, normalizar, fmtMoney, plainNumber, parseQty, stampCorto, VERSION } from './util.js';
import { db, cat, bol, syncCfg, guardarSyncCfg, configurado, deviceName, cosechaActiva, aplicarConfigHoja, modoPruebas, cambiarModo, borrarDatosOperativos,
  reemplazarDesdeHoja, reemplazarBoletosDesdeHoja } from './store.js';
import { cuantosPendientes, enviarPendientes, descartarPendientes, probar, descargarCatalogo, alCambiarPendientes } from './sync.js';
import { compartir, descargar } from './files.js';
import { tarjeta, etiqueta, banda, selector, boton } from './ui.js';
import { hayControl, sesion, salir, actualizarUsuarios } from './users.js';
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
    if (vista === 'admin') return vistaAdmin();
    vistaInicio();
  }
  const volverAjustes = () => h('button', { type: 'button', class: 'btn-texto volver', onclick: () => { vista = 'inicio'; desbloqueado = false; pintar(); } }, '‹ Volver a Ajustes');

  // ----- Pantalla principal: lo mínimo para el usuario -----
  function vistaInicio() {
    const sUs = hayControl() ? sesion() : null;
    const co = cosechaActiva();
    const nPend = cuantosPendientes();
    const estPend = h('p', { class: nPend ? 'estado aviso' : 'estado bien' }, nPend ? `⏳ ${nPend} ${nPend === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar` : '✔ Todo enviado a Google Sheets');
    const ult = cat.actualizado ? `Última actualización: ${new Date(cat.actualizado).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Aún no se ha recibido el catálogo.';
    raiz.append(
      banda('Ajustes'),
      modoPruebas ? h('p', { class: 'estado aviso' }, '🧪 Está en MODO DE PRUEBAS: los datos no son reales.') : null,
      sUs ? tarjeta(h('h2', null, '👤 Usuario'), h('p', { class: 'grande' }, sUs.nombre),
        boton('Cerrar sesión', 'anular', 'c-rojo ancho-total', () => salir())) : null,
      tarjeta(h('h2', null, '📋 Catálogo'), h('p', { class: 'grande' }, co ? `Cosecha ${co}` : 'Sin cosecha todavía'), h('p', { class: 'nota' }, ult),
        boton('Actualizar catálogo', 'resumen', 'c-azul ancho-total', async () => { await actualizarCatalogo(true, alCatalogo); pintar(); })),
      tarjeta(h('h2', null, '☁ Envíos a Google Sheets'), estPend,
        boton('Enviar pendientes ahora', 'enviar', 'c-verde ancho-total', async () => {
          if (!configurado()) return toast('Falta configurar la sincronización (pida ayuda al administrador).', 5000);
          if (!cuantosPendientes()) return toast('No hay envíos pendientes.');
          toast('Enviando…', 1500);
          const r = await enviarPendientes();
          pintar();
          toast(r.error ? `Se enviaron ${r.enviados}. Quedan ${r.restantes}. ${r.error}` : `Enviados: ${r.enviados}. No quedan pendientes.`, 6000);
        })),
      tarjeta(h('h2', null, 'ℹ Aplicación'), h('p', { class: 'nota' }, `Versión ${VERSION} · Dispositivo: ${deviceName()}`), h('p', { class: 'nota', id: 'info-almacen' }, ''),
        boton('Buscar actualización de la app', 'enviar', 'c-teal ancho-total', () => window.__buscarActualizacion && window.__buscarActualizacion())),
      cp(tarjeta(h('h2', null, '🔧 Administración'), h('p', { class: 'nota' }, 'Sincronización, catálogo, copia de seguridad, impresora, modo de pruebas y borrado de datos.'),
        boton('Abrir administración', 'ajustes', 'c-ambar ancho-total', () => { vista = 'admin'; pintar(); })), 'config')
    );
    infoAlmacenamiento();
    const quitar = alCambiarPendientes(() => { if (!raiz.isConnected || vista !== 'inicio') return quitar(); const n = cuantosPendientes(); estPend.className = n ? 'estado aviso' : 'estado bien'; estPend.textContent = n ? `⏳ ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar` : '✔ Todo enviado a Google Sheets'; });
  }

  // ----- Administración (solo administradores) -----
  function vistaAdmin() {
    raiz.append(banda('Administración'), volverAjustes());
    const anchoIn = h('input', { class: 'campo', type: 'number', inputmode: 'decimal', min: '50', max: '82', step: '1', value: String(anchoMm()) });
    raiz.append(
      tarjeta(h('h2', null, 'Sincronización con Google Sheets'), h('p', { class: 'nota' }, configurado() ? 'Configurada. Protegida con la clave de administrador.' : 'Sin configurar: falta la URL y el token.'),
        boton('Configurar sincronización', 'ajustes', 'c-teal ancho-total', () => { vista = 'sync'; desbloqueado = false; pintar(); })),
      tarjeta(h('h2', null, 'Catálogo'), h('p', { class: 'nota' }, 'Cosechas, sociedades, fincas, personas, fichas, precios y cosecha activa se cambian en Google Sheets. Aquí solo se consultan.'),
        boton('Ver catálogo recibido', 'resumen', 'c-azul ancho-total', () => { vista = 'catalogo'; pintar(); }),
        boton('Actualizar lista de usuarios', 'enviar', 'c-azul ancho-total', async () => { const r = await actualizarUsuarios(true); toast(r.ok ? 'Lista de usuarios actualizada.' : r.message, 5000); })),
      esComputadora() ? tarjeta(h('h2', null, 'Impresora de 80 mm (esta computadora)'),
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
          }))) : null,
      tarjeta(h('h2', null, 'Copia de seguridad'),
        h('p', { class: 'nota' }, 'Los datos de este dispositivo (comprobantes, recibos, movimientos y pendientes) se guardan solo en este navegador. Contiene el token de la hoja.'),
        h('div', { class: 'pila' }, boton('Guardar copia de seguridad', 'compartir', 'c-verde ancho-total', exportar), boton('Restaurar una copia', 'enviar', 'c-rojo ancho-total', importar))),
      tarjeta(h('h2', null, '🧪 Modo de pruebas'),
        h('p', { class: 'nota' }, modoPruebas
          ? 'ACTIVO. Todo lo que haga en este modo queda separado de los datos reales (números, comprobantes, catálogo y hoja de Google propios). Los tiquetes salen marcados «PRUEBA».'
          : 'Para practicar sin tocar los datos reales: usa números, comprobantes y hoja de Google propios, y los tiquetes salen marcados «PRUEBA». Puede volver al modo real cuando quiera.'),
        boton(modoPruebas ? 'Volver al modo REAL' : 'Entrar al modo de pruebas', 'ajustes', modoPruebas ? 'c-verde ancho-total' : 'c-ambar ancho-total', cambiarDeModo)),
      tarjeta(h('h2', null, 'Empezar de cero en este dispositivo'),
        h('p', { class: 'nota' }, `Borra todos los comprobantes, recibos, movimientos de boletos y envíos pendientes de ${modoPruebas ? 'el modo de pruebas' : 'este dispositivo'} y reinicia la numeración (C-0001, R-0001, B-0001). No toca el catálogo, la configuración ni la hoja de Google.`),
        boton('Borrar datos y reiniciar números', 'borrar', 'c-rojo ancho-total', empezarDeCero))
    );
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
  async function infoAlmacenamiento() {
    const el = raiz.querySelector('#info-almacen'); if (!el) return;
    try {
      const persistente = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
      el.textContent = persistente === true ? 'Almacenamiento protegido por el navegador: sí.' : persistente === false ? 'Almacenamiento protegido por el navegador: no (haga copias de seguridad).' : '';
    } catch { /* nada */ }
  }

  // ----- Sincronización -----
  function vistaSync() {
    raiz.append(banda('Sincronización'));
    const volver = () => { vista = 'admin'; desbloqueado = false; pintar(); };
    raiz.append(h('button', { type: 'button', class: 'btn-texto volver', onclick: volver }, '‹ Volver'));
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
    raiz.append(banda('Catálogo'), h('button', { type: 'button', class: 'btn-texto volver', onclick: () => { vista = 'admin'; pintar(); } }, '‹ Volver'));
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
