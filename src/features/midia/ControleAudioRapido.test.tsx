import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoInicial } from '../../state/factories';
import { useStore } from '../../state/store';
import { useAmbienciaUiStore } from '../../state/ambienciaUiStore';
import { useMidiaUiStore } from '../../state/midiaUiStore';
import ControleAudioRapido from './ControleAudioRapido';

const hooks = vi.hoisted(() => ({
  estados: [] as any[], estadoIndice: 0,
  refs: [] as { current: any }[], refIndice: 0,
  efeitos: [] as { deps: unknown[]; limpar?: () => void }[], efeitoIndice: 0,
  pendentes: [] as (() => void)[],
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useId: () => 'audio-qa',
  useState: (valor: any) => {
    const indice = hooks.estadoIndice++;
    if (!(indice in hooks.estados)) hooks.estados[indice] = valor;
    return [hooks.estados[indice], (novo: any) => { hooks.estados[indice] = typeof novo === 'function' ? novo(hooks.estados[indice]) : novo; }];
  },
  useRef: (valor: any) => hooks.refs[hooks.refIndice++] ??= { current: valor },
  useEffect: (executar: () => (() => void) | undefined, deps: unknown[]) => {
    const indice = hooks.efeitoIndice++;
    const anterior = hooks.efeitos[indice];
    if (anterior && deps.every((d, i) => Object.is(d, anterior.deps[i]))) return;
    anterior?.limpar?.();
    hooks.pendentes.push(() => { hooks.efeitos[indice] = { deps, limpar: executar() }; });
  },
}));
vi.mock('../../state/store', async (original) => {
  const real = await original<any>();
  return { ...real, useStore: Object.assign((selector: any) => selector(real.useStore.getState()), real.useStore) };
});

class NoFalso { constructor(readonly dentro: boolean) {} }
let listeners: Map<string, (evento: any) => void>;
const focarBotao = vi.fn();
const focarPainel = vi.fn();
const adicionarListener = vi.fn();
const removerListener = vi.fn();

function renderizar() {
  hooks.estadoIndice = 0; hooks.refIndice = 0; hooks.efeitoIndice = 0;
  const arvore = ControleAudioRapido();
  hooks.refs[0].current = { contains: (no: NoFalso) => no.dentro };
  hooks.refs[1].current = { focus: focarBotao };
  hooks.refs[2].current = { focus: focarPainel };
  for (const executar of hooks.pendentes.splice(0)) executar();
  return arvore;
}
function elementos(no: any): any[] {
  if (!no || typeof no !== 'object') return [];
  if (Array.isArray(no)) return no.flatMap(elementos);
  return [no, ...elementos(no.props?.children)];
}
const encontrar = (arvore: any, condicao: (no: any) => boolean) => elementos(arvore).find(condicao);
const abrir = () => {
  encontrar(renderizar(), (no) => no.props?.['aria-haspopup'] === 'dialog').props.onClick();
  return renderizar();
};

beforeEach(() => {
  hooks.estados = []; hooks.refs = []; hooks.efeitos = []; hooks.pendentes = [];
  listeners = new Map();
  vi.useFakeTimers();
  vi.setSystemTime(25_000);
  vi.stubGlobal('Node', NoFalso);
  vi.stubGlobal('document', {
    addEventListener: adicionarListener.mockImplementation((tipo: string, executar: (e: any) => void) => listeners.set(tipo, executar)),
    removeEventListener: removerListener.mockImplementation((tipo: string, executar: (e: any) => void) => {
      if (listeners.get(tipo) === executar) listeners.delete(tipo);
    }),
  });
  useStore.setState(criarEstadoInicial());
  useStore.setState((s) => ({
    midia: { ...s.midia, faixas: [{ id: 'musica', nome: 'sinal na estação', path: '', url: '/musica.mp3', ordem: 0, criadoEm: '' }],
      faixaAtualId: 'musica', tocando: true, volume: 0.8, posicaoSegundos: 1, atualizadoEm: new Date(0).toISOString(), modoLoop: 'faixa' },
    ambiencia: { ...s.ambiencia, faixas: [{ id: 'chuva', nome: 'chuva na rua', path: '', url: '/chuva.mp3', ordem: 0, criadoEm: '' }],
      faixaAtualId: 'chuva', tocando: true, volume: 0.35, posicaoSegundos: 1, atualizadoEm: new Date(0).toISOString() },
  }));
  useMidiaUiStore.getState().definirDuracao(20);
  useAmbienciaUiStore.getState().atualizar(7, 5);
});
afterEach(() => {
  for (const efeito of hooks.efeitos) efeito.limpar?.();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe('controle rápido de áudio do mestre', () => {
  it('ajusta apenas o volume escolhido sem recarimbar a posição ou criar outro player', () => {
    const painel = abrir();
    expect(elementos(painel).some((no) => no.type === 'audio')).toBe(false);
    expect(encontrar(painel, (no) => no.props?.title === 'sinal na estação')).toBeTruthy();
    expect(encontrar(painel, (no) => no.props?.title === 'chuva na rua')).toBeTruthy();
    const musicaAntes = useStore.getState().midia;
    const ambienciaAntes = useStore.getState().ambiencia;
    encontrar(painel, (no) => no.props?.id === 'audio-qa-musica').props.onChange({ target: { value: '0.2' } });
    expect(useStore.getState().midia.volume).toBe(0.2);
    expect(useStore.getState().midia.atualizadoEm).toBe(musicaAntes.atualizadoEm);
    expect(useStore.getState().ambiencia).toBe(ambienciaAntes);
    encontrar(renderizar(), (no) => no.props?.id === 'audio-qa-ambiencia').props.onChange({ target: { value: '0.6' } });
    expect(useStore.getState().ambiencia.volume).toBe(0.6);
    expect(useStore.getState().ambiencia.atualizadoEm).toBe(ambienciaAntes.atualizadoEm);
    expect(useStore.getState().midia.volume).toBe(0.2);
  });

  it('pausa e retoma cada canal no ponto do loop sem afetar o outro', () => {
    let painel = abrir();
    encontrar(painel, (no) => no.props?.['aria-label'] === 'pausar música').props.onClick();
    expect(useStore.getState().midia).toMatchObject({ tocando: false, posicaoSegundos: 6, volume: 0.8 });
    expect(useStore.getState().ambiencia.tocando).toBe(true);
    vi.advanceTimersByTime(10_000);
    painel = renderizar();
    encontrar(painel, (no) => no.props?.['aria-label'] === 'retomar música').props.onClick();
    expect(useStore.getState().midia).toMatchObject({ tocando: true, posicaoSegundos: 6 });
    encontrar(renderizar(), (no) => no.props?.['aria-label'] === 'pausar ambiência').props.onClick();
    expect(useStore.getState().ambiencia).toMatchObject({ tocando: false, posicaoSegundos: 1, volume: 0.35 });
    expect(useStore.getState().midia.tocando).toBe(true);
    vi.advanceTimersByTime(5000);
    encontrar(renderizar(), (no) => no.props?.['aria-label'] === 'retomar ambiência').props.onClick();
    expect(useStore.getState().ambiencia).toMatchObject({ tocando: true, posicaoSegundos: 1 });
  });

  it('não inicia outra faixa nem muda a mesa quando a seleção sumiu', () => {
    const painel = abrir();
    const botao = encontrar(painel, (no) => no.props?.['aria-label'] === 'pausar música');
    useStore.getState().removerFaixaMidia('musica');
    const depois = useStore.getState().midia;
    botao.props.onClick();
    expect(useStore.getState().midia).toBe(depois);
    expect(encontrar(renderizar(), (no) => no.props?.['aria-label'] === 'retomar música').props.disabled).toBe(true);
  });

  it('listener externo fecha por Esc; outras teclas fora do painel continuam livres', () => {
    abrir();
    expect(focarPainel).toHaveBeenCalledOnce();
    const prevenir = vi.fn(); const parar = vi.fn();
    listeners.get('keydown')!({ key: 'r', preventDefault: prevenir, stopPropagation: parar });
    expect(prevenir).not.toHaveBeenCalled();
    expect(parar).not.toHaveBeenCalled();
    expect(encontrar(renderizar(), (no) => no.props?.role === 'dialog')).toBeTruthy();
    listeners.get('keydown')!({ key: 'Escape', preventDefault: prevenir, stopPropagation: parar });
    expect(encontrar(renderizar(), (no) => no.props?.role === 'dialog')).toBeUndefined();
    expect(focarBotao).toHaveBeenCalledOnce();
    expect(prevenir).toHaveBeenCalledOnce();
    expect(parar).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it('bloqueia atalhos dentro do painel sem impedir teclas nativas e fecha Esc com foco', () => {
    const painel = encontrar(abrir(), (no) => no.props?.role === 'dialog');
    const prevenir = vi.fn(); const parar = vi.fn();
    for (const key of ['n', 'p', '1', '8', 'r', 'Tab', 'ArrowRight', ' ']) {
      painel.props.onKeyDown({ key, preventDefault: prevenir, stopPropagation: parar });
    }
    expect(parar).toHaveBeenCalledTimes(8);
    expect(prevenir).not.toHaveBeenCalled();
    expect(encontrar(renderizar(), (no) => no.props?.role === 'dialog')).toBeTruthy();
    painel.props.onKeyDown({ key: 'Escape', preventDefault: prevenir, stopPropagation: parar });
    expect(encontrar(renderizar(), (no) => no.props?.role === 'dialog')).toBeUndefined();
    expect(prevenir).toHaveBeenCalledOnce();
    expect(focarBotao).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it('clique dentro conserva o painel, clique fora fecha sem consumir o evento', () => {
    abrir();
    listeners.get('pointerdown')!({ target: new NoFalso(true) });
    expect(encontrar(renderizar(), (no) => no.props?.role === 'dialog')).toBeTruthy();
    const prevenir = vi.fn();
    listeners.get('pointerdown')!({ target: new NoFalso(false), preventDefault: prevenir });
    expect(encontrar(renderizar(), (no) => no.props?.role === 'dialog')).toBeUndefined();
    expect(prevenir).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
