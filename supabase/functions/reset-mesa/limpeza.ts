/** Etapas idempotentes. Uma falha interrompe a limpeza antes de apagar mais dados. */
export async function executarLimpeza(etapas: { nome: string; executar: () => Promise<void> }[]): Promise<{ ok: true } | { ok: false; erro: string }> {
  for (const etapa of etapas) {
    try {
      await etapa.executar();
    } catch (erro) {
      console.error(`[reset-mesa] ${etapa.nome} falhou`, erro);
      return { ok: false, erro: `limpeza incompleta em ${etapa.nome} — parte dos dados remotos pode já ter sido apagada. tente novamente para concluir.` };
    }
  }
  return { ok: true };
}
