import { useState } from 'react';
import type { ColorsetId } from '../../dice/colorsets';
import { formatarLogRolagem, type RollGroupResult } from '../../dice/useDiceBox';
import type { TipoRolagemForcada } from '../../dice/registroForcados';
import { calcularPvMaximo, estaFerido } from '../../rules/derivados';
import { ATRIBUTOS, PERICIAS } from '../../rules/data/pericias';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';
import ResultadoTeste from './ResultadoTeste';
import { criarResultadoTesteDetalhado, type ResultadoTesteDetalhado } from './resultadoTesteApresentacao';

interface Props {
  ficha: Ficha;
  ready: boolean;
  rolar: (
    notacao: string,
    onComplete: (r: RollGroupResult[]) => void,
    colorset?: ColorsetId,
    personagemId?: string | null,
    tipo?: TipoRolagemForcada,
    bonus?: number,
  ) => void;
}

/**
 * Rolador de teste do jogador (mesa-estatica-multiplayer-completo.md Parte IV §6.5, Fase 6) —
 * versão reduzida de `RoladorTeste.tsx`: só a própria ficha (sem seletor PC/NPC), e sem
 * sucesso/falha/margem — a DT da cena mora em `sessaoPrivada`, que nunca chega no bundle do
 * jogador. Mostra só d20 + modificador = total; o mestre narra o resultado.
 */
export default function RoladorTesteJogador({ ficha, ready, rolar }: Props) {
  const basePV = useStore((s) => s.config.basePV);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);
  const atualizarFicha = useStore((s) => s.atualizarFicha);

  const [periciaId, setPericiaId] = useState(PERICIAS[0].id);
  const [resultado, setResultado] = useState<ResultadoTesteDetalhado | null>(null);
  const [rolando, setRolando] = useState(false);

  const pericia = PERICIAS.find((p) => p.id === periciaId)!;
  const atributo = ATRIBUTOS.find((a) => a.id === pericia.atributo)!;

  const podeRolar = ready && !rolando;
  const favoritas = ficha.periciasFavoritas ?? [];

  const alternarFavorita = () => {
    const novas = favoritas.includes(periciaId) ? favoritas.filter((id) => id !== periciaId) : [...favoritas, periciaId];
    atualizarFicha(ficha.id, { periciasFavoritas: novas });
  };

  const rolarTeste = () => {
    setRolando(true);
    const pvMaximo = calcularPvMaximo(basePV, ficha.atributos.vigor);
    const ferido = estaFerido(ficha.pvAtual, pvMaximo);
    const penalidadeFerido = ferido && (pericia.atributo === 'vigor' || pericia.atributo === 'agilidade') ? -2 : 0;
    const grauPericia = ficha.pericias[periciaId] ?? 0;
    const modificador = ficha.atributos[pericia.atributo] + grauPericia + penalidadeFerido;
    rolar(
      '1d20',
      (grupos) => {
        const d20 = grupos[0]?.rolls[0]?.value ?? 0;
        setResultado(criarResultadoTesteDetalhado(ficha.nome || 'Personagem', pericia.nome, d20, [
          { rotulo: atributo.nome, valor: ficha.atributos[pericia.atributo] },
          { rotulo: pericia.nome, valor: grauPericia },
          { rotulo: 'ferido', valor: penalidadeFerido },
        ]));
        setRolando(false);

        const nome = ficha.nome || 'Personagem';
        const modStr = modificador >= 0 ? `+${modificador}` : `${modificador}`;
        registrarLog(
          'teste',
          formatarLogRolagem({
            quem: nome,
            tipo: `Teste de Perícia: ${pericia.nome}(${atributo.nome})`,
            grupos: [{ notacao: '1d20', resultados: [d20] }],
            bonus: modificador,
            total: d20 + modificador,
          }),
          ficha.id,
          'publica',
        );
        registrarRoll({
          origem: nome,
          personagemId: ficha.id,
          formula: `d20${modStr}`,
          total: d20 + modificador,
          bruto: d20,
          visibilidade: 'publica',
        });
      },
      'rede',
      ficha.id,
      undefined,
      modificador || undefined,
    );
  };

  return (
    <section className="secao">
      <h3 className="label">Rolar teste</h3>

      <div className="campos-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <label htmlFor="rtj-pericia">Perícia</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <select id="rtj-pericia" value={periciaId} onChange={(e) => setPericiaId(e.target.value)} style={{ flex: 1 }}>
              {PERICIAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({ATRIBUTOS.find((a) => a.id === p.atributo)!.nome})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icone-botao"
              title={favoritas.includes(periciaId) ? 'remover dos favoritos' : 'fixar como favorita'}
              onClick={alternarFavorita}
            >
              {favoritas.includes(periciaId) ? '★' : '☆'}
            </button>
          </div>
          {favoritas.length > 0 && (
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              {favoritas.map((id) => {
                const p = PERICIAS.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    className="pill"
                    onClick={() => setPericiaId(id)}
                    style={{ background: periciaId === id ? 'var(--concrete-2)' : 'var(--concrete-1)' }}
                  >
                    {p.nome}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
        <button className="acento" disabled={!podeRolar} onClick={rolarTeste}>
          rolar {atributo.nome.toLowerCase()}+{pericia.nome.toLowerCase()}
        </button>
      </div>

      {resultado && <ResultadoTeste resultado={resultado} />}
    </section>
  );
}
