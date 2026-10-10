import { useState } from 'react';
import { useStore } from '../../state/store';
import type { Ficha } from '../../state/types';
import AnotacoesSection from './sections/AnotacoesSection';
import ArmasSection from './sections/ArmasSection';
import AtributosDerivadosSection from './sections/AtributosDerivadosSection';
import DinheiroSection from './sections/DinheiroSection';
import EquipamentoSection from './sections/EquipamentoSection';
import IdentidadeSection from './sections/IdentidadeSection';
import InvestigacaoSection from './sections/InvestigacaoSection';
import PericiasSection from './sections/PericiasSection';
import ReguladoresSection from './sections/ReguladoresSection';
import TraumasSection from './sections/TraumasSection';
import VinculosSection from './sections/VinculosSection';

export default function FichaEditor({ ficha, souMestre }: { ficha: Ficha; souMestre?: boolean }) {
  const atualizarFicha = useStore((s) => s.atualizarFicha);
  const basePV = useStore((s) => s.config.basePV);
  const onChange = (patch: Partial<Ficha>) => atualizarFicha(ficha.id, patch);
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState(false);

  const exportar = async () => {
    setExportando(true);
    setErroExportacao(false);
    try {
      const { exportarFichaDocx } = await import('./exportarFichaDocx');
      await exportarFichaDocx(ficha, basePV);
    } catch {
      setErroExportacao(true);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="ficha-editor">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button onClick={exportar} disabled={exportando} title="baixar a ficha em .docx — pra editar em Word ou guardar fora do app">
          {exportando ? 'gerando…' : 'exportar .docx'}
        </button>
      </div>
      {erroExportacao && <p role="status" className="vazio">não consegui gerar a ficha — tente exportar novamente.</p>}
      <IdentidadeSection ficha={ficha} onChange={onChange} />
      <VinculosSection ficha={ficha} onChange={onChange} />
      <AtributosDerivadosSection ficha={ficha} onChange={onChange} souMestre={souMestre} />
      <PericiasSection ficha={ficha} onChange={onChange} souMestre={souMestre} />
      <TraumasSection ficha={ficha} onChange={onChange} souMestre={souMestre} />
      <EquipamentoSection ficha={ficha} onChange={onChange} />
      <InvestigacaoSection ficha={ficha} onChange={onChange} />
      <ArmasSection ficha={ficha} onChange={onChange} souMestre={souMestre} />
      <ReguladoresSection ficha={ficha} onChange={onChange} />
      <DinheiroSection ficha={ficha} onChange={onChange} />
      <AnotacoesSection ficha={ficha} onChange={onChange} />
    </div>
  );
}
