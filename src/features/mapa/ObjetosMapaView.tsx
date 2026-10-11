import { useMapaAtivo } from './useMapaAtivo';
import { estiloObjeto, type RetanguloObjetos } from './objetosMapaGeometria';
import './objetosMapa.css';

/** Somente desenho: sem controles de mestre e sem captura de ponteiro. Oculto não cria img. */
export default function ObjetosMapaView({ rect }: { rect: RetanguloObjetos | null }) {
  const mapa = useMapaAtivo();
  if (!rect) return null;
  return <div className="mapa-objetos" aria-label="imagens do mapa">
    {mapa?.objetos?.filter(o => o.visivel === true).map(o => <img key={o.id} data-objeto={o.id} className="mapa-objeto mapa-objeto--leitura" style={estiloObjeto(o, rect)} src={o.imagemUrl} alt={o.nome} draggable={false} />)}
  </div>;
}
