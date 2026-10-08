import { useStore } from '../../state/store';

/** Uma ação explícita publica o texto e organiza o quadro; mudar de coluna não publica. */
export function revelarPistaAosJogadores(id: string): void {
  const mesa = useStore.getState();
  const pista = mesa.pistas.find((p) => p.id === id);
  if (!pista || !pista.texto.trim() || pista.reveladoEm) return;

  // O marcador vem primeiro: um segundo clique, inclusive no card antigo, não duplica o log.
  mesa.atualizarPista(id, { status: 'compartilhada', reveladoEm: new Date().toISOString() });
  mesa.registrarLog('anotacao', `pista revelada: ${pista.texto}${pista.ligadoA ? ` — ligado a: ${pista.ligadoA}` : ''}`, null, 'publica');
}
