import { adquirirBufferAmbiencia, type BufferAmbiencia } from './bufferAmbiencia';

/** O HTMLAudio continua como fallback. Quando possível, um único BufferSource em loop
 * repete no relógio de áudio, sem seek/reload nem timer na emenda de cada volta. */
export class LoopAmbiencia {
  private lease: BufferAmbiencia | null = null;
  private buffer: AudioBuffer | null = null;
  private fonte: AudioBufferSourceNode | null = null;
  private ganho: GainNode | null = null;
  private inicio = 0;
  private offset = 0;
  private desejaTocar = false;
  private revisao = 0;
  private comando = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private descartado = false;
  private tentouPreparar = false;

  constructor(private elemento: HTMLAudioElement, private tempo?: (duracao: number, posicao: number) => void, private fallback?: () => void) {
    elemento.addEventListener('loadedmetadata', this.preparar);
  }

  private preparar = () => {
    if (this.descartado || !this.desejaTocar || this.tentouPreparar || !this.elemento.getAttribute('src')) return;
    if (this.elemento.readyState < 1 || this.elemento.currentSrc !== this.elemento.src) return;
    this.tentouPreparar = true;
    const revisao = this.revisao;
    try { this.lease = adquirirBufferAmbiencia(this.elemento.src, this.elemento.duration); }
    catch { this.fallback?.(); return; }
    if (!this.lease) { this.fallback?.(); return; }
    const lease = this.lease;
    void lease.promessa.then((buffer) => {
      if (this.descartado || revisao !== this.revisao) return;
      this.buffer = buffer;
      this.ganho = lease.contexto.createGain();
      this.ganho.connect(lease.contexto.destination);
      this.atualizarVolume();
      if (this.desejaTocar) this.promover();
    }).catch(() => {
      if (this.descartado || revisao !== this.revisao) return;
      this.lease = null;
      lease.liberar();
      this.fallback?.();
    });
  };

  private promover() {
    const lease = this.lease;
    if (!lease || !this.buffer || !this.desejaTocar || this.fonte) return;
    const revisao = this.revisao;
    // Resume pode aguardar um gesto. O áudio nativo continua tocando enquanto isso;
    // nenhuma flag de autoplay é contornada e callbacks antigos não revivem uma camada.
    void lease.contexto.resume().then(() => {
      if (this.descartado || revisao !== this.revisao || !this.desejaTocar || this.fonte || this.elemento.paused || lease.contexto.state !== 'running') return;
      const posicao = this.elemento.currentTime;
      this.iniciarFonte(posicao);
      this.elemento.pause();
    }).catch(() => {
      if (!this.descartado && revisao === this.revisao) this.fallback?.();
    });
  }

  private iniciarFonte(posicao: number) {
    if (!this.buffer || !this.lease || !this.ganho) return;
    const ctx = this.lease.contexto;
    this.offset = ((posicao % this.buffer.duration) + this.buffer.duration) % this.buffer.duration;
    this.inicio = ctx.currentTime;
    const fonte = ctx.createBufferSource();
    fonte.buffer = this.buffer;
    fonte.loop = true;
    fonte.connect(this.ganho);
    fonte.start(0, this.offset);
    this.fonte = fonte;
    this.elemento.dataset.loopContinuo = 'buffer';
    if (this.tempo) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tempo?.(this.duration, this.currentTime), 250);
    }
  }

  private pararFonte() {
    this.offset = this.currentTime;
    this.fonte?.stop();
    this.fonte?.disconnect();
    this.fonte = null;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private limparBuffer() {
    this.comando++;
    this.revisao++;
    this.tentouPreparar = false;
    this.pararFonte();
    this.ganho?.disconnect();
    this.ganho = null;
    this.buffer = null;
    this.lease?.liberar();
    this.lease = null;
    delete this.elemento.dataset.loopContinuo;
  }

  get duration() { return this.buffer?.duration ?? this.elemento.duration; }
  get currentTime() { return this.fonte && this.lease ? (this.offset + this.lease.contexto.currentTime - this.inicio) % this.duration : this.elemento.currentTime; }
  set currentTime(posicao: number) {
    if (this.fonte) { this.pararFonte(); this.iniciarFonte(posicao); }
    else { this.offset = posicao; this.elemento.currentTime = posicao; }
  }
  get paused() { return this.fonte ? false : this.elemento.paused; }
  get src() { return this.elemento.src; }
  set src(url: string) { this.limparBuffer(); this.offset = 0; this.elemento.src = url; }
  getAttribute(nome: string) { return this.elemento.getAttribute(nome); }
  removeAttribute(nome: string) { if (nome === 'src') { this.desejaTocar = false; this.limparBuffer(); } this.elemento.removeAttribute(nome); }
  load() { this.elemento.load(); }
  addEventListener(tipo: string, callback: EventListener) { this.elemento.addEventListener(tipo, callback); }
  removeEventListener(tipo: string, callback: EventListener) { this.elemento.removeEventListener(tipo, callback); }
  get volume() { return this.elemento.volume; }
  set volume(volume: number) { this.elemento.volume = volume; this.atualizarVolume(); }
  get muted() { return this.elemento.muted; }
  set muted(mudo: boolean) { this.elemento.muted = mudo; this.atualizarVolume(); }
  private atualizarVolume() { if (this.ganho) this.ganho.gain.value = this.elemento.muted ? 0 : this.elemento.volume; }

  async play(): Promise<void> {
    const comando = ++this.comando;
    this.desejaTocar = true;
    if (this.fonte) { await this.lease?.contexto.resume(); return; }
    if (this.buffer && this.lease?.contexto.state === 'running') { this.iniciarFonte(this.offset); return; }
    this.preparar();
    try { await this.elemento.play(); }
    catch (erro) { if (comando === this.comando) this.desejaTocar = false; throw erro; }
    if (this.descartado) { this.elemento.pause(); return; }
    if (comando !== this.comando) return;
    if (!this.desejaTocar) { this.elemento.pause(); return; }
    this.promover();
  }
  pause() {
    this.comando++;
    this.desejaTocar = false;
    if (this.fonte) { this.pararFonte(); this.elemento.currentTime = this.offset; }
    this.elemento.pause();
  }
  dispose() {
    this.descartado = true;
    this.desejaTocar = false;
    this.elemento.pause();
    this.limparBuffer();
    this.elemento.removeEventListener('loadedmetadata', this.preparar);
  }
}
