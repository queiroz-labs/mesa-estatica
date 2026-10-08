import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LinkJogadorBotao from './LinkJogadorBotao';

const ambiente = vi.hoisted(() => ({
  estados: [] as any[], indiceEstado: 0, refs: [] as { current: any }[], indiceRef: 0,
  limpezas: [] as (() => void)[], efeitoMontado: false,
  buscar: vi.fn(), regenerar: vi.fn(), clipboard: vi.fn(), confirmar: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (valor: any) => {
    const i = ambiente.indiceEstado++;
    if (!(i in ambiente.estados)) ambiente.estados[i] = valor;
    return [ambiente.estados[i], (novo: any) => { ambiente.estados[i] = typeof novo === 'function' ? novo(ambiente.estados[i]) : novo; }];
  },
  useRef: (valor: any) => ambiente.refs[ambiente.indiceRef++] ??= { current: valor },
  useEffect: (executar: () => () => void) => {
    if (ambiente.efeitoMontado) return;
    ambiente.limpezas.push(executar());
    ambiente.efeitoMontado = true;
  },
}));
vi.mock('../../multiplayer/auth', () => ({ consultarIsGm: vi.fn().mockResolvedValue(true) }));
vi.mock('../../multiplayer/links', () => ({
  buscarOwnerToken: ambiente.buscar,
  regenerarOwnerToken: ambiente.regenerar,
  montarLinkJogador: (token: string) => `http://localhost:5174/jogador.html?t=${token}`,
}));

const renderizar = () => {
  ambiente.indiceEstado = 0;
  ambiente.indiceRef = 0;
  return LinkJogadorBotao({ fichaId: 'ficha-qa', fichaNome: 'Arthur QA' });
};
const concluir = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
beforeEach(() => {
  vi.useFakeTimers();
  ambiente.estados = []; ambiente.refs = []; ambiente.limpezas = []; ambiente.efeitoMontado = false;
  ambiente.buscar.mockResolvedValue('atual');
  ambiente.regenerar.mockResolvedValue('novo');
  ambiente.clipboard.mockResolvedValue(undefined);
  ambiente.confirmar.mockReturnValue(true);
  vi.stubGlobal('navigator', { clipboard: { writeText: ambiente.clipboard } });
  vi.stubGlobal('window', { confirm: ambiente.confirmar });
});
afterEach(() => {
  for (const limpar of ambiente.limpezas) limpar();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks();
});

describe('copiar link do jogador no mestre', () => {
  it('cópia bloqueada após regenerar preserva o novo link para copiar manualmente', async () => {
    ambiente.clipboard.mockRejectedValue(new Error('permissão negada'));
    renderizar().props.children[1].props.onClick({ stopPropagation: vi.fn() });
    await concluir();
    const resultado = renderizar();
    expect(ambiente.regenerar).toHaveBeenCalledOnce();
    expect(resultado.props.children[1].props['aria-disabled']).toBe(false);
    expect(resultado.props.children[3].props.children[1].props.value).toBe('http://localhost:5174/jogador.html?t=novo');
    vi.advanceTimersByTime(5000);
    expect(renderizar().props.children[3]).toBeTruthy();
  });

  it('falha da consulta libera o botão sem marcar cópia bem-sucedida', async () => {
    ambiente.buscar.mockRejectedValue(new Error('rede indisponível'));
    renderizar().props.children[0].props.onClick({ stopPropagation: vi.fn() });
    await concluir();
    const resultado = renderizar();
    expect(resultado.props.children[0].props.title).toContain('confira a conexão');
    expect(resultado.props.children[0].props['aria-disabled']).toBe(false);
    expect(ambiente.clipboard).not.toHaveBeenCalled();
  });

  it('duas ativações antes do rerender fazem uma única consulta e mantêm Enter disponível', async () => {
    const botao = renderizar().props.children[0];
    botao.props.onKeyDown({ key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() });
    botao.props.onClick({ stopPropagation: vi.fn() });
    await concluir();
    expect(ambiente.buscar).toHaveBeenCalledOnce();
    expect(ambiente.clipboard).toHaveBeenCalledWith('http://localhost:5174/jogador.html?t=atual');
  });

  it('timer da cópia anterior não interrompe o estado de uma consulta mais nova', async () => {
    renderizar().props.children[0].props.onClick({ stopPropagation: vi.fn() });
    await concluir();
    ambiente.buscar.mockImplementation(() => new Promise(() => {}));
    renderizar().props.children[0].props.onClick({ stopPropagation: vi.fn() });
    vi.advanceTimersByTime(5000);
    expect(renderizar().props.children[0].props['aria-disabled']).toBe(true);
  });
});
