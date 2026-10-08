import CenaAtualSection from './sections/CenaAtualSection';
import EstadoMesaSection from './sections/EstadoMesaSection';
import EstatisticasSection from './sections/EstatisticasSection';
import LembretesSection from './sections/LembretesSection';
import MiniLogSection from './sections/MiniLogSection';
import ProximosEventosSection from './sections/ProximosEventosSection';
import SituacaoSection from './sections/SituacaoSection';
import StatusGrupoSection from './sections/StatusGrupoSection';

/** Dashboard da aba Sessão — mesa-estatica-multiplayer-completo.md Parte III.
 *  "Cena atual" é a maior seção (mistura público/privado) — fica na largura toda, primeira,
 *  acima do resto. As demais seções (mistura de [Público]/[Privado], cada uma se rotula) viram
 *  um grid de caixas do mesmo tamanho lado a lado — `alignItems: 'stretch'` (padrão do grid)
 *  iguala a altura das caixas em cada linha. `minmax(max(320px, ...), 1fr)` trava em no máximo
 *  3 colunas por linha mesmo em telas largas (Estado da mesa e Status do grupo têm gauges/linhas
 *  de dados que ficam ilegíveis espremidos em 4+ colunas) — abaixo de ~1000px, o `max(320px, …)`
 *  assume e o `auto-fit` volta a encolher pra 2 ou 1 coluna normalmente. */
export default function SessaoTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <CenaAtualSection />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, max(320px, (100% - 2rem) / 3)), 1fr))',
          gap: '1rem',
        }}
      >
        <SituacaoSection />
        <EstatisticasSection />
        <EstadoMesaSection />
        <ProximosEventosSection />
        <LembretesSection />
        <StatusGrupoSection />
        <MiniLogSection />
      </div>
    </div>
  );
}
