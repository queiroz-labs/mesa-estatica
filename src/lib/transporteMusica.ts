import type { EstadoMidia, FaixaMidia } from '../state/types';
import { CacheBufferMusica } from './bufferMusica';

interface Trecho { faixa: FaixaMidia; buffer: AudioBuffer; fonte: AudioBufferSourceNode; inicio: number; offset: number; valido: boolean }
interface Eventos {
  avancou: (id: string, posicao: number, duracao: number) => void;
  terminou: () => void;
  fallback: (ativo: boolean) => void;
}

/** A emenda acontece no relógio de áudio. onended só atualiza a interface e prepara
 * a faixa seguinte; não inicia a fonte que já foi agendada para esta emenda. */
export class TransporteMusica {
  private cache = new CacheBufferMusica();
  private faixas: FaixaMidia[] = [];
  private modo: EstadoMidia['modoLoop'] = 'nenhum';
  private id: string | null = null;
  private url = '';
  private buffer: AudioBuffer | null = null;
  private atual: Trecho | null = null;
  private proxima: Trecho | null = null;
  private ganho: GainNode | null = null;
  private offset = 0;
  private tocando = false;
  private revisao = 0;
  private comando = 0;
  private plano = 0;
  private tentou = false;
  private descartado = false;
  private transicao: string | null = null;
  private ultimaOrdem = '';

  constructor(private elemento: HTMLAudioElement, private eventos: Eventos) {
    elemento.addEventListener('loadedmetadata', this.preparar);
    elemento.addEventListener('ended', this.terminouNativo);
  }

  aceitarEstado(estado: EstadoMidia) {
    const ordem = JSON.stringify([estado.faixaAtualId, estado.tocando, estado.posicaoSegundos, Date.parse(estado.atualizadoEm)]);
    // Um eco da ordem antiga não desfaz o avanço que já aconteceu neste cliente.
    if (ordem === this.ultimaOrdem && estado.faixaAtualId !== this.id) return false;
    this.ultimaOrdem = ordem;
    return true;
  }
  selecionar(id: string | null) {
    if (this.id === id) return;
    this.id = id;
    this.url = '';
    this.limparFontes();
    this.buffer = null; this.tentou = false; this.transicao = null;
    this.revisao++;
  }
  configurar(faixas: FaixaMidia[], modo: EstadoMidia['modoLoop']) {
    const assinatura = (lista: FaixaMidia[]) => JSON.stringify(lista.map(f => [f.id, f.url, f.ordem]));
    if (modo === this.modo && assinatura(faixas) === assinatura(this.faixas)) return;
    const mudouModo = modo !== this.modo;
    const posicao = this.currentTime;
    this.faixas = [...faixas].sort((a, b) => a.ordem - b.ordem);
    this.modo = modo; this.elemento.loop = modo === 'faixa';
    this.plano++;
    this.cancelar(this.proxima); this.proxima = null;
    if (mudouModo && this.atual) {
      this.limparFontes(); this.iniciar(posicao);
    } else this.agendar();
    this.reterBuffers();
  }
  consumirTransicao(url?: string) {
    if (!url || this.transicao !== url) return false;
    this.transicao = null;
    return true;
  }
  private seguinte() {
    const idx = this.faixas.findIndex(f => f.id === this.id);
    if (idx < 0 || this.modo === 'faixa') return null;
    return this.faixas[idx + 1] ?? (this.modo === 'lista' ? this.faixas[0] : null);
  }
  private reterBuffers() {
    const urls = new Set([this.url]);
    const seguinte = this.seguinte(); if (seguinte) urls.add(seguinte.url);
    this.cache.reter(urls);
  }
  private preparar = () => {
    if (!this.tocando || this.tentou || this.descartado || !this.url || this.elemento.readyState < 1 || this.elemento.currentSrc !== this.elemento.src) return;
    this.tentou = true;
    const revisao = this.revisao;
    let promessa: Promise<AudioBuffer>;
    try { promessa = this.cache.obter(this.url, this.elemento.duration); }
    catch { this.eventos.fallback(true); return; }
    void promessa.then(buffer => {
      if (this.descartado || revisao !== this.revisao) return;
      this.buffer = buffer;
      if (!this.ganho) { this.ganho = this.cache.contexto.createGain(); this.ganho.connect(this.cache.contexto.destination); }
      this.atualizarVolume();
      if (this.tocando) this.promover();
    }).catch(() => { if (!this.descartado && revisao === this.revisao) this.eventos.fallback(true); });
  };
  private promover() {
    if (!this.buffer || !this.tocando || this.atual) return;
    const revisao = this.revisao;
    void this.cache.contexto.resume().then(() => {
      if (this.descartado || revisao !== this.revisao || !this.tocando || this.atual || this.elemento.paused || this.cache.contexto.state !== 'running') return;
      this.iniciar(this.elemento.currentTime);
      this.elemento.pause();
      this.eventos.fallback(false);
    }).catch(() => { if (!this.descartado && revisao === this.revisao) this.eventos.fallback(true); });
  }
  private criar(faixa: FaixaMidia, buffer: AudioBuffer, inicio: number, offset: number): Trecho {
    const fonte = this.cache.contexto.createBufferSource();
    const trecho = { faixa, buffer, fonte, inicio, offset, valido: true };
    fonte.buffer = buffer; fonte.loop = this.modo === 'faixa'; fonte.connect(this.ganho!);
    fonte.onended = () => {
      if (!trecho.valido || this.descartado || this.atual !== trecho) return;
      fonte.disconnect(); fonte.onended = null; trecho.valido = false;
      const proxima = this.proxima;
      this.atual = proxima; this.proxima = null;
      if (proxima) {
        this.id = proxima.faixa.id; this.url = proxima.faixa.url; this.buffer = proxima.buffer;
        this.offset = 0; this.transicao = this.url;
        this.reterBuffers(); this.agendar();
        this.eventos.avancou(this.id, this.currentTime, this.duration);
      } else this.avancarSemBuffer();
    };
    fonte.start(inicio, offset);
    return trecho;
  }
  private iniciar(posicao: number) {
    const faixa = this.faixas.find(f => f.id === this.id);
    if (!faixa || !this.buffer || !this.ganho) return;
    const duracao = this.buffer.duration;
    this.offset = this.modo === 'faixa' ? ((posicao % duracao) + duracao) % duracao : Math.min(Math.max(0, posicao), duracao);
    this.atual = this.criar(faixa, this.buffer, this.cache.contexto.currentTime, this.offset);
    this.elemento.dataset.musicaContinua = 'buffer';
    this.agendar();
  }
  private agendar() {
    const atual = this.atual, seguinte = this.seguinte();
    if (!atual || !seguinte || this.proxima || !this.tocando) return;
    const revisao = this.revisao, plano = this.plano;
    const promessa = seguinte.url === this.url ? Promise.resolve(atual.buffer) : this.cache.obter(seguinte.url);
    void promessa.then(buffer => {
      if (this.descartado || revisao !== this.revisao || plano !== this.plano || atual !== this.atual || !this.tocando || this.proxima) return;
      const inicio = atual.inicio + atual.buffer.duration - atual.offset;
      if (inicio <= this.cache.contexto.currentTime) return;
      this.proxima = this.criar(seguinte, buffer, inicio, 0);
    }).catch(() => { if (!this.descartado && revisao === this.revisao && plano === this.plano) this.eventos.fallback(true); });
  }
  private avancarSemBuffer() {
    if (!this.tocando) return;
    const seguinte = this.seguinte();
    if (!seguinte) { this.tocando = false; this.eventos.terminou(); return; }
    this.selecionar(seguinte.id); this.src = seguinte.url;
    this.offset = 0;
    this.eventos.avancou(seguinte.id, 0, NaN);
    void this.play().catch(() => {});
  }
  private terminouNativo = () => { if (!this.atual) this.avancarSemBuffer(); };
  private cancelar(trecho: Trecho | null) {
    if (!trecho?.valido) return;
    trecho.valido = false; trecho.fonte.onended = null; trecho.fonte.stop(); trecho.fonte.disconnect();
  }
  private limparFontes() {
    this.plano++;
    this.cancelar(this.atual); this.cancelar(this.proxima); this.atual = null; this.proxima = null;
  }
  get duration() { return this.buffer?.duration ?? this.elemento.duration; }
  get currentTime() {
    if (!this.atual) return this.elemento.currentTime;
    const posicao = Math.max(0, this.atual.offset + this.cache.contexto.currentTime - this.atual.inicio);
    return this.modo === 'faixa' ? posicao % this.atual.buffer.duration : Math.min(posicao, this.atual.buffer.duration);
  }
  set currentTime(posicao: number) {
    this.offset = posicao;
    if (this.atual) { this.limparFontes(); this.iniciar(posicao); }
    else this.elemento.currentTime = posicao;
  }
  get paused() { return this.atual ? false : this.elemento.paused; }
  get src() { return this.url; }
  set src(url: string) {
    this.revisao++; this.limparFontes(); this.buffer = null; this.tentou = false; this.offset = 0;
    this.url = url; this.elemento.src = url; delete this.elemento.dataset.musicaContinua;
    this.reterBuffers(); this.eventos.fallback(false);
  }
  getAttribute(nome: string) { return nome === 'src' ? this.url || null : this.elemento.getAttribute(nome); }
  removeAttribute(nome: string) {
    if (nome === 'src') {
      this.pause(); this.revisao++; this.url = ''; this.id = null; this.buffer = null; this.tentou = false;
      this.ganho?.disconnect(); this.ganho = null; this.cache.dispose();
      delete this.elemento.dataset.musicaContinua;
    }
    this.elemento.removeAttribute(nome);
  }
  load() { this.elemento.load(); }
  get volume() { return this.elemento.volume; }
  set volume(v: number) { this.elemento.volume = v; this.atualizarVolume(); }
  get muted() { return this.elemento.muted; }
  set muted(v: boolean) { this.elemento.muted = v; this.atualizarVolume(); }
  private atualizarVolume() { if (this.ganho) this.ganho.gain.value = this.elemento.muted ? 0 : this.elemento.volume; }
  async play() {
    const comando = ++this.comando;
    this.tocando = true;
    if (this.atual) { await this.cache.contexto.resume(); return; }
    if (this.buffer && this.cache.contexto.state === 'running') { this.iniciar(this.offset); return; }
    this.preparar(); const revisao = this.revisao;
    try { await this.elemento.play(); }
    catch (erro) { if (revisao === this.revisao && comando === this.comando) this.tocando = false; throw erro; }
    if (this.descartado || !this.tocando) { this.elemento.pause(); return; }
    if (revisao === this.revisao && comando === this.comando) this.promover();
  }
  pause() {
    this.comando++;
    this.tocando = false;
    if (this.atual) { const posicao = this.currentTime; this.limparFontes(); this.offset = posicao; this.elemento.currentTime = posicao; }
    this.elemento.pause();
  }
  dispose() {
    this.descartado = true; this.removeAttribute('src'); this.load();
    this.elemento.removeEventListener('loadedmetadata', this.preparar);
    this.elemento.removeEventListener('ended', this.terminouNativo);
  }
}
