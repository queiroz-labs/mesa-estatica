# ROADMAP — Mesa de Estática

> Painel de mestre: ficha viva, motor de regras, dados 3D, mapa com tokens, app do jogador e sync via Supabase. Publicado no Cloudflare Pages.
> Próxima sessão de jogo: **11/10/2026**. Docs: [regras](.claude/docs/regras.md) · [ficha](.claude/docs/ficha.md) · [arte](.claude/docs/arte.md) · [arquitetura](.claude/docs/arquitetura.md) · [multiplayer](mesa-estatica-multiplayer-completo.md) · [mídia/R2](.claude/docs/storage-r2.md) · [mcp servers](.claude/docs/mcp-servers.md).
>
> **Histórico detalhado fica no `git log`, não aqui.** Este arquivo guarda: estado atual, invariantes que não podem ser re-quebradas, e o que vem a seguir.

## Estado atual

Tudo abaixo está implementado, testado e em produção salvo indicação em contrário.

- **Ambiência (08/10)**: biblioteca de uploads própria, loop nativo, tocar/pausar/parar/seek e volume independente da música e do soundpad. Validada primeiro no dev com mestre e jogador (uploads R2, repetição, pausa, troca, volumes, mudo e recarga), backups antigos e 779 testes; migração aditiva `0041_ambiencia.sql` em `midia_estado`, sem alterar as permissões existentes.

- **QA pré-sessão (08/10)**: rodada real mestre/jogador, resultados de Trauma/Sanidade/Surto esclarecidos, pedidos de dado consumidos uma vez, sigilo de NPC/logs e rolagens preservado, réguas com primeiro envio imediato, reconciliação de tokens e correções de áudio/mapas. Token PC usa broadcast confirmado no servidor após UPDATE RLS (`0042`), com versão e fallback Postgres Changes: mediana de entrega caiu de 524 ms para 54 ms no teste com duas conexões na mesma máquina/dev. Detalhes e limites em [QA-2026-10-08.md](.claude/docs/QA-2026-10-08.md).

- **Ficha e regras**: ficha completa (`ficha.md`), motor em `src/rules/` puro e testado, indicadores mecânicos (Ferido, linha da Sanidade, Surto com perda ≥5, traumas), neuro-reguladores, dinheiro R$/P$ com câmbio, Kit de Investigação, export `.docx` + import via IA (sobrescreve por nome; via `.docx` automático por Edge Function/Groq+OpenRouter fallback — `.claude/docs/storage-r2.md` Parte 4 — ou manual copiar/colar).
- **Dados**: 3D com colorsets por tipo de rolagem, fila de rolagens, fallback 2D sem WebGL, rolagem rápida em qualquer aba. Honesta por padrão; forçada só pela janela `#controle`.
- **Mapa/combate**: upload comprimido, tokens arrastáveis com cristal 3D, grade configurável, régua de medição, AoE (círculo/quadrado), `CombatOverlay` com iniciativa, condições, glossário e drag-and-drop. **Biblioteca de mapas** (06/09): mestre sobe vários mapas e escolhe qual está ativo a qualquer momento — grid e FoW são lembrados POR MAPA (`MapaBiblioteca`, migração `0039_biblioteca_mapas.sql`), tokens continuam globais. Migração `0039` **aplicada em produção** e `reset-mesa` redeployada (versão 4) em 06/09 — conferido em 07/09 por `npx supabase migration list --linked`: 0001–0039 todas com `local == remote`. *(Esta linha afirmou o contrário até 07/09, o que quase levou a rodar de novo uma migração destrutiva e não repetível — ver o bloco "Antes do dia" no checklist.)* **Falta testar no navegador de verdade**: o ambiente de dev local está atrás do gate de vínculo de mestre, e é isso que separa o item de estar fechado. O QA de 07/09 (`.claude/docs/QA-2026-09-07.md`) achou por simulação a corrida entre `mapa_publico` e `mapas_biblioteca` ao adicionar mapa (FK da 0039 rejeitava, jogador ficava no mapa anterior) — corrigida e commitada em 20/09 (`mapaAtivoSync` espera a confirmação da biblioteca), junto com as outras quatro correções do QA (reset com falha parcial, 12 slots e tags no backup, validação de coleções no import).
- **Sessão**: dashboard público/privado, gauges de Ruído Narrativo/Ameaça com reflexo visual site-wide, ruído de Sanidade por tiers, log narrativo + `rollsLog` separados com visibilidade, aba Pistas (GM-only), jukebox sincronizado.
- **Multiplayer (Supabase)**: Fases A e B em produção (tokens; fichas com dono real via Anonymous Auth + RLS). App do jogador (`jogador.html`) com paridade: ficha própria editável, roladores, mapa, combate read-only, log, mídia. Além das fases A-D originais, já em produção: FoW, AoE, régua, ping, soundpad, rolagem ao vivo transmitida — ver `mesa-estatica-multiplayer-completo.md` §11 (parcialmente desatualizado quanto a isso, tratar como histórico de design, não checklist do estado atual).
- **Fase C** (Edge Function `resolver-rolagem`) construída mas **não ligada** no caminho do mestre. **Fase D** atrás da flag `VITE_FASE_D_ROLAGEM_REMOTA` (**off por padrão**) — falta teste com 2 aparelhos físicos antes de ativar.
- **Mídia (Cloudflare R2 + Freesound)**: áudio do soundpad/jukebox migrado do Supabase Storage pro R2 (egress zero pra leitura), trava de cota de 8GB, limite de 100MB por arquivo, busca de efeito sonoro direto do Freesound no soundpad. Imagem de mapa/NPC/ficha continua no Supabase Storage (paga egress) — decisão consciente, ver `.claude/docs/storage-r2.md`.
- **Interface (07/09)**: passada de polimento nos dois lados — emoji usado como ícone trocado pelos SVG de `combate/icones.tsx`, `<span role="button">` viraram `<button>` de verdade (hover e Enter/Espaço voltaram a funcionar), contraste do `.vazio` subiu pra faixa AA em 133 usos de uma vez, backdrop de modal virou o token `--overlay-backdrop`, e as abas Dados/Mapa do jogador pararam de anunciar "sem ficha vinculada" enquanto a ficha ainda estava carregando. **Silhuetas de NPC** redesenhadas sobre grade comum (`BUSTO`/`CABECA` compartilhados), com recorte vazado de verdade (`fillRule evenodd`) no lugar do furo pintado com a cor do fundo, mais cinco categorias novas (`seguranca`, `crianca`, `anomalia`, `catador`, `camelo`) — nenhum slug existente mudou, então não houve migração; `guarda`, `policial` e `medico` ficaram no desenho anterior por escolha do usuário e são os únicos que ainda dependem do fundo `--concrete-1`. **Fora de escopo de propósito**: confirmação ao excluir pista (o `×` apaga direto, diferente de NPC/mídia que confirmam), padronizar os `window.confirm`/`alert` no modal estilizado do app, e responsividade mobile — o projeto não tem nenhuma media query.
- **Site**: publicado no Cloudflare Pages (migrado do GitHub Pages) — `base: '/'` no Vite, CI continua fazendo lint+test+build antes do deploy.

## Invariantes — aprendidas na marra, não re-quebrar

Cada uma custou um bug real em produção ou ao vivo numa sessão.

- **Exclusão nunca por diff.** Sync infere criação/edição por diff, mas remoção só propaga se a UI marcou de propósito (`multiplayer/remocaoExplicita.ts`). O `GM_TOKEN` é compartilhado — uma aba com lista desatualizada apagava fichas/NPCs/tokens de todo mundo.
- **Flag de "aplicando remoto" é contador, não boolean.** Duas tabelas disparam dois eventos Realtime pro mesmo push; com boolean, o primeiro a terminar zera a flag e o segundo vaza como edição local → loop exponencial de requests.
- **Coordenadas do mapa são % da IMAGEM renderizada**, nunca do container (`getImgRenderRect`/`retanguloGradeEmPx` em `mapaUtils.ts`) — edição E renderização. Container varia por dispositivo; misturar as duas bases desalinha mestre e jogador.
- **Notação de dado forçado aceita um único `@` no fim** — o parser da lib quebra com mais de um.
- **Consumo da fila forçada é destrutivo e casa por alvo + tipo.** Enquanto a única chave era o personagem, qualquer consumidor novo roubava entradas dos outros (um forçado guardado pro d20 de um teste sumia se um sorteio de trauma rodasse antes) — foi o que manteve a fila restrita ao `useDiceBox` por muito tempo. Com o eixo de `tipo` (06/08) dá pra ligar os outros pontos; sem ele, não. O sorteio de trauma segue de fora, por decisão.
- **`forcarRolagem.ts` não pode entrar no bundle do jogador** (abre `BroadcastChannel` no top-level). Quem rola fora da bandeja usa a ponte neutra `dice/registroForcados.ts`, que só o entry do mestre popula — nunca import direto.
- **Visibilidade de rolagem precisa existir no banco.** `registrarLog` (texto livre) e `registrarRoll` são canais paralelos: filtro client-side não basta, a coluna + RLS têm que existir, senão o eco do Realtime devolve a entrada sem visibilidade e vaza.
- **Mascarar na tela não fecha o vazamento se a RLS da tabela não filtrar junto.** `iniciativa` tinha `for select using (true)` enquanto `npcs_publico` já filtrava por `visivel` — um jogador inspecionando a rede ou com a anon key lia nome/participante_id de NPC oculto. Corrigido junto com a troca de `indiceAtualTurno` (índice de array) por `turnoAtualId` (id da entrada, `state/types.ts`): um índice numérico desalinha assim que a RLS passa a omitir linhas de NPC oculto pro jogador (array mais curto que o do mestre); um id não desalinha nunca.
- **Bundle do jogador não persiste em localStorage** (storage condicional no `persist`) — os dois bundles rodam na mesma origin e compartilhariam a chave `estatica-mesa`.
- **Fallback de array em selector do Zustand precisa ser constante fora do componente** (`EMPTY_CONDICOES`) — `?? []` inline cria array novo a cada render e quebra com "getSnapshot should be cached".
- **Canvas WebGL é criado via `document.createElement` e destruído no cleanup**, nunca um `<canvas>` fixo do JSX — um canvas aceita um contexto WebGL por vida inteira, e StrictMode/remount quebram nisso.
- **Token em arrasto ignora eco remoto** (`tokensEmArrasto` em `tokensSync.ts`), senão a posição pula durante o arrasto.
- **HMR longo corrompe o React**: "Invalid hook call" numa aba antiga depois de editar hook não é bug — abrir aba nova.
- **Reconexão precisa rebuscar, não só reassinar.** O Realtime não reenvia evento perdido durante uma queda de canal — sem um refetch explícito na transição erro→`SUBSCRIBED` (`assinarStatusCanalComRefetch` em `statusMesa.ts`), quem cai e volta fica com dado desatualizado até um reload manual. Todo módulo de sync novo com tabela própria precisa ligar isso (24/08).

### ~~Pendência conhecida — reconexão nos módulos de mídia/log (24/08)~~ — fechada em 07/09

`assinarStatusCanalComRefetch` (ver invariante acima) estava ligado só nos módulos combat-críticos e nos 6 hooks de hidratação do jogador; `midiaFaixasSync`, `soundpadSync`, `midiaEstadoSync` e `logRollsSync` ficaram de fora por escopo. Agora os quatro rebuscam ao reconectar, e o lado do mestre deixa de depender de um F5 pra recuperar trilha, efeito e log depois de uma queda de canal (o jogador já rebuscava).

Dois cuidados que o diff sozinho não explica: em `logRollsSync` a rebusca é **merge por id**, não substituição — concatenar duplicaria o log inteiro na tela e substituir apagaria a entrada anotada durante a queda; e em `soundpadSync` o `ultimoDisparo` continua de fora da rebusca, senão reconectar soltaria um efeito antigo na mesa no meio da cena. Ambos têm teste.

`reguasSync`, `aoeSync`, `pingSync` e `rolagemAoVivoSync` seguem sem rebusca de propósito — broadcast de dado descartável, atrasar gesto por reconexão é ruído.

### Pendência conhecida — push de ficha inteira não faz merge (29/08)

`empurrarFicha` (`fichasSync.ts`) grava a ficha inteira a partir do snapshot local a cada push — não é um merge por campo no servidor. Se dois clientes editarem a MESMA ficha quase ao mesmo tempo (ex.: mestre e o próprio jogador rolando Surto pro mesmo personagem dentro da mesma janela de debounce), quem sincronizar por último apaga silenciosamente a mudança do outro. Achado revisando o refactor de `surtoPendente` (que passou a viver na ficha, sincronizado — antes só existia no navegador de quem rolou, imune a essa corrida por construção), mas o problema é mais antigo e mais amplo: vale pra qualquer campo da ficha editado por dois lados ao mesmo tempo, não só Surto. Corrigir de verdade exige uma function no Postgres que aplique a mudança de forma atômica (lê+grava no mesmo passo, sem depender do snapshot do cliente) — mesmo padrão que `registrar_tentativa_mestre` (migração 0024) já usa pra outro caso. Não faz sentido abrir essa migração só por causa do Surto; retomar se o padrão de conflito aparecer em mais de um lugar.

**Auditoria pré-sessão (28/08)**: essa pendência é sobre DOIS escritores editando o MESMO campo ao mesmo tempo — continua em aberto, sem mudança. Um problema irmão, mas distinto — UM escritor sozinho tendo a própria edição revertida pelo eco Realtime de um push anterior chegando dentro da janela de debounce do push seguinte — já estava coberto em fichas/npcs/sessão pública/tokens, mas faltava em `mapaPublicoSync.ts`/`fowSync.ts`/`midiaEstadoSync.ts` (handler de `postgres_changes` aplicava o payload direto, sem checar edição local pendente). Corrigido com o mesmo guard `pendente` que os outros módulos já usavam.

## Próximos passos — confiabilidade pós-publicação

O app nasceu local; agora tem URL pública. Auditoria (tratamento de erro, RLS, build/deploy) levantou os gaps abaixo.

### Fase 0 — evitar perda de dados ao vivo (concluída em 04/08)

1. ~~**Try/catch em `criarStorageComDebounce`**~~ — `setItem/getItem/removeItem` agora engolem `QuotaExceededError`/localStorage indisponível em vez de propagar não capturado; reporta em `lib/statusMesa.ts`.
2. ~~**Indicador visual de status**~~ — novo `lib/statusMesa.ts` (store efêmero, fora do `persist`) + `StatusIndicador.tsx` no header do mestre: "● registrado"/"⚠ não salvou local" e "● sync ok"/"⚠ sync com erro"/"— local". Cada um dos 11 módulos de sync do lado do mestre reporta pelo callback de status do `.subscribe()` do Realtime (`assinarStatusCanal`/`desconectarCanal`) — não foi mexido nos ~25 pontos individuais de `.catch(console.error)` dos pushes, o canal já é o sinal agregado que importa. Lado do jogador não tem o indicador de propósito (os canais de `hidratacaoJogador.ts` não foram instrumentados — mostrar status ali seria enganoso).
3. ~~**Backup — lembrete, não automático**~~ — download automático via script se choca com o bloqueio de "múltiplos downloads" do navegador depois do primeiro; virou lembrete visual no botão "exportar" (some ao clicar) a cada 15min, exige o clique real que o navegador sempre permite.

### Fase 1 — evitar a tela travar (concluída em 04/08)

- ~~**Error Boundary React**~~ (`app/ErrorBoundary.tsx`) — envolve `<App>`/`<PlayerApp>` nos dois entries. Fallback oferece "baixar backup agora" (chama `exportarJSON` direto do `useStore.getState()`, imperativo — não depende de nenhum componente quebrado) e "recarregar". Testado ao vivo: corrompi `fichas[0].traumas` pra string no localStorage — sem o boundary a tela toda travava; com ele, só aparece o fallback, dado intacto.
- ~~**Handler global `window.onerror`/`unhandledrejection`**~~ (`lib/globalErrorHandler.ts`) — não tenta recuperar nada, só acende `⚠ erro inesperado` no `StatusIndicador` (clique dispensa) via `statusMesa.ts`.
- ~~**Validação de shape em `importarJSON`**~~ (`state/validarImportacao.ts`) — além da presença das 6 chaves (já existia), agora confere o TIPO de campos aninhados (`fichas[].traumas` deveria ser lista, `.atributos` deveria ser objeto, etc.) antes de tocar no estado. Reproduzi o cenário exato do bug (traumas como string): sem a validação, quebra no render de `TraumasSection` sem contexto nenhum; com ela, `importarJSON` lança `formato inválido: "fichas[0].traumas" deveria ser uma lista` antes de mudar qualquer coisa.

### Fase 2 — segurança pós-publicação (concluída em 05/08)

- ~~**Rate limit em `vincular-mestre`**~~ — tabela `mestre_tentativas` (migração 0022), 5 tentativas erradas por identidade anônima e bloqueia 15min. Testado ao vivo contra o Supabase real: 5x token errado → 403, 6ª → 429.
- ~~**RLS de `tokens` fechada de verdade**~~ (migração 0021) — item mais sério: `using (true)` desde a Fase A deixava qualquer um com a chave anon reescrever/apagar token de qualquer personagem. Agora insert/delete só `is_gm()`, update dono-ou-mestre. `mídia` (bucket) ficou aberta de propósito — risco baixo, refactor maior; decisão consciente, não esquecimento.
- ~~**Aviso visível sem Supabase em produção**~~ — `AvisoSupabaseAusente.tsx`, banner vermelho só quando `import.meta.env.PROD && !supabase` (nunca aparece em dev local sem `.env`, que é uso válido). Testado com build real sem as env vars.
- ~~**Auditoria de reuso de token em `vincular-jogador`**~~ — tabela `vinculo_jogador_log` (migração 0023) registra auth_uid anterior → novo a cada vínculo bem-sucedido, sem bloquear (revincular é comportamento válido). Só leitura do mestre; sem UI ainda, é consulta direta no banco.

### Fase 3 — nice to have (concluída em 21/08)

- ~~**ESLint no CI**~~ — `eslint.config.js` novo (flat config, ESLint 10 + typescript-eslint). Só `src/**` (mesmo escopo do `tsconfig.json`); `react-hooks` restrito às regras clássicas (`rules-of-hooks`/`exhaustive-deps`) — o `recommended` do plugin v7 vem com o pacote de regras do React Compiler (purity, refs, set-state-in-effect) que acusa padrões intencionais já usados no projeto (ex.: `ref.current = valor` direto no render em `TokenScene.tsx`) como erro. `no-unused-vars` desligado (o `tsc --strict` já cobre). Gate novo em `deploy.yml`, antes do build. 0 erros, 18 avisos de `react-refresh` (HMR only, não bloqueiam).
- ~~**`404.html`/`robots.txt`**~~ — página 404 com a identidade visual do app (`public/404.html`, self-contained, sem CDN) + `robots.txt` com `Disallow: /`. Também `<meta name="robots" content="noindex, nofollow">` em `index.html`/`jogador.html` — é o que realmente vale pra um site num subpath (`/mesa-estatica/robots.txt` não é o local padrão que crawlers verificam; a spec do protocolo só olha a raiz do domínio).
- ~~**Detecção de offline + fila de pendências**~~ — `multiplayer/filaPendencias.ts` (registrar/resolver pendência por módulo+chave, retry automático no evento `online` e na reconexão de canal, persistência só de metadados) + `online` em `lib/statusMesa.ts` + spans novos no `StatusIndicador`. Todos os 15 módulos de sync com tabela/broadcast persistível cobertos (21/08): diff por id (`tokensSync`, `fichasSync`, `npcsSync`, `midiaFaixasSync`, `soundpadSync` — por slot), singleton (`fowSync`, `mapaPublicoSync`, `midiaEstadoSync`, `sessaoPublicaSync`), broadcast puro só no envio garantido de fim de gesto (`reguasSync`, `aoeSync` — `canal.send` não devolve erro observável, gatilho é `online===false` no momento do envio), array inteiro sem re-leitura da store no retry (`iniciativaSync` — motivo: `iniciativaAnterior` já avança de forma otimista antes do resultado do push, reler a store no retry veria um diff vazio; boot faz best-effort upsert-only, sem recuperar delete perdido através de reload) e insert-only por id (`logRollsSync` — log/rollsLog, incluindo `visibilidade` de rolls). `pingSync`/`rolagemAoVivoSync` ficam de fora de propósito (dado descartável, atrasar por reconexão é ruído). `npm test` (584), `npm run lint`, `tsc --noEmit` e `npm run build` verdes. **Não testado**: wifi real desligado com dois clientes de verdade — só simulação de evento `online`/`offline` no DevTools.

### Ideias sem prioridade

Recap automático de sessão a partir do log · indicador sutil de Sanidade no jogador.

## Próximos passos — mesa ao vivo

Quatro frentes levantadas em 06/08, depois da caça a bugs. O levantamento técnico de cada uma já foi feito; o que está aqui é o desenho e as pegadinhas descobertas, não código.

### 1. ~~Dado rolando visível para todos~~ — concluído em 08/08

Rolagem de jogador transmite pro resto da mesa via broadcast (`dados`, migração 0030) — bandeja própria sempre montada no header (`RolagemAoVivoPlayer.tsx`), cor/nome de quem rolou, aba "Dados" acende se quem vê estiver em outra aba. Rolagem do mestre nunca é transmitida (sigilo por bundle, não checagem em runtime).

**Confirmado em 21/08**: migração 0030 já estava aplicada em produção (`supabase migration list --linked`, `local` = `remote` até 0033). Roundtrip real entre dois clientes não foi testado ao vivo, mas segue o mesmo padrão de policy de 0025 (régua/AoE) e 0029 (ping), ambas já validadas em produção.

### 2. Reset de produção sem depender do token de mestre + ambiente de dev isolado

Duas necessidades que apareceram juntas, planejadas em 25/08: limpar a mesa de produção antes de cada sessão — incluindo os binários que o reset do item 3 não cobre — e continuar validando features depois da sessão sem ver o que o mestre guardou lá, enquanto o mestre troca o próprio token sem precisar te avisar o valor novo.

**Partes A e B concluídas em 26/08**: migração `0036_reset_mesa_infra.sql` aplicada, `RESET_TOKEN` setado nos secrets, `reset-mesa`/`trocar-token-mestre`/`vincular-mestre` deployadas, e o bootstrap da troca de token já feito (confirmado por query direta: `mestre_config` tem uma linha com hash válido) — o `GM_TOKEN` antigo não autentica mais nada, quem vale agora é o token que o próprio usuário trocou pela UI.

**Parte C concluída em 27/08** — ambiente de dev isolado completo. Projeto Supabase de dev criado (`mjzgkszckwcnbzrltrww`, região `sa-east-1`, mesma org): as ~36 migrações rodadas do zero, `GM_TOKEN`/`RESET_TOKEN` de dev setados, as 11 Edge Functions deployadas, anonymous sign-ins habilitado (novo projeto vem com isso desligado — sem perceber, `iniciarAuthMultiplayer()` falhava com 422 silenciosamente), `.env.development.local` escrito (fora do git, `*.local`). Bucket R2 de dev (`estatica-dev`, criado manualmente pelo usuário) com as 5 secrets `R2_*` setadas.

Testado de ponta a ponta contra o banco/bucket de dev reais (não mocado): vínculo de mestre, criação de ficha, `reset-mesa` (confirmado por query direta que a linha sumiu do servidor), e upload+leitura+remoção via `presign-r2-upload`/`remover-r2-objeto` contra o R2 de dev. Único ajuste no caminho: o nome real do bucket (`estatica-dev`) não era o assumido (`estatica-audio-dev`) — corrigido no secret `R2_BUCKET_NAME` antes do teste passar.

Item 2 do ROADMAP está completo — reset de produção, rotação de token e ambiente de dev isolado, todos em produção/uso.

- **O reset de hoje (item 3) exige ser mestre.** Toda policy de `delete` do schema usa `is_gm()` (confirmado em todas as tabelas via grep nas migrations). Se o mestre trocar o `GM_TOKEN`, seu cliente deixa de ser `is_gm()` e "sessão limpa" para de apagar qualquer coisa no servidor — localStorage limpa, banco não, e o Realtime devolve tudo no próximo reload. Resetar e não-ser-mestre são hoje mutuamente exclusivos, o que quebra a ideia de trocar o token depois da sessão.
- **Solução — desacoplar os dois privilégios**: nova Edge Function `reset-mesa`, validada por um `RESET_TOKEN` próprio (independente do `GM_TOKEN`, o dev guarda pra sempre), roda com `service_role` (contorna RLS) a mesma sequência que `resetarMesaCompleta()` já faz — **mais** a parte que falta hoje: apagar de fato os objetos dos buckets (`midia`/imagens e R2/áudio), não só as linhas que apontam pra eles. Tabelas de auditoria (`vinculo_jogador_log`, `mestre_tentativas`) continuam intocadas, de propósito. `resetMesa.ts`/`ResetSessao.tsx` passam a chamar essa function em vez de fazer o delete direto do cliente.
- **Mestre troca o próprio token sem depender do dev**: `GM_TOKEN` hoje é uma env var comparada em texto puro dentro de `vincular-mestre` — só muda via `supabase secrets set`, que exige acesso ao projeto (hoje só o dev tem). Trocar a comparação por um hash guardado numa tabela singleton nova (`mestre_config`, RLS fechada, só `service_role` lê) e criar uma Edge Function `trocar-token-mestre` que exige o token **atual** válido pra gerar e gravar um novo — sem passar pelo painel do Supabase nem pelo dev depois disso. Bootstrap único: o dev faz a primeira troca (já conhece o valor atual, inevitável essa vez) e o mestre troca de novo sozinho logo em seguida pra invalidar o que o dev viu.
- **"Dois tokens" no mesmo banco não resolve** — o motivo original segue de pé: o `GM_TOKEN` é secret do projeto Supabase e nenhuma tabela tem coluna que diga a que mesa a linha pertence, então dois tokens no mesmo banco enxergam exatamente as mesmas fichas, NPCs e mapa. Pior: `sessao_publica`, `mapa_publico`, `midia_estado` e `soundpad_estado` são singletons por `check` constraint (uma linha fixa cada), o que impede duas mesas no mesmo banco sem quebrar constraint, ~11 módulos de sync e os nomes de canal Realtime.
- **Caminho escolhido pro ambiente de dev**: um segundo projeto Supabase só pra dev (o free tier permite dois). Rodar as migrações nele, definir um `GM_TOKEN` de dev à parte, e apontar o ambiente local pra ele via `.env.development.local` (já coberto pelo `*.local` do `.gitignore`). O CI continua injetando os secrets de produção no build, e variável de processo tem precedência sobre arquivo `.env` — então `npm run dev` fala com o banco de teste e o deploy fala com o real, sem nenhuma flag no código. **Estender também pra um bucket R2 de dev separado** (áudio mora no R2 desde 20/08 — testar upload/remoção de som contra o bucket de produção seria o mesmo problema que isso já resolve pro banco).
- **O `localStorage` já está isolado de graça**: `localhost:5173` e o Cloudflare Pages são origens diferentes, então o estado local de teste nunca encosta no da mesa real. A ressalva é não usar o site publicado pra testar — com o `reset-mesa` da Parte A isso deixa de ser necessário mesmo antes da sessão.
- **Atalho pra quando não precisar de sync**: sem as env vars, `supabase` vira `null` e o app roda 100% local — serve pra qualquer feature que não seja de multiplayer.
- **Sigilo aqui é soft, não hard**: protege contra o app/fluxo normal, não contra o dev abrindo o Table Editor do Supabase direto — ele continua sendo o único admin do projeto de produção. Blindagem "hard" exigiria o mestre (ou terceiro) ser dono do projeto; descartado por ora como desnecessário — não confundir "token trocado" com "sigilo total".

### 3. ~~Botão "sessão limpa" (GM-only, aba Log)~~ — concluído em 06/08

`features/sessao/ResetSessao.tsx` (montado em `LogTab.tsx`, fora do `LogView` compartilhado pra não entrar no bundle do jogador) + `multiplayer/resetMesa.ts`. Confirmação em dois passos e backup oferecido antes de apagar.

A armadilha que motivou o módulo separado: `resetarEstado()` já existia no store mas era código morto, e chamá-lo cru seria pior que nada — os syncs só propagam DELETE pra id marcado em `remocaoExplicita.ts`, então fichas e NPCs ficariam órfãos no banco e **voltariam** pra tela no próximo Realtime ou reload, desfazendo o reset sozinho. `resetMesa.ts` marca as cinco coleções primeiro, reseta, e só então apaga `rolls_publicas` — a única tabela que nenhum diff de sync cobre. Fora do alcance de propósito: arquivos no bucket de Storage e as tabelas de auditoria.

A lacuna de binários e a dependência de `is_gm()` (que trava esse botão se o mestre trocar o token) viram o item 2 acima, replanejado em 25/08.

### 4. ~~Toda rolagem respeitando a fila de forçados~~ — concluído em 06/08

Onze pontos usavam `Math.random()` direto (iniciativa, surto automático, ação de NPC, estabilizar, dano de arma) — agora todos consomem a fila. Chave `tipo` (`qualquer`/`teste`/`iniciativa`/`dano`/`sanidade`/`surto`) evita que um consumo roube o valor guardado pra outro tipo; ponte neutra `dice/registroForcados.ts` mantém o bundle do jogador honesto por construção (só o mestre registra consumidor). Sorteio de trauma segue honesto, por decisão.

### 5. ~~Migrar imagens pra Supabase Storage~~ — concluído em 08/08

Egress bateu 126% do limite free — fundo de mapa, foto de NPC e foto de ficha ficavam como base64 embutido em coluna Postgres, nunca cacheável pelo navegador. Migrado pro bucket `midia` (prefixo `img/`, mesmo padrão do soundpad, migração `0031_storage_imagens_ficha_dono.sql`) — tabela guarda só a URL, pintura otimista com `dataUrl` local até o upload terminar (`uploadImagemStorage.ts`), fallback gracioso se o Storage rejeitar. `scripts/migrar-imagens-storage.mjs` rodado em produção (08/08): 4 imagens migradas, 0 erros, idempotente. Item encerrado.

### 6. ~~Áudio pro Cloudflare R2 + busca no Freesound + site pro Cloudflare Pages~~ — concluído em 20/08

Áudio (soundpad/jukebox) migrado do Supabase Storage pro R2 (egress zero na leitura), com trava de cota de 8GB e limite de 100MB por arquivo. Soundpad ganhou busca de efeito sonoro direto do Freesound (`buscar-freesound` Edge Function). Site migrado do GitHub Pages pro Cloudflare Pages (`base: '/'`, CI continua rodando lint+test antes do deploy) — detalhe operacional completo em `.claude/docs/storage-r2.md`.

### 7. ~~Caça a bugs: egress do Supabase, sync mestre-jogador, Surto, área de combate~~ — concluído em 20/08

Três rodadas: (1) corrida upload-vs-sync mandava base64 de foto/mapa pro Realtime, `iniciativaSync` sem debounce/diff, log sem limite de histórico, hooks do jogador sem status de canal; (2) Surto ativo não expirava certo ao trocar cena/combate (`expiraEm` media rodada OU cena dependendo do modo, mas a checagem usava o modo ATUAL em vez do modo de criação — Surto sumia ao encerrar combate e reaparecia ao reiniciar); (3) varredura da área de combate: tooltip de iniciativa sem os números reais (e `d20`/`agilidade` se perdiam no sync, migração `0033`), o mesmo bug do Surto duplicado inline em 3 componentes, PV do jogador sem cor por gravidade, "Aguardando" nunca desligava sozinho, AoE rotulando quadrado como "raio". Detalhe em `git log`.

## Checklist do dia da sessão

### Antes do dia — técnico

O CI sobe **só o frontend** no push pra `main`. Migração e Edge Function exigem comando manual (`.claude/docs/deploy.md`), e é aí que mora o modo de falha silencioso: o frontend novo vai pro ar esperando um schema que ninguém aplicou. Conferir no banco, não no que este arquivo diz — a linha da biblioteca de mapas afirmou "migração não rodada" de 06/09 a 07/09 enquanto ela já estava aplicada.

- [ ] `npx supabase migration list --linked` contra produção: toda migração local com `remote` correspondente
- [ ] `git log --oneline -- supabase/functions/` — algum commit recente sem `functions deploy` correspondente? Cruzar com `npx supabase functions list --project-ref ahhzgxcafoaodetwkyti` (compara `updated_at` com a data do commit)
- [ ] Token de mestre confirmado **antes** da mesa (sem ele, `is_gm()` falha e "sessão limpa" para de apagar no servidor)
- [ ] `VITE_FASE_D_ROLAGEM_REMOTA` continua desligada — falta teste com dois aparelhos físicos
- [x] `reset-mesa` **versão 5** em produção — deployada em 20/09 (dev e produção), conferida por `functions list` + smoke test (401 no token errado, function sobe com `limpeza.ts`).
- [ ] Um "sessão limpa" **real** contra o dev antes de confiar no de produção — o reset novo só foi validado por teste simulado e smoke test, nunca executado de ponta a ponta.
- [x] Link da CLI (`supabase/.temp/project-ref`) confirmado em **produção** em 08/10. Operações de dev nesta rodada usam workdir isolado; conferir o destino novamente antes de qualquer comando futuro.

### No dia

- [ ] `npm run build` + `npm run preview` funcionando (e o site publicado abrindo)
- [ ] Export JSON de backup salvo fora do navegador
- [ ] Fichas conferidas contra as dos jogadores; mapas importados, NPCs pré-cadastrados
- [ ] Links de jogador enviados; vínculo de mestre ativo (pill `● mestre`)
- [ ] Discord: compartilhar a **janela** do navegador (não a tela), 1080p, "otimizar para vídeo" desligado
- [ ] Determinação de todos resetada para 1
- [ ] d20 físico na mesa por garantia — *fé no rolador do navegador, mas o papel não esquece*

## Próximos passos — ideias capturadas de VTTs (06/08)

Levantamento de features em VTTs maduros (Roll20, Foundry VTT, Fantasy Grounds, Owlbear Rodeo) filtradas pelo modelo da Estática (horror/investigação, mestre compartilha tela no Discord, app do jogador reduzido, local-first com Supabase opcional). Descartado: marketplace, multi-sistema, voz/vídeo embarcado, worldbuilding 3D, sistema de extensões Lua/XML — nada disso se aplica.

### Tier 1 — alta aderência ao tema, reaproveita infraestrutura já existente

| # | Ideia | Origem | Por que encaixa |
|---|---|---|---|
| **F1** | **~~Fog of war no mapa~~** (máscara de revelação controlada pelo GM, sync pro app do jogador) — **implementado em 06/08** | Roll20, Foundry, FG | Três camadas CSS (`vistas`/`visiveisAgora`/nunca), cada uma com assinatura visual própria: chiado P&B (canal sem sinal), frame congelado degradado (`backdrop-filter` + scanlines + microcopy `seen · timestamp`), luz atual com vinheta sutil + burst de 280ms com chroma aberration na transição ("sintonizando"). Zona por região (`rua` = âmbar `--real`, `corporativo` = ciano `--rede`, default P&B puro). Persistente (`EstadoFoW` em `mapa.fow` + tabela `fow_estado` migration 0027); toolbar GM-only (`FoWOverlay.tsx`), render compartilhado (`FoWViewOverlay.tsx`). `fowSync` espelha `mapaPublicoSync` (singleton, RLS `is_gm()`). `resetMesa` DELETE explícito de `fow_estado`. Arquivos: `features/mapa/FoW{Overlay,ViewOverlay}.tsx`, `fowGeometria.ts`, `state/fowStore.ts`, `multiplayer/fowSync.ts`, `styles/fow.css`. |
| **F2** | **Relógio de tensão in-game** (relógio manual, atado aos gauges de Ruído/Ameaça) | Foundry (módulos) | Investigação tem pressão de tempo ("até o amanhecer"). Concentrado na aba Sessão, perto dos gauges já existentes. (Movido de "Ideias sem prioridade".) |
| **F3** | **Anotações no mapa** (desenhos/marcadores do GM, sync — possível camada GM-only vs pública) | Roll20, Foundry, FG | Marcar sangue, pistas, conexões. Aproveita o mesmo canal Realtime dos tokens. |
| **F4** | **Handouts (empurrar imagem/doc pro app do jogador)** | Roll20, Foundry, FG | Investigação vive de pistas visuais. Reaproveita a aba Pistas + Realtime. (Movido de "Ideias sem prioridade".) |
| **F5** | **Música atada à cena** (troca de mapa → troca automática de trilha) | Roll20, Foundry | Jukebox já sincronizada; só falta metadados cena→track. Lift pequeno, imersão grande. |
| **F6** | **Tabelas aleatórias** ("encontros de rua de São Paulo", "ruídos noturnos", "eventos de surto") | Roll20, Foundry, FG | Específicas pro setting distópico. Rolagem → resultado no log. Sub-seção em Dados ou Pistas. |
| **F7** | **Gatilhos narrativos ao cruzar limiares de Ruído/Ameaça** | — | Casa com relógio de tensão e FoW: ao atingir threshold, dispara efeito (overlay, som, mudança de cena). (Movido de "Ideias sem prioridade".) |

### Tier 2 — bom encaixe, mais lift ou parcialmente coberto

- **Visão/lanterna de token** (paired com FoW) — lanterna limitada é horror clássico, mas adiciona complexidade no render; segundo momento.
- ~~**Ping/apontar no mapa**~~ — **implementado em 07/08**. Clique sem arrastar em `.mapa-area` (mestre OU jogador — mesma simetria da régua) dispara um pulso na cor de quem clicou, visto por todo mundo, some sozinho em ~1.4s. Reaproveita o gesto da régua: `useRegua.ts` só decide "é régua ou é ping" pela distância percorrida desde o `pointerdown` (limiar de 5px, mesmo princípio do clique-vs-arrasto de token em `MapaTab.tsx`) — abaixo disso nenhuma régua fantasma chega a ser publicada. Store efêmero `state/pingsStore.ts`, broadcast simples (sem tabela, sem debounce, sem evento de cancelamento — um ping nasce pronto) em `multiplayer/pingSync.ts`, render compartilhado `features/mapa/PingOverlay.tsx`.
- **Sussurro privado pra um jogador** — GM envia nota só pra um aparelho. Combina com "você nota algo que só você vê".
- **Bestiário/NPCs persistentes entre sessões** — hoje NPCs são por sessão; uma biblioteca evita re-setup a cada jogo.
- **Macros de rolagem** — salvar presets de "Perception", "Investigation" (com 15 perícias, poupa cliques recorrentes).
- **Overlays atmosféricos na cena** (chuva, neblina estática) — extender o tier atual de ruído visual p/ o mapa.

### Tier 3 — toques pequenos

- Turn timer no combate (tensão de pacing).
- Transição de cena (fade to black/vermelho) ao trocar de mapa ou cruzar limiar de Ameaça.
- Indicador de atividade noutra aba — generalizar o "aviso fora da aba" já mapeado para o dado remoto.
- Textarea de "observações de combate" auto-crescente no `TokenOverlay.tsx`/`TokenOverlayJogador.tsx` (mapa) — reaproveitar `useAutoResizeTextarea` (`src/hooks/useAutoResizeTextarea.ts`, já usado na ficha desde 30/08) passando um `maxHeight` pra não deixar o card do token gigante.

### Próxima implementação (a partir de 06/08)

Tier 1, em ordem: ~~**F1 Fog of war**~~ (06/08) · **F2 Relógio de tensão** · **F3 Anotações no mapa**. Cada uma ganha levantamento técnico próprio quando sair do backlog (desenho + pegadinhas, não código).
