import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handler: null as any,
  cliente: null as any,
  getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => h.cliente }));
vi.stubGlobal('Deno', { env: { get: () => 'qa-local' }, serve: (handler: unknown) => { h.handler = handler; } });
await import('./index');

const LINK_A = '00000000-0000-4000-8000-000000000001';
const LINK_B = '00000000-0000-4000-8000-000000000002';
const UID_A = '00000000-0000-4000-8000-000000000003';
const UID_B = '00000000-0000-4000-8000-000000000004';

beforeEach(() => {
  vi.resetAllMocks();
  h.getUser.mockResolvedValue({ data: { user: { id: UID_A } }, error: null });
  h.rpc.mockResolvedValue({ data: 'qa-ficha', error: null });
  h.cliente = { auth: { getUser: h.getUser }, rpc: h.rpc, from: h.from };
});
afterEach(() => vi.restoreAllMocks());
const chamar = (body: unknown = { owner_token: LINK_A }, authorization: string | null = 'Bearer qa'): Promise<Response> =>
  h.handler(new Request('https://example.test/vincular-jogador', {
    method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body: JSON.stringify(body),
  }));

it('faz uma única RPC com identidade do JWT, ignorando UID enviado no corpo', async () => {
  const resposta = await chamar({ owner_token: LINK_A, auth_uid: UID_B, p_auth_uid: UID_B });
  expect(resposta.status).toBe(200);
  expect(await resposta.json()).toEqual({ ok: true, characterId: 'qa-ficha' });
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith('vincular_jogador_atomico', { p_owner_token: LINK_A, p_auth_uid: UID_A });
  expect(h.from).not.toHaveBeenCalled();
});

it('não recorre a updates separados se a transação falhar ou a RPC estiver ausente', async () => {
  h.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'RPC indisponível' } });
  const resposta = await chamar();
  expect(resposta.status).toBe(500);
  expect(await resposta.json()).toEqual({ erro: 'falha ao vincular' });
  expect(h.from).not.toHaveBeenCalled();
});

it('retorna erro controlado se o transporte da RPC rejeitar a promise', async () => {
  h.rpc.mockRejectedValue(new Error('falha de transporte sintética'));
  expect((await chamar()).status).toBe(500);
  expect(h.from).not.toHaveBeenCalled();
});

it('link inexistente retorna 404 quando a RPC devolve null', async () => {
  h.rpc.mockResolvedValue({ data: null, error: null });
  expect((await chamar()).status).toBe(404);
  expect(h.from).not.toHaveBeenCalled();
});

it.each([{}, { owner_token: null }, { owner_token: '' }])('corpo sem link não toca o banco: %j', async (body) => {
  expect((await chamar(body)).status).toBe(400);
  expect(h.rpc).not.toHaveBeenCalled();
});

it.each([{ owner_token: {} }, { owner_token: 4 }, { owner_token: 'nao-e-uuid' }])('link malformado não toca o banco: %j', async (body) => {
  expect((await chamar(body)).status).toBe(404);
  expect(h.rpc).not.toHaveBeenCalled();
});

it('sem autorização não resolve identidade nem vincula', async () => {
  expect((await chamar({ owner_token: LINK_A }, null)).status).toBe(401);
  expect(h.getUser).not.toHaveBeenCalled();
  expect(h.rpc).not.toHaveBeenCalled();
});

it('JWT inválido não chama a RPC privilegiada', async () => {
  h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT inválido' } });
  expect((await chamar()).status).toBe(401);
  expect(h.rpc).not.toHaveBeenCalled();
});

// Modelo de contrato para exercitar a Edge real; não interpreta SQL nem prova
// isolamento/grants do PostgreSQL. Esses critérios exigem homologação no dev.
function bancoTransacionalSimulado() {
  let rows = [
    { id: 'qa-A', owner_token: LINK_A, auth_uid: UID_A as string | null },
    { id: 'qa-B', owner_token: LINK_B, auth_uid: null as string | null },
  ];
  let fila = Promise.resolve();
  let falharAtribuicao = false;
  h.rpc.mockImplementation((_name, { p_owner_token, p_auth_uid }) => {
    const executar = async () => {
      const copia = rows.map(row => ({ ...row }));
      const alvo = copia.find(row => row.owner_token === p_owner_token);
      if (!alvo) return { data: null, error: null };
      for (const row of copia) if (row.auth_uid === p_auth_uid && row.id !== alvo.id) row.auth_uid = null;
      await Promise.resolve();
      if (falharAtribuicao) return { data: null, error: { message: 'atribuição falhou' } };
      alvo.auth_uid = p_auth_uid;
      rows = copia;
      return { data: alvo.id, error: null };
    };
    const resultado = fila.then(executar);
    fila = resultado.then(() => undefined);
    return resultado;
  });
  return { rows: () => rows, falhar: () => { falharAtribuicao = true; } };
}

it('contrato simulado: chamadas concorrentes só deixam uma ficha para a identidade', async () => {
  const banco = bancoTransacionalSimulado();
  const respostas = await Promise.all(Array.from({ length: 20 }, (_, i) => chamar({ owner_token: i % 2 ? LINK_B : LINK_A })));
  expect(respostas.every(resposta => resposta.status === 200)).toBe(true);
  expect(banco.rows().filter(row => row.auth_uid === UID_A)).toHaveLength(1);
  expect(h.rpc).toHaveBeenCalledTimes(20);
  expect(h.from).not.toHaveBeenCalled();
});

it('contrato simulado: falha na atribuição preserva o vínculo anterior', async () => {
  const banco = bancoTransacionalSimulado();
  banco.falhar();
  expect((await chamar({ owner_token: LINK_B })).status).toBe(500);
  expect(banco.rows().map(row => row.auth_uid)).toEqual([UID_A, null]);
});

it('contrato simulado: trocar de aparelho transfere a ficha sem deixar o dono anterior', async () => {
  const banco = bancoTransacionalSimulado();
  h.getUser.mockResolvedValue({ data: { user: { id: UID_B } }, error: null });
  expect((await chamar()).status).toBe(200);
  expect(banco.rows()[0].auth_uid).toBe(UID_B);
  expect(banco.rows().filter(row => row.auth_uid === UID_A)).toHaveLength(0);
});

it('contrato simulado: link inexistente não revoga a ficha atual', async () => {
  const banco = bancoTransacionalSimulado();
  expect((await chamar({ owner_token: '00000000-0000-4000-8000-000000000099' })).status).toBe(404);
  expect(banco.rows()[0].auth_uid).toBe(UID_A);
});
