import { useEffect, useRef, useState } from 'react';
import { formatarHeaderRolagem, type GrupoDados, type RollTermo, useDiceBox } from '../../dice/useDiceBox';
import { useReproduzirRolagemAoVivo } from '../../dice/useReproduzirRolagemAoVivo';
import { resolverRolagemJogador } from '../../multiplayer/rolagemRemota';
import { rolarDanoArmaFicha } from '../../rules/armasCombate';
import { PERICIAS } from '../../rules/data/pericias';
import { parseDanoArma } from '../../rules/teste';
import { rolarTestePericiaFicha } from '../../rules/testePericia';
import { usePedidoRolagemDanoStore, type PedidoRolagemDano } from '../../state/pedidoRolagemDanoStore';
import { usePedidoRolagemTesteStore, type PedidoRolagemTeste } from '../../state/pedidoRolagemTesteStore';
import { avisarInicioRolagem, ehRolagemPropria, useRolagemAoVivoStore } from '../../state/rolagemAoVivoStore';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';

/** Fatia `valores` (achatado, na ordem dos termos) pelos `qty` de cada termo — reconstrói os
 *  grupos que `formatarHeaderRolagem` espera a partir do shape plano do broadcast. */
function agruparPorTermo(termos: RollTermo[], valores: number[]): GrupoDados[] {
  let cursor = 0;
  return termos.map((t) => {
    const resultados = valores.slice(cursor, cursor + t.qty);
    cursor += t.qty;
    return { notacao: `${t.qty}d${t.sides}`, resultados };
  });
}

/** Tempo para ler o resultado depois da física. Também limita um aviso de início
 *  órfão, caso o autor caia antes de transmitir o resultado. */
const GRACA_RESULTADO_MS = 16000;

/**
 * Reproduz a rolagem de outro jogador (chegou por `rolagemAoVivoSync.ts`) — montado no
 * `<header>` de `App.tsx`/`PlayerApp.tsx`, ao lado de `SoundpadPlayer`, fora das abas: resolve a
 * "lacuna 1" do item 1 do ROADMAP (nenhuma bandeja fica montada fora da aba Dados/overlay), pra
 * quem estiver em outra aba também ver o dado caindo e saber quem rolou.
 *
 * Texto evolui em duas fases: "{origem} está rolando…" enquanto a física roda, depois
 * "{origem}: 1d20 → [4] = 4" (via `formatarHeaderRolagem`) quando o dado assenta — fica visível
 * por `GRACA_RESULTADO_MS` antes de sumir, tempo de ler o número.
 *
 * Bandeja própria e SEMPRE habilitada (3ª instância independente, mesmo padrão de aba
 * Dados + QuickRoll já terem cada uma a sua) — precisa estar pronta pra animar na hora que
 * chega um broadcast, sem esperar `box.initialize()`. O container fica sempre no DOM (visibility,
 * não render condicional — mesmo motivo das abas em `App.tsx`): desmontar entre rolagens
 * destruiria a instância e reintroduziria o atraso de inicialização do WebGL.
 */
interface Props {
  /** true só em `App.tsx` (header do mestre) — ver comentário em `useReproduzirRolagemAoVivo.ts`. */
  verProprias?: boolean;
  /** presente só em `PlayerApp.tsx` — a própria ficha do jogador. Habilita esta bandeja a também
   *  EXECUTAR (não só reproduzir) os pedidos de dano/teste de ataque/perícia da própria ficha
   *  (`pedidoRolagemDanoStore`/`pedidoRolagemTesteStore`, vindos de `ArmasSection.tsx`/
   *  `ArmasCombate.tsx`/`PericiasSection.tsx`) — antes rodavam em `QuickRollOverlayJogador.tsx`,
   *  que precisava se auto-abrir só pra existir o container da física. Migrado pra cá (03/09,
   *  melhorias-pendentes-2026-09-02.md §4) pra a própria rolagem do jogador aparecer no header
   *  igual a rolagem de qualquer outro jogador, sem popup forçado. Sem essa prop (mestre), essas
   *  duas stores continuam intocadas — pertencem a `QuickRollOverlay.tsx` do lado do mestre. */
  ficha?: Ficha;
}

export default function RolagemAoVivoPlayer({ verProprias, ficha }: Props) {
  const { ready, rolando, modo2D, erro, falhaRolagem, rolar, reproduzir } = useDiceBox('dice-ao-vivo', true, 45, ficha ? resolverRolagemJogador : undefined);
  const basePV = useStore((s) => s.config.basePV);
  const registrarLog = useStore((s) => s.registrarLog);
  const registrarRoll = useStore((s) => s.registrarRoll);
  const pedidoDano = usePedidoRolagemDanoStore((s) => s.pedido);
  const limparPedidoRolagemDano = usePedidoRolagemDanoStore((s) => s.limparPedidoRolagemDano);
  const pedidoTeste = usePedidoRolagemTesteStore((s) => s.pedido);
  const limparPedidoRolagemTeste = usePedidoRolagemTesteStore((s) => s.limparPedidoRolagemTeste);
  const iniciando = useRolagemAoVivoStore((s) => s.iniciando);

  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [rotulo, setRotulo] = useState<{ cor: string; texto: string } | null>(null);

  // espelha no store — é o que o destaque da aba "Dados" em App.tsx/PlayerApp.tsx lê pra saber
  // quando desligar o realce (ver comentário em rolagemAoVivoStore.ts).
  const marcarVisivel = (v: boolean) => {
    setVisivel(v);
    useRolagemAoVivoStore.getState().definirMostrando(v);
  };

  useEffect(() => {
    if (!iniciando || (!verProprias && ehRolagemPropria(iniciando.id))) return;
    if (graceRef.current) clearTimeout(graceRef.current);
    setRotulo({ cor: iniciando.cor, texto: `${iniciando.origem} está rolando…` });
    marcarVisivel(true);
    // Se o autor cair antes do resultado, o aviso não fica preso no header.
    graceRef.current = setTimeout(() => {
      if (useRolagemAoVivoStore.getState().iniciando?.id === iniciando.id) useRolagemAoVivoStore.getState().definirInicio(null);
      marcarVisivel(false);
    }, GRACA_RESULTADO_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciando?.id, verProprias]);

  useReproduzirRolagemAoVivo(reproduzir, ready, {
    aoIniciar: (r) => {
      if (graceRef.current) clearTimeout(graceRef.current);
      setRotulo({ cor: r.cor, texto: `${r.origem} está rolando…` });
      marcarVisivel(true);
    },
    aoTerminar: (r) => {
      // Surto: 2d20 comparados, não termos da notação — grupo único fixo em vez de `agruparPorTermo`.
      const grupos: GrupoDados[] = r.tipo === 'surto' ? [{ notacao: '2d20', resultados: r.valores }] : agruparPorTermo(r.termos, r.valores);
      const total = grupos.flatMap((g) => g.resultados).reduce((soma, v) => soma + v, 0) + (r.bonus ?? 0);
      const tipoTexto = r.contexto === 'trauma' ? 'trauma' : r.contexto === 'livre' ? 'qualquer' : r.tipo;
      const texto = formatarHeaderRolagem({ quem: r.origem, grupos, bonus: r.bonus, total, tipo: tipoTexto });
      setRotulo({ cor: r.cor, texto });
      graceRef.current = setTimeout(() => marcarVisivel(false), GRACA_RESULTADO_MS);
    },
  }, verProprias);

  // Pedido de dano de arma da própria ficha (chip em ArmasCombate.tsx/botão em ArmasSection.tsx)
  // — a física roda nesta MESMA bandeja sempre-montada (não mais numa própria escondida atrás de
  // `aberto`). `rolarDanoArmaFicha` já cuida de log/registro/broadcast pra mesa toda; aqui só
  // falta mostrar o resultado no PRÓPRIO header (o broadcast é auto-filtrado da reprodução por
  // `ehRolagemPropria`, de propósito — replay duplicaria a animação que já rodou aqui).
  const executarPedidoDano = (p: PedidoRolagemDano) => {
    if (!ficha || p.fichaId !== ficha.id || !usePedidoRolagemDanoStore.getState().iniciarPedidoRolagemDano(p.id)) return;
    const arma = ficha.armas.find((a) => a.id === p.armaId);
    if (!arma) {
      limparPedidoRolagemDano(p.id);
      return;
    }
    const rolagemId = p.visibilidade === 'publica' ? avisarInicioRolagem(ficha.nome || 'jogador', ficha.corVisual, 'dano') : undefined;
    if (graceRef.current) clearTimeout(graceRef.current);
    setRotulo({ cor: ficha.corVisual, texto: `${ficha.nome || 'jogador'} está rolando…` });
    marcarVisivel(true);
    const finalizar = (valoresDados: number[], termos: RollTermo[]) => {
      const r = rolarDanoArmaFicha(ficha, arma, termos, valoresDados, p.critico, registrarLog, registrarRoll, p.visibilidade, rolagemId);
      setRotulo({ cor: ficha.corVisual, texto: `dano · ${arma.nome || 'arma'}: ${r.texto}` });
      graceRef.current = setTimeout(() => marcarVisivel(false), GRACA_RESULTADO_MS);
      limparPedidoRolagemDano(p.id);
    };
    const parsed = parseDanoArma(arma.dano);
    if (!parsed) {
      finalizar([], []);
      return;
    }
    const termos = [{ sides: parsed.lados, qty: parsed.qtd }];
    if (p.critico) {
      const valoresMaximos = Array(parsed.qtd).fill(parsed.lados);
      reproduzir(termos, valoresMaximos, { base: 'rede', cor: ficha.corVisual }, () => finalizar(valoresMaximos, termos));
    } else {
      rolar(termos, (grupos) => finalizar(grupos.flatMap((g) => g.rolls.map((r) => r.value)), termos), 'rede', ficha.id, 'dano');
    }
  };

  // Pedido de teste de perícia/ataque de arma da própria ficha — mesma ponte de
  // `executarPedidoDano` acima, mesma bandeja física.
  const executarPedidoTeste = (p: PedidoRolagemTeste) => {
    if (!ficha || p.fichaId !== ficha.id || !usePedidoRolagemTesteStore.getState().iniciarPedidoRolagemTeste(p.id)) return;
    const pericia = PERICIAS.find((per) => per.id === p.periciaId);
    if (!pericia) {
      limparPedidoRolagemTeste(p.id);
      return;
    }
    const rolagemId = p.visibilidade === 'publica' ? avisarInicioRolagem(ficha.nome || 'jogador', ficha.corVisual, 'teste') : undefined;
    if (graceRef.current) clearTimeout(graceRef.current);
    setRotulo({ cor: ficha.corVisual, texto: `${ficha.nome || 'jogador'} está rolando…` });
    marcarVisivel(true);
    rolar('1d20', (grupos) => {
      const d20 = grupos[0]?.rolls[0]?.value ?? 0;
      const r = rolarTestePericiaFicha(ficha, pericia, d20, basePV, registrarLog, registrarRoll, p.visibilidade, p.rotuloArma, rolagemId);
      setRotulo({ cor: ficha.corVisual, texto: `${p.rotuloArma ?? pericia.nome}: ${r.texto}` });
      graceRef.current = setTimeout(() => marcarVisivel(false), GRACA_RESULTADO_MS);
      limparPedidoRolagemTeste(p.id);
    }, 'rede', ficha.id, 'teste');
  };

  // Mesmo padrão de fila de pendência de `QuickRollOverlayJogador.tsx` (de onde isso foi
  // migrado): se o pedido chegar com a bandeja ainda ocupada, guarda e dispara sozinho assim que
  // ela libera — nenhum clique se perde.
  const pedidoDanoPendenteRef = useRef<PedidoRolagemDano | null>(null);
  const executarPedidoDanoRef = useRef(executarPedidoDano);
  executarPedidoDanoRef.current = executarPedidoDano;

  useEffect(() => {
    if (!ficha || !pedidoDano) { pedidoDanoPendenteRef.current = null; return; }
    if (ready && !rolando) {
      executarPedidoDanoRef.current(pedidoDano);
    } else {
      pedidoDanoPendenteRef.current = pedidoDano;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficha, pedidoDano?.id]);

  useEffect(() => {
    if (ficha && ready && !rolando && pedidoDanoPendenteRef.current) {
      const p = pedidoDanoPendenteRef.current;
      pedidoDanoPendenteRef.current = null;
      executarPedidoDanoRef.current(p);
    }
  }, [ficha, ready, rolando]);

  const pedidoTestePendenteRef = useRef<PedidoRolagemTeste | null>(null);
  const executarPedidoTesteRef = useRef(executarPedidoTeste);
  executarPedidoTesteRef.current = executarPedidoTeste;

  useEffect(() => {
    if (!ficha || !pedidoTeste) { pedidoTestePendenteRef.current = null; return; }
    if (ready && !rolando) {
      executarPedidoTesteRef.current(pedidoTeste);
    } else {
      pedidoTestePendenteRef.current = pedidoTeste;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficha, pedidoTeste?.id]);

  useEffect(() => {
    if (ficha && ready && !rolando && pedidoTestePendenteRef.current) {
      const p = pedidoTestePendenteRef.current;
      pedidoTestePendenteRef.current = null;
      executarPedidoTesteRef.current(p);
    }
  }, [ficha, ready, rolando]);

  useEffect(() => {
    if (!erro || !falhaRolagem || !ficha) return;
    // Uma falha da física não chama onComplete. Libere apenas os pedidos que
    // esta bandeja já iniciou, para permitir tentar novamente sem criar resultado.
    const dano = usePedidoRolagemDanoStore.getState();
    const teste = usePedidoRolagemTesteStore.getState();
    const falhouDano = !!dano.pedido && dano.pedido.fichaId === ficha.id && dano.emExecucaoId === dano.pedido.id;
    const falhouTeste = !!teste.pedido && teste.pedido.fichaId === ficha.id && teste.emExecucaoId === teste.pedido.id;
    if (!falhouDano && !falhouTeste) return;
    if (falhouDano) { pedidoDanoPendenteRef.current = null; dano.limparPedidoRolagemDano(dano.pedido!.id); }
    if (falhouTeste) { pedidoTestePendenteRef.current = null; teste.limparPedidoRolagemTeste(teste.pedido!.id); }
    const inicio = useRolagemAoVivoStore.getState().iniciando;
    if (inicio && ehRolagemPropria(inicio.id)) useRolagemAoVivoStore.getState().definirInicio(null);
    if (graceRef.current) clearTimeout(graceRef.current);
    setRotulo({ cor: ficha?.corVisual ?? 'var(--ruido)', texto: 'não consegui rolar — tente novamente' });
    marcarVisivel(true);
    graceRef.current = setTimeout(() => marcarVisivel(false), GRACA_RESULTADO_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erro, falhaRolagem]);

  useEffect(
    () => () => {
      if (graceRef.current) clearTimeout(graceRef.current);
    },
    [],
  );

  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        minWidth: 0,
        maxWidth: '100%',
        // visibility sozinha mantém a altura do texto no layout. O aviso oculto sai
        // do fluxo, mas a bandeja filha continua com 60×60 para a física permanecer pronta.
        position: visivel ? 'relative' : 'absolute',
        height: visivel ? undefined : 0,
        overflow: visivel ? undefined : 'hidden',
        visibility: visivel ? 'visible' : 'hidden',
        width: visivel ? undefined : 60,
      }}
    >
      {!modo2D && (
        <div
          id="dice-ao-vivo"
          style={{
            width: 60,
            height: 60,
            background: 'var(--concrete-0)',
            border: '1px solid var(--concrete-2)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        />
      )}
      <span style={{ fontSize: 12, color: rotulo?.cor ?? 'var(--ink-dim)', whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0, maxWidth: 420 }}>
        {rotulo?.texto ?? ''}
      </span>
    </div>
  );
}
