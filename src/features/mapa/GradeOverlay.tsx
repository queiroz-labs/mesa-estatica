import { useState } from 'react';
import Icone from '../../components/Icone';
import InputNumeroDraft from '../../components/InputNumeroDraft';
import { useStore } from '../../state/store';
import { useMapaAtivo } from './useMapaAtivo';

// arredonda pro campo numérico ficar digitável (arrastar produz float; digitar quer inteiro).
const clamp = (valor: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, valor)));

/**
 * Controle do grid do mapa, minimizado — mesmo padrão visual da bandeja de rolagem rápida
 * (QuickRollOverlay), no canto oposto (inferior esquerdo). Fica só na aba Mapa: dentro de
 * MapaTab, que já vira `visibility:hidden` nas outras abas (App.tsx) — isso também esconde
 * este `position:fixed`, apesar de fixed normalmente escapar do layout do ancestral.
 */
export default function GradeOverlay() {
  const mapaAtivo = useMapaAtivo();
  const atualizarGrade = useStore((s) => s.atualizarGrade);
  const [aberto, setAberto] = useState(false);

  // nada pra calibrar sem um mapa selecionado — evita mostrar uma ferramenta que não faz nada.
  if (!mapaAtivo) return null;
  const grade = mapaAtivo.grade;

  return (
    <div style={{ position: 'fixed', left: '1.25rem', bottom: '1.25rem', zIndex: 50 }}>
      {aberto && (
        <div className="secao" style={{ width: 'min(260px, calc(100vw - 2.5rem))', marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 className="label" style={{ margin: 0 }}>
              grid do mapa
            </h3>
            <button className="controle-icone" onClick={() => setAberto(false)} title="fechar" aria-label="fechar grade do mapa">
              <Icone nome="fechar" />
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <input type="checkbox" checked={grade.ativa} onChange={(e) => atualizarGrade({ ativa: e.target.checked })} />
            <span style={{ fontSize: 13 }}>ativo</span>
          </label>

          {grade.ativa && (
            <div className="campos-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label htmlFor="grade-colunas">colunas</label>
                <InputNumeroDraft
                  id="grade-colunas"
                  min={1}
                  max={100}
                  value={grade.colunas}
                  onCommit={(valor) => atualizarGrade({ colunas: clamp(valor, 1, 100) })}
                />
              </div>
              <div>
                <label htmlFor="grade-linhas">linhas</label>
                <InputNumeroDraft
                  id="grade-linhas"
                  min={1}
                  max={100}
                  value={grade.linhas}
                  onCommit={(valor) => atualizarGrade({ linhas: clamp(valor, 1, 100) })}
                />
              </div>
              <div>
                <label htmlFor="grade-x">x (%)</label>
                <InputNumeroDraft
                  id="grade-x"
                  min={0}
                  max={100}
                  value={grade.x}
                  onCommit={(valor) => atualizarGrade({ x: clamp(valor, 0, 100) })}
                />
              </div>
              <div>
                <label htmlFor="grade-y">y (%)</label>
                <InputNumeroDraft
                  id="grade-y"
                  min={0}
                  max={100}
                  value={grade.y}
                  onCommit={(valor) => atualizarGrade({ y: clamp(valor, 0, 100) })}
                />
              </div>
              <div>
                <label htmlFor="grade-largura">largura (%)</label>
                <InputNumeroDraft
                  id="grade-largura"
                  min={0}
                  max={100}
                  value={grade.largura}
                  onCommit={(valor) => atualizarGrade({ largura: clamp(valor, 0, 100) })}
                />
              </div>
              <div>
                <label htmlFor="grade-altura">altura (%)</label>
                <InputNumeroDraft
                  id="grade-altura"
                  min={0}
                  max={100}
                  value={grade.altura}
                  onCommit={(valor) => atualizarGrade({ altura: clamp(valor, 0, 100) })}
                />
              </div>
              <div>
                <label htmlFor="grade-escala">escala (por célula)</label>
                <InputNumeroDraft
                  id="grade-escala"
                  min={0.1}
                  step={0.1}
                  value={grade.escala}
                  onCommit={(valor) => atualizarGrade({ escala: Math.max(0.1, valor) })}
                />
              </div>
              <div>
                <label htmlFor="grade-unidade">unidade</label>
                <select
                  id="grade-unidade"
                  value={grade.unidade}
                  onChange={(e) => atualizarGrade({ unidade: e.target.value as 'm' | 'km' })}
                >
                  <option value="m">metros (m)</option>
                  <option value="km">quilômetros (km)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        className="mapa-ferramenta"
        onClick={() => setAberto(!aberto)}
        title="grid do mapa"
        aria-label="grade do mapa"
        aria-expanded={aberto}
        data-ativo={grade.ativa}
      >
        <Icone nome="grade" size={20} />
      </button>
    </div>
  );
}
