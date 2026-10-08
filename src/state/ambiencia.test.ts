import { beforeEach, describe, expect, it } from 'vitest';
import { criarEstadoInicial } from './factories';
import { normalizarAmbiencia } from './ambiencia';
import { migrate, useStore } from './store';

beforeEach(() => useStore.setState(criarEstadoInicial()));

describe('ambiência independente', () => {
  it('biblioteca, play, seek e volume não alteram música nem soundpad', () => {
    const s = useStore.getState();
    s.atualizarEstadoMidia({ tocando: true, posicaoSegundos: 42 });
    const { midia, soundpad } = useStore.getState();
    const id = s.adicionarFaixaAmbiencia('chuva', 'sfx/chuva.wav', 'https://audio.test/chuva.wav');
    s.atualizarEstadoAmbiencia({ faixaAtualId: id, tocando: true, posicaoSegundos: 3 });
    const carimbo = useStore.getState().ambiencia.atualizadoEm;
    s.definirVolumeAmbiencia(0.25);
    expect(useStore.getState().midia).toBe(midia);
    expect(useStore.getState().soundpad).toBe(soundpad);
    expect(useStore.getState().ambiencia.atualizadoEm).toBe(carimbo);
    expect(useStore.getState().ambiencia.volume).toBe(0.25);
  });

  it('remove o som ativo e para só a ambiência; remover outro som preserva playback', () => {
    const s = useStore.getState();
    const ativo = s.adicionarFaixaAmbiencia('chuva', 'sfx/chuva.wav', 'https://audio.test/chuva.wav');
    const outro = s.adicionarFaixaAmbiencia('vento', 'sfx/vento.wav', 'https://audio.test/vento.wav');
    s.atualizarEstadoAmbiencia({ faixaAtualId: ativo, tocando: true });
    s.removerFaixaAmbiencia(outro);
    expect(useStore.getState().ambiencia.tocando).toBe(true);
    s.removerFaixaAmbiencia(ativo);
    expect(useStore.getState().ambiencia).toMatchObject({ faixaAtualId: null, tocando: false, posicaoSegundos: 0 });
  });

  it('backup mantém biblioteca e volume, mas importar não revive áudio tocando', () => {
    const s = useStore.getState();
    const id = s.adicionarFaixaAmbiencia('chuva', 'sfx/chuva.wav', 'https://audio.test/chuva.wav');
    s.atualizarEstadoAmbiencia({ faixaAtualId: id, tocando: true, posicaoSegundos: 5 });
    s.definirVolumeAmbiencia(0.2);
    const backup = s.exportarJSON();
    s.resetarEstado();
    s.importarJSON(backup);
    expect(useStore.getState().ambiencia).toMatchObject({ faixaAtualId: id, volume: 0.2, tocando: false, posicaoSegundos: 0 });
    expect(useStore.getState().ambiencia.faixas).toHaveLength(1);
  });

  it('localStorage v34 e backup antigo recebem canal vazio sem mudar os dados antigos', () => {
    const antigo: any = criarEstadoInicial();
    delete antigo.ambiencia;
    const { midia, soundpad } = antigo;
    expect(migrate(antigo, 34)).toMatchObject({ schemaVersion: 35, midia, soundpad, ambiencia: { faixas: [], tocando: false } });
    delete antigo.ambiencia;
    useStore.getState().importarJSON(JSON.stringify(antigo));
    expect(useStore.getState().ambiencia.faixas).toEqual([]);
  });

  it('rejeita listas malformadas em backup sem alterar a mesa', () => {
    const s = useStore.getState();
    const antes = s.exportarJSON();
    const invalido = JSON.parse(antes);
    invalido.ambiencia.faixas = [null];
    expect(() => s.importarJSON(JSON.stringify(invalido))).toThrow('ambiencia.faixas[0]');
    expect(s.exportarJSON()).toBe(antes);
  });

  it('payload malformado não deixa ids órfãos, NaN ou volume fora da faixa', () => {
    expect(normalizarAmbiencia({ faixas: [null], tocando: true, faixaAtualId: 'ausente', volume: Infinity, posicaoSegundos: NaN, atualizadoEm: 'inválido' }))
      .toMatchObject({ faixas: [], tocando: false, faixaAtualId: null, volume: 0.5, posicaoSegundos: 0 });
    useStore.getState().definirVolumeAmbiencia(NaN);
    expect(useStore.getState().ambiencia.volume).toBe(0.5);
  });
});
