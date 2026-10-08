import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarRecepcaoPosicoesTokens } from './tokensPosicaoRapida';
import type { TokenMapa } from '../state/types';

const pc: TokenMapa = { id: 'pc', participanteId: 'ficha', tipo: 'pc', x: 0.5, y: 0.5, versaoPosicao: 0 };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function criarCliente() {
  const canais: any[] = [];
  const cliente: any = {
    channel: vi.fn((topic, options) => {
      const canal: any = { topic, options, send: vi.fn() };
      canal.on = (_type: string, _filter: unknown, receber: (payload: any) => void) => { canal.receber = receber; return canal; };
      canal.subscribe = (status: (status: string) => void) => { canal.status = status; return canal; };
      canais.push(canal);
      return canal;
    }),
    removeChannel: vi.fn(),
  };
  return { cliente, canais };
}

it('abre exclusivamente recepção privada para PC de backend com versão; NPC e legado não entram', () => {
  const { cliente, canais } = criarCliente();
  const receber = vi.fn();
  const recepcao = criarRecepcaoPosicoesTokens(cliente, receber, vi.fn());
  recepcao.atualizar([pc, { ...pc, id: 'npc', tipo: 'npc' }, { id: 'legado', participanteId: 'ficha2', tipo: 'pc', x: 0, y: 0 }]);
  recepcao.atualizar([pc]);
  expect(cliente.channel).toHaveBeenCalledTimes(1);
  expect(cliente.channel).toHaveBeenCalledWith('token-pc:pc', { config: { private: true } });
  canais[0].receber({ payload: { id: 'npc', x: 0.2, y: 0.3, versao_posicao: 1 } });
  expect(receber).not.toHaveBeenCalled();
  canais[0].receber({ payload: { id: 'pc', x: 0.2, y: 0.3, versao_posicao: 1 } });
  expect(receber).toHaveBeenCalledWith({ id: 'pc', x: 0.2, y: 0.3, versaoPosicao: 1 });
  expect(canais[0].send).not.toHaveBeenCalled();
  recepcao.parar();
});

it('refaz leitura no primeiro join e depois de reconectar; ignora canal antigo de token removido/recriado', async () => {
  const { cliente, canais } = criarCliente();
  const receber = vi.fn();
  const reconsultar = vi.fn();
  const recepcao = criarRecepcaoPosicoesTokens(cliente, receber, reconsultar);
  recepcao.atualizar([pc]);
  canais[0].status('SUBSCRIBED');
  expect(reconsultar).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(1);
  canais[0].status('CHANNEL_ERROR');
  canais[0].status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(2);
  recepcao.atualizar([]);
  expect(cliente.removeChannel).toHaveBeenCalledWith(canais[0]);
  recepcao.atualizar([pc]);
  canais[0].receber({ payload: { id: 'pc', x: 0.1, y: 0.1, versao_posicao: 5 } });
  expect(receber).not.toHaveBeenCalled();
  recepcao.parar();
  canais[1].receber({ payload: { id: 'pc', x: 0.1, y: 0.1, versao_posicao: 5 } });
  expect(receber).not.toHaveBeenCalled();
});

it('rajada de joins faz uma consulta; joins durante essa consulta fazem só uma leitura seguinte', async () => {
  const { cliente, canais } = criarCliente();
  let concluir!: () => void;
  const reconsultar = vi.fn().mockReturnValueOnce(new Promise<void>((resolve) => { concluir = resolve; }));
  const recepcao = criarRecepcaoPosicoesTokens(cliente, vi.fn(), reconsultar);
  recepcao.atualizar(Array.from({ length: 6 }, (_, i) => ({ ...pc, id: `pc-${i}` })));
  for (const canal of canais) canal.status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(1);
  for (const canal of canais) canal.status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(100);
  expect(reconsultar).toHaveBeenCalledTimes(1);
  concluir();
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(2);
  recepcao.parar();
});

it('cleanup cancela refetch pendente e falha da consulta é tratada sem impedir próxima assinatura', async () => {
  const { cliente, canais } = criarCliente();
  const reconsultar = vi.fn().mockRejectedValue(new Error('sem rede'));
  const recepcao = criarRecepcaoPosicoesTokens(cliente, vi.fn(), reconsultar);
  recepcao.atualizar([pc]);
  canais[0].status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(1);
  canais[0].status('SUBSCRIBED');
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(2);
  canais[0].status('SUBSCRIBED');
  recepcao.parar();
  await vi.advanceTimersByTimeAsync(25);
  expect(reconsultar).toHaveBeenCalledTimes(2);
});
