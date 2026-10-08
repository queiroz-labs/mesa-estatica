interface FerramentaMapa {
  area: () => HTMLElement | null;
  cancelar: () => void;
}
const ferramentas = new Set<FerramentaMapa>();

export function elementoVisivel(elemento: HTMLElement | null): boolean {
  if (!elemento || elemento.getClientRects().length === 0) return false;
  const estilo = getComputedStyle(elemento);
  return estilo.visibility !== 'hidden' && estilo.display !== 'none';
}

function aoPressionarEsc(evento: KeyboardEvent): void {
  if (evento.key !== 'Escape' || evento.defaultPrevented) return;
  const alvo = evento.target as HTMLElement | null;
  if (alvo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable)) return;
  const modais = document.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="dialog"], [role="alertdialog"], [style*="--overlay-backdrop"]');
  if ([...modais].some(elementoVisivel)) return;
  let encerrou = false;
  // FoW e AoE podem estar ligados juntos: um único Esc libera as duas capturas.
  for (const ferramenta of ferramentas) {
    if (!elementoVisivel(ferramenta.area())) continue;
    ferramenta.cancelar();
    encerrou = true;
  }
  if (encerrou) { evento.preventDefault(); evento.stopPropagation(); }
}

export function registrarEscFerramentaMapa(area: () => HTMLElement | null, cancelar: () => void): () => void {
  const ferramenta = { area, cancelar };
  ferramentas.add(ferramenta);
  if (ferramentas.size === 1) window.addEventListener('keydown', aoPressionarEsc);
  return () => {
    ferramentas.delete(ferramenta);
    if (ferramentas.size === 0) window.removeEventListener('keydown', aoPressionarEsc);
  };
}

export interface CapturaMapa { alvo: Element; ponteiroId: number }
export function liberarCapturaMapa(captura: CapturaMapa | null): void {
  if (!captura) return;
  try {
    if (captura.alvo.hasPointerCapture(captura.ponteiroId)) captura.alvo.releasePointerCapture(captura.ponteiroId);
  } catch { /* O navegador pode já ter liberado a captura ao terminar o gesto. */ }
}
