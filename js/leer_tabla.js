// Lectura de tablas desde un archivo .xlsx o .csv, sin librerías (funciona sin internet).
// .xlsx = zip con XML: se lee el directorio del zip, se descomprime con DecompressionStream y se interpretan las celdas.

const dec = new TextDecoder('utf-8');

async function inflar(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function leerZip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) { if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('El archivo no es un Excel válido (.xlsx).');
  const n = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  const ent = {};
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true), csz = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const nombre = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    ent[nombre] = { metodo, csz, off };
    p += 46 + nl + el + cl;
  }
  const leer = async (nombre) => {
    const e = ent[nombre]; if (!e) return null;
    const nl = v.getUint16(e.off + 26, true), el = v.getUint16(e.off + 28, true), ini = e.off + 30 + nl + el;
    const datos = u8.subarray(ini, ini + e.csz);
    return dec.decode(e.metodo === 0 ? datos : await inflar(datos));
  };
  return { leer, nombres: Object.keys(ent) };
}

const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/** Devuelve las filas (arreglos de texto) de la hoja que parezca ser la de datos. */
async function filasXlsx(buf) {
  const zip = await leerZip(buf);
  const wb = xml(await zip.leer('xl/workbook.xml'));
  const rels = xml(await zip.leer('xl/_rels/workbook.xml.rels'));
  const destino = {}; rels.querySelectorAll('Relationship').forEach((r) => { destino[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const hojas = [...wb.querySelectorAll('sheet')].map((s) => ({ nombre: s.getAttribute('name'), ruta: destino[s.getAttribute('r:id')] || destino[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] }));
  const comp = [];
  const sst = await zip.leer('xl/sharedStrings.xml');
  if (sst) xml(sst).querySelectorAll('si').forEach((si) => comp.push([...si.querySelectorAll('t')].map((t) => t.textContent).join('')));
  const leerHoja = async (h) => {
    const ruta = (h.ruta || '').replace(/^\//, ''); const t = await zip.leer(ruta.startsWith('xl/') ? ruta : 'xl/' + ruta);
    if (!t) return [];
    const filas = [];
    xml(t).querySelectorAll('sheetData > row').forEach((row) => {
      const fila = [];
      row.querySelectorAll('c').forEach((c) => {
        const tipo = c.getAttribute('t'), vv = c.querySelector('v');
        let val = '';
        if (tipo === 's') val = comp[Number(vv ? vv.textContent : -1)] ?? '';
        else if (tipo === 'inlineStr') val = [...c.querySelectorAll('t')].map((x) => x.textContent).join('');
        else val = vv ? vv.textContent : '';
        const i = colIdx(c.getAttribute('r') || 'A1'); while (fila.length < i) fila.push(''); fila[i] = String(val).trim();
      });
      filas.push(fila);
    });
    return filas;
  };
  let elegida = hojas.find((h) => /personas nuevas/i.test(h.nombre));
  if (elegida) return leerHoja(elegida);
  for (const h of hojas) { const f = await leerHoja(h); if (f.slice(0, 5).some((r) => r.some((c) => /tarjeta/i.test(c)))) return f; }
  return hojas.length ? leerHoja(hojas[0]) : [];
}

function filasCsv(texto) {
  const t = texto.replace(/^﻿/, '');
  const primera = t.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = (primera.match(/\t/g) || []).length ? '\t' : (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { fila.push(campo.trim()); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; fila.push(campo.trim()); campo = ''; filas.push(fila); fila = []; }
    else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  return filas;
}

/** Lee un archivo (.xlsx, .csv, .txt) y devuelve las filas como arreglos de texto. */
export async function leerArchivoTabla(archivo) {
  const buf = await archivo.arrayBuffer();
  if (/\.xlsx$/i.test(archivo.name) || (new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 0, 2)[1] === 0x4b)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede abrir Excel. Guarde el archivo como CSV o use «Pegar desde Excel».');
    return filasXlsx(buf);
  }
  if (/\.xls$/i.test(archivo.name)) throw new Error('El formato .xls viejo no se puede leer. Guárdelo como .xlsx o CSV.');
  return filasCsv(dec.decode(buf));
}
