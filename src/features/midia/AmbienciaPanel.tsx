import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { deletarR2, isUrlSupabaseStorage, uploadR2 } from '../../multiplayer/uploadR2';
import { useStore } from '../../state/store';
import type { FaixaMidia } from '../../state/types';
import CamadaAmbienciaControles from './CamadaAmbienciaControles';
import { CAMADA_PRINCIPAL } from '../../state/ambiencia';
import Icone from '../../components/Icone';

export default function AmbienciaPanel() {
  const ambiencia = useStore((s) => s.ambiencia);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!supabase) { setErro('configure o multiplayer para enviar áudio.'); return; }
    if (arquivo.size === 0) { setErro('o arquivo de áudio está vazio.'); return; }
    if (arquivo.size > 100 * 1024 * 1024) { setErro('arquivo excede 100MB — comprima ou divida em partes menores.'); return; }
    setEnviando(true);
    setErro(null);
    try {
      const path = `sfx/ambiencia-${crypto.randomUUID()}-${arquivo.name}`;
      const { url, erro: mensagem } = await uploadR2(path, arquivo, arquivo.type || 'application/octet-stream');
      if (!url) { setErro(mensagem ?? 'upload falhou — confira o arquivo e tente de novo.'); return; }
      useStore.getState().adicionarFaixaAmbiencia(arquivo.name, path, url);
    } catch { setErro('upload falhou — confira a conexão e tente de novo.'); }
    finally { setEnviando(false); }
  };

  const selecionar = (id: string) => useStore.getState().atualizarEstadoAmbiencia({ faixaAtualId: id, tocando: true, posicaoSegundos: 0 });
  const excluir = async (som: FaixaMidia) => {
    if (!window.confirm(`excluir ambiência "${som.nome}"?`)) return;
    useStore.getState().removerFaixaAmbiencia(som.id);
    try {
      const ok = isUrlSupabaseStorage(som.url)
        ? !!supabase && !(await supabase.storage.from('midia').remove([som.path])).error
        : await deletarR2(som.path);
      if (!ok) setErro('ambiência removida da lista, mas o arquivo não foi apagado.');
    } catch { setErro('ambiência removida da lista, mas o arquivo não foi apagado.'); }
  };

  return <section className="secao" aria-label="ambiência" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
      <h3 className="label" style={{ margin: 0 }}>ambiência</h3>
      <label className="mapa-upload-botao">
        {enviando ? 'enviando ambiência…' : 'enviar ambiência'}
        <input type="file" aria-label="enviar ambiência" accept="audio/*,video/mp4,.m4a,.aac,.flac,.ogg,.wav,.mp3" hidden disabled={enviando} onChange={enviar} />
      </label>
    </div>
    <p className="vazio" style={{ margin: 0 }}>chuva, vento e outros sons em loop contínuo, junto com a música.</p>
    <CamadaAmbienciaControles id={CAMADA_PRINCIPAL} numero={1} />
    {ambiencia.camadas?.map((c, i) => <CamadaAmbienciaControles key={c.id} id={c.id} numero={i + 2} />)}
    <button type="button" onClick={() => useStore.getState().adicionarCamadaAmbiencia()} aria-label="adicionar camada de ambiência">+ adicionar ambiência</button>
    <p className="vazio" style={{ margin: 0 }}>cada camada tem volume próprio. remover uma camada mantém o arquivo na biblioteca.</p>
    {!ambiencia.faixas.length && <p className="vazio" style={{ margin: 0 }}>nenhuma ambiência ainda — envie um áudio acima.</p>}
    {ambiencia.faixas.map((f) => <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button onClick={() => selecionar(f.id)} aria-pressed={f.id === ambiencia.faixaAtualId} style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</button>
      <button className="icone-botao" title={`excluir ambiência ${f.nome}`} aria-label={`excluir ambiência ${f.nome}`} onClick={() => void excluir(f)}><Icone nome="lixeira" /></button>
    </div>)}
    {erro && <span role="alert" style={{ color: 'var(--ruido)', fontSize: 12 }}>{erro}</span>}
  </section>;
}
