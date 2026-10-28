// Piezas compartidas de filtros (Café recibido y Ventas de exportación): barra compacta, hoja de filtros y filtros guardados.
import { h, clear, dialogo, formulario, toast, confirmar } from './util.js';
import { db } from './store.js';

/** Filtros guardados por pantalla: [{n, est}] (est = estado de filtros que la pantalla sabe aplicar). */
export function guardadosDe(clave) {
  const k = 'filtros_guardados_' + clave;
  return {
    lista: () => db.get(k, []),
    agregar(n, est) { const l = db.get(k, []).filter((x) => x.n !== n); l.push({ n, est }); db.set(k, l); },
    quitar(n) { db.set(k, db.get(k, []).filter((x) => x.n !== n)); }
  };
}

/**
 * Barra compacta: [📅 periodo ▾] [⚙ Filtros (n)] + segmento rápido + filtros guardados + chips activos.
 * Devuelve {el, pintar(cfg)}; cfg: {periodo, nFiltros, onPeriodo, onFiltros, segmento:{opciones:[{t,on,click}]}, guardados:[{n,on,click}], activos:[{t,quitar,abrir}], onLimpiar}
 */
export function barraCompacta() {
  const el = h('div', { class: 'barra-compacta' });
  return {
    el,
    pintar(c) {
      clear(el);
      const fila = h('div', { class: 'bc-fila' },
        c.onPeriodo ? h('button', { type: 'button', class: 'bc-btn', onclick: c.onPeriodo }, '📅 ', h('span', null, c.periodo), ' ▾') : null,
        h('button', { type: 'button', class: 'bc-btn' + (c.nFiltros ? ' on' : ''), onclick: c.onFiltros }, '⚙ Filtros' + (c.nFiltros ? ` (${c.nFiltros})` : '')));
      el.append(fila);
      if (c.segmento) el.append(h('div', { class: 'seg', role: 'group' }, ...c.segmento.opciones.map((o) => h('button', { type: 'button', class: o.on ? 'on' : '', onclick: o.click }, o.t))));
      if (c.guardados && c.guardados.length) el.append(h('div', { class: 'chips chicas guardados' }, ...c.guardados.map((g) => h('button', { type: 'button', class: 'chip' + (g.on ? ' on' : ''), onclick: g.click }, '★ ' + g.n))));
      if (c.activos && c.activos.length) {
        el.append(h('div', { class: 'chips envuelve chicas filtros-activos' },
          ...c.activos.map((a) => h('span', { class: 'chip on con-x' },
            h('button', { type: 'button', class: 'txt', onclick: a.abrir }, a.t),
            h('button', { type: 'button', class: 'x', 'aria-label': 'Quitar ' + a.t, onclick: a.quitar }, '✕'))),
          h('button', { type: 'button', class: 'btn-texto limpiar', onclick: c.onLimpiar }, 'Limpiar')));
      }
    }
  };
}

/**
 * Hoja inferior de filtros. filas(): [{t, valor, on, abrir}], contar(): texto del botón, guardar(): estado a guardar,
 * guardados: guardadosDe(...), aplicar(est): aplica un guardado, limpiar(), alCerrar().
 */
export function hojaFiltros({ titulo = 'Filtros', filas, contar, guardados, guardable, aplicar, limpiar, alCerrar }) {
  const lista = h('div', { class: 'hoja-filas' });
  const etq = h('div', { class: 'etiqueta' }, 'Mis filtros guardados');
  const gcont = h('div', { class: 'chips envuelve chicas guardados' });
  const pintar = () => {
    clear(lista); clear(gcont);
    filas().forEach((x) => lista.append(h('button', { type: 'button', class: 'hoja-fila' + (x.on ? ' on' : ''), onclick: async () => { await x.abrir(); pintar(); } },
      h('span', null, x.t), h('b', null, x.valor), h('i', null, '›'))));
    const gs = guardados ? guardados.lista() : [];
    gs.forEach((g) => gcont.append(h('span', { class: 'chip con-x' },
      h('button', { type: 'button', class: 'txt', onclick: () => { aplicar(g.est); pintar(); } }, '★ ' + g.n),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Borrar el filtro guardado ' + g.n, onclick: async () => { if (await confirmar('Borrar filtro guardado', `¿Borrar «${g.n}»?`, { si: 'Borrar', peligro: true })) { guardados.quitar(g.n); pintar(); } } }, '✕'))));
    gcont.hidden = !gs.length; if (etq) etq.hidden = !gs.length;
    if (btn) btn.textContent = contar();
  };
  const guardar = h('button', { type: 'button', class: 'btn-texto ancho', onclick: async () => {
    const v = await formulario('Guardar este filtro', [{ etiqueta: 'Nombre', placeholder: 'Ej. Internos 26-27', mayus: true }], { ok: 'Guardar', validar: (x) => (x[0] ? null : 'Escriba un nombre.') });
    if (!v) return;
    guardados.agregar(v[0], guardable()); toast(`Filtro «${v[0]}» guardado.`); pintar();
  } }, '★ Guardar este filtro');
  const d = dialogo({
    titulo,
    cuerpo: [guardados ? etq : null, guardados ? gcont : null, lista, guardados ? guardar : null],
    botones: [{ texto: 'Limpiar', onclick: () => { limpiar(); } }, { texto: '', clase: 'primario' }]
  });
  d.caja.classList.add('hoja');
  const btn = d.caja.querySelector('.btn-texto.primario');
  d.alCerrar = () => { if (alCerrar) alCerrar(); };
  pintar();
  return d;
}

/** Elige un periodo: Hoy / Esta semana / Este mes / Toda la cosecha / Rango. Devuelve {per, desde, hasta} o null. */
export function elegirPeriodo({ actual, desde, hasta, ref, inicioCosecha }) {
  return new Promise((res) => {
    let hecho = false;
    const op = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['cosecha', 'Toda la cosecha'], ['rango', 'Rango de fechas…']];
    const iD = h('input', { class: 'campo', type: 'date', value: desde || inicioCosecha || ref }), iH = h('input', { class: 'campo', type: 'date', value: hasta || ref });
    const caja = h('div', { hidden: actual !== 'rango' }, h('label', { class: 'etiqueta' }, 'Desde'), iD, h('label', { class: 'etiqueta' }, 'Hasta'), iH);
    let sel = actual;
    const lista = h('div', { class: 'lista' });
    const pintar = () => {
      clear(lista);
      op.forEach(([k, t]) => lista.append(h('button', { type: 'button', class: 'item opcion', role: 'radio', 'aria-checked': String(sel === k), onclick: () => {
        sel = k; caja.hidden = k !== 'rango';
        if (k !== 'rango') { hecho = true; d.cerrar(); res({ per: k }); } else pintar();
      } }, h('span', { class: 'cb' + (sel === k ? ' on' : ''), 'aria-hidden': 'true' }, sel === k ? '●' : ''), h('span', null, t))));
    };
    const d = dialogo({ titulo: 'Periodo', cuerpo: [lista, caja], botones: [{ texto: 'Cancelar' }, { texto: 'Aplicar rango', clase: 'primario', onclick: () => {
      if (sel !== 'rango') return false;
      if (!iD.value || !iH.value) { toast('Elija las dos fechas.'); return false; }
      const a = iD.value <= iH.value ? iD.value : iH.value, b = iD.value <= iH.value ? iH.value : iD.value;
      hecho = true; res({ per: 'rango', desde: a, hasta: b });
    } }] });
    d.alCerrar = () => { if (!hecho) res(null); };
    pintar();
  });
}
