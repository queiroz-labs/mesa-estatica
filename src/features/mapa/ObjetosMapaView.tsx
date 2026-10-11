import { useMapaAtivo } from './useMapaAtivo';
import { estiloObjeto, type RetanguloObjetos } from './objetosMapaGeometria';
import { caixasIntersectam } from './fowGeometria';
import './objetosMapa.css';

/** Somente desenho: sem controles de mestre e sem captura de ponteiro. Oculto não cria img. */
export default function ObjetosMapaView({ rect }: { rect: RetanguloObjetos | null }) {
  const mapa = useMapaAtivo();
  if (!rect) return null;
  const objetos = mapa?.objetos?.filter((o) => o.visivel === true && (!mapa.fow.ativa
    || [...mapa.fow.vistas, ...mapa.fow.visiveisAgora].some((r) => caixasIntersectam(r, { x: o.x, y: o.y, w: o.largura, h: o.altura }))));
  return <div className="mapa-objetos" aria-label="imagens do mapa">
    {objetos?.map(o => <img key={o.id} data-objeto={o.id} className="mapa-objeto mapa-objeto--leitura" style={estiloObjeto(o, rect)} src={o.imagemUrl} alt={o.nome} draggable={false} />)}
  </div>;
}
