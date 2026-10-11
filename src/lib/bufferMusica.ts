// Cache exclusivo do transporte de música: apenas faixa atual e próxima.
// O orçamento da ambiência permanece independente e inalterado.
export const LIMITE_ARQUIVO_MUSICA = 32 * 1024 * 1024;
export const LIMITE_BUFFER_MUSICA = 128 * 1024 * 1024;
export const LIMITE_TOTAL_MUSICA = 256 * 1024 * 1024;
interface Entrada { abortar: AbortController; promessa: Promise<AudioBuffer>; bytes: number }

async function duracaoDaUrl(url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const limpar = () => {
      audio.removeEventListener('loadedmetadata', pronto);
      audio.removeEventListener('error', falhou);
      signal.removeEventListener('abort', cancelou);
      audio.removeAttribute('src'); audio.load();
    };
    const pronto = () => { const duracao = audio.duration; limpar(); resolve(duracao); };
    const falhou = () => { limpar(); reject(new Error('metadados indisponíveis')); };
    const cancelou = () => { limpar(); reject(new DOMException('cancelado', 'AbortError')); };
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', pronto);
    audio.addEventListener('error', falhou);
    signal.addEventListener('abort', cancelou, { once: true });
    if (signal.aborted) { cancelou(); return; }
    audio.src = url;
  });
}

export class CacheBufferMusica {
  private entradas = new Map<string, Entrada>();
  private ctx: AudioContext | null = null;
  private fila: Promise<unknown> = Promise.resolve();
  private bytes = 0;
  get contexto() { return this.ctx ??= new AudioContext({ sampleRate: 48000 }); }

  obter(url: string, duracao?: number): Promise<AudioBuffer> {
    const existente = this.entradas.get(url);
    if (existente) return existente.promessa;
    if (typeof AudioContext === 'undefined') return Promise.reject(new Error('Web Audio indisponível'));
    const ctx = this.contexto, abortar = new AbortController();
    const entrada: Entrada = { abortar, bytes: 0, promessa: Promise.resolve(null as unknown as AudioBuffer) };
    this.entradas.set(url, entrada);
    entrada.promessa = this.fila.catch(() => {}).then(async () => {
      const verificar = () => { if (abortar.signal.aborted) throw new DOMException('cancelado', 'AbortError'); };
      verificar();
      const timeout = setTimeout(() => abortar.abort(), 30000);
      try {
        const segundos = duracao ?? await duracaoDaUrl(url, abortar.signal);
        verificar();
        const estimativa = Math.ceil(segundos * 48000 * 2 * 4);
        if (!Number.isFinite(segundos) || segundos <= 0 || estimativa > LIMITE_BUFFER_MUSICA || this.bytes + estimativa > LIMITE_TOTAL_MUSICA) throw new Error('limite de memória da música');
        entrada.bytes = estimativa; this.bytes += estimativa;
        // O preload nativo pode ter armazenado a mesma URL sem cabeçalhos CORS.
        const resposta = await fetch(url, { signal: abortar.signal, cache: 'reload' });
        if (!resposta.ok || !resposta.body) throw new Error('download de música indisponível');
        if (Number(resposta.headers.get('content-length')) > LIMITE_ARQUIVO_MUSICA) {
          await resposta.body.cancel(); throw new Error('arquivo de música grande');
        }
        const leitor = resposta.body.getReader(), partes: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const { done, value } = await leitor.read();
            if (done) break;
            total += value.byteLength;
            if (total > LIMITE_ARQUIVO_MUSICA) { await leitor.cancel(); throw new Error('arquivo de música grande'); }
            partes.push(value);
          }
        } finally { leitor.releaseLock(); }
        verificar();
        const dados = new Uint8Array(total); let offset = 0;
        for (const parte of partes) { dados.set(parte, offset); offset += parte.byteLength; }
        const buffer = await ctx.decodeAudioData(dados.buffer);
        verificar();
        const reais = buffer.length * buffer.numberOfChannels * 4;
        if (reais > LIMITE_BUFFER_MUSICA || this.bytes - entrada.bytes + reais > LIMITE_TOTAL_MUSICA) throw new Error('limite de memória da música');
        this.bytes += reais - entrada.bytes; entrada.bytes = reais;
        return buffer;
      } catch (erro) {
        this.bytes -= entrada.bytes; entrada.bytes = 0;
        throw erro;
      } finally { clearTimeout(timeout); }
    });
    this.fila = entrada.promessa.then(() => {}, () => {});
    return entrada.promessa;
  }

  reter(urls: Set<string>) {
    for (const [url, entrada] of this.entradas) if (!urls.has(url)) {
      entrada.abortar.abort(); this.bytes -= entrada.bytes; entrada.bytes = 0;
      this.entradas.delete(url);
    }
  }
  dispose() {
    this.reter(new Set());
    if (this.ctx) void this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
