import { beforeEach, describe, expect, it } from 'vitest';
import { criarEstadoInicial } from './factories';
import { normalizarAmbiencia } from './ambiencia';
import { migrate, useStore } from './store';

beforeEach(() => useStore.setState(criarEstadoInicial()));

describe('ambiência independente', () => {
  it('camadas têm volume e transporte independentes, sem recarimbar volume', () => {
    const s = useStore.getState();
    const faixa = s.adicionarFaixaAmbiencia('vento', 'vento', '/vento.wav');
    s.atualizarEstadoAmbiencia({ faixaAtualId: faixa, tocando: true, posicaoSegundos: 4 });
    const a = s.adicionarCamadaAmbiencia();
    const b = s.adicionarCamadaAmbiencia();
    s.atualizarCamadaAmbiencia(a, { faixaAtualId: faixa, tocando: true, posicaoSegundos: 7 });
    s.atualizarCamadaAmbiencia(b, { faixaAtualId: faixa, tocando: true, posicaoSegundos: 9 });
    const antes = useStore.getState();
    const camadaB = antes.ambiencia.camadas![1];
    s.atualizarCamadaAmbiencia(a, { volume: 0.2 });
    expect(useStore.getState().ambiencia.camadas![0]).toMatchObject({ volume: 0.2, atualizadoEm: antes.ambiencia.camadas![0].atualizadoEm, posicaoSegundos: 7 });
    expect(useStore.getState().ambiencia.camadas![1]).toBe(camadaB);
    expect(useStore.getState().ambiencia.faixaAtualId).toBe(faixa);
    expect(useStore.getState().ambiencia.posicaoSegundos).toBe(4);
    expect(useStore.getState().midia).toBe(antes.midia);
    s.atualizarCamadaAmbiencia(a, { tocando: false, posicaoSegundos: 2 });
    expect(useStore.getState().ambiencia.camadas![1].tocando).toBe(true);
    expect(useStore.getState().ambiencia.tocando).toBe(true);
  });

  it('adicionar/remover várias camadas não remove biblioteca nem revive id removido', () => {
    const s = useStore.getState();
    s.adicionarFaixaAmbiencia('chuva', 'chuva', '/chuva.wav');
    const ids = Array.from({ length: 30 }, () => s.adicionarCamadaAmbiencia());
    expect(new Set(ids).size).toBe(30);
    expect(useStore.getState().ambiencia.camadas).toHaveLength(30);
    for (const id of ids) s.removerCamadaAmbiencia(id);
    s.atualizarCamadaAmbiencia(ids[0], { tocando: true });
    expect(useStore.getState().ambiencia.camadas).toEqual([]);
    expect(useStore.getState().ambiencia.faixas).toHaveLength(1);
  });

  it('excluir um arquivo esvazia todas as camadas que o usam, preservando outras', () => {
    const s = useStore.getState();
    const a = s.adicionarFaixaAmbiencia('chuva', 'chuva', '/chuva.wav');
    const b = s.adicionarFaixaAmbiencia('vento', 'vento', '/vento.wav');
    const ids = [s.adicionarCamadaAmbiencia(), s.adicionarCamadaAmbiencia()];
    s.atualizarEstadoAmbiencia({ faixaAtualId: a, tocando: true });
    s.atualizarCamadaAmbiencia(ids[0], { faixaAtualId: a, tocando: true });
    s.atualizarCamadaAmbiencia(ids[1], { faixaAtualId: b, tocando: true });
    s.removerFaixaAmbiencia(a);
    expect(useStore.getState().ambiencia).toMatchObject({ faixaAtualId: null, tocando: false });
    expect(useStore.getState().ambiencia.camadas).toMatchObject([{ faixaAtualId: null, tocando: false }, { faixaAtualId: b, tocando: true }]);
  });

  it('importar backup conserva camadas e volumes, com todos os transportes parados', () => {
    const s = useStore.getState();
    const faixa = s.adicionarFaixaAmbiencia('chuva', 'chuva', '/chuva.wav');
    const id = s.adicionarCamadaAmbiencia();
    s.atualizarCamadaAmbiencia(id, { faixaAtualId: faixa, tocando: true, posicaoSegundos: 5, volume: 0.15 });
    const backup = s.exportarJSON();
    s.resetarEstado(); s.importarJSON(backup);
    expect(useStore.getState().ambiencia.camadas).toMatchObject([{ id, faixaAtualId: faixa, tocando: false, posicaoSegundos: 0, volume: 0.15 }]);
  });

  it('normaliza duplicatas, transporte órfão e valores não finitos sem impor limite', () => {
    const estado = normalizarAmbiencia({ faixas: [], camadas: [null, { id: 'principal' }, { id: 'a', faixaAtualId: 'ausente', tocando: true, volume: NaN }, { id: 'a' }] });
    expect(estado.camadas).toEqual([{ id: 'a', faixaAtualId: null, tocando: false, volume: 0.5, posicaoSegundos: 0, atualizadoEm: new Date(0).toISOString() }]);
    expect(normalizarAmbiencia({ faixas: [], tocando: false }).camadas).toEqual([]);
  });

  it('backup com camadas inválidas é rejeitado antes de alterar estado', () => {
    const s = useStore.getState();
    const antes = s.exportarJSON();
    const invalido = JSON.parse(antes);
    invalido.ambiencia.camadas = [null];
    expect(() => s.importarJSON(JSON.stringify(invalido))).toThrow('ambiencia.camadas[0]');
    expect(s.exportarJSON()).toBe(antes);
  });

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
