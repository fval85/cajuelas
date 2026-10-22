// Escritores de archivos sin librerías: PDF (páginas como imagen), ZIP y XLSX.
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);

function crc32(data) {
  if (!crc32.t) {
    crc32.t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crc32.t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function unir(partes) {
  const total = partes.reduce((t, p) => t + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  partes.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

/** ZIP sin compresión. entradas: [{nombre, datos(Uint8Array|string)}] */
export function zip(entradas) {
  const locales = [], centrales = [];
  let offset = 0;
  const fecha = new Date();
  const dosT = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dosD = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  for (const e of entradas) {
    const nombre = bytes(e.nombre);
    const datos = typeof e.datos === 'string' ? bytes(e.datos) : e.datos;
    const crc = crc32(datos);
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true);
    l.setUint16(10, dosT, true); l.setUint16(12, dosD, true); l.setUint32(14, crc, true);
    l.setUint32(18, datos.length, true); l.setUint32(22, datos.length, true); l.setUint16(26, nombre.length, true); l.setUint16(28, 0, true);
    locales.push(new Uint8Array(l.buffer), nombre, datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true); c.setUint16(28, nombre.length, true); c.setUint32(42, offset, true);
    centrales.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + datos.length;
  }
  const cdTam = centrales.reduce((t, p) => t + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, entradas.length, true); fin.setUint16(10, entradas.length, true);
  fin.setUint32(12, cdTam, true); fin.setUint32(16, offset, true);
  return unir([...locales, ...centrales, new Uint8Array(fin.buffer)]);
}

// ---------- PDF ----------
const canvasABytes = (canvas, calidad) => new Promise((res, rej) => {
  canvas.toBlob(async (b) => { if (!b) return rej(new Error('No se pudo convertir la imagen')); res(new Uint8Array(await b.arrayBuffer())); }, 'image/jpeg', calidad);
});

/** páginas: [{canvas, ancho, alto}] con ancho/alto en puntos (1/72 pulgada). */
export async function pdfDePaginas(paginas, calidad = 0.93) {
  const partes = [];
  const offs = [];
  let pos = 0;
  const poner = (x) => { const b = typeof x === 'string' ? bytes(x) : x; partes.push(b); pos += b.length; };
  const obj = (n, cuerpo) => { offs[n] = pos; poner(`${n} 0 obj\n`); poner(cuerpo); poner('\nendobj\n'); };
  poner('%PDF-1.4\n%âãÏÓ\n');
  const n = paginas.length;
  // 1 = catálogo, 2 = páginas; por página: 3+3i página, 4+3i contenido, 5+3i imagen
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${paginas.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`);
  for (let i = 0; i < n; i++) {
    const p = paginas[i];
    const jpg = await canvasABytes(p.canvas, calidad);
    const w = p.ancho.toFixed(2), h = p.alto.toFixed(2);
    obj(3 + 3 * i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${5 + 3 * i} 0 R >> >> /Contents ${4 + 3 * i} 0 R >>`);
    const cont = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(4 + 3 * i, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
    offs[5 + 3 * i] = pos;
    poner(`${5 + 3 * i} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.canvas.width} /Height ${p.canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    poner(jpg);
    poner('\nendstream\nendobj\n');
  }
  const total = 3 + 3 * n;
  const xref = pos;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  x += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  poner(x);
  return new Blob([unir(partes)], { type: 'application/pdf' });
}

// ---------- XLSX ----------
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function colNombre(i) {
  let n = i, r = '';
  while (n > 0) { const m = (n - 1) % 26; r = String.fromCharCode(65 + m) + r; n = Math.floor((n - 1) / 26); }
  return r;
}
/**
 * filas: array de arrays. Celda: string (texto) | number | {n: número, dec: true} (formato 0,00) | null.
 */
export function xlsx(nombreHoja, filas) {
  let sheet = '';
  filas.forEach((fila, r) => {
    let celdas = '';
    fila.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      const ref = colNombre(c + 1) + (r + 1);
      if (typeof v === 'number') celdas += `<c r="${ref}"><v>${Math.round(v * 10000) / 10000}</v></c>`;
      else if (typeof v === 'object') celdas += `<c r="${ref}" s="1"><v>${Math.round(v.n * 10000) / 10000}</v></c>`;
      else celdas += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    });
    sheet += `<row r="${r + 1}">${celdas}</row>`;
  });
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    { nombre: '[Content_Types].xml', datos: cab + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { nombre: '_rels/.rels', datos: cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', datos: cab + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(nombreHoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nombre: 'xl/styles.xml', datos: cab + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { nombre: 'xl/worksheets/sheet1.xml', datos: cab + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>` }
  ]);
}

// ---------- Compartir / descargar ----------
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Abre la hoja de compartir del sistema (WhatsApp, correo, AirDrop…). Si no existe, descarga el archivo. */
export async function compartir(archivos, titulo, texto = '') {
  const files = archivos.map((a) => new File([a.blob], a.nombre, { type: a.blob.type || 'application/octet-stream' }));
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: titulo, text: texto });
      return 'compartido';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelado';
  }
  files.forEach((f, i) => descargar(archivos[i].blob, f.name));
  return 'descargado';
}
