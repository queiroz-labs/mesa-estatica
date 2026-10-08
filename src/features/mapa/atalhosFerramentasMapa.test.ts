import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registrarEscFerramentaMapa } from './atalhosFerramentasMapa';
let handler: (evento: any) => void;
let modais: any[];
let paradas: Array<() => void>;
const elemento = (visibilidade = 'visible') => ({ getClientRects: () => [{}], visibilidade }) as any;
const evento = (target: any = { tagName: 'DIV' }) => ({ key: 'Escape', target, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() });
beforeEach(() => {
  modais = []; paradas = [];
  vi.stubGlobal('window', { addEventListener: (_nome: string, callback: any) => { handler = callback; }, removeEventListener: vi.fn() });
  vi.stubGlobal('document', { querySelectorAll: () => modais });
  vi.stubGlobal('getComputedStyle', (el: any) => ({ visibility: el.visibilidade ?? 'visible', display: 'block' }));
});
afterEach(() => { paradas.forEach((parar) => parar()); vi.unstubAllGlobals(); });

it('Esc encerra ambas as ferramentas visíveis de uma vez', () => {
  const fow = vi.fn(); const aoe = vi.fn();
  paradas.push(registrarEscFerramentaMapa(() => elemento(), fow), registrarEscFerramentaMapa(() => elemento(), aoe));
  const e = evento(); handler(e);
  expect(fow).toHaveBeenCalledOnce(); expect(aoe).toHaveBeenCalledOnce();
  expect(e.preventDefault).toHaveBeenCalledOnce();
});
it('não atravessa modal visível nem atua em input/editável ou mapa oculto', () => {
  const cancelar = vi.fn();
  paradas.push(registrarEscFerramentaMapa(() => elemento(), cancelar));
  modais = [elemento()]; handler(evento()); modais = [];
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) handler(evento({ tagName }));
  handler(evento({ tagName: 'DIV', isContentEditable: true }));
  expect(cancelar).not.toHaveBeenCalled();
  paradas[0](); paradas = [registrarEscFerramentaMapa(() => elemento('hidden'), cancelar)];
  handler(evento()); expect(cancelar).not.toHaveBeenCalled();
});
it('modal oculto permite Esc, mas evento já consumido permanece intacto', () => {
  const cancelar = vi.fn();
  paradas.push(registrarEscFerramentaMapa(() => elemento(), cancelar));
  modais = [elemento('hidden')];
  handler({ ...evento(), defaultPrevented: true });
  expect(cancelar).not.toHaveBeenCalled();
  handler(evento()); expect(cancelar).toHaveBeenCalledOnce();
});
