import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { deletarR2, isUrlSupabaseStorage, uploadR2 } from '../../multiplayer/uploadR2';
import { useAmbienciaUiStore } from '../../state/ambienciaUiStore';
import { useStore } from '../../state/store';
import type { FaixaMidia } from '../../state/types';

export default function AmbienciaPanel() {
  const ambiencia = useStore((s) => s.ambiencia);
  const duracao = useAmbienciaUiStore((s) => s.duracaoSegundos);
  const posicao = useAmbienciaUiStore((s) => s.posicaoSegundos);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const faixa = ambiencia.faixas.find((f) => f.id === ambiencia.faixaAtualId);

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
  const alternar = () => {
    if (!faixa) {
      if (ambiencia.faixas[0]) selecionar(ambiencia.faixas[0].id);
    } else useStore.getState().atualizarEstadoAmbiencia({ tocando: !ambiencia.tocando, posicaoSegundos: posicao });
  };
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
    <label className="label" htmlFor="ambiencia-faixa">som de ambiência</label>
    <select id="ambiencia-faixa" value={ambiencia.faixaAtualId ?? ''} onChange={(e) => {
      if (e.target.value) selecionar(e.target.value);
      else useStore.getState().atualizarEstadoAmbiencia({ faixaAtualId: null, tocando: false, posicaoSegundos: 0 });
    }}>
      <option value="">nenhuma ambiência selecionada</option>
      {ambiencia.faixas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
    </select>
    <input type="range" aria-label="posição da ambiência" min={0} max={duracao || 0} step={0.1}
      value={Math.min(posicao, duracao || 0)} disabled={!faixa || !duracao}
      onChange={(e) => useStore.getState().atualizarEstadoAmbiencia({ posicaoSegundos: Number(e.target.value) })} />
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="acento" onClick={alternar} disabled={!ambiencia.faixas.length}>{ambiencia.tocando ? 'pausar ambiência' : 'tocar ambiência'}</button>
      <button disabled={!faixa} onClick={() => useStore.getState().atualizarEstadoAmbiencia({ tocando: false, posicaoSegundos: 0 })}>parar ambiência</button>
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-dim)' }}>loop contínuo</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <label className="vazio" htmlFor="ambiencia-volume" style={{ fontSize: 12 }}>volume ambiência (todos)</label>
      <input id="ambiencia-volume" type="range" min={0} max={1} step={0.05} value={ambiencia.volume}
        onChange={(e) => useStore.getState().definirVolumeAmbiencia(Number(e.target.value))} style={{ width: 260, maxWidth: '100%' }} />
      <span className="mono" style={{ fontSize: 11 }}>{Math.round(ambiencia.volume * 100)}%</span>
    </div>
    {!ambiencia.faixas.length && <p className="vazio" style={{ margin: 0 }}>nenhuma ambiência ainda — envie um áudio acima.</p>}
    {ambiencia.faixas.map((f) => <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <button onClick={() => selecionar(f.id)} aria-pressed={f.id === ambiencia.faixaAtualId} style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</button>
      <button className="icone-botao perigo" title={`excluir ambiência ${f.nome}`} onClick={() => void excluir(f)}>×</button>
    </div>)}
    {erro && <span role="alert" style={{ color: 'var(--ruido)', fontSize: 12 }}>{erro}</span>}
  </section>;
}
