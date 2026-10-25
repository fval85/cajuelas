import { h, VERSION, toast } from './util.js';
import { cargarCatalogo, cargarBoletosCat, pedirAlmacenamientoPersistente, configurado, limpiarPantallas, modoPruebas } from './store.js';
import { cargarFuentes } from './draw.js';
import { cuantosPendientes, enviarPendientes, alCambiarPendientes, iniciarReintentos } from './sync.js';
import { crearRegistro } from './ui_registro.js';
import { crearDiario } from './ui_diario.js';
import { crearBoletos } from './ui_boletos.js';
import { crearReportes } from './ui_reportes.js';
import { crearAjustes, actualizarCatalogo } from './ui_ajustes.js';
import { icono } from './ui.js';
import { hayControl, puede, necesitaLogin, pantallaLogin, cerrarLogin, alCambiarSesion, actualizarUsuarios, sesion } from './users.js';

// Cada vez que se abre la app las pantallas empiezan limpias (salvo al actualizar o restaurar una copia).
let conservar = false;
try { conservar = sessionStorage.getItem('cajuelas.conservar') === '1'; sessionStorage.removeItem('cajuelas.conservar'); } catch { /* nada */ }
if (!conservar) limpiarPantallas();
const LIMPIAR_TRAS_MIN = 5; // minutos fuera de la app para empezar de cero al volver
let salioA = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') salioA = Date.now();
  else if (salioA && Date.now() - salioA > LIMPIAR_TRAS_MIN * 60000) { salioA = 0; location.reload(); }
});
cargarCatalogo();
cargarBoletosCat();
pedirAlmacenamientoPersistente();

const app = document.getElementById('app');
const barra = h('div', { id: 'barra-estado', hidden: true });
const contenido = h('main', { id: 'contenido' });
const tabs = h('nav', { id: 'tabs', role: 'tablist' });
app.append(barra, contenido, tabs);
if (modoPruebas) app.prepend(h('div', { id: 'banner-pruebas' }, '🧪 MODO DE PRUEBAS · los datos no son reales'));

const nav = {
  pendientes() { pintarBarra(); },
  catalogoCambio() { paginas.forEach((p) => p.refrescar && p.refrescar()); }
};
const paginas = [crearRegistro(nav), crearDiario(nav), crearBoletos(nav), crearReportes(nav), crearAjustes(nav)];
const nombres = [['Registro', 'registro'], ['Diario', 'diario'], ['Boletos', 'boletos'], ['Reportes', 'reportes'], ['Ajustes', 'ajustes']];
const permisoTab = ['registro', 'diario', 'boletos', 'reportes', null];
const TAB_AJUSTES = 4;
let actual = 0;
function ir(i) {
  const actualAntes = actual;
  if (permisoTab[i] && !puede(permisoTab[i])) i = primeraPermitida();
  actual = i;
  paginas.forEach((p, k) => { p.el.hidden = k !== i; });
  [...tabs.children].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
  if (paginas[i].reiniciar && i !== actualAntes) paginas[i].reiniciar(); else if (paginas[i].refrescar) paginas[i].refrescar();
  window.scrollTo(0, 0);
  aplicarPermisos();
  if (!hayControl() || sesion()) { try { localStorage.setItem('cajuelas.tab', String(i)); } catch { /* nada */ } }
}
nombres.forEach(([t, ic], i) => tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => ir(i) }, icono(ic, 24), h('span', null, t))));
paginas.forEach((p) => contenido.append(p.el));
function primeraPermitida() { const k = permisoTab.findIndex((p) => !p || puede(p)); return k < 0 ? TAB_AJUSTES : k; }
/** Muestra u oculta pestañas y botones según los permisos del usuario que entró. */
function aplicarPermisos() {
  [...tabs.children].forEach((b, k) => { b.hidden = !!permisoTab[k] && !puede(permisoTab[k]); });
  document.querySelectorAll('[data-permiso]').forEach((el) => { el.hidden = !puede(el.dataset.permiso); });
  document.querySelectorAll('.fila-botones').forEach((f) => {
    const vis = [...f.children].filter((x) => !x.hidden).length;
    f.hidden = vis === 0;
    if (vis) f.style.gridTemplateColumns = `repeat(${vis}, 1fr)`;
  });
  document.querySelectorAll('.banda').forEach((b) => b.pintarUsuario && b.pintarUsuario());
  if (permisoTab[actual] && !puede(permisoTab[actual])) ir(primeraPermitida());
}
function revisarAcceso() {
  if (necesitaLogin()) pantallaLogin(); else cerrarLogin();
  aplicarPermisos();
  paginas.forEach((p) => p.refrescar && p.refrescar());
  aplicarPermisos();
}
let programado = false;
new MutationObserver(() => {
  if (programado) return;
  programado = true;
  requestAnimationFrame(() => { programado = false; aplicarPermisos(); });
}).observe(contenido, { childList: true, subtree: true });
ir(0);
alCambiarSesion(() => {
  revisarAcceso();
  if (sesion()) ir(primeraPermitida());
});
revisarAcceso();
actualizarUsuarios(true).then(() => revisarAcceso());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') actualizarUsuarios().then(() => revisarAcceso()); });
setInterval(() => actualizarUsuarios().then(() => revisarAcceso()), 5 * 60000);

// ----- Barra de estado: envíos pendientes -----
function pintarBarra() {
  const n = cuantosPendientes();
  barra.hidden = n === 0;
  barra.textContent = n ? `⏳ ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar a Google Sheets. Toque para enviar ahora.` : '';
}
barra.addEventListener('click', async () => {
  if (!configurado()) return toast('Configure la URL y el token en Ajustes > Administración.', 5000);
  const r = await enviarPendientes();
  if (r.error) toast(`Quedan ${r.restantes} pendientes. ${r.error}`, 6000); else toast('Todo enviado a Google Sheets.');
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
