// Ajustes › Usuarios (solo administradores). Crear, cambiar rol y permisos, restablecer PIN y desactivar. El servidor valida todo.
import { h, clear, toast, confirmar, formulario } from './util.js';
import { usuariosAdmin, conexionesAdmin } from './sync.js';
import { huella, sesion } from './users.js';
import { VERSION } from './util.js';
import { cabSub } from './ui.js';

const ROLES = ['Administrador', 'Recibidor de Café', 'Encargado de boletos', 'Digitador de registro', 'Encargado de planillas'];
const ETQ = {
  registro: '📝 Registro', diario: '📅 Diario', boletos: '🎟 Boletos', reportes: '📊 Reportes (Históricos y Exportaciones)', planillas: '👷 Planillas',
  reimprimir: 'Reimprimir comprobantes', resumenes: 'Resúmenes del día', anular: 'Anular', precios: 'Precios', provisional: 'Datos provisionales',
  config: 'Configuración', exportaciones_editar: 'Registrar contratos, salidas y pagos de Exportaciones', todos: 'Todo (administrador)'
};
const GRUPOS = [
  ['Pestañas que ve', ['registro', 'diario', 'boletos', 'reportes', 'planillas']],
  ['Acciones', ['reimprimir', 'resumenes', 'anular', 'precios', 'provisional', 'config']],
  ['Exportaciones', ['exportaciones_editar']]
];
const pinValido = (p) => /^\d{4,12}$/.test(String(p));


// ---------- Conexiones (última vez, versión y pendientes que reporta cada teléfono) ----------
const DIAS_ALERTA = 3;
const normN = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const verNum = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0);
const verMenor = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
const p2 = (n) => String(n).padStart(2, '0');
function cuando(iso) {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '—';
  const hoy = new Date(), ini = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((ini(hoy) - ini(d)) / 86400000), hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return dias <= 0 ? `hoy ${hm}` : dias === 1 ? `ayer ${hm}` : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${hm}`;
}
const diasSin = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 0 : Math.floor((Date.now() - d.getTime()) / 86400000); };
const textoPend = (pend) => Object.entries(pend || {}).map(([k, x]) => `${k} ${x.n}`).join(' · ');
const totalPend = (pend) => Object.values(pend || {}).reduce((t, x) => t + (x.n || 0), 0);
/** Resume las filas de conexión de una persona (puede tener varios teléfonos). */
function resumenConex(filas, nombre, vigente) {
  const mias = (filas || []).filter((f) => normN(f.usuario) === normN(nombre)).sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)));
  if (!mias.length) return { mias, sinDato: true, problemas: false, chips: [['Sin dato de conexión', 'gris']] };
  const u = mias[0], chips = [];
  const dias = diasSin(u.ultima), pend = mias.reduce((t, f) => t + totalPend(f.pendientes), 0);
  const vieja = mias.some((f) => f.version && verMenor(f.version, vigente));
  if (dias >= DIAS_ALERTA) chips.push([`🔴 Sin conexión ${dias} días`, 'rojo']);
  if (vieja) chips.push([`🟠 Versión anterior (${vigente})`, 'ambar']);
  if (pend) chips.push([`⚠ ${pend} envío${pend === 1 ? '' : 's'} pendiente${pend === 1 ? '' : 's'}: ${mias.map((f) => textoPend(f.pendientes)).filter(Boolean).join(' · ')}`, 'ambar']);
  const problemas = chips.length > 0;
  if (!problemas) chips.push(['✅ Al día', 'verde']);
  return { mias, u, problemas, chips, sinDato: false };
}

export function pintarUsuarios({ raiz, irInicio }) {
  let lista = null, cargando = false, error = '', conex = null, vigente = VERSION, soloProblemas = false;

  async function cargar() {
    cargando = true; error = ''; pintarLista();
    const r = await usuariosAdmin('listar', {});
    cargando = false;
    if (r.ok && r.json && Array.isArray(r.json.usuarios)) lista = r.json.usuarios; else error = r.message || 'No se pudo cargar la lista.';
    pintarLista();
    // Las conexiones son un extra: si fallan (p. ej. falta el SQL 29), la lista funciona igual.
    try {
      const c = await conexionesAdmin();
      if (c.filas) { conex = c.filas; vigente = c.filas.reduce((m, f) => (f.version && verMenor(m, f.version) ? f.version : m), VERSION); pintarLista(); }
    } catch { /* nada */ }
  }

  function chip(t, clase) { return h('span', { class: 'chip-est ' + clase }, t); }

  function pintarLista() {
    clear(raiz);
    raiz.append(cabSub('Usuarios', irInicio));
    raiz.append(h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: pintarNuevo }, '＋ Nuevo usuario'));
    if (cargando && !lista) raiz.append(h('p', { class: 'nota' }, 'Cargando…'));
    if (error) raiz.append(h('p', { class: 'estado aviso' }, '⚠ ' + error), h('button', { type: 'button', class: 'btn-texto', onclick: cargar }, 'Reintentar'));
    const info = (u) => (conex && u.activo ? resumenConex(conex, u.nombre, vigente) : null);
    const nProb = (lista || []).filter((u) => { const i = info(u); return i && i.problemas; }).length;
    if (conex) raiz.append(h('div', { class: 'fila-opc' },
      h('button', { type: 'button', class: 'opcion-sel' + (!soloProblemas ? ' on' : ''), onclick: () => { soloProblemas = false; pintarLista(); } }, h('b', null, 'Todos')),
      h('button', { type: 'button', class: 'opcion-sel' + (soloProblemas ? ' on' : ''), onclick: () => { soloProblemas = true; pintarLista(); } }, h('b', null, `Solo con problemas (${nProb})`))));
    (lista || []).forEach((u) => {
      const sinPin = !u.tienePin, i = info(u);
      if (soloProblemas && !(i && i.problemas)) return;
      raiz.append(h('div', { class: 'fila-aj fila-usuario' + (u.activo ? '' : ' inactivo'), role: 'button', tabindex: '0', onclick: () => pintarEditar(u) },
        h('span', { class: 'tx' }, u.nombre, h('small', null, `${u.rol || 'Sin rol'}${u.permisos.length ? ' · permisos personalizados' : ''}`),
          i && i.u ? h('small', null, `Última conexión: ${cuando(i.u.ultima)}${i.u.version ? ' · v' + i.u.version : ''}${i.u.dispositivo ? ' · ' + i.u.dispositivo : ''}`) : null,
          i ? h('div', { class: 'chips' }, ...i.chips.map(([t, c]) => chip(t, c))) : null),
        !u.activo ? chip('Inactivo', 'gris') : sinPin ? h('button', { type: 'button', class: 'chip-est ambar', onclick: (e) => { e.stopPropagation(); restablecerPin(u); } }, 'Sin PIN · asignar') : null));
    });
  }

  async function restablecerPin(u) {
    const r = await formulario(u.tienePin ? 'Restablecer PIN' : 'Asignar PIN', [{ etiqueta: 'PIN nuevo (4 a 12 números)', tipo: 'password', inputmode: 'numeric' }],
      { ok: 'Guardar PIN', detalle: `${u.nombre} usará este PIN para entrar. Se cierran sus sesiones abiertas. Dígaselo en persona: la app no lo muestra después.`,
        validar: async (v) => {
          if (!pinValido(v[0])) return 'El PIN debe tener de 4 a 12 números.';
          const x = await usuariosAdmin('pin', { id: u.id, hash: await huella(u.nombre, v[0]) });
          return x.ok ? null : x.message;
        } });
    if (r) { toast(`PIN de ${u.nombre} guardado.`); await cargar(); }
  }

  function selRol(valor, deshabilitado = false) {
    const s = h('select', { class: 'campo selec' }, ...ROLES.map((r) => h('option', { value: r }, r)));
    s.value = ROLES.includes(valor) ? valor : ROLES[1]; s.disabled = deshabilitado;
    return s;
  }

  function pintarNuevo() {
    clear(raiz);
    raiz.append(cabSub('Nuevo usuario', () => { pintarLista(); }));
    const nombre = h('input', { class: 'campo', type: 'text', placeholder: 'Nombre completo', autocomplete: 'off' });
    const rol = selRol('Recibidor de Café');
    const pin = h('input', { class: 'campo', type: 'password', inputmode: 'numeric', placeholder: '4 a 12 números', autocomplete: 'off', maxlength: '12' });
    const msg = h('p', { class: 'nota' }, 'El usuario cambia su PIN solo, en Ajustes › Cambiar mi PIN.');
    const guardar = h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
      const n = nombre.value.trim();
      if (n.length < 3) return toast('Escriba el nombre completo.');
      if (!pinValido(pin.value)) return toast('El PIN temporal debe tener de 4 a 12 números.');
      guardar.disabled = true;
      const r = await usuariosAdmin('guardar', { nombre: n, rol: rol.value, hash: await huella(n, pin.value) });
      guardar.disabled = false;
      if (!r.ok) return toast(r.message, 5000);
      toast(r.message); await cargar();
    } }, 'Guardar usuario');
    raiz.append(h('label', { class: 'etiqueta' }, 'Nombre completo'), nombre, h('label', { class: 'etiqueta' }, 'Rol'), rol, h('label', { class: 'etiqueta' }, 'PIN temporal'), pin, msg, guardar,
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: pintarLista }, 'Cancelar'));
  }

  function pintarEditar(u) {
    clear(raiz);
    const yo = (sesion() || {}).nombre;
    const esYo = yo && yo.toLowerCase() === u.nombre.toLowerCase();
    raiz.append(cabSub(u.nombre, pintarLista));
    if (conex && u.activo) {
      const i = resumenConex(conex, u.nombre, vigente);
      const filas = i.sinDato
        ? [h('p', { class: 'nota' }, 'Todavía no hay datos de conexión. Aparecen cuando el teléfono abre la app con internet y ya tiene la versión 2.19 o una más nueva.')]
        : i.mias.map((f) => h('div', { class: 'tarjeta' }, h('b', null, f.dispositivo || 'Teléfono sin nombre'),
          h('p', { class: 'pre' }, `Última conexión: ${cuando(f.ultima)} (${diasSin(f.ultima) === 0 ? 'hoy' : 'hace ' + diasSin(f.ultima) + ' día' + (diasSin(f.ultima) === 1 ? '' : 's')})\nVersión de la app: ${f.version || 'sin dato'}${f.version && verMenor(f.version, vigente) ? ' 🟠 (la vigente es ' + vigente + ')' : ' ✅'}\nEnvíos pendientes: ${totalPend(f.pendientes) ? Object.entries(f.pendientes).map(([k, x]) => `${k} ${x.n}${x.viejo ? ' (el más viejo: ' + x.viejo + ')' : ''}`).join(' · ') : 'ninguno'}`)));
      raiz.append(h('div', { class: 'titulo-grupo' }, 'Conexión'), h('div', { class: 'chips' }, ...i.chips.map(([t, c]) => chip(t, c))), ...filas);
    }
    const rol = selRol(u.rol, esYo);
    let modo = u.permisos.length ? 'pers' : 'rol';
    // Solo permisos que existen hoy: datos viejos (p. ej. «emitir») hacían que el servidor rechazara el guardado.
    const marcados = new Set((u.permisos.length ? u.permisos : u.efectivos).filter((p) => p !== 'todos' && p !== 'todo' && ETQ[p]));
    let bloquear = !!u.bloquear;
    const zona = h('div');
    const pintarZona = () => {
      clear(zona);
      if (esYo) { zona.append(h('p', { class: 'nota' }, 'No puede cambiar su propio rol ni sus permisos (así nunca se queda sin acceso).')); return; }
      // Un administrador siempre es «Todo»: personalizar sus permisos le quitaba el acceso total (Café en fruta VOLCAFE, etc.).
      if (rol.value === 'Administrador') modo = 'rol';
      const seg = h('div', { class: 'seg' },
        h('button', { type: 'button', class: modo === 'rol' ? 'on' : '', onclick: () => { modo = 'rol'; pintarZona(); } }, 'Lo del rol'),
        h('button', { type: 'button', class: modo === 'pers' ? 'on' : '', onclick: () => { modo = 'pers'; pintarZona(); } }, 'Personalizar'));
      zona.append(h('label', { class: 'etiqueta' }, '¿Qué puede ver y hacer?'), ...(rol.value === 'Administrador' ? [] : [seg]));
      if (modo === 'rol') {
        const ver = (u.rol === rol.value ? u.efectivos : []).filter((p) => ETQ[p] && p !== 'todos');
        zona.append(h('div', { class: 'tarjeta' }, h('b', null, `Con el rol «${rol.value}»`), h('p', { class: 'nota' }, rol.value === 'Administrador' ? 'Ve y puede todo, incluido administrar usuarios.' : ver.length ? ver.map((p) => ETQ[p]).join(' · ') : 'Cambie el rol y guarde para ver sus permisos.')));
      } else {
        GRUPOS.forEach(([t, ks]) => zona.append(h('div', { class: 'tarjeta' }, h('b', null, t), ...ks.map((k) => {
          const cb = h('input', { type: 'checkbox', checked: marcados.has(k), onchange: () => { if (cb.checked) marcados.add(k); else marcados.delete(k); } });
          return h('label', { class: 'casilla' }, cb, ' ', ETQ[k]);
        }))));
      }
    };
    rol.addEventListener('change', pintarZona);
    const cbBloq = h('input', { type: 'checkbox', checked: bloquear, onchange: () => { bloquear = cbBloq.checked; } });
    const guardar = h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => {
      let permisos = [];
      if (!esYo && modo === 'pers' && rol.value !== 'Administrador') { permisos = [...marcados].filter((p) => ETQ[p]); if (!permisos.length) return toast('Marque al menos un permiso o vuelva a «Lo del rol».'); }
      guardar.disabled = true;
      const r = await usuariosAdmin('guardar', { id: u.id, rol: rol.value, permisos, bloquear });
      guardar.disabled = false;
      if (!r.ok) return toast(r.message, 5000);
      toast(r.message + ' Le llega al teléfono de la persona cuando sincronice.', 4500); await cargar();
    } }, 'Guardar cambios');
    raiz.append(h('label', { class: 'etiqueta' }, 'Rol'), rol, zona, h('label', { class: 'casilla' }, cbBloq, ' Barra de abajo bloqueada (el usuario no puede cambiarla)'), guardar,
      h('button', { type: 'button', class: 'btn-texto ancho-total', onclick: () => restablecerPin(u) }, '🔑 Restablecer PIN'),
      esYo ? null : u.activo
        ? h('button', { type: 'button', class: 'btn-texto peligro ancho-total', onclick: async () => {
            if (!(await confirmar(`Desactivar a ${u.nombre}`, 'Ya no podrá entrar, ni con la sesión abierta en su teléfono. Sus recibos y la auditoría se conservan. Se puede volver a activar.', { si: 'Desactivar', peligro: true }))) return;
            const r = await usuariosAdmin('estado', { id: u.id, activo: false }); toast(r.message, 4000); if (r.ok) await cargar();
          } }, 'Desactivar usuario')
        : h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: async () => { const r = await usuariosAdmin('estado', { id: u.id, activo: true }); toast(r.message, 4000); if (r.ok) await cargar(); } }, 'Volver a activar'));
    pintarZona();
  }

  cargar();
}
