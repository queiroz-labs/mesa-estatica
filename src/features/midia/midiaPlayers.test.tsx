import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstadoAmbiencia, criarEstadoMidia, criarEstadoSoundpad } from '../../state/factories';
import MidiaPlayerGM from './MidiaPlayerGM';
import MidiaPlayerJogador from './MidiaPlayerJogador';
import SoundpadPlayer from './SoundpadPlayer';
import MidiaJogadorView from './MidiaJogadorView';
import { CamadaAmbienciaPlayer } from './AmbienciaPlayer';

// Os testes executam os efeitos de playback com um elemento de mídia controlado.
// Promessas e timers são independentes para reproduzir mudanças enquanto play está pendente.
const ambiente = vi.hoisted(() => ({
  refs: [] as { current: any }[],
  indiceRef: 0,
  indiceEfeito: 0,
  efeitos: [] as { deps?: unknown[]; executar: () => void | (() => void); limpar?: () => void; rodar: boolean }[],
  estado: {} as any,
  som: { slotsTocando: new Set<number>(), mudo: false, marcarParado: vi.fn(), marcarTocando: vi.fn(), definirMudo: vi.fn() },
  habilitado: true,
  definirHabilitado: vi.fn(),
  definirDuracao: vi.fn(),
  listeners: new Set<(s: any) => void>(),
  retomadas: new Set<() => void>(),
}));

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (valor: any) => {
    const indice = ambiente.indiceRef++;
    return ambiente.refs[indice] ??= { current: valor };
  },
  useState: (valor: any) => [valor, vi.fn()],
  useEffect: (executar: () => void | (() => void), deps?: unknown[]) => {
    const indice = ambiente.indiceEfeito++;
    const antigo = ambiente.efeitos[indice];
    const rodar = !antigo || !deps || deps.some((dep, i) => !Object.is(dep, antigo.deps?.[i]));
    ambiente.efeitos[indice] = { deps, executar, limpar: antigo?.limpar, rodar };
  },
}));
vi.mock('../../state/store', () => ({
  useStore: Object.assign((selecionar: (s: any) => any) => selecionar(ambiente.estado), {
    getState: () => ambiente.estado,
    subscribe: (fn: (s: any) => void) => { ambiente.listeners.add(fn); return () => ambiente.listeners.delete(fn); },
  }),
}));
vi.mock('../../state/soundpadUiStore', () => ({
  useSoundpadUiStore: Object.assign((selecionar: (s: any) => any) => selecionar(ambiente.som), { getState: () => ambiente.som }),
}));
vi.mock('../../state/midiaUiStore', () => ({ useMidiaUiStore: (selecionar: (s: any) => any) => selecionar({ definirDuracao: ambiente.definirDuracao }) }));
vi.mock('../../state/audioJogadorStore', () => ({
  useAudioJogadorStore: Object.assign((selecionar: (s: any) => any) => selecionar({ habilitado: ambiente.habilitado, definirHabilitado: ambiente.definirHabilitado }), {
    getState: () => ({ habilitado: ambiente.habilitado, definirHabilitado: ambiente.definirHabilitado }),
  }),
  registrarRetomadaAudio: (fn: () => void) => { ambiente.retomadas.add(fn); return () => { ambiente.retomadas.delete(fn); }; },
  habilitarAudioJogador: () => { ambiente.habilitado = true; },
}));

function audioFalso() {
  let origem: string | null = null;
  const audio = {
    currentTime: 0, duration: 60, volume: 0.8, muted: false, paused: true,
    get src() { return origem ?? ''; },
    set src(valor: string) { origem = valor; audio.paused = true; },
    getAttribute: () => origem,
    removeAttribute: () => { origem = null; },
    load: vi.fn(),
    pause: vi.fn(() => { audio.paused = true; }),
    play: vi.fn(() => { audio.paused = false; return Promise.resolve(); }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return audio;
}

function renderizar(componente: () => ReactElement | null, audio?: ReturnType<typeof audioFalso>) {
  ambiente.indiceRef = 0;
  ambiente.indiceEfeito = 0;
  const resultado = componente();
  if (audio) ambiente.refs[0].current = audio;
  for (const efeito of ambiente.efeitos) {
    if (!efeito.rodar) continue;
    efeito.limpar?.();
    efeito.limpar = efeito.executar() || undefined;
    efeito.rodar = false;
  }
  return resultado;
}

function atualizarMidia(patch: Record<string, unknown>) {
  ambiente.estado.midia = { ...ambiente.estado.midia, ...patch };
  for (const fn of ambiente.listeners) fn(ambiente.estado);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  ambiente.refs = [];
  ambiente.efeitos = [];
  ambiente.listeners.clear();
  ambiente.retomadas.clear();
  ambiente.habilitado = true;
  ambiente.som.slotsTocando = new Set();
  ambiente.som.mudo = false;
  ambiente.estado = {
    midia: { ...criarEstadoMidia(), faixaAtualId: 'faixa', tocando: true, atualizadoEm: new Date().toISOString(), faixas: [{ id: 'faixa', nome: 'chuva.mp3', url: 'https://example.test/chuva.mp3', path: 'chuva.mp3', ordem: 0, criadoEm: new Date().toISOString() }] },
    soundpad: criarEstadoSoundpad(),
    ambiencia: criarEstadoAmbiencia(),
    atualizarEstadoMidia: vi.fn(),
  };
});

afterEach(() => {
  for (const efeito of ambiente.efeitos) efeito.limpar?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('nomes de áudio na interface do jogador', () => {
  it('repete música individual nativamente no jogador, mas deixa playlist seguir o mestre', () => {
    atualizarMidia({ modoLoop: 'faixa' });
    expect((renderizar(MidiaPlayerJogador, audioFalso())!.props as any).children[0].props.loop).toBe(true);
    atualizarMidia({ modoLoop: 'lista' });
    expect((renderizar(MidiaPlayerJogador)!.props as any).children[0].props.loop).toBe(false);
  });
  it('não renderiza títulos no cabeçalho ou aba, inclusive após troca e nova hidratação', () => {
    const audio = audioFalso();
    for (const [i, nome] of ['SPOILER_CHEFE', 'SPOILER_TRAICAO', 'SPOILER_RECONEXAO'].entries()) {
      const faixa = { ...ambiente.estado.midia.faixas[0], id: `faixa-${i}`, nome };
      atualizarMidia({ faixas: [faixa], faixaAtualId: faixa.id });
      ambiente.estado.ambiencia = { ...criarEstadoAmbiencia(), faixas: [{ ...faixa, nome: 'SPOILER_AMBIENCIA' }], faixaAtualId: faixa.id, tocando: true };
      const cabecalho = renderToStaticMarkup(renderizar(MidiaPlayerJogador, audio)!);
      const aba = renderToStaticMarkup(MidiaJogadorView());
      expect(cabecalho + aba).not.toContain('SPOILER');
      expect(cabecalho).toContain('música da mesa');
      expect(aba).toContain('ambiência em loop');
      expect(cabecalho).toContain('silenciar som para você');
      expect(audio.src).toBe(faixa.url);
      expect(audio.paused).toBe(false);
    }
  });

  it('mantém estados pausado e vazio sem expor título em atributos acessíveis', () => {
    const audio = audioFalso();
    atualizarMidia({ tocando: false, faixas: [{ ...ambiente.estado.midia.faixas[0], nome: 'SPOILER_PAUSADO' }] });
    let html = renderToStaticMarkup(renderizar(MidiaPlayerJogador, audio)!) + renderToStaticMarkup(MidiaJogadorView());
    expect(html).not.toContain('SPOILER');
    expect(html).toContain('música pausada');
    atualizarMidia({ faixaAtualId: null });
    html = renderToStaticMarkup(renderizar(MidiaPlayerJogador, audio)!) + renderToStaticMarkup(MidiaJogadorView());
    expect(html).not.toContain('SPOILER');
    expect(html).toContain('sem áudio tocando');
    expect(html).toContain('nada tocando no momento.');
  });
});

describe('player de camada de ambiência', () => {
  const componente = () => CamadaAmbienciaPlayer({ jogador: true, camadaId: 'extra' });
  beforeEach(() => {
    ambiente.estado.ambiencia = { ...criarEstadoAmbiencia(), faixas: ambiente.estado.midia.faixas,
      camadas: [{ id: 'extra', faixaAtualId: 'faixa', tocando: true, posicaoSegundos: 0, atualizadoEm: new Date().toISOString(), volume: 0.3 }] };
  });
  it('mudar outro canal não reinicia áudio nem faz seek nesta camada', () => {
    const audio = audioFalso();
    renderizar(componente, audio);
    audio.currentTime = 8;
    ambiente.estado.ambiencia = { ...ambiente.estado.ambiencia, volume: 0.1 };
    renderizar(componente, audio);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(8);
    expect(audio.volume).toBe(0.3);
  });
  it('volume próprio e mudo local não reposicionam nem retomam áudio', () => {
    const audio = audioFalso(); renderizar(componente, audio); audio.currentTime = 9;
    ambiente.estado.ambiencia.camadas[0] = { ...ambiente.estado.ambiencia.camadas[0], volume: 0.15 };
    ambiente.som.mudo = true; renderizar(componente, audio);
    expect(audio.volume).toBe(0.15); expect(audio.muted).toBe(true); expect(audio.currentTime).toBe(9);
    expect(audio.play).toHaveBeenCalledOnce();
  });
  it('desmontagem para e descarrega áudio, remove listener/retomada e ignora resposta atrasada', async () => {
    const audio = audioFalso(); let concluir!: () => void;
    audio.play.mockImplementation(() => { audio.paused = false; return new Promise<void>((resolve) => { concluir = resolve; }); });
    renderizar(componente, audio);
    expect(ambiente.retomadas.size).toBe(1);
    for (const efeito of ambiente.efeitos) efeito.limpar?.();
    concluir(); await Promise.resolve();
    expect(audio.paused).toBe(true); expect(audio.src).toBe(''); expect(audio.load).toHaveBeenCalledOnce();
    expect(audio.removeEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));
    expect(ambiente.retomadas.size).toBe(0);
  });
});

describe.each([['mestre', MidiaPlayerGM], ['jogador', MidiaPlayerJogador]] as const)('música do %s', (_nome, componente) => {
  it('inicia quando a biblioteca chega depois do estado de playback', () => {
    const audio = audioFalso();
    const faixas = ambiente.estado.midia.faixas;
    atualizarMidia({ faixas: [] });
    renderizar(componente, audio);
    expect(audio.play).not.toHaveBeenCalled();
    atualizarMidia({ faixas });
    renderizar(componente, audio);
    expect(audio.src).toBe('https://example.test/chuva.mp3');
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('resultado atrasado do play não cancela a pausa mais recente', async () => {
    const audio = audioFalso();
    let concluir!: () => void;
    audio.play.mockImplementation(() => { audio.paused = false; return new Promise<void>((resolve) => { concluir = resolve; }); });
    renderizar(componente, audio);
    atualizarMidia({ tocando: false });
    renderizar(componente, audio);
    concluir();
    await Promise.resolve();
    vi.advanceTimersByTime(700);
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);
  });

  it('retomada antes do fim do fade cancela a pausa pendente', async () => {
    const audio = audioFalso();
    renderizar(componente, audio);
    await Promise.resolve();
    vi.advanceTimersByTime(700);
    atualizarMidia({ tocando: false });
    renderizar(componente, audio);
    atualizarMidia({ tocando: true });
    renderizar(componente, audio);
    vi.advanceTimersByTime(1000);
    expect(audio.paused).toBe(false);
    expect(audio.volume).toBe(0.8);
  });

  it('corrige posição em metadata e conserva loop dentro da duração após reload', () => {
    const audio = audioFalso();
    audio.duration = NaN;
    atualizarMidia({ modoLoop: 'faixa', atualizadoEm: new Date(Date.now() - 3_725_000).toISOString(), posicaoSegundos: 5 });
    const resultado = renderizar(componente, audio)!;
    expect(audio.currentTime).toBe(0);
    audio.duration = 60;
    const elementoAudio = resultado.props as { children: ReactElement<{ onLoadedMetadata: (e: { currentTarget: typeof audio }) => void }>[] };
    elementoAudio.children[0].props.onLoadedMetadata({ currentTarget: audio });
    expect(audio.currentTime).toBe(10);
  });

  it('mudar volume enquanto play está pendente conserva o slider mais recente', async () => {
    const audio = audioFalso();
    let concluir!: () => void;
    audio.play.mockImplementation(() => { audio.paused = false; return new Promise<void>((resolve) => { concluir = resolve; }); });
    renderizar(componente, audio);
    atualizarMidia({ volume: 0.2 });
    renderizar(componente, audio);
    concluir();
    await Promise.resolve();
    vi.advanceTimersByTime(700);
    expect(audio.volume).toBe(0.2);
  });

  it('unmount interrompe a reprodução e invalida ramps pendentes', async () => {
    const audio = audioFalso();
    renderizar(componente, audio);
    await Promise.resolve();
    for (const efeito of ambiente.efeitos) efeito.limpar?.();
    vi.advanceTimersByTime(1000);
    expect(audio.paused).toBe(true);
  });
});

describe('soundpad', () => {
  it('rejeição da instância anterior não encerra o slot novo, e unmount para o novo áudio', async () => {
    const audios: ReturnType<typeof audioFalso>[] = [];
    const rejeitar: ((e: Error) => void)[] = [];
    vi.stubGlobal('Audio', class {
      constructor() {
        const audio = audioFalso();
        audio.play.mockImplementation(() => new Promise<void>((_, reject) => { rejeitar.push(reject); }));
        audios.push(audio);
        return audio;
      }
    });
    ambiente.estado.soundpad = { ...criarEstadoSoundpad(), sons: [{ slot: 0, url: 'https://example.test/efeito.mp3' }], ultimoDisparo: { slot: 0, tipo: 'tocar', em: new Date().toISOString() } };
    renderizar(SoundpadPlayer);
    ambiente.estado.soundpad = { ...ambiente.estado.soundpad, ultimoDisparo: { slot: 0, tipo: 'tocar', em: new Date(Date.now() + 1).toISOString() } };
    renderizar(SoundpadPlayer);
    expect(audios[0].pause).toHaveBeenCalledOnce();
    ambiente.som.marcarParado.mockClear();
    rejeitar[0](new Error('interrompido'));
    await Promise.resolve();
    expect(ambiente.som.marcarParado).not.toHaveBeenCalled();
    for (const efeito of ambiente.efeitos) efeito.limpar?.();
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(ambiente.som.marcarParado).toHaveBeenCalledWith(0);
  });
});
