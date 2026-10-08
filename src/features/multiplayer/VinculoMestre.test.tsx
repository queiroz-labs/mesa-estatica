import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVinculoMestreStore } from '../../multiplayer/vinculoMestreStore';
import VinculoMestre from './VinculoMestre';

vi.mock('../../multiplayer/auth', () => ({
  CHAVE_TOKEN_MESTRE: 'chave-teste',
  verificarVinculoMestre: vi.fn(), trocarTokenMestre: vi.fn(), vincularComoMestre: vi.fn(),
}));
vi.mock('../../multiplayer/vinculoMestreStore', async (original) => {
  const real = await original<typeof import('../../multiplayer/vinculoMestreStore')>();
  return { ...real, useVinculoMestreStore: Object.assign(
    (selector: Parameters<typeof real.useVinculoMestreStore>[0]) => selector(real.useVinculoMestreStore.getState()),
    real.useVinculoMestreStore,
  ) };
});
beforeEach(() => {
  useVinculoMestreStore.setState({ status: 'checando' });
  vi.stubGlobal('localStorage', { getItem: () => 'token-mestre-privado' });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['checando', 'verificando mestre'],
  ['vinculado', 'mestre vinculado'],
  ['nao-vinculado', 'mestre não vinculado'],
] as const)('vínculo %s usa botão nativo acessível e texto explícito', (status, texto) => {
  useVinculoMestreStore.setState({ status });
  const html = renderToStaticMarkup(<VinculoMestre />);
  expect(html).toContain('<button type="button"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain(texto);
  expect(html).toContain('<svg');
  expect(html).not.toMatch(/role="button"|token-mestre-privado|var\(--ruido\)/);
});

it('restrição de armazenamento não derruba o indicador de vínculo', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage bloqueado'); } });
  expect(() => renderToStaticMarkup(<VinculoMestre />)).not.toThrow();
});
