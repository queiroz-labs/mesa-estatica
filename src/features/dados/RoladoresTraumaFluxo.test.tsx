import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarFichaVazia } from '../../state/factories';
const h = vi.hoisted(() => ({ valores: [] as any[], indice: 0, refs: [] as any[], indiceRef: 0 }));
vi.mock('react', async (original) => ({
  ...await original<any>(),
  useEffect: (efeito: () => void) => { efeito(); },
  useRef: (inicial: any) => h.refs[h.indiceRef++] ??= { current: inicial },
  useState: (inicial: any) => {
    const indice = h.indice++;
    if (!(indice in h.valores)) h.valores[indice] = typeof inicial === 'function' ? inicial() : inicial;
    return [h.valores[indice], (valor: any) => { h.valores[indice] = typeof valor === 'function' ? valor(h.valores[indice]) : valor; }];
  },
}));
vi.mock('../../state/store', async (original) => {
  const real = await original<any>();
  return { ...real, useStore: Object.assign((selector: any) => selector(real.useStore.getState()), real.useStore) };
});
import { useStore } from '../../state/store';
import RoladorTrauma from './RoladorTrauma';
import RoladorTraumaJogador from './RoladorTraumaJogador';

beforeEach(() => { h.valores = []; h.indice = 0; h.refs = []; h.indiceRef = 0; useStore.setState(criarEstadoInicial()); });
function elementos(no: any, tipo: string): ReactElement<any>[] {
  if (Array.isArray(no)) return no.flatMap((filho) => elementos(filho, tipo));
  if (!no || typeof no !== 'object') return [];
  return [...(no.type === tipo ? [no] : []), ...elementos(no.props?.children, tipo)];
}
function texto(no: any): string {
  if (Array.isArray(no)) return no.map(texto).join('');
  if (no && typeof no.type === 'function') return texto(no.type(no.props));
  return typeof no === 'object' && no !== null ? texto(no.props?.children) : String(no ?? '');
}

function preparar(modo: 'mestre' | 'jogador') {
  const alvo = { ...criarFichaVazia(), nome: 'Arthur', sanidadeAtual: 20, atributos: { ...criarFichaVazia().atributos, vontade: 2 } };
  alvo.traumas = [{ id: 'trauma', nome: 'Hipervigilância', gatilho: 'câmeras', resposta: 'mapear saídas', virouCicatriz: false, cicatrizUsadaNestaSessao: false }];
  const outro = { ...criarFichaVazia(), nome: 'Outro', sanidadeAtual: 10 };
  useStore.setState({ fichas: [alvo, outro] });
  let completar: (grupos: any[]) => void | false = () => {};
  const rolar = vi.fn((_termos: any, callback: (grupos: any[]) => void | false) => { completar = callback; });
  const renderizar = () => {
    h.indice = 0;
    h.indiceRef = 0;
    return modo === 'mestre' ? RoladorTrauma({ ready: true, rolar }) : RoladorTraumaJogador({ ficha: useStore.getState().fichas[0], ready: true, rolar });
  };
  let tela = renderizar();
  if (modo === 'mestre') {
    elementos(tela, 'select').find((el) => el.props.id === 'rtr-ficha')!.props.onChange({ target: { value: alvo.id } });
    tela = renderizar();
  }
  elementos(tela, 'select').find((el) => el.props.id === (modo === 'mestre' ? 'rtr-trauma' : 'rtrj-trauma'))!.props.onChange({ target: { value: 'trauma' } });
  return { alvo, outro, rolar, renderizar, concluir: (valor: number) => completar([{ value: valor, rolls: [{ value: valor }] }]) };
}

it.each(['mestre', 'jogador'] as const)('Trauma do %s bloqueia troca de alvo durante teste e perda de Sanidade', (modo) => {
  const { renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  tela = renderizar();
  expect(elementos(tela, 'select').every((el) => el.props.disabled === true)).toBe(true);
  concluir(1);
  tela = renderizar();
  expect(elementos(tela, 'select').every((el) => el.props.disabled !== true)).toBe(true);
  elementos(tela, 'button').find((el) => texto(el).includes('perder 1d4 Sanidade'))!.props.onClick();
  tela = renderizar();
  expect(elementos(tela, 'select').every((el) => el.props.disabled === true)).toBe(true);
  concluir(4);
  tela = renderizar();
  expect(elementos(tela, 'select').every((el) => el.props.disabled !== true)).toBe(true);
  expect(useStore.getState().fichas.map((f) => f.sanidadeAtual)).toEqual([16, 10]);
});

it.each(['mestre', 'jogador'] as const)('Anestesia ativa no %s passa gatilho sem rolar nem gerar efeitos, até término manual', (modo) => {
  const { alvo, rolar, renderizar } = preparar(modo);
  useStore.getState().atualizarFicha(alvo.id, { anestesiaAte: '2000-01-01T00:00:00.000Z' });
  let tela = renderizar();
  const botao = elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!;
  expect(botao.props.disabled).toBe(true);
  expect(texto(tela)).toContain('gatilhos de Trauma passam automaticamente');
  botao.props.onClick();
  expect(rolar).not.toHaveBeenCalled();
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 20, determinacao: 1 });
  useStore.getState().atualizarFicha(alvo.id, { anestesiaAte: null });
  tela = renderizar();
  expect(elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.disabled).toBe(false);
});

it.each(['mestre', 'jogador'] as const)('Anestesia ativada durante Vontade do %s descarta falha antes de aplicar consequências', (modo) => {
  const { alvo, renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  useStore.getState().atualizarFicha(alvo.id, { anestesiaAte: new Date().toISOString() });
  const conclusao = concluir(1);
  if (modo === 'jogador') expect(conclusao).toBe(false);
  tela = renderizar();
  expect(elementos(tela, 'button').some((el) => texto(el).includes('perder 1d4'))).toBe(false);
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 20, determinacao: 1 });
  expect(useStore.getState().log).toEqual([]);
});

it.each(['mestre', 'jogador'] as const)('Anestesia ativada durante perda do %s preserva Sanidade', (modo) => {
  const { alvo, renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(1); tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('perder 1d4'))!.props.onClick();
  useStore.getState().atualizarFicha(alvo.id, { anestesiaAte: new Date().toISOString() });
  const conclusao = concluir(4);
  if (modo === 'jogador') expect(conclusao).toBe(false);
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 20, determinacao: 1 });
  expect(useStore.getState().log.some((entrada) => entrada.texto.includes('perde Sanidade'))).toBe(false);
});

it('ficha removida durante Trauma do jogador veta a conclusão pública sem criar efeito', () => {
  const { renderizar, concluir } = preparar('jogador');
  const tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  useStore.setState({ fichas: [] });
  expect(concluir(1)).toBe(false);
  expect(useStore.getState().log).toEqual([]);
});

it.each(['mestre', 'jogador'] as const)('botão antigo de interpretar do %s respeita Anestesia que chegou antes do clique', (modo) => {
  const { alvo, renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(1); tela = renderizar();
  const interpretar = elementos(tela, 'button').find((el) => texto(el).includes('interpretar a Resposta'))!;
  useStore.getState().atualizarFicha(alvo.id, { anestesiaAte: new Date().toISOString() });
  interpretar.props.onClick();
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 20, determinacao: 1 });
  expect(useStore.getState().log.some((entrada) => entrada.texto.includes('interpretou'))).toBe(false);
});

it.each(['mestre', 'jogador'] as const)('perda do %s usa Sanidade atual se houve ajuste enquanto d4 animava', (modo) => {
  const { alvo, renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(1); tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('perder 1d4'))!.props.onClick();
  useStore.getState().ajustarSanidadeAtual(alvo.id, 18);
  concluir(4);
  expect(useStore.getState().fichas.map((f) => f.sanidadeAtual)).toEqual([14, 10]);
});

it.each(['mestre', 'jogador'] as const)('resultado do %s separa d20, Vontade, total, DT e sucesso sem mudar recursos', (modo) => {
  const { renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(10); tela = renderizar();
  const resultado = texto(tela);
  expect(resultado).toContain('Dado bruto: d20 = 10');
  expect(resultado).toContain('Modificador de Vontade: +2');
  expect(resultado).toContain('Total do teste: 12 · DT 12');
  expect(resultado).toContain('Sucesso: segurou o gatilho');
  expect(resultado).toContain('Nenhuma perda de Sanidade ou ganho de Determinação');
  expect(elementos(tela, 'button').some((el) => texto(el).includes('interpretar a Resposta'))).toBe(false);
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 20, determinacao: 1 });
});

it.each(['mestre', 'jogador'] as const)('interpretar no %s confirma o ganho real e não promete +1 ao atingir teto 2', (modo) => {
  const { alvo, renderizar, concluir } = preparar(modo);
  useStore.getState().ajustarDeterminacao(alvo.id, 2);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(1); tela = renderizar();
  const interpretar = elementos(tela, 'button').find((el) => texto(el).includes('interpretar a Resposta'))!;
  expect(texto(interpretar)).toContain('já no limite de 2');
  interpretar.props.onClick(); tela = renderizar();
  expect(texto(tela)).toContain('Determinação permanece 2: limite de 2 atingido, nenhum ponto adicional');
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 20, determinacao: 2 });
  expect(useStore.getState().log[0].texto).toContain('nenhum ponto adicional');
  expect(useStore.getState().log[0].texto).not.toContain('+1 Determinação');
});

it.each(['mestre', 'jogador'] as const)('escolha de perder Sanidade do %s aplica só essa consequência mesmo com outro handler antigo', (modo) => {
  const { rolar, renderizar, concluir } = preparar(modo);
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(1); tela = renderizar();
  const interpretar = elementos(tela, 'button').find((el) => texto(el).includes('interpretar a Resposta'))!;
  elementos(tela, 'button').find((el) => texto(el).includes('perder 1d4'))!.props.onClick();
  interpretar.props.onClick();
  concluir(4); tela = renderizar();
  expect(rolar).toHaveBeenCalledTimes(2);
  expect(texto(tela)).toContain('Perda aplicada: 4 Sanidade (20 → 16), sem outro teste');
  expect(useStore.getState().fichas[0]).toMatchObject({ sanidadeAtual: 16, determinacao: 1 });
});

it.each(['perda', 'resposta'] as const)('Trauma privado do mestre mantém %s e deltas privados mesmo após desmarcar privado', (escolha) => {
  const { renderizar, concluir } = preparar('mestre');
  let tela = renderizar();
  elementos(tela, 'button').find((el) => texto(el).includes('rolar Vontade'))!.props.onClick();
  concluir(1); tela = renderizar();
  elementos(tela, 'input').find((el) => el.props.type === 'checkbox')!.props.onChange({ target: { checked: false } });
  tela = renderizar();
  if (escolha === 'perda') {
    elementos(tela, 'button').find((el) => texto(el).includes('perder 1d4'))!.props.onClick();
    concluir(4);
  } else {
    elementos(tela, 'button').find((el) => texto(el).includes('interpretar a Resposta'))!.props.onClick();
  }
  const log = useStore.getState().log;
  expect(log).toHaveLength(3);
  expect(log.every((entrada) => entrada.visibilidade === 'privada')).toBe(true);
});
