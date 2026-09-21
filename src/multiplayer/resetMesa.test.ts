import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from '../state/factories';
import { useStore } from '../state/store';

// `supabase` é exportado como valor (não objeto), então o mock usa um getter pra conseguir
// alternar entre "configurado" e "ausente" entre os testes — o binding ESM é live.
const h = vi.hoisted(() => ({ clienteAtual: null as unknown }));
vi.mock('../lib/supabaseClient', () => ({
  get supabase() {
    return h.clienteAtual;
  },
}));

const { resetarMesaCompleta } = await import('./resetMesa');

function clienteFalso(invoke: ReturnType<typeof vi.fn>) {
  return { functions: { invoke } };
}

function mesaComUmaFicha() {
  useStore.setState({ ...criarEstadoInicial(), fichas: [{ ...criarFichaVazia(), id: 'ficha-1' }] });
}

beforeEach(() => {
  useStore.setState(criarEstadoInicial());
  h.clienteAtual = null;
  vi.restoreAllMocks();
});

describe('resetarMesaCompleta', () => {
  it.each([undefined, { ok: false, erro: 'limpeza incompleta' }, {}])('preserva a mesa sem confirmação explícita: %j', async (data) => {
    mesaComUmaFicha();
    const antes = useStore.getState();
    h.clienteAtual = clienteFalso(vi.fn().mockResolvedValue({ data, error: null }));
    expect((await resetarMesaCompleta('token')).ok).toBe(false);
    expect(useStore.getState()).toBe(antes);
  });
  it('preserva a mesa se a chamada lançar', async () => {
    mesaComUmaFicha();
    const antes = useStore.getState();
    h.clienteAtual = clienteFalso(vi.fn().mockRejectedValue(new Error('rede')));
    expect((await resetarMesaCompleta('token')).ok).toBe(false);
    expect(useStore.getState()).toBe(antes);
  });
  it('chama a Edge Function reset-mesa com o token informado', async () => {
    mesaComUmaFicha();
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    h.clienteAtual = clienteFalso(invoke);

    await resetarMesaCompleta('token-secreto');

    expect(invoke).toHaveBeenCalledWith('reset-mesa', { body: { reset_token: 'token-secreto' } });
  });

  it('em sucesso, zera o estado local', async () => {
    mesaComUmaFicha();
    h.clienteAtual = clienteFalso(vi.fn().mockResolvedValue({ data: { ok: true }, error: null }));

    const resultado = await resetarMesaCompleta('token-secreto');

    expect(resultado).toEqual({ ok: true });
    expect(useStore.getState().fichas).toEqual([]);
  });

  it('se o servidor rejeitar o token, aborta sem zerar o estado local', async () => {
    mesaComUmaFicha();
    const erro = new FunctionsHttpError(new Response(JSON.stringify({ erro: 'token inválido' }), { status: 403 }));
    h.clienteAtual = clienteFalso(vi.fn().mockResolvedValue({ error: erro }));

    const resultado = await resetarMesaCompleta('token-errado');

    expect(resultado).toEqual({ ok: false, erro: 'token inválido' });
    expect(useStore.getState().fichas).toHaveLength(1);
  });

  it('sem Supabase configurado: não chama function nenhuma e reseta local (mesa offline continua usável)', async () => {
    mesaComUmaFicha();
    h.clienteAtual = null;

    const resultado = await resetarMesaCompleta();

    expect(resultado).toEqual({ ok: true });
    expect(useStore.getState().fichas).toEqual([]);
  });
});
