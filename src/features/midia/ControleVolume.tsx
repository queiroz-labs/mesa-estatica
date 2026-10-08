import './midia.css';

interface Props {
  id: string;
  nome: string;
  volume: number;
  onChange: (volume: number) => void;
  title?: string;
  compacto?: boolean;
}

/** Só controla o canal recebido; os players permanentes continuam donos do playback. */
export default function ControleVolume({ id, nome, volume, onChange, title, compacto = false }: Props) {
  return <div className={`midia-volume${compacto ? ' midia-volume--compacto' : ''}`}>
    <label htmlFor={id} title={title}>volume {nome}</label>
    <input id={id} type="range" min={0} max={1} step={0.05} value={volume}
      onChange={(e) => onChange(Number(e.target.value))} />
    <span className="mono midia-volume-valor">{Math.round(volume * 100)}%</span>
  </div>;
}
