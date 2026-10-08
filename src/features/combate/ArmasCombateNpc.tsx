import { useState } from 'react';
import { usePedidoRolagemDanoStore } from '../../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore } from '../../state/pedidoRolagemTesteStore';
import type { Npc } from '../../state/types';
import { IconeLamina } from './icones';

interface Props {
  npc: Npc;
}

/**
 * Chips de arma de NPC — mesmo padrão de `ArmasCombate.tsx` (PC), só que "atacar" já soma um
 * bônus fixo (`NpcAcao.bonus`) em vez de perícia+atributo (NPC não tem nenhum dos dois). Usado
 * em `IniciativaPanel.tsx`, `NpcsTab.tsx` e `TokenOverlay.tsx` — os 3 lugares que antes chamavam
 * `usarAcaoNpc` (rolagem síncrona, sempre privada, sem dado 3D) — substituído por
 * `rolarAtaqueNpc`/`rolarDanoNpcArma` (npcAcoes.ts), rodando na mesma bandeja física do
 * `QuickRollOverlay.tsx` que as armas de PC já usam. Sempre mestre-facing (NPC é sempre
 * mestre-only nos 3 lugares acima) — sem prop `souMestre`, checkbox "privado" sempre visível.
 */
export default function ArmasCombateNpc({ npc }: Props) {
  const [privado, setPrivado] = useState(true);
  const pedidoDano = usePedidoRolagemDanoStore((s) => s.pedido);
  const pedirRolagemDano = usePedidoRolagemDanoStore((s) => s.pedirRolagemDano);
  const pedidoTeste = usePedidoRolagemTesteStore((s) => s.pedido);
  const pedirRolagemTeste = usePedidoRolagemTesteStore((s) => s.pedirRolagemTeste);
  const visibilidade = privado ? 'privada' : 'publica';
  const rolagemEmVoo = pedidoDano !== null || pedidoTeste !== null;

  if (npc.acoes.length === 0) return null;

  const rolarAtaque = (bonus: number, nome: string) => {
    pedirRolagemTeste({ id: crypto.randomUUID(), npcId: npc.id, bonusFixo: bonus, rotuloArma: nome || 'ação', visibilidade });
  };

  const rolarDano = (acaoId: string) => {
    pedirRolagemDano({ id: crypto.randomUUID(), npcId: npc.id, armaId: acaoId, critico: false, visibilidade });
  };

  return (
    <div style={{ marginBottom: '0.4rem' }}>
      <span className="combate-rotulo">armas</span>
      <label
        title="ataque e dano rolados aqui nascem privados por padrão — desmarque pra rolar público"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: 12, cursor: 'pointer', color: 'var(--ink-dim)', marginLeft: '0.4rem' }}
      >
        <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} />
        privado
      </label>
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.2rem' }}>
        {npc.acoes.map((a) => (
          <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <span
              className="combate-chip"
              title={`${a.nome || 'arma'} · bônus: ${a.bonus >= 0 ? '+' : ''}${a.bonus}${a.dano ? ` · dano: ${a.dano}` : ''}`}
              style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <IconeLamina size={10} /> {a.nome || 'arma'}
            </span>
            <button
              className="combate-chip combate-chip--ativa"
              disabled={rolagemEmVoo}
              onClick={() => rolarAtaque(a.bonus, a.nome)}
              title="rolar ataque (1d20 + bônus)"
              style={{ fontSize: 11, cursor: 'pointer' }}
            >
              atacar
            </button>
            <button
              className="combate-chip combate-chip--ativa"
              disabled={rolagemEmVoo || a.dano.trim() === ''}
              onClick={() => rolarDano(a.id)}
              title="rolar dano"
              style={{ fontSize: 11, cursor: 'pointer' }}
            >
              dano
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
