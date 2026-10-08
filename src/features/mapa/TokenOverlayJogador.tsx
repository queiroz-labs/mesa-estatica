import { useEffect } from 'react';
import Avatar from '../../components/Avatar';
import Icone from '../../components/Icone';
import { calcularDefesa, calcularPvMaximo, calcularSanidadeMaxima } from '../../rules/derivados';
import { surtosAtivosNaSessao } from '../../rules/surto';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';
import CombatenteResumo from '../combate/CombatenteResumo';

const EMPTY_CONDICOES: string[] = [];

interface Props {
  minhaFicha: Ficha;
  nome: string;
  cor: string;
  foto: string | null;
  silhueta: string | null;
  /** null = é o próprio PC (mostra detalhes); qualquer string = restrito (exceto NPC, ver `tipo`) */
  idFora: string | null;
  tipo?: 'pc' | 'npc';
  notas?: string;
  onFechar: () => void;
}

export default function TokenOverlayJogador({ minhaFicha, nome, cor, foto, silhueta, idFora, tipo, notas, onFechar }: Props) {
  const basePV = useStore((s) => s.config.basePV);
  const ajustarPvAtual = useStore((s) => s.ajustarPvAtual);
  const ajustarSanidadeAtual = useStore((s) => s.ajustarSanidadeAtual);
  const atualizarFicha = useStore((s) => s.atualizarFicha);
  const modoCombate = useStore((s) => s.sessaoPublica.modoCombate);
  const contadorCena = useStore((s) => s.sessaoPublica.contadorCena);
  const rodada = useStore((s) => s.sessaoPublica.rodada);
  const condicoesAtivas = useStore((s) => s.sessaoPublica.condicoesCombate[minhaFicha.id] ?? EMPTY_CONDICOES);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onFechar]);

  const surtosVisiveis = surtosAtivosNaSessao(minhaFicha.surtosAtivos, { modoCombate, contadorCena, rodada });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-backdrop)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onFechar}
    >
      <div className="secao" style={{ width: 'min(320px, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <Avatar nome={nome} cor={cor} foto={foto} silhueta={silhueta} bordaCor={cor} tamanho={52} ampliavel />
            <h3 style={{ margin: 0 }}>{nome || 'sem nome'}</h3>
          </div>
          <button className="controle-icone" onClick={onFechar} title="fechar (Esc)" aria-label="fechar detalhes do token">
            <Icone nome="fechar" />
          </button>
        </div>

        {idFora === null ? (
          <>
            <CombatenteResumo
              nome=""
              cor={minhaFicha.corVisual}
              pvAtual={minhaFicha.pvAtual}
              pvMaximo={calcularPvMaximo(basePV, minhaFicha.atributos.vigor)}
              defesa={calcularDefesa(minhaFicha.atributos.agilidade, minhaFicha.equipamentoModificadorDefesa)}
              condicoes={condicoesAtivas}
              surtoAtivo={surtosVisiveis.length > 0}
              surtoEscolha={surtosVisiveis.find((s) => s.escolha !== null)?.escolha ?? null}
              editavel
              sanidadeAtual={minhaFicha.sanidadeAtual}
              sanidadeMaxima={calcularSanidadeMaxima(minhaFicha.atributos.vontade)}
              onAjustarPv={(d) => ajustarPvAtual(minhaFicha.id, minhaFicha.pvAtual + d)}
              onAjustarSanidade={(d) => ajustarSanidadeAtual(minhaFicha.id, minhaFicha.sanidadeAtual + d)}
            />
            <div style={{ marginTop: '0.75rem' }}>
              <label className="label" style={{ fontSize: 11, display: 'block', marginBottom: '0.25rem' }}>
                observações de combate
              </label>
              <textarea
                rows={3}
                value={minhaFicha.observacaoCombate ?? ''}
                onChange={(e) => atualizarFicha(minhaFicha.id, { observacaoCombate: e.target.value })}
                placeholder="anotações de PV, defesa, condições…"
                style={{ width: '100%', minHeight: '2.5em', fontSize: 12 }}
              />
            </div>
          </>
        ) : tipo === 'npc' ? (
          <p className="vazio" style={{ margin: '0.5rem 0', fontStyle: notas ? 'italic' : undefined }}>
            {notas || 'sem notas.'}
          </p>
        ) : (
          <p className="vazio" style={{ textAlign: 'center', margin: '1.5rem 0' }}>
            informação restrita ao mestre
          </p>
        )}
      </div>
    </div>
  );
}
