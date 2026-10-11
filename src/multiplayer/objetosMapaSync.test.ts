import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { criarEstadoInicial, criarMapaBiblioteca } from '../state/factories';
import { useStore } from '../state/store';
import type { ObjetoMapa } from '../state/types';
const h = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: h.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.read }) }) }) } }));
import { iniciarSyncObjetosMapa, recarregarObjetosMapa, tentarObjetosMapa, useObjetosSyncUi } from './objetosMapaSync';
import { paraLinha } from './mapasBibliotecaSync';
const obj: ObjetoMapa = { id:'o', nome:'pista', imagemPath:'img/p.webp', imagemUrl:'https://example.test/p.webp', x:.2,y:.2,largura:.2,altura:.1,visivel:false };
let stop: (() => void) | undefined;
beforeEach(() => { useStore.setState(criarEstadoInicial()); h.rpc.mockReset(); h.read.mockReset(); useObjetosSyncUi.setState({avisos:{}}); });
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); });
const mapa = () => { const m = { ...criarMapaBiblioteca('m','','https://example.test/m.jpg',0), id:'m', objetos:[] as ObjetoMapa[], objetosRevisao:0 };useStore.setState(s=>({mapa:{...s.mapa,biblioteca:[m]}}));return m; };
it('objetos não entram no upsert genérico: aba velha não sobrescreve a coluna', () => {
  const linha = paraLinha({...mapa(), objetos:[obj], objetosRevisao:4});
  expect(linha).not.toHaveProperty('objetos'); expect(linha).not.toHaveProperty('objetos_revisao');
});
it('serializa cliques durante envio e usa a revisão confirmada, sem revelar o objeto novo', async () => {
  mapa(); let concluir!: (v: unknown) => void;
  h.rpc.mockImplementationOnce(()=>new Promise(r=>{concluir=r;})).mockResolvedValueOnce({data:{ok:true,revisao:2},error:null});
  stop=iniciarSyncObjetosMapa(()=>false); useStore.getState().adicionarObjetoMapa('m',{...obj,visivel:true});
  expect(h.rpc.mock.calls[0][1].p_objetos[0].visivel).toBe(false);
  useStore.getState().atualizarObjetoMapa('m','o',{visivel:true});expect(h.rpc).toHaveBeenCalledTimes(1);
  concluir({data:{ok:true,revisao:1},error:null});
  await vi.waitFor(()=>expect(h.rpc).toHaveBeenCalledTimes(2));
  expect(h.rpc.mock.calls[1][1]).toMatchObject({p_revisao:1,p_objetos:[{visivel:true}]});
  await vi.waitFor(()=>expect(useStore.getState().mapa.biblioteca[0].objetosPendentes).toBe(false));
});
it('conflito de aba mantém rascunho e avisa; não faz retry infinito nem sobrescreve', async () => {
  mapa(); h.rpc.mockResolvedValue({data:{ok:false,motivo:'conflito'},error:null});stop=iniciarSyncObjetosMapa(()=>false);
  useStore.getState().adicionarObjetoMapa('m',obj);
  await vi.waitFor(()=>expect(useObjetosSyncUi.getState().avisos.m).toContain('outra aba'));
  useStore.getState().renomearMapaBiblioteca('m','nome novo');expect(h.rpc).toHaveBeenCalledTimes(1);
  expect(useStore.getState().mapa.biblioteca[0]).toMatchObject({objetos:[obj],objetosPendentes:true});
});
it('erro de rede/migration tem retry explícito e não perde rascunho ao recarregar', async () => {
  const m=mapa(); useStore.setState(s=>({mapa:{...s.mapa,biblioteca:[{...m,objetos:[obj],objetosPendentes:true}]}}));
  h.rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}}).mockResolvedValueOnce({data:{ok:true,revisao:1},error:null});
  stop=iniciarSyncObjetosMapa(()=>false); await vi.waitFor(()=>expect(useObjetosSyncUi.getState().avisos.m).toContain('conexão'));
  tentarObjetosMapa('m');await vi.waitFor(()=>expect(useStore.getState().mapa.biblioteca[0].objetosPendentes).toBe(false));
});
it('resultado após exclusão do mapa ou cleanup não ressuscita nem altera outra cena', async () => {
  mapa(); let concluir!: (v: unknown)=>void;h.rpc.mockImplementation(()=>new Promise(r=>{concluir=r;}));
  stop=iniciarSyncObjetosMapa(()=>false);useStore.getState().adicionarObjetoMapa('m',obj);useStore.getState().removerMapaBiblioteca('m');
  concluir({data:{ok:true,revisao:1},error:null});await Promise.resolve();await Promise.resolve();expect(useStore.getState().mapa.biblioteca).toEqual([]);
});
it('espera mapa publicado e nunca envia base64 no JSON remoto', () => {
  mapa();stop=iniciarSyncObjetosMapa(()=>true);useStore.getState().adicionarObjetoMapa('m',obj);expect(h.rpc).not.toHaveBeenCalled();stop();
  useStore.setState(s=>({mapa:{...s.mapa,biblioteca:s.mapa.biblioteca.map(m=>({...m,objetos:[{...obj,imagemUrl:'data:image/png;base64,AAAA'}]}))}}));
  stop=iniciarSyncObjetosMapa(()=>false);expect(h.rpc).not.toHaveBeenCalled();expect(useObjetosSyncUi.getState().avisos.m).toContain('locais');
});

async function conflito() {
  mapa(); h.rpc.mockResolvedValue({data:{ok:false,motivo:'conflito'},error:null});
  stop=iniciarSyncObjetosMapa(()=>false); useStore.getState().adicionarObjetoMapa('m',obj);
  await vi.waitFor(()=>expect(useObjetosSyncUi.getState().avisos.m).toContain('outra aba'));
}
function leituraPendente() {
  let concluir!: (v: unknown) => void;
  h.read.mockImplementationOnce(()=>new Promise(r=>{concluir=r;}));
  const promessa=recarregarObjetosMapa('m');
  return { promessa, concluir: (x=.2, revisao=2) => concluir({data:{objetos:[{...obj,x}],objetos_revisao:revisao},error:null}) };
}
it('após conflito e recarga, próxima edição sincroniza usando a revisão recebida', async () => {
  await conflito(); h.read.mockResolvedValue({data:{objetos:[obj],objetos_revisao:2},error:null});
  await recarregarObjetosMapa('m'); expect(useObjetosSyncUi.getState().avisos.m).toBe('');
  h.rpc.mockResolvedValue({data:{ok:true,revisao:3},error:null});
  useStore.getState().atualizarObjetoMapa('m','o',{visivel:true});
  await vi.waitFor(()=>expect(useStore.getState().mapa.biblioteca[0].objetosPendentes).toBe(false));
  expect(h.rpc).toHaveBeenCalledTimes(2); expect(h.rpc.mock.calls[1][1]).toMatchObject({p_revisao:2,p_objetos:[{visivel:true}]});
});
it('edição durante recarga invalida a resposta sem apagar rascunho nem pendência', async () => {
  await conflito(); const leitura=leituraPendente();
  useStore.getState().atualizarObjetoMapa('m','o',{x:.6}); leitura.concluir(); await leitura.promessa;
  expect(useStore.getState().mapa.biblioteca[0]).toMatchObject({objetos:[{x:.6}],objetosPendentes:true,objetosRevisao:0});
  expect(useObjetosSyncUi.getState().avisos.m).toContain('rascunho foi preservado'); expect(h.rpc).toHaveBeenCalledTimes(1);
});
it.each(['trocar e voltar','excluir','cleanup'])('resposta de recarga depois de %s não modifica a cena', async acao => {
  await conflito(); const leitura=leituraPendente();
  if (acao==='trocar e voltar') {
    useStore.setState(s=>({mapa:{...s.mapa,mapaAtivoId:'outra'}}));
    useStore.setState(s=>({mapa:{...s.mapa,mapaAtivoId:null}}));
  } else if (acao==='excluir') useStore.getState().removerMapaBiblioteca('m');
  else stop?.();
  const antes=useStore.getState().exportarJSON();leitura.concluir(.4,8);await leitura.promessa;
  expect(useStore.getState().exportarJSON()).toBe(antes);
});
it('só a última recarga pode concluir; resposta antiga não regride revisão ou aviso', async () => {
  await conflito(); const antiga=leituraPendente(),nova=leituraPendente();
  nova.concluir(.4,8);await nova.promessa;antiga.concluir(.2,2);await antiga.promessa;
  expect(useStore.getState().mapa.biblioteca[0]).toMatchObject({objetos:[{x:.4}],objetosRevisao:8,objetosPendentes:false});
  expect(useObjetosSyncUi.getState().avisos.m).toBe('');
});
it.each(['erro','ausente','rejeição'])('recarga com %s preserva rascunho e permite repetir', async tipo => {
  await conflito(); const antes=useStore.getState().exportarJSON();
  if(tipo==='rejeição') h.read.mockRejectedValueOnce(new Error('offline'));
  else h.read.mockResolvedValueOnce({data:null,error:tipo==='erro'?{message:'offline'}:null});
  await expect(recarregarObjetosMapa('m')).resolves.toBeUndefined();expect(useStore.getState().exportarJSON()).toBe(antes);
  expect(useObjetosSyncUi.getState().avisos.m).toContain('não foi possível');
  h.read.mockResolvedValueOnce({data:{objetos:[obj],objetos_revisao:2},error:null});await recarregarObjetosMapa('m');
  expect(useStore.getState().mapa.biblioteca[0].objetosRevisao).toBe(2);expect(useObjetosSyncUi.getState().avisos.m).toBe('');
});
it.each(['retry','online'])('%s durante recarga aguarda leitura e envia somente a edição preservada', async modo => {
  const janela=new EventTarget();vi.stubGlobal('window',janela);
  await conflito();const leitura=leituraPendente();useStore.getState().atualizarObjetoMapa('m','o',{x:.6});
  h.rpc.mockResolvedValue({data:{ok:true,revisao:1},error:null});
  if(modo==='online') janela.dispatchEvent(new Event('online')); else tentarObjetosMapa('m');
  expect(h.rpc).toHaveBeenCalledTimes(1);
  leitura.concluir();await leitura.promessa;await vi.waitFor(()=>expect(h.rpc).toHaveBeenCalledTimes(2));
  expect(h.rpc.mock.calls[1][1]).toMatchObject({p_revisao:0,p_objetos:[{x:.6}]});
});
it('recarga não concorre com gravação já em voo', async () => {
  mapa();let concluir!:(v:unknown)=>void;h.rpc.mockImplementationOnce(()=>new Promise(r=>{concluir=r;}));
  stop=iniciarSyncObjetosMapa(()=>false);useStore.getState().adicionarObjetoMapa('m',obj);
  await recarregarObjetosMapa('m');expect(h.read).not.toHaveBeenCalled();
  concluir({data:{ok:true,revisao:1},error:null});await vi.waitFor(()=>expect(useStore.getState().mapa.biblioteca[0].objetosPendentes).toBe(false));
});
