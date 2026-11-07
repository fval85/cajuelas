// Ajustes › Precios del registro (administradores o permiso «Precios»): el precio de la cajuela que sale para elegir en Registro.
// Los recibos ya hechos guardan el precio con el que se hicieron: un cambio nunca los modifica.
import { h, clear, toast, confirmar } from './util.js';
import { cat } from './store.js';
import { preciosAdmin } from './sync.js';
import { cabSub } from './ui.js';

const fmtMoney = (p) => '₡' + Number(p).toLocaleString('es-CR', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
export const textoPrecioHoy = () => (cat.precios.length ? 'Hoy: ' + cat.precios.map((p) => fmtMoney(p)).join(' y ') : 'Sin precios todavía');
const dma = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const dmaHora = (t) => (t ? `${dma(t)} ${t.slice(11, 16)}` : '');

export function pintarPrecios({ raiz, irInicio, alGuardar }) {
  let datos = null, cargando = false, error = '', pantalla = 'lista';
  const chip = (t, c) => h('span', { class: 'chip-est ' + c }, t);
  const boton = (t, fn, cls = '') => h('button', { type: 'button', class: `btn-texto ${cls} ancho-total`, onclick: fn }, t);

  async function cargar() {
    cargando = true; error = ''; pintar();
    const r = await preciosAdmin('lista', {});
    cargando = false;
    if (r.ok && r.json && Array.isArray(r.json.enUso)) datos = r.json; else error = r.message || 'No se pudo cargar los precios.';
    pintar();
  }
  const ir = (p) => { pantalla = p; pintar(); };
  const atras = () => (pantalla === 'lista' ? irInicio() : ir('lista'));

  function pintar() {
    clear(raiz);
    raiz.append(cabSub({ lista: 'Precios del registro', nuevo: 'Nuevo precio', historial: 'Historial de precios' }[pantalla], atras));
    if (error) { raiz.append(h('p', { class: 'estado aviso' }, '⚠ ' + error), boton('Reintentar', cargar)); return; }
    if (!datos) { raiz.append(h('p', { class: 'nota' }, cargando ? 'Cargando…' : '')); return; }
    ({ lista, nuevo, historial })[pantalla]();
  }

  function lista() {
    raiz.append(boton('＋ Nuevo precio', () => ir('nuevo'), 'primario'),
      h('p', { class: 'nota' }, 'Estos son los precios que salen para elegir en cada línea de Registro.'));
    datos.enUso.forEach((x) => raiz.append(h('div', { class: 'fila-aj fila-usuario' },
      h('span', { class: 'tx' }, fmtMoney(x.precio), h('small', null, 'desde ' + dma(x.desde))), chip('EN USO', 'verde'),
      datos.enUso.length > 1 ? h('button', { type: 'button', class: 'btn-texto peligro', onclick: () => quitar(x) }, 'Quitar') : null)));
    datos.programados.forEach((x) => raiz.append(h('div', { class: 'fila-aj fila-usuario' },
      h('span', { class: 'tx' }, fmtMoney(x.precio), h('small', null, 'empieza ' + dmaHora(x.desde))), chip('PROGRAMADO', 'ambar'),
      h('button', { type: 'button', class: 'btn-texto peligro', onclick: () => quitar(x) }, 'Cancelar'))));
    datos.anteriores.slice(0, 5).forEach((x) => raiz.append(h('div', { class: 'fila-aj fila-usuario' },
      h('span', { class: 'tx' }, fmtMoney(x.precio), h('small', null, `del ${dma(x.desde)} al ${dma(x.hasta)}`)), chip('ANTERIOR', 'gris'))));
    raiz.append(boton('🕘 Ver historial de cambios', () => ir('historial')));
  }

  async function quitar(x) {
    if (!(await confirmar(`Quitar ${fmtMoney(x.precio)}`, 'Deja de salir en Registro. Los recibos ya hechos con ese precio no cambian.', { si: 'Quitar', peligro: true }))) return;
    const r = await preciosAdmin('quitar', { id: x.id });
    toast(r.message, 5000);
    if (r.ok) { alGuardar && alGuardar(); cargar(); }
  }

  function nuevo() {
    let cuando = 'ahora', modo = 'reemplazar';
    const precio = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', placeholder: 'Ej. 1900', autocomplete: 'off' });
    const actuales = datos.enUso.map((x) => fmtMoney(x.precio)).join(' y ');
    const opc = (grupo, valor, titulo, sub) => {
      const b = h('button', { type: 'button', class: 'opcion-sel', onclick: () => { if (grupo === 'cuando') cuando = valor; else modo = valor; marcar(); refrescarInfo(); } }, h('b', null, titulo), sub ? h('small', null, sub) : null);
      b.dataset.g = grupo; b.dataset.v = valor; return b;
    };
    const marcar = () => raiz.querySelectorAll('.opcion-sel').forEach((b) => b.classList.toggle('on', (b.dataset.g === 'cuando' ? cuando : modo) === b.dataset.v));
    const info = h('p', { class: 'nota' });
    const refrescarInfo = () => {
      const p = Number(String(precio.value).replace(',', '.')); const t = p > 0 ? fmtMoney(p) : 'el precio nuevo';
      info.textContent = (modo === 'reemplazar' ? `${t} reemplaza a ${actuales}` : `Salen ${actuales} y ${t} para elegir`) + (cuando === 'ahora' ? ', desde ahora.' : ', desde mañana a las 6:00 a. m.') + '\nLos recibos ya hechos no cambian. Los teléfonos lo reciben al sincronizar.';
    };
    precio.addEventListener('input', refrescarInfo);
    raiz.append(h('label', { class: 'etiqueta' }, 'Precio por cajuela (₡)'), precio,
      h('label', { class: 'etiqueta' }, 'Vale desde'), h('div', { class: 'fila-opc' }, opc('cuando', 'ahora', 'Ahora', 'apenas se guarda'), opc('cuando', 'manana', 'Mañana', 'desde las 6:00 a. m.')),
      h('label', { class: 'etiqueta' }, '¿Qué pasa con el precio anterior?'),
      opc('modo', 'reemplazar', 'Reemplazarlo', `${actuales} deja de salir en Registro`), opc('modo', 'ambos', 'Dejar los dos', `salen ${actuales} y el nuevo para elegir`), info,
      boton('Guardar precio', async () => {
        const p = Number(String(precio.value).replace(',', '.'));
        if (!(p > 0)) return toast('Escriba el precio.');
        const ok = await confirmar(`Cambiar el precio a ${fmtMoney(p)}`, info.textContent, { si: 'Guardar precio' });
        if (!ok) return;
        const r = await preciosAdmin('nuevo', { precio: String(p), cuando, modo });
        toast(r.message, 6000);
        if (r.ok) { alGuardar && alGuardar(); await cargar(); ir('lista'); }
      }, 'primario'), boton('Cancelar', () => ir('lista')));
    marcar(); refrescarInfo();
  }

  function historial() {
    if (!datos.historial.length) raiz.append(h('p', { class: 'nota' }, 'Todavía no hay cambios.'));
    datos.historial.forEach((x) => {
      const t = x.antes ? `${x.antes} → ${x.despues}` : `${x.accion.replace('Precio: ', 'Precio ')}: ${x.despues || x.antes}`;
      raiz.append(h('div', { class: 'fila-aj fila-usuario' }, h('span', { class: 'tx' }, t, h('small', null, `${x.cuando} · ${x.quien}`))));
    });
  }
  cargar();
}
