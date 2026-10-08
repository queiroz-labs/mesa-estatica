import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStatusMesa } from '../lib/statusMesa';
import StatusIndicador from './StatusIndicador';
import DesyncIndicadorJogador from './DesyncIndicadorJogador';
import { recursosDaMesa } from './statusMensagens';

const cenario = vi.hoisted(() => ({
  configurado: false,
  pendencias: [] as { modulo: string; chave: string }[],
}));

vi.mock('../lib/supabaseClient', () => ({ get supabase() { return cenario.configurado ? {} : null; } }));
vi.mock('../multiplayer/filaPendencias', () => ({ usePendenciasDetalhe: () => cenario.pendencias }));
vi.mock('../lib/statusMesa', async (original) => {
  const real = await original<typeof import('../lib/statusMesa')>();
  return { ...real, useStatusMesa: Object.assign(
    (selector: Parameters<typeof real.useStatusMesa>[0]) => selector(real.useStatusMesa.getState()),
    real.useStatusMesa,
  ) };
});

beforeEach(() => {
  cenario.configurado = false;
  cenario.pendencias = [];
  useStatusMesa.setState({ local: 'ok', online: true, canaisComErro: new Set(), canaisConectados: new Set(), erroRuntime: null });
});

describe('estado da mesa', () => {
  it('separa gravação local de sincronização não configurada', () => {
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('● registrado');
    expect(html).toContain('modo local');
    expect(html).toContain('A sincronização entre dispositivos não está configurada');
    expect(html).not.toContain('conexão ativa');
  });

  it('aguarda conexão quando multiplayer está configurado e ainda não há canal ativo', () => {
    cenario.configurado = true;
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('conectando');
    expect(html).not.toContain('modo local');
    expect(html).not.toContain('conexão ativa');
  });

  it('descreve conexão ativa sem afirmar entrega aos jogadores', () => {
    cenario.configurado = true;
    useStatusMesa.setState({ canaisConectados: new Set(['tokens-sync']) });
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('conexão ativa');
    expect(html).toContain('não confirma que todos os jogadores já receberam cada ação');
    expect(html).not.toMatch(/sync ok|rede ativa|sincronizado com os jogadores em tempo real/);
    expect(html).toContain('<summary>');
    expect(html).toContain('<svg');
  });

  it('prioriza falta de internet mesmo se um canal ainda constar conectado', () => {
    useStatusMesa.setState({ online: false, canaisConectados: new Set(['tokens-sync']) });
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('sem internet');
    expect(html).toContain('quando a internet retornar');
    expect(html).not.toContain('conexão ativa');
  });

  it('erro parcial explica os recursos afetados em linguagem de sessão', () => {
    useStatusMesa.setState({ canaisConectados: new Set(['tokens-sync']), canaisComErro: new Set(['reguas', 'jogador-fichas-publico']) });
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('sincronização com falha');
    expect(html).toContain('Recursos afetados: fichas, régua');
    expect(html).not.toContain('jogador-fichas-publico');
    expect(html).not.toContain('conexão ativa');
  });

  it('nomeia fila sem publicar chaves e usa texto e SVG em vez de emoji', () => {
    cenario.pendencias = [{ modulo: 'tokens-sync', chave: 'id-personagem-privado' }, { modulo: 'midia-estado-sync', chave: 'id-audio-privado' }];
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('2 envios pendentes');
    expect(html).toContain('Aguardando envio: áudio, tokens no mapa');
    expect(html).not.toMatch(/id-personagem-privado|id-audio-privado|⏳|var\(--ruido\)/);
  });

  it('falha local recomenda backup e não continua dizendo registrado', () => {
    useStatusMesa.setState({ local: 'erro' });
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('não salvou neste navegador');
    expect(html).toContain('Exporte um backup antes de fechar a página');
    expect(html).not.toContain('● registrado');
  });

  it('aviso inesperado tem botão nativo e protege mensagens internas', () => {
    useStatusMesa.setState({ erroRuntime: 'falhou requisição com token-secreto' });
    const html = renderToStaticMarkup(<StatusIndicador />);
    expect(html).toContain('aviso da mesa');
    expect(html).toContain('<button type="button">dispensar aviso</button>');
    expect(html).not.toMatch(/token-secreto|role="button"/);
  });

  it('negação de permissão orienta reconferir vínculo, sem sugerir só aguardar rede', () => {
    useStatusMesa.setState({ erroRuntime: 'sem permissão pra salvar (tokens-sync)' });
    expect(renderToStaticMarkup(<StatusIndicador />)).toContain('Recarregue a página para conferir o vínculo');
  });
});

describe('aviso do jogador', () => {
  it('permanece silencioso quando não há falha', () => {
    expect(renderToStaticMarkup(<DesyncIndicadorJogador />)).toBe('');
    useStatusMesa.setState({ canaisConectados: new Set(['jogador-fichas-publico']) });
    expect(renderToStaticMarkup(<DesyncIndicadorJogador />)).toBe('');
  });

  it('mostra sem internet e reconexão automática sem confundir falha parcial', () => {
    useStatusMesa.setState({ online: false, canaisComErro: new Set(['reguas']) });
    const html = renderToStaticMarkup(<DesyncIndicadorJogador />);
    expect(html).toContain('sem internet');
    expect(html).toContain('reconexão automática');
    expect(html).not.toContain('sincronização com falha');
  });

  it('mostra recurso com falha mesmo havendo outro conectado', () => {
    useStatusMesa.setState({ canaisComErro: new Set(['jogador-iniciativa']), canaisConectados: new Set(['jogador-fichas-publico']) });
    const html = renderToStaticMarkup(<DesyncIndicadorJogador />);
    expect(html).toContain('sincronização com falha');
    expect(html).toContain('informações de combate podem estar desatualizadas');
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/sem internet|jogador-iniciativa|var\(--ruido\)/);
  });
});

it('agrupa recursos equivalentes e oferece fallback sem revelar um canal desconhecido', () => {
  expect(recursosDaMesa(['fichas-publico-sync', 'fichas-privado-sync', 'canal-interno-secreto', 'aoe'])).toEqual(['áreas de efeito', 'fichas', 'outros recursos da mesa']);
});
