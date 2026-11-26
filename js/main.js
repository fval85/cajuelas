import { h, VERSION, toast, clear, dialogo } from './util.js';
import { cargarCatalogo, cargarBoletosCat, pedirAlmacenamientoPersistente, configurado, limpiarPantallas, modoPruebas } from './store.js';
import { cargarFuentes } from './draw.js';
import { cuantosPendientes, enviarPendientes, alCambiarPendientes, iniciarReintentos, latido, latidoPronto } from './sync.js';
import { crearRegistro } from './ui_registro.js';
import { crearDiario } from './ui_diario.js';
import { crearBoletos } from './ui_boletos.js';
import { crearReportes } from './ui_reportes.js';
import { crearPlanillas } from './ui_planillas.js';
import { modulo } from './nav_barra.js';
import { crearInicio } from './ui_inicio.js';
import { crearAjustes, actualizarCatalogo } from './ui_ajustes.js';
import { iniciarAtras } from './atras.js';
import { aplicarApariencia } from './apariencia.js';
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
const contenido = h('main', { id: 'contenido' });
app.append(barra, contenido);
if (modoPruebas) app.prepend(h('div', { id: 'banner-pruebas' }, '🧪 MODO DE PRUEBAS · los datos no son reales'));

// Sin zoom con los dedos (solo se puede ampliar dentro de los reportes y PDF).
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1 && !e.target.closest('.visor')) e.preventDefault(); }, { passive: false });
const nav = {
  pendientes() { pintarBarra(); if (actual === 'inicio') paginas.inicio.refrescar(); },
  catalogoCambio() { Object.values(paginas).forEach((p) => p.refrescar && p.refrescar()); },
  ir(k) { ir(k); }
};
const paginas = {
  inicio: crearInicio(nav), registro: crearRegistro(nav), diario: crearDiario(nav), boletos: crearBoletos(nav), reportes: crearReportes(nav),
  planillas: crearPlanillas(nav), ajustes: crearAjustes(nav)
};
let actual = 'inicio';
const moduloPermitido = (k) => { if (k === 'inicio') return true; const m = modulo(k); return !!m && (!m.permiso || puede(m.permiso)); };
const primeraPermitida = () => 'inicio';
function ir(k) {
  const actualAntes = actual;
  if (!moduloPermitido(k)) k = primeraPermitida();
  actual = k;
  Object.entries(paginas).forEach(([kk, p]) => { p.el.hidden = kk !== k; });
  const pg = paginas[k];
  if (pg.reiniciar && k !== actualAntes) pg.reiniciar(); else if (pg.refrescar) pg.refrescar();
  window.scrollTo(0, 0);
  aplicarPermisos();
  if (!hayControl() || sesion()) { try { localStorage.setItem('cajuelas.tab', k); } catch { /* nada */ } }
}
Object.values(paginas).forEach((p) => contenido.append(p.el));
/** Muestra u oculta botones según los permisos del usuario que entró. */
function aplicarPermisos() {
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
const tabArranque = () => { const t = tabRecarga; tabRecarga = null; return t && moduloPermitido(t) ? t : primeraPermitida(); };
ir(primeraPermitida());
alCambiarSesion(() => {
  revisarAcceso();
  if (sesion()) { ir(tabArranque()); setTimeout(() => latido(true), 2500); }
});
revisarAcceso();
if (tabRecarga && !necesitaLogin()) ir(tabArranque());
actualizarUsuarios(true).then(() => revisarAcceso());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') actualizarUsuarios().then(() => revisarAcceso()); });
setInterval(() => actualizarUsuarios().then(() => revisarAcceso()), 5 * 60000);

iniciarAtras({ pestanaActual: () => actual, pestanaPrincipal: primeraPermitida, irAPestana: (k) => ir(k), hayLogin: necesitaLogin });

// ----- Inicio: botón de casa de cada módulo y avisos del día (saldo de boletos y planilla pendiente) -----
window.addEventListener('cajuelas-inicio', () => ir('inicio'));
const refrescarInicio = () => { if (actual === 'inicio') paginas.inicio.refrescar(); };
setInterval(refrescarInicio, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refrescarInicio(); });
alCambiarSesion(refrescarInicio);

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
// Aviso de conexión (versión, última vez y pendientes) para el administrador: al abrir, al volver a la app y cada 10 minutos.
alCambiarPendientes(latidoPronto);
setTimeout(() => latido(true), 4000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') latido(); });
setInterval(() => latido(), 10 * 60000);

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
