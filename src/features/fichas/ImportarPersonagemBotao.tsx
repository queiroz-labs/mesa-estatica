import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { extrairMensagemErro } from '../../multiplayer/uploadR2';
import { ANTECEDENTES } from '../../rules/data/antecedentes';
import { ATRIBUTOS, PERICIAS } from '../../rules/data/pericias';
import { useStore } from '../../state/store';
import { extrairTextoDocx } from './extrairTextoDocx';
import { encontrarFichaPorNome, importarFichasDeJSON, type ResultadoImportacao } from './importarPersonagem';

const PLACEHOLDER_DOCX = '[cole ou anexe o conteúdo do .docx aqui]';

const EXEMPLO = {
  nome: "Marta 'Sombra' Andrade",
  jogador: 'nome de quem joga',
  antecedente: 'Jornalista independente',
  motivo: 'perdeu a fonte que ia provar o Incidente',
  perguntaQueTeDefine: 'até onde você vai por uma matéria que ninguém quer publicada?',
  respostaPergunta: 'até onde for preciso — de novo',
  gancho: 'a última matéria caiu 40 minutos depois de fechada',
  atributos: { vigor: 1, agilidade: 2, intelecto: 3, percepcao: 2, presenca: 1, vontade: 0 },
  pericias: { investigacao: 'veterano', persuasao: 'treinado', furtividade: 'treinado' },
  vinculos: [{ quemOuOque: 'o fotógrafo que sumiu', frase: 'ele viu o mesmo que eu' }],
  traumas: [{ nome: 'mãos que tremem', gatilho: 'flash de câmera no escuro', resposta: 'silêncio, depois um passo atrás' }],
  kitAntecedente: 'gravador analógico, credencial vencida, arquivo de matérias engavetadas',
  contatoOuRecurso: 'fonte dentro de uma corporação, só fala por mensagem autodestrutiva',
  armas: [{ nome: 'Faca', bonusAtaque: '', dano: '1d6', alcance: '1,5m', nota: 'fácil de esconder' }],
  kitInvestigacao: [{ nome: 'Kit médico de campo', nota: 'Marcado — sem ele, Medicina em campo: DT +5' }],
  anotacoes: '',
  observacaoCombate: 'tiro no pé direito — desvantagem em Agilidade',
};

function montarPrompt(): string {
  const perícias = PERICIAS.map((p) => `${p.id} (${p.nome})`).join(', ');
  const antecedentes = ANTECEDENTES.map((a) => `"${a.nome}"`).join(', ');
  const atributos = ATRIBUTOS.map((a) => a.id).join(', ');
  return `Você vai converter uma ficha de personagem de RPG (texto de um .docx que vou colar ou anexar) num JSON num formato específico. Preencha só o que a ficha realmente disser — não invente número nem história. Campos que não aparecerem na ficha, omita do JSON.

Formato esperado (um objeto por personagem; se eu mandar várias fichas de uma vez, devolva uma lista de objetos):

${JSON.stringify(EXEMPLO, null, 2)}

Regras de preenchimento:
- "antecedente": um destes nomes, exatamente como está escrito ou bem parecido: ${antecedentes}.
- "atributos": chaves são ${atributos}, valores inteiros de 0 a 5.
- "pericias": chave é o id ou nome da perícia (${perícias}); valor é "nenhum", "treinado" ou "veterano".
- "vinculos" e "traumas": no máximo 3 cada.
- "corVisual" (opcional): só se a ficha tiver uma cor definida, em hex tipo "#4fc1d4" — senão omita.
- "kitInvestigacao": lista opcional de itens de investigação { nome, nota }.
- texto do documento que não se encaixar em nenhum campo acima (comentário solto, nota sem seção clara, qualquer trecho sobrando) entra em "anotacoes" (concatenado ao que já tiver ali, sem se perder) — nenhum texto do documento original pode ser descartado.
- apelido ou citação dentro de um texto: use aspas simples ('assim'), nunca aspas duplas sem escapar — aspas duplas cruas dentro de um valor quebram o JSON (veja "nome" no exemplo acima).
- Responda só com o JSON, sem markdown, sem comentário antes ou depois.

Aqui está a ficha:
${PLACEHOLDER_DOCX}`;
}

type Status = 'fechado' | 'aberto' | 'copiado';

export default function ImportarPersonagemBotao() {
  const basePV = useStore((s) => s.config.basePV);
  const adicionarFicha = useStore((s) => s.adicionarFicha);
  const atualizarFicha = useStore((s) => s.atualizarFicha);

  const [status, setStatus] = useState<Status>('fechado');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [convertendo, setConvertendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const copiarPrompt = async () => {
    setErro(null);
    try {
      await navigator.clipboard.writeText(montarPrompt());
      setStatus('copiado');
      setTimeout(() => setStatus((atual) => atual === 'copiado' ? 'aberto' : atual), 1500);
    } catch { setErro('cópia bloqueada pelo navegador — permita copiar e tente novamente.'); }
  };

  const aplicarResultados = (resultados: ResultadoImportacao[]) => {
    const linhas: string[] = [];
    for (const r of resultados) {
      // reler a cada volta — uma ficha criada nesta mesma leva já entra na busca da próxima.
      const fichasAtuais = useStore.getState().fichas;
      const existenteId = encontrarFichaPorNome(fichasAtuais, r.patch.nome);
      const id = existenteId ?? adicionarFicha();
      atualizarFicha(id, r.patch);
      const acao = existenteId ? 'sobrescrito (já existia um personagem com esse nome)' : 'importado';
      linhas.push(
        r.avisos.length === 0
          ? `${r.nomeParaExibir}: ${acao}, sem avisos.`
          : `${r.nomeParaExibir}: ${acao}.\n  - ${r.avisos.join('\n  - ')}`,
      );
    }
    // resultado inline em vez de window.alert: dialog nativo pode ficar bloqueado/mudo em
    // contexto embutido (ex.: sem permissão do site aceita) sem avisar — a ficha já foi
    // criada/atualizada acima de qualquer forma, então a confirmação não pode depender disso.
    setResultado(`${resultados.length} personagem(ns) processado(s).\n\n${linhas.join('\n\n')}`);
    setTexto('');
    setErro(null);
  };

  const importarDoTexto = () => {
    if (!texto.trim()) return;
    const { resultados, erroGeral } = importarFichasDeJSON(texto, basePV);
    if (erroGeral) {
      setErro(erroGeral);
      return;
    }
    aplicarResultados(resultados);
  };

  const importarDeArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      const conteudo = await arquivo.text();
      const { resultados, erroGeral } = importarFichasDeJSON(conteudo, basePV);
      if (erroGeral) { setErro(erroGeral); return; }
      aplicarResultados(resultados);
    } catch { setErro('não consegui ler esse arquivo — selecione o JSON novamente ou cole o conteúdo no campo de texto.'); }
  };

  const importarDeDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo || !supabase) return;
    setErro(null);
    setConvertendo(true);
    try {
      const textoDocx = await extrairTextoDocx(arquivo);
      const prompt = montarPrompt().replace(PLACEHOLDER_DOCX, textoDocx);
      const { data, error } = await supabase.functions.invoke<{ texto: string }>('converter-ficha-docx', { body: { prompt } });
      if (error || !data) {
        setErro((await extrairMensagemErro(error)) ?? 'importação por IA falhou — tenta de novo ou usa o fluxo manual.');
        return;
      }
      const { resultados, erroGeral } = importarFichasDeJSON(data.texto, basePV);
      if (erroGeral) {
        setErro(erroGeral);
        return;
      }
      aplicarResultados(resultados);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'não deu pra ler esse .docx.');
    } finally {
      setConvertendo(false);
    }
  };

  const fechar = () => {
    setStatus('fechado');
    setTexto('');
    setErro(null);
    setResultado(null);
  };

  useEffect(() => {
    if (status === 'fechado') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status]);

  if (status === 'fechado') {
    return (
      <button onClick={() => setStatus('aberto')} title="converter .docx de jogador em ficha, via IA + JSON">
        importar personagem
      </button>
    );
  }

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
      onClick={fechar}
    >
      <div
        className="secao"
        style={{ width: 560, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>importar personagem</h3>
          <button className="icone-botao" onClick={fechar} title="fechar (Esc)" style={{ color: 'var(--ruido)' }}>
            ×
          </button>
        </div>
        {resultado ? (
          <>
            <p className="vazio" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {resultado}
            </p>
            <button className="acento" onClick={fechar}>
              fechar
            </button>
          </>
        ) : (
          <>
            {supabase && (
              <>
                <p className="vazio" style={{ margin: 0 }}>
                  carregue o .docx do jogador e a IA converte sozinha, sem precisar copiar/colar nada.
                </p>
                <label className="mapa-upload-botao acento" style={{ fontSize: '13px', padding: '0.5em 0.8em', opacity: convertendo ? 0.6 : 1 }}>
                  {convertendo ? 'convertendo…' : 'carregar .docx (IA converte automático)'}
                  <input type="file" accept=".docx" hidden disabled={convertendo} onChange={importarDeDocx} />
                </label>
                <p className="vazio" style={{ margin: 0, fontSize: '12px' }}>
                  ou, se preferir controlar a IA você mesmo:
                </p>
              </>
            )}
            <p className="vazio" style={{ margin: 0 }}>
              1. copie o prompt abaixo e mande pra sua IA junto com o .docx do jogador. 2. cole aqui embaixo o JSON que ela devolver (ou
              carregue como arquivo .json).
              {!supabase && ' (importação automática por IA precisa de Supabase configurado.)'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={copiarPrompt}>{status === 'copiado' ? 'copiado' : 'copiar prompt pra IA'}</button>
              <label className="mapa-upload-botao" style={{ fontSize: '13px', padding: '0.5em 0.8em' }}>
                carregar .json
                <input type="file" accept=".json,application/json" hidden onChange={importarDeArquivo} />
              </label>
            </div>
            <textarea
              rows={8}
              placeholder="cole aqui o JSON que a IA devolveu"
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setErro(null);
              }}
              style={{ width: '100%' }}
            />
            {erro && <span style={{ color: 'var(--ruido)', fontSize: '12px' }}>{erro}</span>}
            <button className="acento" onClick={importarDoTexto} disabled={!texto.trim()}>
              importar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
