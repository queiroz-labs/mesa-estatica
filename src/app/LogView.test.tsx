import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial } from '../state/factories';

vi.mock('../state/store', () => ({
  useStore: (seletor: (estado: unknown) => unknown) => seletor({
    ...criarEstadoInicial(),
    log: [{ id: 'log-ficha', timestamp: '2026-10-11T12:00:00Z', tipo: 'ficha', personagemId: 'f1', texto: 'Helena alterou perícia Investigação', visibilidade: 'privada' }],
  }),
}));

import LogView from './LogView';

describe('alterações privadas de ficha no log', () => {
  it('mostra o registro e o filtro para o mestre', () => {
    const html = renderToStaticMarkup(<LogView podeLimpar />);
    expect(html).toContain('Helena alterou perícia Investigação');
    expect(html).toContain('alteração de ficha');
    expect(html).toContain('privado');
  });
  it('esconde o registro na tela do jogador mesmo se estiver no estado local', () => {
    const html = renderToStaticMarkup(<LogView podeLimpar={false} />);
    expect(html).not.toContain('Helena alterou perícia Investigação');
  });
});
