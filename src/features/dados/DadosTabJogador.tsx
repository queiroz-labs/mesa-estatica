import { Fragment, useRef, useState } from 'react';
import { normalizarTermos, useDiceBox, type RollGroupResult } from '../../dice/useDiceBox';
import { useReproduzirRolagemAoVivo } from '../../dice/useReproduzirRolagemAoVivo';
import { resolverRolagemJogador } from '../../multiplayer/rolagemRemota';
import { avisarInicioRolagem, marcarComoProprio, useRolagemAoVivoStore } from '../../state/rolagemAoVivoStore';
import type { Ficha } from '../../state/types';
import FeedRolagensJogador from './FeedRolagensJogador';
import RoladorSanidadeJogador from './RoladorSanidadeJogador';
import RoladorSurtoJogador from './RoladorSurtoJogador';
import RoladorTesteJogador from './RoladorTesteJogador';
import RoladorTraumaJogador from './RoladorTraumaJogador';
import RolagemLivreJogador from './RolagemLivreJogador';
import './dados.css';

interface Props {
  ficha: Ficha;
  active?: boolean;
  /** Incrementado por `PlayerApp.tsx` quando o jogador clica em "rolar" no lembrete de Sanidade
   *  do log (`LogTabJogador.tsx`) — repassado pro rolador disparar sozinho. */
  pedidoRapidoSanidade?: number;
}

/**
 * Aba de dados do jogador (Fase 6, mesa-estatica-multiplayer-completo.md §6.5) — mesma
 * bandeja física de `DadosTab.tsx`, mas `useDiceBox` recebe `resolverRolagemJogador` em vez
 * do padrão do mestre: sempre tenta `resolver-rolagem` (sem o gate de
 * `VITE_FASE_D_ROLAGEM_REMOTA`, que só existe pra validação incremental do mestre). Os 4
 * roladores da própria ficha (Teste/Sanidade/Surto/Trauma) — sem rolagem livre nem seletor
 * de PC/NPC, que são fluxos do mestre. Sanidade só mostra os dados brutos (não aplica a
 * perda) — ver comentário em `RoladorSanidadeJogador.tsx`.
 */
export default function DadosTabJogador({ ficha, active = true, pedidoRapidoSanidade }: Props) {
  const { ready, rolando, erro, falhaRolagem, modo2D, rolar, reproduzir } = useDiceBox('dice-bandeja-jogador', active, 100, resolverRolagemJogador);
  const podeRolar = ready && !rolando;
  const [geracaoControles, setGeracaoControles] = useState(0);
  const pedidoSanidadeJaObservado = useRef<number>();

  // rolagem de OUTRO jogador também anima aqui quando a aba Dados está aberta — a própria
  // rolagem deste jogador é filtrada dentro do hook (ehRolagemPropria), senão a bandeja tocaria
  // o resultado duas vezes seguidas.
  useReproduzirRolagemAoVivo(reproduzir, ready);

  // transmite a rolagem pra mesa toda ver o dado caindo (rolagemAoVivoStore/rolagemAoVivoSync) —
  // wrapper único em vez de tocar nos 6 call sites de rolar() espalhados pelos roladores abaixo.
  // `bonus` (7º parâmetro, opcional) é o modificador de perícia/atributo — não passa pela
  // física, só entra no total mostrado pelo aviso ao vivo (formatarHeaderRolagem).
  const rolarEBroadcast = (
    notacao: Parameters<typeof rolar>[0],
    onComplete: (grupos: RollGroupResult[]) => void | false,
    colorset?: Parameters<typeof rolar>[2],
    personagemId?: Parameters<typeof rolar>[3],
    tipo?: Parameters<typeof rolar>[4],
    bonus?: number,
    contexto?: 'livre' | 'trauma',
  ) => {
    const id = avisarInicioRolagem(ficha.nome || 'jogador', ficha.corVisual, tipo ?? 'teste');
    rolar(
      notacao,
      (grupos) => {
        if (onComplete(grupos) === false) {
          // Uma regra invalidada enquanto a física rodava não publica um resultado.
          const aoVivo = useRolagemAoVivoStore.getState();
          if (aoVivo.iniciando?.id === id) aoVivo.definirInicio(null);
          return;
        }
        marcarComoProprio(id);
        useRolagemAoVivoStore.getState().definirAtual({
          id,
          termos: normalizarTermos(notacao),
          valores: grupos.flatMap((g) => g.rolls.map((r) => r.value)),
          colorsetBase: typeof colorset === 'string' ? colorset : 'rede',
          cor: ficha.corVisual,
          origem: ficha.nome || 'jogador',
          tipo: tipo ?? 'teste',
          bonus,
          contexto,
        });
      },
      colorset,
      personagemId,
      tipo,
    );
  };

  return (
    <div className="dados-grade">
      {!modo2D && (
        <div
          id="dice-bandeja-jogador"
          className="dados-bandeja"
        />
      )}
      {modo2D && (
        <div className="secao" style={{ gridColumn: '1 / -1' }}>
          <p className="vazio">
            renderização 3D indisponível neste aparelho (sem WebGL) — os dados ainda funcionam, só sem o visual físico.
          </p>
        </div>
      )}
      {falhaRolagem && <p role="status" style={{ color: 'var(--ruido)' }}>não consegui rolar. Se algum botão ficou bloqueado, <button onClick={() => {
        // Remontar Sanidade não pode repetir um lembrete antigo já consumido.
        pedidoSanidadeJaObservado.current = pedidoRapidoSanidade;
        setGeracaoControles((n) => n + 1);
      }}>reiniciar controles</button> e tente novamente.</p>}
      {!ready && !erro && <p className="vazio">carregando física dos dados…</p>}

      <Fragment key={geracaoControles}>
        <RoladorTesteJogador ficha={ficha} ready={podeRolar} rolar={rolarEBroadcast} />
        <RoladorSanidadeJogador ficha={ficha} ready={podeRolar} rolar={rolarEBroadcast} pedidoRapido={pedidoSanidadeJaObservado.current === pedidoRapidoSanidade ? 0 : pedidoRapidoSanidade} />
        <RoladorSurtoJogador ficha={ficha} ready={podeRolar} rolar={rolarEBroadcast} />
        <RoladorTraumaJogador ficha={ficha} ready={podeRolar} rolar={rolarEBroadcast} />
        <RolagemLivreJogador fichaId={ficha.id} ready={podeRolar} rolar={(notacao, onComplete, _colorset, _personagemId, _tipo, bonusLivre) =>
          rolarEBroadcast(notacao, onComplete, undefined, ficha.id, 'teste', bonusLivre, 'livre')} />
      </Fragment>
      <div style={{ gridColumn: '1 / -1' }}>
        <FeedRolagensJogador />
      </div>
    </div>
  );
}
