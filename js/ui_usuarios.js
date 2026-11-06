// Ajustes › Usuarios (solo administradores). Crear, cambiar rol y permisos, restablecer PIN y desactivar. El servidor valida todo.
import { h, clear, toast, confirmar, formulario } from './util.js';
import { usuariosAdmin } from './sync.js';
import { huella, sesion } from './users.js';
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

export function pintarUsuarios({ raiz, irInicio }) {
  let lista = null, cargando = false, error = '';

  async function cargar() {
    cargando = true; error = ''; pintarLista();
    const r = await usuariosAdmin('listar', {});
    cargando = false;
    if (r.ok && r.json && Array.isArray(r.json.usuarios)) lista = r.json.usuarios; else error = r.message || 'No se pudo cargar la lista.';
    pintarLista();
  }

  function chip(t, clase) { return h('span', { class: 'chip-est ' + clase }, t); }

  function pintarLista() {
    clear(raiz);
    raiz.append(cabSub('Usuarios', irInicio));
    raiz.append(h('button', { type: 'button', class: 'btn-texto primario ancho-total', onclick: pintarNuevo }, '＋ Nuevo usuario'));
    if (cargando && !lista) raiz.append(h('p', { class: 'nota' }, 'Cargando…'));
    if (error) raiz.append(h('p', { class: 'estado aviso' }, '⚠ ' + error), h('button', { type: 'button', class: 'btn-texto', onclick: cargar }, 'Reintentar'));
    (lista || []).forEach((u) => {
      const sinPin = !u.tienePin;
      raiz.append(h('div', { class: 'fila-aj fila-usuario' + (u.activo ? '' : ' inactivo'), role: 'button', tabindex: '0', onclick: () => pintarEditar(u) },
        h('span', { class: 'tx' }, u.nombre, h('small', null, `${u.rol || 'Sin rol'}${u.permisos.length ? ' · permisos personalizados' : ''}`)),
        !u.activo ? chip('Inactivo', 'gris') : sinPin ? h('button', { type: 'button', class: 'chip-est ambar', onclick: (e) => { e.stopPropagation(); restablecerPin(u); } }, 'Sin PIN · asignar') : chip('Activo', 'verde')));
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
    const rol = selRol(u.rol, esYo);
    let modo = u.permisos.length ? 'pers' : 'rol';
    const marcados = new Set(u.permisos.length ? u.permisos : u.efectivos.filter((p) => p !== 'todos' && p !== 'todo'));
    let bloquear = !!u.bloquear;
    const zona = h('div');
    const pintarZona = () => {
      clear(zona);
      if (esYo) { zona.append(h('p', { class: 'nota' }, 'No puede cambiar su propio rol ni sus permisos (así nunca se queda sin acceso).')); return; }
      const seg = h('div', { class: 'seg' },
        h('button', { type: 'button', class: modo === 'rol' ? 'on' : '', onclick: () => { modo = 'rol'; pintarZona(); } }, 'Lo del rol'),
        h('button', { type: 'button', class: modo === 'pers' ? 'on' : '', onclick: () => { modo = 'pers'; pintarZona(); } }, 'Personalizar'));
      zona.append(h('label', { class: 'etiqueta' }, '¿Qué puede ver y hacer?'), seg);
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
      if (!esYo && modo === 'pers') { permisos = [...marcados]; if (!permisos.length) return toast('Marque al menos un permiso o vuelva a «Lo del rol».'); }
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
