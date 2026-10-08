import { afterEach, describe, expect, it } from 'vitest';
import { avisarInicioRolagem, ehRolagemPropria, marcarComoProprio, useRolagemAoVivoStore } from './rolagemAoVivoStore';

afterEach(() => useRolagemAoVivoStore.setState({ atual: null, iniciando: null }));

describe('marcarComoProprio / ehRolagemPropria', () => {
  it('um id marcado como próprio é reconhecido como próprio', () => {
    const id = 'rolagem-teste-1';
    expect(ehRolagemPropria(id)).toBe(false);
    marcarComoProprio(id);
    expect(ehRolagemPropria(id)).toBe(true);
  });

  it('um id nunca marcado não é considerado próprio (rolagem de outro jogador)', () => {
    expect(ehRolagemPropria('rolagem-nunca-marcada')).toBe(false);
  });

  it('marcar não afeta outros ids', () => {
    marcarComoProprio('rolagem-teste-2');
    expect(ehRolagemPropria('rolagem-teste-3')).toBe(false);
  });
});

describe('aviso de início sem antecipar resultado', () => {
  it('inicio local contém apenas a identidade pública e é marcado como próprio', () => {
    const id = avisarInicioRolagem('Arthur', '#888888', 'teste');
    expect(useRolagemAoVivoStore.getState().iniciando).toEqual({ id, origem: 'Arthur', cor: '#888888', tipo: 'teste' });
    expect(ehRolagemPropria(id)).toBe(true);
    expect(useRolagemAoVivoStore.getState().atual).toBeNull();
  });

  it('resultado anterior não limpa o início mais novo; só o resultado do mesmo ID limpa', () => {
    const id = avisarInicioRolagem('Arthur', '#888888', 'teste');
    const resultado = { id: 'antigo', origem: 'Arthur', cor: '#888888', tipo: 'teste' as const, colorsetBase: 'rede' as const, termos: [{ sides: 20, qty: 1 }], valores: [12] };
    useRolagemAoVivoStore.getState().definirAtual(resultado);
    expect(useRolagemAoVivoStore.getState().iniciando?.id).toBe(id);
    useRolagemAoVivoStore.getState().definirAtual({ ...resultado, id });
    expect(useRolagemAoVivoStore.getState().iniciando).toBeNull();
  });
});
