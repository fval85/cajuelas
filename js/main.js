import { h, VERSION, toast } from './util.js';
import { cargarCatalogo, cargarBoletosCat, pedirAlmacenamientoPersistente, configurado } from './store.js';
import { cargarFuentes } from './draw.js';
import { cuantosPendientes, enviarPendientes, alCambiarPendientes, iniciarReintentos } from './sync.js';
import { crearRegistro } from './ui_registro.js';
import { crearDiario } from './ui_diario.js';
import { crearBoletos } from './ui_boletos.js';
import { crearAjustes, actualizarCatalogo } from './ui_ajustes.js';
import { icono } from './ui.js';

cargarCatalogo();
cargarBoletosCat();
pedirAlmacenamientoPersistente();

const app = document.getElementById('app');
const barra = h('div', { id: 'barra-estado', hidden: true });
const contenido = h('main', { id: 'contenido' });
const tabs = h('nav', { id: 'tabs', role: 'tablist' });
app.append(barra, contenido, tabs);

const nav = {
  pendientes() { pintarBarra(); },
  catalogoCambio() { paginas.forEach((p) => p.refrescar && p.refrescar()); }
};
const paginas = [crearRegistro(nav), crearDiario(nav), crearBoletos(nav), crearAjustes(nav)];
const nombres = [['Registro', 'registro'], ['Diario', 'diario'], ['Boletos', 'boletos'], ['Ajustes', 'ajustes']];
let actual = 0;
function ir(i) {
  actual = i;
  paginas.forEach((p, k) => { p.el.hidden = k !== i; });
  [...tabs.children].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
  if (paginas[i].refrescar) paginas[i].refrescar();
  window.scrollTo(0, 0);
  try { localStorage.setItem('cajuelas.tab', String(i)); } catch { /* nada */ }
}
nombres.forEach(([t, ic], i) => tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => ir(i) }, icono(ic, 24), h('span', null, t))));
paginas.forEach((p) => contenido.append(p.el));
let inicial = 0;
try { inicial = Number(localStorage.getItem('cajuelas.tab')) || 0; } catch { /* nada */ }
ir(inicial >= 0 && inicial < 4 ? inicial : 0);

// ----- Barra de estado: envíos pendientes -----
function pintarBarra() {
  const n = cuantosPendientes();
  barra.hidden = n === 0;
  barra.textContent = n ? `⏳ ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'} de enviar a Google Sheets. Toque para enviar ahora.` : '';
}
barra.addEventListener('click', async () => {
  if (!configurado()) return toast('Configure la URL y el token en Ajustes > Sincronización.', 5000);
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
    h('button', { type: 'button', class: 'btn-texto primario', onclick: () => location.reload() }, 'Actualizar ahora')));
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
