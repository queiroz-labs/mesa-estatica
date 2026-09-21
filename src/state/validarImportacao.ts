/**
 * Confere o TIPO de campos que, se vierem errados, não travam a importação em si — o objeto
 * espalhado (`{ ...f }`) não reclama de tipo nenhum — só quebram DEPOIS, no meio do render de
 * uma ficha qualquer (`traumas.map(...)` numa string, `Object.entries(pericias)` num número),
 * sem nenhum contexto de que a causa foi um JSON malformado importado minutos antes.
 *
 * Deliberadamente não é uma validação de schema completa (não é zod) — só os campos que a UI
 * itera (`.map`) ou trata como objeto sem checar o tipo antes. Roda depois da checagem de
 * chaves obrigatórias (`importarJSON`, store.ts) e antes de `normalizar` — se achar problema,
 * a importação nem chega a mexer no estado.
 */
export function validarTiposEstado(dados: Record<string, unknown>): string[] {
  const problemas: string[] = [];

  const listar = (caminho: string, valor: unknown) => {
    if (valor !== undefined && !Array.isArray(valor)) problemas.push(`"${caminho}" deveria ser uma lista`);
  };
  /** Como `listar`, mas também confere que CADA elemento é um objeto — não só o array em si.
   *  Sem isso, `[null]` ou `["x"]` passava a checagem (é uma lista de verdade) e só quebrava
   *  depois, no primeiro `.map(item => item.id)` da seção que renderiza essa lista — e como o
   *  JSON malformado já tinha sido persistido, o crash se repetia pra sempre a cada reload. */
  const listarDeObjetos = (caminho: string, valor: unknown) => {
    if (valor === undefined) return;
    if (!Array.isArray(valor)) {
      problemas.push(`"${caminho}" deveria ser uma lista`);
      return;
    }
    valor.forEach((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        problemas.push(`"${caminho}[${i}]" deveria ser um objeto`);
      }
    });
  };
  const objetar = (caminho: string, valor: unknown) => {
    if (valor !== undefined && (typeof valor !== 'object' || valor === null || Array.isArray(valor))) {
      problemas.push(`"${caminho}" deveria ser um objeto`);
    }
  };
  const textar = (caminho: string, valor: unknown) => {
    if (valor !== undefined && typeof valor !== 'string') problemas.push(`"${caminho}" deveria ser texto`);
  };
  const registro = (valor: unknown): valor is Record<string, unknown> =>
    !!valor && typeof valor === 'object' && !Array.isArray(valor);
  const visitarLista = (caminho: string, valor: unknown, visitar: (item: Record<string, unknown>, caminho: string) => void) => {
    listarDeObjetos(caminho, valor);
    if (Array.isArray(valor)) valor.forEach((item, i) => {
      if (registro(item)) visitar(item, `${caminho}[${i}]`);
    });
  };

  for (const campo of ['sessaoPrivada', 'sessaoPublica', 'midia', 'soundpad']) objetar(campo, dados[campo]);
  if (registro(dados.sessaoPrivada)) {
    for (const campo of ['eventos', 'lembretes']) {
      visitarLista(`sessaoPrivada.${campo}`, dados.sessaoPrivada[campo], (item, caminho) => textar(`${caminho}.texto`, item.texto));
    }
    listar('sessaoPrivada.selecionadosIniciativa', dados.sessaoPrivada.selecionadosIniciativa);
    objetar('sessaoPrivada.estatisticas', dados.sessaoPrivada.estatisticas);
  }
  for (const campo of ['pistas', 'rollsLog']) listarDeObjetos(campo, dados[campo]);
  if (registro(dados.midia)) {
    visitarLista('midia.faixas', dados.midia.faixas, (item, caminho) => {
      for (const campo of ['nome', 'tag', 'path', 'url']) textar(`${caminho}.${campo}`, item[campo]);
    });
  }
  if (registro(dados.soundpad)) listarDeObjetos('soundpad.sons', dados.soundpad.sons);
  visitarLista('tabelas', dados.tabelas, (item, caminho) => listarDeObjetos(`${caminho}.entradas`, item.entradas));

  listar('fichas', dados.fichas);
  listar('npcs', dados.npcs);
  listarDeObjetos('iniciativa', dados.iniciativa);
  listarDeObjetos('log', dados.log);
  objetar('mapa', dados.mapa);
  objetar('config', dados.config);

  if (Array.isArray(dados.fichas)) {
    dados.fichas.forEach((f, i) => {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        problemas.push(`fichas[${i}] deveria ser um objeto`);
        return;
      }
      const ficha = f as Record<string, unknown>;
      textar(`fichas[${i}].nome`, ficha.nome);
      objetar(`fichas[${i}].atributos`, ficha.atributos);
      objetar(`fichas[${i}].pericias`, ficha.pericias);
      for (const campo of ['traumas', 'armas', 'vinculos', 'kitInvestigacao', 'reguladores', 'surtosAtivos'] as const) {
        listarDeObjetos(`fichas[${i}].${campo}`, ficha[campo]);
      }
    });
  }

  if (Array.isArray(dados.npcs)) {
    dados.npcs.forEach((n, i) => {
      if (!n || typeof n !== 'object' || Array.isArray(n)) {
        problemas.push(`npcs[${i}] deveria ser um objeto`);
        return;
      }
      const npc = n as Record<string, unknown>;
      textar(`npcs[${i}].nome`, npc.nome);
      listarDeObjetos(`npcs[${i}].acoes`, npc.acoes);
    });
  }

  if (dados.mapa && typeof dados.mapa === 'object' && !Array.isArray(dados.mapa)) {
    const mapa = dados.mapa as Record<string, unknown>;
    listarDeObjetos('mapa.tokens', mapa.tokens);
    // `biblioteca` só existe no formato atual — export legado (pré-biblioteca) não tem essa
    // chave, e `normalizarMapa` (store.ts) já sabe converter esse formato antigo.
    const validarFow = (item: Record<string, unknown>, caminho: string) => {
      objetar(`${caminho}.fow`, item.fow);
      if (registro(item.fow)) {
        for (const campo of ['vistas', 'visiveisAgora']) listarDeObjetos(`${caminho}.fow.${campo}`, item.fow[campo]);
      }
    };
    validarFow(mapa, 'mapa');
    visitarLista('mapa.biblioteca', mapa.biblioteca, validarFow);
  }

  return problemas;
}
