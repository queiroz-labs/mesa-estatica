import { calcularDefesa, calcularPvMaximo } from '../rules/derivados';
import { useStore } from '../state/store';
import type { EntradaIniciativa, Ficha } from '../state/types';
import './ResumoJogador.css';

interface Props {
  minhaFicha: Ficha | null;
  iniciativa: Pick<EntradaIniciativa, 'id' | 'participanteId' | 'tipo'>[];
}

/** Só a ficha própria, fora das abas. Não precisa de nomes ou dados de outro combatente. */
export default function ResumoJogador({ minhaFicha, iniciativa }: Props) {
  const basePV = useStore((s) => s.config.basePV);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const turnoAtualId = useStore((s) => s.sessaoPublica.turnoAtualId);
  const rodada = useStore((s) => s.sessaoPublica.rodada);

  if (!minhaFicha) return null;
  const turnoAtual = iniciativa.find((e) => e.id === turnoAtualId);
  const minhaVez = modoCombate && turnoAtual?.tipo === 'pc' && turnoAtual.participanteId === minhaFicha.id;
  const pvMaximo = calcularPvMaximo(basePV, minhaFicha.atributos.vigor);
  const defesa = calcularDefesa(minhaFicha.atributos.agilidade, minhaFicha.equipamentoModificadorDefesa);

  return (
    <div className="resumo-jogador mono" aria-label="resumo do seu personagem">
      <div className="resumo-jogador__valores">
        <span>PV <strong>{minhaFicha.pvAtual}/{pvMaximo}</strong></span>
        <span title="defesa da ficha: 10 + Agilidade + proteção">Defesa <strong>{defesa}</strong></span>
        <span>Determinação <strong>{minhaFicha.determinacao}/2</strong></span>
      </div>
      {minhaVez && (
        <span className="resumo-jogador__turno" role="status" aria-live="polite" aria-atomic="true">
          rodada {rodada} · sua vez
        </span>
      )}
    </div>
  );
}
