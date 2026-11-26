// Pantalla de inicio (desde 2.27.0 reemplaza la barra de abajo): un icono por módulo. Todos ven todos los iconos,
// pero solo entran a los que tienen permiso; los demás salen con candado y van al final.
import { h, clear, toast, VERSION } from './util.js';
import { banda, icono } from './ui.js';
import { ordenInicio } from './nav_barra.js';
import { saldoPendienteHoy, planillasPendientesHoy } from './avisos.js';
import { pendientes } from './sync.js';

export function crearInicio(nav) {
  const raiz = h('div', { class: 'pagina' });

  /** Texto corto bajo cada icono (envíos sin enviar o recordatorios del día). */
  function estado(k, plan) {
    const cola = pendientes();
    const n = (f) => cola.filter(f).length;
    let c = 0, txt = '';
    if (k === 'registro') c = n((p) => !p.formato || !['recibo', 'boleto', 'planilla'].includes(p.formato));
    else if (k === 'diario') c = n((p) => p.formato === 'recibo');
    else if (k === 'boletos') { c = n((p) => p.formato === 'boleto'); if (!c && saldoPendienteHoy()) return 'Falta el saldo'; }
    else if (k === 'planillas') { c = n((p) => p.formato === 'planilla'); if (!c && plan.length) return 'Falta enviar hoy'; }
    if (c) txt = `${c} sin enviar`;
    return txt;
  }

  function pintar() {
    clear(raiz);
    raiz.append(banda('Registro de Cajuelas', { sinCasa: true }));
    // Avisos del día
    const avisos = [];
    if (saldoPendienteHoy()) avisos.push({ t: '🎟 Ya pasaron las 3:00 pm y falta registrar el saldo de boletos de hoy. Toque para hacerlo.', k: 'boletos' });
    const plan = planillasPendientesHoy();
    if (plan.length) avisos.push({ t: `📋 Falta enviar la planilla de hoy${plan.length === 1 ? ': ' + plan[0] : ' (' + plan.length + ' fincas)'}. Toque para hacerlo.`, k: 'planillas' });
    avisos.forEach((a) => raiz.append(h('button', { type: 'button', class: 'ini-aviso', onclick: () => nav.ir(a.k) }, a.t)));
    // Iconos: permitidos primero, luego bloqueados
    const { permitidos, bloqueados } = ordenInicio();
    const tile = (m, ok) => h('button', { type: 'button', class: 'ini-tile' + (ok ? '' : ' bloq'), 'aria-disabled': ok ? null : 'true', 'aria-label': ok ? m.n : `${m.n} (sin permiso)`,
      onclick: () => (ok ? nav.ir(m.k) : toast(`No tiene permiso para entrar a ${m.n}. Pídaselo a un administrador.`, 4500)) },
      ok ? null : h('span', { class: 'ini-cand' }, icono('candado', 16)),
      h('span', { class: 'ini-ic' }, icono(m.ic, 40)), h('b', null, m.n),
      ok && estado(m.k, plan) ? h('small', null, estado(m.k, plan)) : null);
    raiz.append(h('div', { class: 'ini-grid' }, ...permitidos.map((m) => tile(m, true)), ...bloqueados.map((m) => tile(m, false))));
    raiz.append(h('p', { class: 'ini-ver' }, 'Versión ' + VERSION));
  }

  return { el: raiz, refrescar: pintar };
}
