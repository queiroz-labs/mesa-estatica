import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ admin: null as any, fetchR2: vi.fn(), handler: null as any, env: {} as Record<string, string> }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => h.admin }));
vi.mock('https://esm.sh/aws4fetch@1.0.20', () => ({ AwsClient: class { fetch = h.fetchR2; } }));
vi.stubGlobal('Deno', { env: { get: (nome: string) => h.env[nome] }, serve: (handler: unknown) => { h.handler = handler; } });
await import('./index');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.env = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESET_TOKEN', 'R2_ACCOUNT_ID', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].map((key) => [key, 'qa']));
  const excluir = vi.fn().mockResolvedValue({ error: null });
  const storage = { list: vi.fn().mockResolvedValue({ data: [{ id: 'arquivo', name: 'foto.png' }], error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
  h.admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'qa' } }, error: null }) },
    rpc: async () => ({ error: null }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), delete: () => ({ not: excluir }) }),
    storage: { from: () => storage }, excluir, arquivos: storage,
  };
  h.fetchR2.mockReset().mockImplementation(async (_url, options) => options?.method === 'DELETE'
    ? new Response(null, { status: 204 })
    : new Response('<ListBucketResult><Contents><Key>sfx/test.mp3</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'));
});
afterEach(() => vi.restoreAllMocks());
const chamar = (): Promise<Response> => h.handler(new Request('https://example.test/reset-mesa', {
  method: 'POST', headers: { Authorization: 'Bearer qa' }, body: JSON.stringify({ reset_token: 'qa' }),
}));

it.each(['tabela', 'listar imagens', 'apagar imagens', 'listar áudio', 'apagar áudio'])('responde falha parcial se falhar em %s', async (etapa) => {
  const error = { message: 'falha simulada' };
  if (etapa === 'tabela') h.admin.excluir.mockResolvedValueOnce({ error });
  if (etapa === 'listar imagens') h.admin.arquivos.list.mockResolvedValueOnce({ data: null, error });
  if (etapa === 'apagar imagens') h.admin.arquivos.remove.mockResolvedValueOnce({ error });
  if (etapa === 'listar áudio') h.fetchR2.mockResolvedValueOnce(new Response(null, { status: 503 }));
  if (etapa === 'apagar áudio') h.fetchR2.mockImplementation(async (_url, options) => options?.method === 'DELETE'
    ? new Response(null, { status: 503 }) : new Response('<Contents><Key>sfx/test.mp3</Key></Contents>'));
  const resposta = await chamar();
  expect(resposta.status).toBe(500);
  expect(await resposta.json()).toMatchObject({ ok: false, erro: expect.stringContaining('limpeza incompleta') });
  if (etapa === 'tabela') expect(h.admin.arquivos.list).not.toHaveBeenCalled();
  if (etapa.includes('imagens')) expect(h.fetchR2).not.toHaveBeenCalled();
});
it('confirma sucesso somente após limpar todas as etapas', async () => {
  const resposta = await chamar();
  expect(resposta.status).toBe(200);
  expect(await resposta.json()).toEqual({ ok: true });
  expect(h.admin.arquivos.remove).toHaveBeenCalledWith(['foto.png']);
  expect(h.fetchR2).toHaveBeenCalledWith(expect.stringContaining('/sfx/test.mp3'), { method: 'DELETE' });
});
it('não inicia exclusões com configuração de áudio incompleta', async () => {
  delete h.env.R2_BUCKET_NAME;
  expect((await chamar()).status).toBe(503);
  expect(h.admin.excluir).not.toHaveBeenCalled();
});
