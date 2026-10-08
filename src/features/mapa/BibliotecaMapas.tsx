import { useState } from 'react';
import Icone from '../../components/Icone';
import { comprimirImagem } from '../../lib/comprimirImagem';
import { supabase } from '../../lib/supabaseClient';
import { marcarRemocaoExplicita } from '../../multiplayer/remocaoExplicita';
import { uploadImagemStorage } from '../../multiplayer/uploadImagemStorage';
import { useStore } from '../../state/store';
import type { MapaBiblioteca } from '../../state/types';

/**
 * Popover na toolbar da aba Mapa (mestre) — biblioteca de mapas: subir vários, escolher qual
 * está em cena agora. Grid/FoW de cada um ficam guardados junto do item (`MapaBiblioteca`,
 * `state/types.ts`) e voltam do jeito que ficaram ao reselecionar — só a imagem/posição de
 * tokens é que troca na hora.
 *
 * Mesmo padrão de upload de `MapaTab.tsx` original (`comprimirImagem` +
 * `uploadImagemStorage`), e mesmo padrão de exclusão de `MidiaTab.tsx` (`marcarRemocaoExplicita`
 * + delete no Storage decidido pelo path guardado, não pela URL).
 */
export default function BibliotecaMapas() {
  const biblioteca = useStore((s) => s.mapa.biblioteca);
  const mapaAtivoId = useStore((s) => s.mapa.mapaAtivoId);
  const adicionarMapaBiblioteca = useStore((s) => s.adicionarMapaBiblioteca);
  const removerMapaBiblioteca = useStore((s) => s.removerMapaBiblioteca);
  const renomearMapaBiblioteca = useStore((s) => s.renomearMapaBiblioteca);
  const atualizarImagemMapaBiblioteca = useStore((s) => s.atualizarImagemMapaBiblioteca);
  const selecionarMapaAtivo = useStore((s) => s.selecionarMapaAtivo);

  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ordenados = [...biblioteca].sort((a, b) => a.ordem - b.ordem);
  const ativo = biblioteca.find((m) => m.id === mapaAtivoId) ?? null;

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro(null);
    setCarregando(true);
    try {
      const { dataUrl, blob } = await comprimirImagem(arquivo);
      // pintura otimista: item nasce com a dataURL local, funciona sem Supabase configurado
      // (modo local) — mesmo princípio do fluxo antigo (`MapaTab.tsx`, ver histórico). Se o
      // upload pro Storage completar, troca pela URL leve (`atualizarImagemMapaBiblioteca`);
      // enquanto for dataURL, `mapasBibliotecaSync.ts` não sincroniza esse item (evita mandar
      // o base64 pro Postgres/Realtime — mesmo cuidado de `imagemPendente.ts`).
      const nome = arquivo.name.replace(/\.[^.]+$/, '') || 'mapa';
      const id = adicionarMapaBiblioteca(nome, '', dataUrl);
      selecionarMapaAtivo(id);
      const { url, path, erro: mensagemErro } = await uploadImagemStorage('mapas', blob);
      if (url) atualizarImagemMapaBiblioteca(id, path ?? '', url);
      else setErro(mensagemErro ?? null);
    } catch {
      setErro('não foi possível carregar essa imagem.');
    } finally {
      setCarregando(false);
    }
  };

  const excluir = async (mapa: MapaBiblioteca) => {
    if (!window.confirm(`excluir "${mapa.nome || 'mapa sem nome'}" da biblioteca?`)) return;
    marcarRemocaoExplicita(mapa.id);
    removerMapaBiblioteca(mapa.id);
    if (mapa.imagemPath && supabase) {
      const { error } = await supabase.storage.from('midia').remove([mapa.imagemPath]);
      if (error) console.error('[BibliotecaMapas] remoção do Storage falhou (linha já removida)', error);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button className="mapa-upload-botao" onClick={() => setAberto((a) => !a)} title="biblioteca de mapas" aria-expanded={aberto}>
        {ativo ? ativo.nome || 'mapa sem nome' : 'biblioteca de mapas'}
      </button>

      {aberto && (
        <div
          className="secao"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.4rem)',
            left: 0,
            zIndex: 40,
            width: 'min(320px, calc(100vw - 3rem))',
            maxHeight: '60vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="label" style={{ margin: 0 }}>
              biblioteca de mapas
            </h3>
            <button className="controle-icone" onClick={() => setAberto(false)} title="fechar" aria-label="fechar biblioteca de mapas">
              <Icone nome="fechar" />
            </button>
          </div>

          <label className="mapa-upload-botao" style={{ textAlign: 'center' }}>
            {carregando ? 'comprimindo…' : '+ adicionar mapa'}
            <input type="file" accept="image/*" hidden onChange={importar} disabled={carregando} />
          </label>
          {erro && <span style={{ color: 'var(--ruido)', fontSize: 12 }}>{erro}</span>}

          {ordenados.length === 0 ? (
            <p className="vazio" style={{ margin: 0 }}>
              nenhum mapa ainda — adicione um acima.
            </p>
          ) : (
            ordenados.map((mapa) => (
              <ItemBiblioteca
                key={mapa.id}
                mapa={mapa}
                ativo={mapa.id === mapaAtivoId}
                onUsar={() => selecionarMapaAtivo(mapa.id)}
                onRenomear={(nome) => renomearMapaBiblioteca(mapa.id, nome)}
                onExcluir={() => void excluir(mapa)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ItemBiblioteca({
  mapa,
  ativo,
  onUsar,
  onRenomear,
  onExcluir,
}: {
  mapa: MapaBiblioteca;
  ativo: boolean;
  onUsar: () => void;
  onRenomear: (nome: string) => void;
  onExcluir: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem',
        border: '1px solid var(--concrete-2)',
        borderRadius: '2px',
        background: ativo ? 'var(--concrete-1)' : undefined,
      }}
    >
      <img
        src={mapa.imagemUrl}
        alt=""
        style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: '2px', flexShrink: 0, cursor: 'pointer' }}
        onClick={onUsar}
      />
      <input
        type="text"
        value={mapa.nome}
        placeholder="nome do mapa"
        onChange={(e) => onRenomear(e.target.value)}
        style={{ flex: 1, minWidth: 0, fontSize: 12 }}
      />
      {!ativo && (
        <button className="icone-botao" onClick={onUsar} title="usar este mapa">
          usar
        </button>
      )}
      <button className="controle-icone" onClick={onExcluir} title="excluir" aria-label={`excluir mapa ${mapa.nome || 'sem nome'}`}>
        <Icone nome="lixeira" />
      </button>
    </div>
  );
}
