import { expect, it, vi } from 'vitest';
import { executarLimpeza } from './limpeza';

it.each([0, 1, 2])('interrompe na falha da etapa %s e permite repetir', async (falha) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const etapas = ['tabelas', 'imagens', 'áudio'].map((nome) => ({ nome, executar: vi.fn().mockResolvedValue(undefined) }));
  etapas[falha].executar.mockRejectedValueOnce(new Error('indisponível'));
  const resultado = await executarLimpeza(etapas);
  expect(resultado.ok).toBe(false);
  if (!resultado.ok) expect(resultado.erro).toContain(etapas[falha].nome);
  for (let i = falha + 1; i < etapas.length; i++) expect(etapas[i].executar).not.toHaveBeenCalled();
  expect(await executarLimpeza(etapas)).toEqual({ ok: true });
  log.mockRestore();
});
