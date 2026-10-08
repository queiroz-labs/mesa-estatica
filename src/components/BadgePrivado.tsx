import Icone from './Icone';

/** Acesso restrito é uma informação de visibilidade, não um alerta de perigo. */
export default function BadgePrivado() {
  return <span className="badge badge--privado"><Icone nome="cadeado" size={12} /> privado</span>;
}
