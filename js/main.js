import { h, VERSION, toast, clear, dialogo } from './util.js';
import { cargarCatalogo, cargarBoletosCat, pedirAlmacenamientoPersistente, configurado, limpiarPantallas, modoPruebas } from './store.js';
import { cargarFuentes } from './draw.js';
import { cuantosPendientes, enviarPendientes, alCambiarPendientes, iniciarReintentos } from './sync.js';
import { crearRegistro } from './ui_registro.js';
import { crearDiario } from './ui_diario.js';
import { crearBoletos } from './ui_boletos.js';
import { crearReportes } from './ui_reportes.js';
import { crearPlanillas } from './ui_planillas.js';
import { MODULOS, modulo, permitidos, distribucion } from './nav_barra.js';
import { saldoPendienteHoy, HORA_SALDO } from './avisos.js';
import { crearAjustes, actualizarCatalogo } from './ui_ajustes.js';
import { icono } from './ui.js';
import { aplicarApariencia, tabInicio } from './apariencia.js';
import { hayControl, puede, necesitaLogin, pantallaLogin, cerrarLogin, alCambiarSesion, actualizarUsuarios, sesion } from './users.js';

window.addEventListener('cajuelas-sesion-invalida', () => { toast('La sesión venció. Vuelva a entrar.', 4000); setTimeout(() => location.reload(), 1200); });
window.addEventListener('cajuelas-url', () => toast('La dirección de la hoja se actualizó sola.', 5000));
// Cada vez que se abre la app las pantallas empiezan limpias (salvo al actualizar o restaurar una copia).
let conservar = false;
try { conservar = sessionStorage.getItem('cajuelas.conservar') === '1'; sessionStorage.removeItem('cajuelas.conservar'); } catch { /* nada */ }
if (!conservar) limpiarPantallas();
// Al arrastrar hacia abajo para actualizar (recarga de la página) se queda en la misma pestaña.
let tabRecarga = null;
try {
  const nav0 = performance.getEntriesByType('navigation')[0];
  if (nav0 && nav0.type === 'reload') { const g = localStorage.getItem('cajuelas.tab'); if (g && modulo(g)) tabRecarga = g; }
} catch { /* nada */ }
const LIMPIAR_TRAS_MIN = 5; // minutos fuera de la app para empezar de cero al volver
let salioA = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') salioA = Date.now();
  else if (salioA && Date.now() - salioA > LIMPIAR_TRAS_MIN * 60000) { salioA = 0; location.reload(); }
});
cargarCatalogo();
cargarBoletosCat();
pedirAlmacenamientoPersistente();

aplicarApariencia(); window.addEventListener('load', aplicarApariencia);
const app = document.getElementById('app');
const barra = h('div', { id: 'barra-estado', hidden: true });
const barraSaldo = h('div', { id: 'barra-saldo', hidden: true, role: 'button' }, `🎟 Ya pasaron las ${HORA_SALDO - 12}:00 pm y falta registrar el saldo de boletos de hoy. Toque para hacerlo.`);
barraSaldo.addEventListener('click', () => { barraSaldo.hidden = true; ir('boletos'); });
const contenido = h('main', { id: 'contenido' });
const tabs = h('nav', { id: 'tabs', role: 'tablist' });
app.append(barra, barraSaldo, contenido, tabs);
if (modoPruebas) app.prepend(h('div', { id: 'banner-pruebas' }, '🧪 MODO DE PRUEBAS · los datos no son reales'));

// Sin zoom con los dedos (solo se puede ampliar dentro de los reportes y PDF).
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1 && !e.target.closest('.visor')) e.preventDefault(); }, { passive: false });
const nav = {
  pendientes() { pintarBarra(); },
  catalogoCambio() { Object.values(paginas).forEach((p) => p.refrescar && p.refrescar()); },
  barraCambio() { pintarTabs(true); },
  ir(k) { ir(k); }
};
const paginas = {
  registro: crearRegistro(nav), diario: crearDiario(nav), boletos: crearBoletos(nav), reportes: crearReportes(nav),
  planillas: crearPlanillas(nav), ajustes: crearAjustes(nav)
};
let actual = 'registro';
const moduloPermitido = (k) => { const m = modulo(k); return !!m && (!m.permiso || puede(m.permiso)); };
function primeraPermitida() { const d = distribucion(); const k = d.barra[0] || (permitidos()[0] || {}).k; return k || 'ajustes'; }
function ir(k) {
  const actualAntes = actual;
  if (!moduloPermitido(k)) k = primeraPermitida();
  actual = k;
  Object.entries(paginas).forEach(([kk, p]) => { p.el.hidden = kk !== k; });
  pintarTabs();
  const pg = paginas[k];
  if (pg.reiniciar && k !== actualAntes) pg.reiniciar(); else if (pg.refrescar) pg.refrescar();
  window.scrollTo(0, 0);
  aplicarPermisos();
  if (!hayControl() || sesion()) { try { localStorage.setItem('cajuelas.tab', k); } catch { /* nada */ } }
}
// ----- Barra inferior: módulos de «distribucion()» (4 + «Más» cuando no caben) -----
let firmaTabs = '';
function abrirMas(claves) {
  const caja = h('div', { class: 'mas-grid' }, ...claves.map((k) => { const m = modulo(k); return h('button', { type: 'button', class: 'mas-item' + (k === actual ? ' on' : ''), onclick: () => { api.cerrar(); ir(k); } }, icono(m.ic, 30), h('span', null, m.n)); }));
  const api = dialogo({ titulo: 'Más', cuerpo: [caja], botones: [{ texto: 'Cerrar' }] });
}
function pintarTabs(forzar = false) {
  const d = distribucion();
  const firma = d.barra.join(',') + '|' + d.mas.join(',') + '|' + actual;
  if (!forzar && firma === firmaTabs) return;
  firmaTabs = firma;
  clear(tabs);
  d.barra.forEach((k) => { const m = modulo(k); tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab' + (k === actual ? ' on' : ''), 'aria-selected': String(k === actual), onclick: () => ir(k) }, icono(m.ic, 24), h('span', null, m.n))); });
  if (d.mas.length) tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab' + (d.mas.includes(actual) ? ' on' : ''), onclick: () => abrirMas(d.mas) }, icono('mas', 24), h('span', null, 'Más')));
}
Object.values(paginas).forEach((p) => contenido.append(p.el));
/** Muestra u oculta botones según los permisos del usuario que entró. */
function aplicarPermisos() {
  pintarTabs();
  document.querySelectorAll('[data-permiso]').forEach((el) => { el.hidden = !puede(el.dataset.permiso); });
  document.querySelectorAll('.fila-botones').forEach((f) => {
    const vis = [...f.children].filter((x) => !x.hidden).length;
    f.hidden = vis === 0;
    if (vis) f.style.gridTemplateColumns = `repeat(${vis}, 1fr)`;
  });
  document.querySelectorAll('.banda').forEach((b) => b.pintarUsuario && b.pintarUsuario());
  if (!moduloPermitido(actual)) ir(primeraPermitida());
}
function revisarAcceso() {
  if (necesitaLogin()) pantallaLogin(); else cerrarLogin();
  aplicarPermisos();
  Object.values(paginas).forEach((p) => p.refrescar && p.refrescar());
  aplicarPermisos();
}
let programado = false;
new MutationObserver(() => {
  if (programado) return;
  programado = true;
  requestAnimationFrame(() => { programado = false; aplicarPermisos(); });
}).observe(contenido, { childList: true, subtree: true });
const tabArranque = () => { const t = tabRecarga || tabInicio(); tabRecarga = null; return t && moduloPermitido(t) ? t : primeraPermitida(); };
ir(primeraPermitida());
alCambiarSesion(() => {
  revisarAcceso();
  if (sesion()) ir(tabArranque());
});
revisarAcceso();
if ((tabInicio() || tabRecarga) && !necesitaLogin()) ir(tabArranque());
actualizarUsuarios(true).then(() => revisarAcceso());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') actualizarUsuarios().then(() => revisarAcceso()); });
setInterval(() => actualizarUsuarios().then(() => revisarAcceso()), 5 * 60000);

// ----- Recordatorio del saldo (a partir de las 7:00 pm) -----
function revisarSaldo() { barraSaldo.hidden = necesitaLogin() || !saldoPendienteHoy(); }
revisarSaldo();
setInterval(revisarSaldo, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisarSaldo(); });
alCambiarSesion(revisarSaldo);

// ----- Barra de estado: envíos pendientes -----
function pintarBarra() {
  const n = cuantosPendientes();
  barra.hidden = n === 0;
  barra.textContent = n ? `⏳ ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar. Toque para enviar ahora.` : '';
}
barra.addEventListener('click', async () => {
  if (!configurado()) return toast('Configure la URL y el token en Ajustes > Administración.', 5000);
  const r = await enviarPendientes();
  if (r.error) toast(`Quedan ${r.restantes} pendientes. ${r.error}`, 6000); else toast('Todo enviado.');
});
alCambiarPendientes(pintarBarra);
pintarBarra();
iniciarReintentos();

// ----- Fuentes y catálogo -----
cargarFuentes();
actualizarCatalogo(false, () => nav.catalogoCambio());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') actualizarCatalogo(false, () => nav.catalogoCambio()); });

// ----- Aviso para instalar en iPhone -----
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let visto = false;
try { visto = localStorage.getItem('cajuelas.tip_instalar') === '1'; } catch { /* nada */ }
if (esIOS && !instalada && !visto) {
  const tip = h('div', { class: 'tip' }, h('p', null, 'Para instalarla en el iPhone: toque el botón Compartir (el cuadro con la flecha) y elija «Añadir a pantalla de inicio».'),
    h('button', { type: 'button', class: 'btn-texto primario', onclick: () => { tip.remove(); try { localStorage.setItem('cajuelas.tip_instalar', '1'); } catch { /* nada */ } } }, 'Entendido'));
  app.prepend(tip);
}

// ----- Service worker y actualizaciones -----
function avisoActualizacion() {
  if (document.getElementById('aviso-act')) return;
  app.prepend(h('div', { id: 'aviso-act', class: 'tip' }, h('p', null, 'Hay una versión nueva de la aplicación.'),
    h('button', { type: 'button', class: 'btn-texto primario', onclick: () => { try { sessionStorage.setItem('cajuelas.conservar', '1'); } catch { /* nada */ } location.reload(); } }, 'Actualizar ahora')));
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.tipo === 'actualizada') avisoActualizacion(); });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    window.__buscarActualizacion = async () => {
      toast('Buscando actualización…', 2000);
      try {
        await reg.update();
        setTimeout(() => { if (!document.getElementById('aviso-act')) toast(`Ya tiene la última versión (${VERSION}).`); }, 2500);
      } catch { toast('No se pudo buscar (sin conexión).'); }
    };
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
