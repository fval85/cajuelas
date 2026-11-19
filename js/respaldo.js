// Ajustes › Respaldo de datos (solo administradores): descarga TODO en un ZIP de archivos CSV (uno por tabla), sin entrar a Supabase.
import { h, clear, toast, diaHoy, VERSION } from './util.js';
import { db } from './store.js';
import { postJson } from './sync.js';
import { zip, descargar } from './files.js';
import { cabSub } from './ui.js';
import { sesion } from './users.js';

const p2 = (n) => String(n).padStart(2, '0');
/** Texto de una celda para CSV con «;» (el Excel en español lo abre en columnas). */
function celda(v) {
  if (v === null || v === undefined) return '';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
export const diasDesdeRespaldo = () => {
  const u = db.get('ultimo_respaldo', null);
  if (!u) return null;
  const d = new Date(u); if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};
export function textoUltimoRespaldo() {
  const n = diasDesdeRespaldo();
  return n === null ? 'Nunca se ha hecho en este dispositivo' : n === 0 ? 'Último respaldo: hoy' : `Último respaldo: hace ${n} día${n === 1 ? '' : 's'}`;
}

export function pintarRespaldo({ raiz, irInicio }) {
  let ocupado = false;
  const estado = h('p', { class: 'nota' });
  const barra = h('div', { class: 'progreso', role: 'progressbar' }, h('i', { style: 'width:0%' }));
  barra.hidden = true;
  const btn = h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: hacer }, '⬇ Descargar respaldo (ZIP)');
  const pintaUlt = () => { const n = diasDesdeRespaldo(); ult.textContent = textoUltimoRespaldo(); ult.className = 'nota' + (n === null || n >= 7 ? ' aviso' : ''); };
  const ult = h('p', { class: 'nota' });

  async function hacer() {
    if (ocupado) return;
    ocupado = true; btn.disabled = true; barra.hidden = false; estado.textContent = 'Preparando…';
    try {
      const t = await postJson('', { action: 'respaldo', op: 'tablas' }, 60000);
      if (!t.ok) throw new Error(t.message || 'No se pudo leer la lista de tablas.');
      const tablas = t.json.tablas;
      const total = tablas.reduce((s, x) => s + x.filas, 0) || 1;
      let hechas = 0; const entradas = [], resumen = [], avisos = [];
      for (const [i, tb] of tablas.entries()) {
        const filas = [tb.columnas.map(celda).join(';')];
        let leidas = 0;
        for (let off = 0; off < tb.filas; off += 1000) {
          estado.textContent = `Tabla ${i + 1} de ${tablas.length}: ${tb.tabla} (${leidas} de ${tb.filas})`;
          const r = await postJson('', { action: 'respaldo', op: 'filas', tabla: tb.tabla, desde: off, limite: 1000 }, 90000);
          if (!r.ok) throw new Error(`${tb.tabla}: ${r.message || 'falló la lectura'}`);
          r.json.filas.forEach((f) => filas.push(tb.columnas.map((c) => celda(f[c])).join(';')));
          leidas += r.json.filas.length; hechas += r.json.filas.length;
          barra.firstChild.style.width = Math.min(100, Math.round(hechas / total * 100)) + '%';
        }
        if (leidas !== tb.filas) avisos.push(`${tb.tabla}: se esperaban ${tb.filas} filas y se leyeron ${leidas} (cambió durante el respaldo; repita si es importante)`);
        entradas.push({ nombre: `${tb.tabla}.csv`, datos: '﻿' + filas.join('\r\n') + '\r\n' });
        resumen.push(`${tb.tabla}: ${leidas} filas`);
      }
      const ahora = new Date(), sello = `${diaHoy(ahora)}_${p2(ahora.getHours())}${p2(ahora.getMinutes())}`, quien = (sesion() || {}).nombre || '';
      entradas.unshift({ nombre: 'LEEME.txt', datos: [`RESPALDO DE REGISTRO DE CAJUELAS`, `Fecha: ${ahora.toLocaleString('es-CR')}`, `Hecho por: ${quien}`, `Versión de la app: ${VERSION}`, '',
        'Un archivo .csv por tabla (separado por «;», con tildes; se abre en Excel con doble clic).',
        'NO incluye las sesiones ni las columnas secretas (PIN cifrado, tokens, claves): por seguridad no salen del servidor.', '',
        'TABLAS Y FILAS:', ...resumen, ...(avisos.length ? ['', 'AVISOS:', ...avisos] : [])].join('\r\n') });
      const bytes = zip(entradas);
      descargar(new Blob([bytes], { type: 'application/zip' }), `Respaldo_Cajuelas_${sello}.zip`);
      db.set('ultimo_respaldo', ahora.toISOString());
      postJson('', { action: 'respaldo', op: 'fin', resumen: `${tablas.length} tablas, ${hechas} filas` }, 20000).catch(() => {});
      estado.textContent = `✅ Listo: ${tablas.length} tablas y ${hechas} filas. Se descargó Respaldo_Cajuelas_${sello}.zip (${(bytes.length / 1048576).toFixed(1)} MB).${avisos.length ? '\n⚠ ' + avisos.join('\n⚠ ') : ''}`;
      toast('Respaldo descargado.', 4000); pintaUlt();
    } catch (e) {
      estado.textContent = '⚠ No se pudo completar el respaldo: ' + (e && e.message ? e.message : e) + '\nRevise la conexión y vuelva a intentar. No se descargó nada incompleto.';
    } finally { ocupado = false; btn.disabled = false; }
  }

  clear(raiz);
  raiz.append(cabSub('Respaldo de datos', irInicio), ult,
    h('div', { class: 'tarjeta' }, h('b', null, 'Qué incluye'), h('p', { class: 'nota' }, 'Todos los datos del servidor en un ZIP con un archivo Excel (.csv) por tabla: recibos, boletos, planillas, café en fruta, exportaciones, personas, precios y auditoría.\nNo incluye PIN ni sesiones.')),
    btn, barra, estado,
    h('p', { class: 'nota' }, 'Recomendado: una vez por semana. Guarde el ZIP fuera de Drive/del teléfono (computadora o disco externo). Tarda unos segundos; no cierre la pantalla mientras avanza.'));
  pintaUlt();
}
