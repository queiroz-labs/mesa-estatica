import { CAMADA_PRINCIPAL, obterCamadaAmbiencia } from '../../state/ambiencia';
import { useAmbienciaUiStore } from '../../state/ambienciaUiStore';
import { useStore } from '../../state/store';
import ControleVolume from './ControleVolume';

export default function CamadaAmbienciaControles({ id, numero }: { id: string; numero: number }) {
  const ambiencia = useStore((s) => s.ambiencia);
  const camada = obterCamadaAmbiencia(ambiencia, id);
  const duracao = useAmbienciaUiStore((s) => id === CAMADA_PRINCIPAL ? s.duracaoSegundos : s.camadas[id]?.duracaoSegundos ?? 0);
  const posicao = useAmbienciaUiStore((s) => id === CAMADA_PRINCIPAL ? s.posicaoSegundos : s.camadas[id]?.posicaoSegundos ?? 0);
  if (!camada) return null;
  const faixa = ambiencia.faixas.find((f) => f.id === camada.faixaAtualId);
  const nome = `ambiência ${numero}`;
  const atualizar = (patch: Parameters<ReturnType<typeof useStore.getState>['atualizarCamadaAmbiencia']>[1]) => useStore.getState().atualizarCamadaAmbiencia(id, patch);
  return <section aria-label={`camada ${numero}`} style={{ border: '1px solid var(--concrete-2)', padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
      <h4 className="label" style={{ margin: 0 }}>{nome}</h4>
      {id !== CAMADA_PRINCIPAL && <button type="button" aria-label={`remover camada ${numero}`} onClick={() => useStore.getState().removerCamadaAmbiencia(id)}>remover camada</button>}
    </div>
    <label className="label" htmlFor={`ambiencia-faixa-${id}`}>som de {nome}</label>
    <select id={`ambiencia-faixa-${id}`} value={camada.faixaAtualId ?? ''} onChange={(e) => atualizar({ faixaAtualId: e.target.value || null, tocando: !!e.target.value, posicaoSegundos: 0 })}>
      <option value="">nenhuma ambiência selecionada</option>
      {ambiencia.faixas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
    </select>
    <input type="range" aria-label={`posição da ${nome}`} min={0} max={duracao || 0} step={0.1}
      value={Math.min(posicao, duracao || 0)} disabled={!faixa || !duracao}
      onChange={(e) => atualizar({ posicaoSegundos: Number(e.target.value) })} />
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="acento" disabled={!faixa} aria-label={`${camada.tocando ? 'pausar' : 'tocar'} ${nome}`}
        onClick={() => atualizar({ tocando: !camada.tocando, posicaoSegundos: posicao })}>{camada.tocando ? 'pausar' : 'tocar'}</button>
      <button disabled={!faixa} aria-label={`parar ${nome}`} onClick={() => atualizar({ tocando: false, posicaoSegundos: 0 })}>parar</button>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)' }}>loop contínuo</span>
    </div>
    <ControleVolume id={`ambiencia-volume-${id}`} nome={`${nome} (todos)`} volume={camada.volume}
      onChange={(volume) => atualizar({ volume })} title={`volume da ${nome} — independente das outras camadas`} />
  </section>;
}
