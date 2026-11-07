// Pasar el total de un día de Diario a Históricos (vista previa, confirmación y escritura). Lo usan Reportes y la anulación de recibos de días atrás.
import { toast, confirmar } from './util.js';
import { pasarAHistoricos } from './sync.js';
import { fmtFechaDMA } from './rep_calc.js';

/** Devuelve true si se escribió en Históricos. */
export async function pasarDiaFlujo(fecha, { titulo = 'Pasar a Históricos', intro = '' } = {}) {
    toast('Revisando recibos de Diario…');
    const v = await pasarAHistoricos({ fecha, soloVer: true });
    if (v.error) { toast(v.error, 7000); return false; }
    const miles = (n) => Number(n).toLocaleString('es-CR', { maximumFractionDigits: 2 });
    let texto = `${v.lineas} línea(s) · ${miles(v.cajuelas)} cajuelas (${miles(v.cajuelas / 20)} fanegas) del ${fmtFechaDMA(fecha)}.\nUna línea por sociedad y finca, sin los recibos anulados. El tipo queda en M.`;
    if (v.reemplaza) texto += `\n\nYa se habían pasado ${v.reemplaza} línea(s) de este día: se reemplazan (se conservan el tipo y el N° de recibo que haya escrito).`;
    if (v.sinSociedad && v.sinSociedad.length) texto += `\n\n⚠ Sociedades que no están en la hoja «Sociedades» de Históricos:\n• ${v.sinSociedad.join('\n• ')}`;
    if (v.sinFinca && v.sinFinca.length) texto += `\n\n⚠ Fincas sin número en la hoja «Fincas»:\n• ${v.sinFinca.join('\n• ')}`;
    if (intro) texto = intro + '\n\n' + texto;
    if (!await confirmar(titulo, texto, { si: 'Pasar al Históricos' })) return false;
    let forzar = false;
    if (v.manuales) {
      if (!await confirmar('Ese día ya tiene líneas', `En Históricos ya hay ${v.manuales} línea(s) del ${fmtFechaDMA(fecha)} escritas a mano. Si continúa se agregan las de Diario además de esas (podrían quedar repetidas).`, { si: 'Agregar de todos modos', peligro: true })) return false;
      forzar = true;
    }
    toast('Pasando a Históricos…');
    const r = await pasarAHistoricos({ fecha, forzar });
    if (r.error) { toast(r.error, 8000); return false; }
    toast(r.message, 6000);
    return true;
  return false;
}
