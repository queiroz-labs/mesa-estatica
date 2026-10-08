import { useState } from 'react';
import { formatarLogRolagem, type GrupoDados, type RollGroupResult, type RollTermo } from '../../dice/useDiceBox';
import { useStore } from '../../state/store';
import type { ColorsetId } from '../../dice/colorsets';
import type { TipoRolagemForcada } from '../../dice/registroForcados';
import ResultadoLivre from './ResultadoLivre';
import { criarResultadoLivreDetalhado, formulaLivreComAjuste, type ResultadoLivreDetalhado } from './resultadoLivreApresentacao';
import Icone from '../../components/Icone';
import './dados.css';

const TODAS_AS_FACES = [4, 6, 8, 10, 12, 20, 100];

interface Termo {
  id: string;
  quantidade: number;
  faces: number;
}

function termoVazio(faces = 20): Termo {
  return { id: crypto.randomUUID(), quantidade: 1, faces };
}

interface RolagemLivreJogadorProps {
  fichaId: string;
  ready: boolean;
  rolar: (
    notacao: RollTermo[], onComplete: (r: RollGroupResult[]) => void,
    colorset?: ColorsetId, personagemId?: string | null, tipo?: TipoRolagemForcada, bonus?: number,
  ) => void;
}

export default function RolagemLivreJogador({ fichaId, ready, rolar }: RolagemLivreJogadorProps) {
  const fichas = useStore((s) => s.fichas);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);
  const fichaNome = fichas.find((f) => f.id === fichaId)?.nome ?? null;

  const [bonus, setBonus] = useState(0);
  const [termos, setTermos] = useState<Termo[]>([termoVazio()]);
  const [resultado, setResultado] = useState<ResultadoLivreDetalhado | null>(null);
  const [rolando, setRolando] = useState(false);

  const podeRolar = ready && !rolando;

  const atualizarTermo = (id: string, patch: Partial<Termo>) => {
    setTermos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const adicionarTermo = () => setTermos((prev) => [...prev, termoVazio()]);
  const removerTermo = (id: string) => setTermos((prev) => (prev.length > 1 ? prev.filter((t) => t.id !== id) : prev));

  const rolarCombinado = () => {
    setRolando(true);
    setResultado(null);
    const notacao: RollTermo[] = termos.map((t) => ({ sides: t.faces, qty: t.quantidade }));
    rolar(notacao, (resultados) => {
      setResultado(criarResultadoLivreDetalhado(fichaNome || 'Personagem', resultados, bonus));
      setRolando(false);

      const total = resultados.reduce((soma, g) => soma + g.value, 0);
      const totalComBonus = total + bonus;
      const notacaoTexto = termos.map((t) => `${t.quantidade}d${t.faces}`).join(' + ');
      const gruposLog: GrupoDados[] = resultados.map((g) => ({ notacao: `${g.qty}d${g.sides}`, resultados: g.rolls.map((r) => r.value) }));
      registrarLog(
        'rolagem-livre',
        formatarLogRolagem({ quem: fichaNome || 'Personagem', tipo: 'Rolagem Livre', grupos: gruposLog, bonus: bonus || undefined, total: totalComBonus }),
        fichaId,
        'publica',
      );

      registrarRoll({
        origem: fichaNome || 'Rolagem livre',
        personagemId: fichaId,
        formula: formulaLivreComAjuste(notacaoTexto, bonus),
        total: totalComBonus,
        bruto: total,
        visibilidade: 'publica',
      });
    }, undefined, fichaId, 'qualquer', bonus || undefined);
  };

  const notacaoTexto = termos.map((t) => `${t.quantidade}d${t.faces}`).join(' + ');

  return (
    <section className="secao">
      <h3 className="label">Rolagem livre</h3>

      <div className="campos-grid" style={{ gridTemplateColumns: '1fr', marginTop: '0.5rem' }}>
        <div>
          <label htmlFor="rlj-bonus">Ajuste (+ bônus / − penalidade)</label>
          <input
            id="rlj-bonus"
            type="number"
            value={bonus}
            onChange={(e) => setBonus(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem', marginBottom: '0.75rem' }}>
        {TODAS_AS_FACES.map((f) => (
          <button key={f} onClick={() => setTermos([{ id: crypto.randomUUID(), quantidade: 1, faces: f }])} disabled={!podeRolar || rolando}>
            1d{f}
          </button>
        ))}
      </div>

      {termos.map((t) => (
        <div key={t.id} className="linha-repetivel dados-termo">
          <input
            type="number"
            min={1}
            max={20}
            aria-label="quantidade de dados"
            value={t.quantidade}
            onChange={(e) => atualizarTermo(t.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })}
          />
          <select aria-label="faces do dado" value={t.faces} onChange={(e) => atualizarTermo(t.id, { faces: Number(e.target.value) })}>
            {TODAS_AS_FACES.map((f) => (
              <option key={f} value={f}>
                d{f}
              </option>
            ))}
          </select>
          <span className="vazio" style={{ alignSelf: 'center' }}>
            {t.quantidade}d{t.faces}
          </span>
          <button className="icone-botao" title={`remover ${t.quantidade}d${t.faces}`} aria-label={`remover ${t.quantidade}d${t.faces}`} onClick={() => removerTermo(t.id)} disabled={termos.length <= 1}>
            <Icone nome="lixeira" />
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <button className="acento" onClick={adicionarTermo}>
          + combinar outro dado
        </button>
        <button disabled={!podeRolar || rolando} onClick={rolarCombinado}>
          rolar {notacaoTexto}
        </button>
      </div>

      {resultado && <ResultadoLivre resultado={resultado} />}
    </section>
  );
}
