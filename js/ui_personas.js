// Ajustes › Personas con tarjeta (solo administradores): agregar personas una por una, pegando desde Excel o subiendo un archivo.
// Siempre hay vista previa antes de guardar; el servidor valida todo otra vez y asigna el código de cada persona.
import { h, clear, toast, confirmar } from './util.js';
import { personasAdmin } from './sync.js';
import { cabSub } from './ui.js';
import { descargar } from './files.js';
import { leerArchivoTabla } from './leer_tabla.js';

const corta = (s) => String(s || '').replace(/\s*S\.A\.?$/i, '').replace(/^BENEFICIADORA\s+/i, 'BEN. ');
const soloDig = (s) => String(s || '').replace(/[\s-]/g, '');
const mascara = (t) => (t && t.length >= 4 ? '···· ' + t.slice(-4) : t || '—');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto pegado desde Excel → [{nombre, tarjeta, deduccion}]. Acepta tabuladores, «;» o «nombre 5421…» seguido. */
export function parsearPegado(texto, conocidos = null) {
  const out = [];
  String(texto || '').split(/\r?\n/).forEach((linea) => {
    if (!linea.trim()) return;
    let c = linea.split('\t').map((x) => x.trim());
    if (c.length < 2 && linea.includes(';')) c = linea.split(';').map((x) => x.trim());
    if (/tarjeta/i.test(linea) && !/\d{8}/.test(linea)) return; // encabezado
    // Filas completas copiadas de la plantilla: Usuario ⇥ Sociedad ⇥ Nombre ⇥ Tarjeta ⇥ Deducción
    if (conocidos && c.length >= 4) {
      const us = conocidos.usuarios.find((u) => norm(u) === norm(c[0])), so = conocidos.sociedades.find((x) => norm(x) === norm(c[1]));
      if (us && so) { out.push({ usuario: us, sociedad: so, nombre: c[2], tarjeta: soloDig(c[3]), deduccion: c[4] || '' }); return; }
    }
    let ti = c.findIndex((x, i) => i > 0 && /^\d{16}$/.test(soloDig(x)));
    if (ti < 0) ti = c.findIndex((x, i) => i > 0 && /^\d{8,}$/.test(soloDig(x)));
    if (ti > 0) { out.push({ nombre: c.slice(0, ti).join(' '), tarjeta: soloDig(c[ti]), deduccion: c[ti + 1] || '' }); return; }
    const m = linea.match(/(\d[\d -]{13,}\d)\s*(.*)$/);
    if (m) out.push({ nombre: linea.slice(0, m.index).replace(/[\t;,]+$/, '').trim(), tarjeta: soloDig(m[1]), deduccion: (m[2] || '').trim() });
    else out.push({ nombre: c[0], tarjeta: '', deduccion: '' });
  });
  return out;
}

/** Filas de un archivo (con encabezados Usuario, Sociedad, Nombre, Tarjeta, Deducción) → [{usuario, sociedad, nombre, tarjeta, deduccion}]. */
export function filasDeArchivo(filas) {
  let ini = filas.findIndex((r) => r.some((c) => /tarjeta/i.test(c)));
  let col = { usuario: 0, sociedad: 1, nombre: 2, tarjeta: 3, deduccion: 4 };
  if (ini >= 0) {
    const enc = filas[ini].map(norm);
    const f = (re) => enc.findIndex((x) => re.test(x));
    col = { usuario: f(/usuario|dispositivo/), sociedad: f(/sociedad/), nombre: f(/nombre/), tarjeta: f(/tarjeta/), deduccion: f(/deduccion/) };
    if (col.usuario < 0 || col.sociedad < 0 || col.nombre < 0 || col.tarjeta < 0) throw new Error('El archivo necesita las columnas Usuario, Sociedad, Nombre y Tarjeta. Descargue la plantilla.');
    ini += 1;
  } else ini = 0;
  const g = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  return filas.slice(ini).filter((r) => r.some((c) => String(c).trim())).map((r) => ({ usuario: g(r, col.usuario), sociedad: g(r, col.sociedad), nombre: g(r, col.nombre), tarjeta: soloDig(g(r, col.tarjeta)), deduccion: g(r, col.deduccion) }))
    .filter((x) => !/^ejemplo/i.test(x.nombre));
}

export function pintarPersonas({ raiz, irInicio }) {
  let res = null, lista = null, error = '', cargando = false;

  async function cargar() {
    cargando = true; error = ''; inicio();
    const [a, b] = await Promise.all([personasAdmin('resumen', {}), personasAdmin('lista', {})]);
    cargando = false;
    if (a.ok && b.ok && a.json && b.json) { res = a.json; lista = b.json.personas || []; } else error = (a.ok ? b.message : a.message) || 'No se pudo cargar la lista.';
    inicio();
  }
  const chip = (t, c) => h('span', { class: 'chip-est ' + c }, t);
  const total = () => (res ? res.grupos.reduce((t, g) => t + g.n, 0) : 0);

  // ---------- Inicio ----------
  function inicio() {
    clear(raiz);
    raiz.append(cabSub('Personas con tarjeta', irInicio));
    if (error) { raiz.append(h('p', { class: 'estado aviso' }, '⚠ ' + error), h('button', { type: 'button', class: 'btn-texto', onclick: cargar }, 'Reintentar')); return; }
    if (cargando && !res) { raiz.append(h('p', { class: 'nota' }, 'Cargando…')); return; }
    raiz.append(
      h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: () => agregarUna() }, '＋ Agregar una persona'),
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => pegar() }, '📋 Pegar desde Excel'),
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => subir() }, '📁 Subir archivo Excel / CSV'));
    const q = h('input', { class: 'campo', type: 'search', placeholder: '🔍 Buscar nombre o tarjeta', autocomplete: 'off' });
    const zona = h('div');
    raiz.append(q, h('p', { class: 'nota' }, `${plural(total(), 'registro', 'registros')} · cosecha ${res.cosecha}`), zona);
    const pintarGrupos = () => {
      clear(zona);
      res.grupos.forEach((g) => zona.append(h('div', { class: 'fila-aj fila-usuario', role: 'button', tabindex: '0', onclick: () => verLista(`${g.usuario} · ${corta(g.sociedad)}`, (p) => p.sociedad === g.sociedad && p.items.some((i) => i.usuario === g.usuario), g.usuario) },
        h('span', { class: 'tx' }, g.usuario, h('small', null, corta(g.sociedad))), h('b', null, String(g.n)))));
    };
    q.addEventListener('input', () => {
      const t = norm(q.value).trim();
      if (!t) return pintarGrupos();
      clear(zona); pintarPersonas2(zona, lista.filter((p) => norm(p.nombre).includes(t) || p.tarjeta.includes(t.replace(/\D/g, '') || '§')));
    });
    pintarGrupos();
  }
  function pintarPersonas2(zona, ps) {
    if (!ps.length) { zona.append(h('p', { class: 'nota' }, 'Ninguna persona coincide.')); return; }
    ps.slice(0, 200).forEach((p) => zona.append(h('div', { class: 'fila-aj fila-usuario', role: 'button', tabindex: '0', onclick: () => persona(p) },
      h('span', { class: 'tx' }, p.nombre, h('small', null, `${corta(p.sociedad)} · ${mascara(p.tarjeta)} · ${p.items.map((i) => `${i.usuario} (${i.codigo})`).join(', ')}`)),
      p.deduccion != null ? chip('Deducción', 'ambar') : null)));
    if (ps.length > 200) zona.append(h('p', { class: 'nota' }, `Mostrando 200 de ${ps.length}. Escriba para filtrar.`));
  }
  function verLista(titulo, filtro, origen = '') {
    clear(raiz);
    raiz.append(cabSub(titulo, inicio));
    const ps = lista.filter(filtro);
    raiz.append(h('p', { class: 'nota' }, plural(ps.length, 'persona', 'personas')));
    const sel = new Set(); let modo = false;
    const barra = h('div'), zona = h('div');
    raiz.append(barra, zona);
    const clave = (p) => p.sociedad + '|' + p.tarjeta;
    const pintar = () => {
      clear(barra); clear(zona);
      if (!modo) {
        barra.append(h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => { modo = true; pintar(); } }, '☑ Seleccionar varias (copiar o pasar a otro usuario)'));
        pintarPersonas2(zona, ps); return;
      }
      const dest = h('select', { class: 'campo selec' }, ...res.usuarios.filter((u) => u !== origen).map((u) => h('option', { value: u }, u)));
      const cuenta = h('p', { class: 'nota' });
      const act = () => { cuenta.textContent = `${plural(sel.size, 'persona elegida', 'personas elegidas')}`; };
      const ejecutar = async (pasar) => {
        if (!sel.size) return toast('Elija al menos una persona.');
        const elegidas = ps.filter((p) => sel.has(clave(p)));
        const txt = pasar ? `Pasar ${plural(elegidas.length, 'persona', 'personas')} de ${origen} a ${dest.value}` : `Copiar ${plural(elegidas.length, 'persona', 'personas')} a ${dest.value}`;
        if (!(await confirmar(txt, pasar ? `Dejan de salirle a ${origen} y le salen a ${dest.value} con código nuevo. Los recibos anteriores se conservan.` : `${dest.value} las recibe con código nuevo; ${origen || 'quien ya las tenía'} las conserva.`, { si: pasar ? 'Pasar' : 'Copiar' }))) return;
        const r = await personasAdmin('asignar', { personas: elegidas.map((p) => ({ sociedad: p.sociedad, tarjeta: p.tarjeta })), agregar: [dest.value], quitar: pasar ? [origen] : [] });
        toast(r.message, 5000);
        if (r.ok) { await cargar0(); verLista(titulo, filtro, origen); }
      };
      barra.append(h('label', { class: 'etiqueta' }, 'Destino'), dest, cuenta,
        h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => { if (sel.size === ps.length) sel.clear(); else ps.forEach((p) => sel.add(clave(p))); pintar(); } }, sel.size === ps.length ? 'Quitar selección' : 'Seleccionar todas'),
        h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: () => ejecutar(false) }, 'Copiar al destino'),
        origen ? h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: () => ejecutar(true) }, 'Pasar al destino (quitar de ' + origen + ')') : null,
        h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => { modo = false; sel.clear(); pintar(); } }, 'Cancelar selección'));
      act();
      ps.forEach((p) => {
        const cb = h('input', { type: 'checkbox', checked: sel.has(clave(p)), onchange: () => { if (cb.checked) sel.add(clave(p)); else sel.delete(clave(p)); act(); } });
        zona.append(h('label', { class: 'casilla' }, cb, h('span', { class: 'tx' }, ' ' + p.nombre, h('small', null, ` ${mascara(p.tarjeta)} · ${p.items.map((x) => x.usuario).join(', ')}`))));
      });
    };
    pintar();
  }

  // ---------- Elegir sociedad y usuarios ----------
  function selectorDestino(inicial = '') {
    const sel = h('select', { class: 'campo selec' }, ...res.sociedades.map((s) => h('option', { value: s }, s)));
    if (inicial) sel.value = inicial;
    const marcados = new Set();
    const caja = h('div');
    const pintarUsuarios = (porDefecto) => {
      if (porDefecto) { marcados.clear(); ((res.porSociedad || {})[sel.value] || []).filter((u) => res.usuarios.includes(u)).forEach((u) => marcados.add(u)); }
      clear(caja);
      res.usuarios.forEach((u) => { const cb = h('input', { type: 'checkbox', checked: marcados.has(u), onchange: () => { if (cb.checked) marcados.add(u); else marcados.delete(u); } }); caja.append(h('label', { class: 'casilla' }, cb, ' ', u)); });
    };
    sel.addEventListener('change', () => pintarUsuarios(true));
    pintarUsuarios(true);
    return { sel, caja, marcados, el: [h('label', { class: 'etiqueta' }, 'Sociedad'), sel, h('label', { class: 'etiqueta' }, 'Se asignan a (marcados según la sociedad; cámbielos si hace falta)'), caja] };
  }

  // ---------- Una persona ----------
  function agregarUna() {
    clear(raiz);
    raiz.append(cabSub('Nueva persona', inicio));
    const nombre = h('input', { class: 'campo', type: 'text', placeholder: 'Nombre y apellidos', autocomplete: 'off' });
    const tarjeta = h('input', { class: 'campo', type: 'text', inputmode: 'numeric', placeholder: '16 dígitos', autocomplete: 'off', maxlength: '24' });
    const ded = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', placeholder: 'Vacío si no hay', autocomplete: 'off' });
    const dest = selectorDestino();
    const btn = h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
      const us = [...dest.marcados];
      if (!us.length) return toast('Marque al menos un usuario.');
      btn.disabled = true;
      const r = await personasAdmin('guardar', { filas: us.map((u) => ({ usuario: u, sociedad: dest.sel.value, nombre: nombre.value, tarjeta: tarjeta.value, deduccion: ded.value })) });
      btn.disabled = false;
      if (!r.ok) return toast(r.message, 5000);
      const j = r.json;
      if (!j.nuevas) return toast((j.filas.find((f) => f.mensaje) || {}).mensaje || 'No se agregó nada.', 5000);
      toast(`Persona agregada (${plural(j.nuevas, 'usuario', 'usuarios')}).` + (j.errores || j.ya ? ' Algunos usuarios no se agregaron: ' + (j.filas.find((f) => f.estado !== 'nueva') || {}).mensaje : ''), 5000);
      await cargar();
    } }, 'Guardar persona');
    raiz.append(h('label', { class: 'etiqueta' }, 'Nombre y apellidos'), nombre, h('label', { class: 'etiqueta' }, 'Tarjeta (16 dígitos)'), tarjeta,
      h('label', { class: 'etiqueta' }, 'Deducción (opcional)'), ded, h('p', { class: 'nota' }, 'Se cobra una sola vez; después se borra desde la persona.'), ...dest.el, btn,
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: inicio }, 'Cancelar'));
  }

  // ---------- Pegar desde Excel ----------
  function pegar() {
    clear(raiz);
    raiz.append(cabSub('Pegar desde Excel', inicio));
    const dest = selectorDestino();
    const area = h('textarea', { class: 'campo', rows: '8', placeholder: 'Pegue aquí las filas copiadas de Excel:\nNombre ⇥ Tarjeta ⇥ Deducción (opcional)', autocomplete: 'off', spellcheck: 'false' });
    const btn = h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
      const us = [...dest.marcados];
      const ps = parsearPegado(area.value, { usuarios: res.usuarios, sociedades: res.sociedades });
      if (!ps.length) return toast('Pegue primero las filas de Excel.');
      const filas = [];
      if (!us.length && ps.some((p) => !p.usuario)) return toast('Marque al menos un usuario.');
      // Las filas que ya traen usuario y sociedad (copiadas de la plantilla) se respetan tal cual.
      ps.forEach((p, g) => { if (p.usuario) filas.push({ ...p, g }); else us.forEach((u) => filas.push({ ...p, usuario: u, sociedad: dest.sel.value, g })); });
      await revisar(filas, ps.length, pegar);
    } }, 'Ver vista previa');
    raiz.append(...dest.el, h('label', { class: 'etiqueta' }, 'Pegue aquí: Nombre ⇥ Tarjeta ⇥ Deducción (opcional)'), area, btn,
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: inicio }, 'Cancelar'));
  }

  // ---------- Subir archivo ----------
  function subir() {
    clear(raiz);
    raiz.append(cabSub('Subir archivo', inicio));
    const arch = h('input', { type: 'file', accept: '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true });
    arch.addEventListener('change', async () => {
      const f = arch.files && arch.files[0]; if (!f) return;
      try {
        const filas = filasDeArchivo(await leerArchivoTabla(f));
        if (!filas.length) return toast('No encontré personas en el archivo.', 5000);
        filas.forEach((x, g) => { x.g = g; });
        await revisar(filas, filas.length, subir, f.name);
      } catch (e) { toast(e.message || 'No se pudo leer el archivo.', 6000); }
      arch.value = '';
    });
    raiz.append(h('p', { class: 'nota' }, 'El archivo trae una persona por fila, con Usuario y Sociedad. Use la plantilla para que quede igual.'), arch,
      h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: () => arch.click() }, '📁 Elegir archivo'),
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: async () => {
        try { const r = await fetch('./Plantilla_Personas_Nuevas.xlsx', { cache: 'no-store' }); if (!r.ok) throw new Error(); descargar(await r.blob(), 'Plantilla_Personas_Nuevas.xlsx'); } catch { toast('No se pudo bajar la plantilla (¿sin internet?).', 5000); }
      } }, '⬇ Descargar la plantilla'),
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: inicio }, 'Cancelar'));
  }

  // ---------- Vista previa y guardado ----------
  async function revisar(filas, nPersonas, volver, nombreArchivo = '') {
    if (filas.length > 1500) return toast('Máximo 1500 filas por carga. Divida el archivo.', 6000);
    toast('Revisando…', 1500);
    const r = await personasAdmin('previa', { filas: filas.map(({ g, ...x }) => x) });
    if (!r.ok) return toast(r.message, 6000);
    vistaPrevia(filas, r.json, volver, nombreArchivo);
  }
  function vistaPrevia(filas, j, volver, nombreArchivo) {
    clear(raiz);
    raiz.append(cabSub('Vista previa', volver));
    // Una tarjeta por persona (aunque vaya a varios usuarios).
    const per = new Map();
    j.filas.forEach((f) => { const o = filas[f.i - 1], k = soloDig(o.tarjeta) ? soloDig(o.tarjeta) + '|' + o.sociedad.toUpperCase() : o.g + '|' + o.sociedad; if (!per.has(k)) per.set(k, { nombre: f.nombre || o.nombre, tarjeta: f.tarjeta || o.tarjeta, sociedad: f.sociedad, filas: [] }); per.get(k).filas.push(f); });
    const ps = [...per.values()].map((p) => {
      const err = p.filas.filter((f) => f.estado === 'error'), nue = p.filas.filter((f) => f.estado === 'nueva'), ya = p.filas.filter((f) => f.estado === 'ya');
      return { ...p, err, nue, ya, tipo: err.length ? 'error' : nue.length ? 'nueva' : 'ya' };
    }).sort((a, b) => ({ error: 0, nueva: 1, ya: 2 }[a.tipo] - { error: 0, nueva: 1, ya: 2 }[b.tipo]));
    const nN = ps.filter((p) => p.tipo === 'nueva').length, nY = ps.filter((p) => p.tipo === 'ya').length, nE = ps.filter((p) => p.tipo === 'error').length;
    raiz.append(h('div', { class: 'tarjeta' }, h('b', null, nombreArchivo ? `📁 ${nombreArchivo}` : 'Revisión'), h('p', { class: 'nota' }, `${plural(nN, 'nueva', 'nuevas')} · ${nY} ya ${nY === 1 ? 'estaba' : 'estaban'} · ${plural(nE, 'con error', 'con error')}`)));
    ps.forEach((p) => {
      const detalle = p.tipo === 'error' ? p.err[0].mensaje
        : p.tipo === 'ya' ? 'Esa tarjeta ya está en esa sociedad.'
        : p.nue.map((f) => `${f.usuario}: código ${f.codigo}`).join(' · ') + (p.ya.length ? ` · ya estaba en ${p.ya.map((f) => f.usuario).join(', ')}` : '');
      raiz.append(h('div', { class: 'fila-aj fila-usuario' }, h('span', { class: 'tx' }, p.nombre || '(sin nombre)', h('small', null, `${corta(p.sociedad)} · ${mascara(p.tarjeta)}`), h('small', null, detalle)),
        p.tipo === 'error' ? chip('Revisar', 'ambar') : p.tipo === 'ya' ? chip('Ya está', 'gris') : chip('Nueva', 'verde')));
    });
    if (nE) raiz.append(h('p', { class: 'nota' }, `Las ${nE} con error no se guardan: corríjalas y cárguelas de nuevo.`));
    const btn = h('button', { type: 'button', class: 'btn-texto primario ancho-total', disabled: !nN, onclick: async () => {
      btn.disabled = true;
      const r = await personasAdmin('guardar', { filas: filas.map(({ g, ...x }) => x) });
      if (!r.ok) { btn.disabled = false; return toast(r.message, 6000); }
      await cargar0(); resultado(r.json);
    } }, nN ? `Guardar ${plural(nN, 'persona nueva', 'personas nuevas')}` : 'No hay nada nuevo para guardar');
    raiz.append(btn, h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: volver }, 'Volver'));
  }
  async function cargar0() { const [a, b] = await Promise.all([personasAdmin('resumen', {}), personasAdmin('lista', {})]); if (a.ok && b.ok) { res = a.json; lista = b.json.personas || []; } }
  function resultado(j) {
    clear(raiz);
    raiz.append(cabSub('Personas con tarjeta', inicio));
    const g = new Map();
    j.filas.filter((f) => f.estado === 'nueva').forEach((f) => { const k = f.usuario + '|' + f.sociedad; const o = g.get(k) || { usuario: f.usuario, sociedad: f.sociedad, min: f.codigo, max: f.codigo }; o.min = Math.min(o.min, f.codigo); o.max = Math.max(o.max, f.codigo); g.set(k, o); });
    const pers = new Set(j.filas.filter((f) => f.estado === 'nueva').map((f) => f.sociedad + '|' + f.tarjeta)).size;
    raiz.append(h('div', { class: 'tarjeta' }, h('b', null, `✓ ${plural(pers, 'persona agregada', 'personas agregadas')}`), h('p', { class: 'nota' }, 'Los teléfonos las reciben al sincronizar.')));
    [...g.values()].forEach((o) => raiz.append(h('div', { class: 'fila-aj' }, h('span', { class: 'tx' }, `${o.usuario} · ${corta(o.sociedad)}`, h('small', null, o.min === o.max ? `código ${o.min}` : `códigos ${o.min} al ${o.max}`)))));
    raiz.append(h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: inicio }, 'Listo'));
  }

  // ---------- Una persona ya cargada ----------
  function persona(p) {
    clear(raiz);
    raiz.append(cabSub(p.nombre, inicio));
    const nombre = h('input', { class: 'campo', type: 'text', value: p.nombre, autocomplete: 'off' });
    const tarjeta = h('input', { class: 'campo', type: 'text', inputmode: 'numeric', value: p.tarjeta || '', autocomplete: 'off', maxlength: '24' });
    const ded = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', value: p.deduccion != null ? String(p.deduccion) : '', placeholder: 'Vacío si no hay', autocomplete: 'off' });
    const ids = p.items.map((i) => i.id);
    const guardar = async (dedTxt) => {
      const r = await personasAdmin('editar', { ids, nombre: nombre.value, tarjeta: tarjeta.value, deduccion: dedTxt });
      toast(r.message, 4000); if (r.ok) await cargar();
    };
    const marcados = new Set(p.items.map((i) => i.usuario)); const actuales = [...marcados];
    const cajaUs = h('div', { class: 'tarjeta' }, h('b', null, 'Usuarios que la tienen'), ...res.usuarios.map((u) => {
      const cb = h('input', { type: 'checkbox', checked: marcados.has(u), onchange: () => { if (cb.checked) marcados.add(u); else marcados.delete(u); } });
      const it = p.items.find((i) => i.usuario === u);
      return h('label', { class: 'casilla' }, cb, ' ', u, it ? h('small', null, ` · código ${it.codigo}`) : null);
    }),
      h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
        if (!marcados.size) return toast('Marque al menos un usuario, o use «Quitar de la lista».');
        const agregar = [...marcados].filter((u) => !actuales.includes(u)), quitar = actuales.filter((u) => !marcados.has(u));
        if (!agregar.length && !quitar.length) return toast('No hay cambios en los usuarios.');
        if (quitar.length && !(await confirmar('Quitar usuarios', `Deja de salirle a ${quitar.join(', ')}. Sus recibos anteriores se conservan.`, { si: 'Guardar' }))) return;
        const r = await personasAdmin('asignar', { personas: [{ sociedad: p.sociedad, tarjeta: p.tarjeta }], agregar, quitar });
        toast(r.message, 4000); if (r.ok) await cargar();
      } }, 'Guardar usuarios'));
    raiz.append(h('div', { class: 'tarjeta' }, h('b', null, corta(p.sociedad))), cajaUs,
      h('label', { class: 'etiqueta' }, 'Nombre y apellidos'), nombre, h('label', { class: 'etiqueta' }, 'Tarjeta'), tarjeta, h('label', { class: 'etiqueta' }, 'Deducción'), ded,
      p.deduccion != null ? h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => guardar('') }, 'Quitar deducción (ya se cobró)') : null,
      h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: () => guardar(ded.value) }, 'Guardar cambios'),
      h('button', { type: 'button', class: 'btn-texto peligro ancho-total', onclick: async () => {
        if (!(await confirmar(`Quitar a ${p.nombre}`, 'Deja de salir en la lista de recibir café de los usuarios indicados. Sus recibos anteriores se conservan.', { si: 'Quitar', peligro: true }))) return;
        const r = await personasAdmin('quitar', { ids }); toast(r.message, 4000); if (r.ok) await cargar();
      } }, 'Quitar de la lista'));
  }

  cargar();
}
