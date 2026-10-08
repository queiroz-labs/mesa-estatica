import type { CSSProperties, ReactNode } from 'react';

const desenhos = {
  wifi: <><path d="M3 8.5a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 15.5a4.5 4.5 0 0 1 6 0" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
  'wifi-off': <><path d="M3 8.5a14 14 0 0 1 3-2M10 5.5a14 14 0 0 1 11 3M6 12a9 9 0 0 1 3-1.8M13 10.5a9 9 0 0 1 5 1.5M9 15.5a4.5 4.5 0 0 1 6 0M3 3l18 18" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cadeado: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></>,
  lixeira: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  grade: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>,
  cracha: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M9 4V2h6v2M8 17a4 4 0 0 1 8 0" /><circle cx="12" cy="10" r="2.5" /></>,
  circulo: <circle cx="12" cy="12" r="9" />,
  quadrado: <rect x="3" y="3" width="18" height="18" rx="2" />,
  lua: <path d="M20.5 13a9 9 0 0 1-9.5-9.5A9 9 0 1 0 20.5 13z" />,
  caveira: <><path d="M7 17v4h10v-4a8 8 0 1 0-10 0zM10 17v4M14 17v4" /><circle cx="8.5" cy="11" r="1.5" /><circle cx="15.5" cy="11" r="1.5" /><path d="m12 13-1 2h2z" /></>,
  fechar: <path d="m6 6 12 12M18 6 6 18" />,
  escudo: <><path d="m12 3 8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6z" /><path d="m8 12 3 3 5-6" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></>,
  download: <><path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6" /></>,
  'seta-cima': <path d="M12 20V4m-6 6 6-6 6 6" />,
  'seta-baixo': <path d="M12 4v16m-6-6 6 6 6-6" />,
  'seta-esquerda': <path d="M20 12H4m6-6-6 6 6 6" />,
  'seta-direita': <path d="M4 12h16m-6-6 6 6-6 6" />,
  mover: <><path d="M12 3v18M3 12h18m-6-6 6 6-6 6M9 6l3-3 3 3M6 9l-3 3 3 3M9 18l3 3 3-3" /></>,
  olho: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  'olho-fechado': <><path d="M3 12s3.5-6.5 9-6.5c1.4 0 2.7.3 3.9.9M21 12s-1 1.9-2.9 3.5M6.4 17.1C4.3 15.7 3 12 3 12M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16" /></>,
  link: <><path d="m10 13 4-4M9 15l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 9l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
  renovar: <><path d="M20 10a8 8 0 1 0-1 7M20 3v7h-7" /></>,
  musica: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
} satisfies Record<string, ReactNode>;

export type NomeIcone = keyof typeof desenhos;

interface Props {
  nome: NomeIcone;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** Traço do projeto, sem fontes de símbolos nem dependências externas. */
export default function Icone({ nome, size = 14, className, style }: Props) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ flexShrink: 0, verticalAlign: 'middle', ...style }}
      aria-hidden="true" focusable="false"
    >
      {desenhos[nome]}
    </svg>
  );
}
