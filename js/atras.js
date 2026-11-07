// Botón «atrás» del celular (y del navegador): en vez de sacar de la app, retrocede un paso dentro de ella.
// Orden: 1) cierra la ventana abierta (diálogo, lista, vista previa); 2) pulsa la flecha «‹» de la pantalla visible;
// 3) si está en otra pestaña, vuelve a la pestaña principal. Solo en la pantalla principal de la pestaña principal sale de la app.
// Truco: mientras haya algo a lo que retroceder se mantiene UNA entrada extra («centinela») en el historial del navegador.
// Al pulsar atrás se consume esa entrada, se hace el retroceso y, si aún queda algo, se vuelve a poner.

const visible = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && !el.closest('[hidden]');

export function iniciarAtras({ pestanaActual, pestanaPrincipal, irAPestana, hayLogin }) {
  let centinela = false;
  let ignorar = 0;
  try { centinela = !!(history.state && history.state.cajuelasAtras === 1); } catch { /* nada */ }

  const velos = () => [...document.querySelectorAll('body > .velo')];
  const flechas = () => [...document.querySelectorAll('#contenido .cab-sub .atras')].filter(visible);

  const hayAlgo = () => {
    if (hayLogin()) return false;
    if (velos().length) return true;
    if (flechas().length) return true;
    return pestanaActual() !== pestanaPrincipal();
  };

  function accion() {
    const v = velos();
    if (v.length) {
      // Cierra la ventana de arriba: equivale a tocar su botón de cancelar/cerrar (primero de la fila) o fuera de ella.
      const ultima = v[v.length - 1];
      ultima.dispatchEvent(new MouseEvent('click', { bubbles: true })); // toque fuera (cierra si no es «fijo»)
      if (ultima.isConnected) {
        const bs = [...ultima.querySelectorAll('.dialogo-botones .btn-texto')];
        const b = bs.find((x) => /cancel|cerrar|ahora no|volver|^no$/i.test(x.textContent.trim())) || (bs.length === 1 ? bs[0] : null);
        if (b) b.click();
      }
      return;
    }
    const f = flechas();
    if (f.length) { f[f.length - 1].click(); return; }
    if (pestanaActual() !== pestanaPrincipal()) irAPestana(pestanaPrincipal());
  }

  function reconciliar() {
    const quiere = hayAlgo();
    if (quiere && !centinela) {
      try { history.pushState({ cajuelasAtras: 1 }, ''); centinela = true; } catch { /* nada */ }
    } else if (!quiere && centinela) {
      ignorar += 1; centinela = false;
      try { history.back(); } catch { ignorar -= 1; }
    }
  }

  window.addEventListener('popstate', () => {
    if (ignorar > 0) { ignorar -= 1; return; }
    // El usuario pulsó atrás: la entrada centinela ya se consumió.
    const estabaCentinela = centinela;
    centinela = false;
    if (estabaCentinela && hayAlgo()) accion();
    else if (!estabaCentinela && hayAlgo()) { /* sin centinela: dejar que el navegador siga su curso */ }
    setTimeout(reconciliar, 60);
  });

  let prog = false;
  const programar = () => { if (prog) return; prog = true; setTimeout(() => { prog = false; reconciliar(); }, 40); };
  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('click', programar, true);
  programar();
  return { reconciliar };
}
