# Infraestrutura e conexões externas — mapa para auditoria

> **Para quem**: alguém (pessoa ou IA) que vá avaliar o projeto e precise saber o que existe
> **fora** do repositório, o que dá pra verificar de fato e com qual comando. Este doc é o
> índice; o procedimento fica nos outros: [`deploy.md`](deploy.md) (o que sobe sozinho e o que
> exige comando manual), [`mcp-servers.md`](mcp-servers.md) (setup das ferramentas de inspeção),
> [`storage-r2.md`](storage-r2.md) (runbook de mídia/R2/Freesound/IA),
> [`arquitetura.md`](arquitetura.md) (decisões de stack) e
> [`../../mesa-estatica-multiplayer-completo.md`](../../mesa-estatica-multiplayer-completo.md)
> (spec do multiplayer, RLS, papéis).
>
> Nenhum valor de credencial aparece aqui — nem deve. Só **nomes** de secret, refs de projeto e
> URLs públicas. Ver a seção "Regras para quem avalia" no fim antes de rodar qualquer comando.

## Resumo — tudo que está conectado

| Serviço | Identificador | Pra quê | Como conferir |
|---|---|---|---|
| GitHub | `queiroz-labs/mesa-estatica` (origin HTTPS, branch `main`) | código, histórico, secrets do CI | `git remote -v`, `gh repo view` |
| GitHub Actions | `.github/workflows/deploy.yml` | lint + build + test + deploy a cada push em `main` | `gh run list`, `gh workflow view` |
| GitHub Actions | `.github/workflows/keepalive.yml` | a cada 4h chama 3x a RPC `keepalive()` (migração 0040, escreve em `keepalive_log`) + 1 leitura REST + GET no Auth dos dois Supabase (1x/dia ainda gerou aviso em 02/10). GET no REST sozinho não contava como "atividade suficiente" (dev recebeu aviso e foi pausado em 09/2026). Ping não acorda projeto pausado — restaurar pelo dashboard ou `POST /v1/projects/{ref}/restore` | `gh run list --workflow keepalive.yml` |
| Cloudflare Pages | projeto `estatica`, público em `https://estatica-stc.pages.dev` | hospeda o frontend (mestre e jogador) | abrir a URL; MCP `cloudflare`; dashboard |
| Cloudflare R2 | bucket de produção (nome só existe nos secrets) + bucket de dev `estatica-dev` | áudio do soundpad (`sfx/`) e backup de sessão (`saves/`) | MCP `cloudflare`; Edge Function `listar-r2-objetos` |
| Supabase **produção** | ref `ahhzgxcafoaodetwkyti` | banco + RLS + Realtime + Storage + Edge Functions da mesa real | MCP `supabase` (read-only), CLI `supabase` |
| Supabase **dev** | ref `mjzgkszckwcnbzrltrww` | mesmo esquema, descartável, alvo do `npm run dev` local | CLI com `--project-ref` |
| Freesound | chave em secret do Supabase | busca de efeitos sonoros pro soundpad | só via Edge Function `buscar-freesound` |
| Groq + OpenRouter | chaves em secrets do Supabase | import de ficha `.docx` por IA (Groq primário, OpenRouter fallback) | só via Edge Function `converter-ficha-docx` |
| MCP do Claude Code | `supabase`, `cloudflare`, `context7` (`.mcp.json`) | inspeção assistida durante a conversa | `claude /mcp` |

**Sem nada disso o app ainda roda.** Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` o
frontend funciona 100% local (localStorage), sem multiplayer, sem mídia remota e sem import por
IA — é o modo padrão de um clone limpo (ver [`../../README.md`](../../README.md)).

---

## 1. GitHub

- Repositório: `https://github.com/queiroz-labs/mesa-estatica`. Branch única de trabalho: `main`.
- **Secrets do repositório** (Settings → Secrets and variables → Actions), consumidos só pelo
  workflow: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (credenciais de **produção**, injetadas
  no build), `CLOUDFLARE_API_TOKEN` (escopo *Cloudflare Pages:Edit*), `CLOUDFLARE_ACCOUNT_ID`.
- O workflow roda `npm ci` → `npm run lint` → `npm run build` → `npm test` → `wrangler pages
  deploy dist --project-name=estatica`. Lint e teste são **gate**: falha aí, não publica.
- O repo **não** está conectado ao Cloudflare Pages via "Connect to Git" — de propósito: a
  integração nativa buildaria sem rodar lint/test. Ver `storage-r2.md` Parte 3, Passo 1.

## 2. Cloudflare Pages — o frontend publicado

- Nome do projeto (o que o wrangler usa): **`estatica`**. Subdomínio público:
  **`estatica-stc.pages.dev`** — os dois são campos separados na Cloudflare, e o sufixo `-stc`
  veio de colisão global no `*.pages.dev`. Não confundir um com o outro.
- Serve na raiz (`vite.config.ts` → `base: '/'`) e publica **dois entrypoints**: `index.html`
  (mestre) e `jogador.html` (app reduzido do jogador). O bundle do jogador nunca importa código
  exclusivo de mestre — parte do sigilo depende disso.
- Migrado do GitHub Pages (`queiroz-labs.github.io/mesa-estatica/`), que não é mais o endereço
  oficial. Histórico completo da migração em `storage-r2.md` Parte 3.

## 3. Cloudflare R2 — mídia pesada

Existe pra fugir do egress do Supabase Storage. O navegador **sobe direto pro R2** com uma URL
assinada gerada pela Edge Function — as credenciais R2 nunca chegam ao cliente.

- Prefixos liberados hoje: **`sfx/`** (sons do soundpad) e **`saves/`** (backup JSON da sessão).
  A lista (`PREFIXOS_PERMITIDOS`) está duplicada nas três functions de R2 e precisa ser mantida
  em sincronia — é um ponto legítimo de revisão.
- Trava de cota de 8 GB checada por `ListObjectsV2` antes de assinar upload.
- CORS do bucket precisa listar a origem real do site (`https://estatica-stc.pages.dev`) e
  `http://localhost:5173`; sem isso o `PUT` do navegador falha.
- Bucket de produção: o nome real **não é versionado** (vive só no secret `R2_BUCKET_NAME`) —
  `estatica-midia` aparece nos docs apenas como sugestão do passo a passo. Bucket de dev:
  `estatica-dev`. Nunca inferir esses nomes; a lição de 27/08 (nome errado → 502 confuso na 1ª
  chamada) está em `deploy.md` e `storage-r2.md` Parte 6, Passo 3.
- Imagens (fotos de ficha, mapas, capas) continuam no **Supabase Storage**, bucket `midia` — não
  foram migradas pro R2. Então as duas storages coexistem hoje, de propósito.

## 4. Supabase

### 4.1 Os dois projetos

| | ref | quem fala com ele |
|---|---|---|
| Produção | `ahhzgxcafoaodetwkyti` | site publicado (credenciais injetadas pelo CI) |
| Dev | `mjzgkszckwcnbzrltrww` | `npm run dev` local, via `.env.development.local` (fora do git) |

Secrets, functions implantadas e dados são **independentes** entre os dois. A CLI tem um projeto
"linkado" por vez (`supabase/.temp/`, não versionado) e o link fica em produção por padrão.

### 4.2 Banco

- **40 migrações** em `supabase/migrations/` (`0001_…` a `0040_keepalive.sql`), aditivas
  (`create table if not exists`, `create or replace function`) e **sem rollback automático**.
- **25 tabelas**, todas em `public`: `characters_publico`, `characters_privado`, `npcs_publico`,
  `npcs_privado`, `sessao_publica`, `mapa_publico`, `mapas_biblioteca`, `fow_estado`,
  `iniciativa`, `rolls_publicas`, `rolls_log`, `log_publico`, `forced_queue`, `midia_estado`,
  `midia_faixas`, `soundpad_estado`, `soundpad_sons`, `tokens`, `mestres`, `mestre_config`,
  `mestre_tentativas`, `mestre_tentativas_global`, `token_tentativas_global`,
  `vinculo_jogador_log`, `keepalive_log` (só o keepalive, RLS sem policy).
- O par `_publico`/`_privado` é o mecanismo central de sigilo: **RLS é por linha, não por
  coluna**, então o que o jogador não pode ver mora em outra tabela, não em outra coluna
  (`mesa-estatica-multiplayer-completo.md` §3, §4).
- `forced_queue` não é escrita direto por cliente nenhum — só pela Edge Function
  `gerenciar-fila-forcada`. É o que impede a rolagem forçada de vazar (§5).
- Realtime Authorization está nas migrações 0025, 0029 e 0030 (AoE/réguas, ping, dados).

### 4.3 Storage

Bucket **`midia`** (imagens de ficha, mapas). Política de dono na migração
`0031_storage_imagens_ficha_dono.sql`. O feature `storage` do MCP Supabase vem **desligado** por
padrão — pra inspecionar o bucket por MCP é preciso ligá-lo na URL (ver `mcp-servers.md`).

### 4.4 Edge Functions (11)

| Function | Faz | Secrets que usa |
|---|---|---|
| `vincular-mestre` | valida o token de mestre e registra o vínculo | `GM_TOKEN`, service role |
| `vincular-jogador` | vincula jogador a uma ficha pelo `owner_token` | service role |
| `trocar-token-mestre` | mestre troca o próprio token sem passar pelo dev | `GM_TOKEN`, service role |
| `reset-mesa` | zera a mesa no servidor sem depender de `is_gm()` | `RESET_TOKEN`, service role |
| `resolver-rolagem` | único lugar que decide honesta × forçada | service role |
| `gerenciar-fila-forcada` | única escrita possível em `forced_queue` | service role |
| `presign-r2-upload` | URL assinada de upload + trava de cota | `R2_*` |
| `remover-r2-objeto` | exclusão no R2 | `R2_*` |
| `listar-r2-objetos` | listagem de um prefixo (usada pelos backups) | `R2_*` |
| `buscar-freesound` | busca no Freesound e sobe a prévia pro R2 | `FREESOUND_API_KEY`, `R2_*` |
| `converter-ficha-docx` | relay pra IA que converte ficha `.docx` em JSON | `GROQ_*`, `OPENROUTER_*` |

Cada function traz no topo do arquivo o ponteiro pra seção do doc que a especifica — bom ponto
de partida pra revisar uma delas.

## 5. Segredos — onde cada um vive

Nenhum valor está no repositório, e nenhum deve entrar em doc versionado.

| Nome | Onde vive | Consumido por |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | secret do GitHub Actions (produção) · `.env` ou `.env.development.local` local | build do frontend; keepalive |
| `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY` | secret do GitHub Actions (projeto de dev) | só o keepalive |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret do GitHub Actions | passo de deploy do workflow |
| `GM_TOKEN`, `RESET_TOKEN` | secrets do Supabase (um conjunto por projeto) | Edge Functions de vínculo/reset |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` | secrets do Supabase | as quatro functions que falam com R2 |
| `FREESOUND_API_KEY` | secret do Supabase | `buscar-freesound` |
| `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | secrets do Supabase | `converter-ficha-docx` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injetados pelo próprio Supabase no runtime das functions | quase todas as functions |

`.gitignore` cobre `.env`, `*.local`, `supabase/.temp/` e `.claude/settings.local.json`. Flag de
build opcional, não secreta: `VITE_FASE_D_ROLAGEM_REMOTA`.

## 6. O que dá pra checar (e como)

**Sem credencial nenhuma, só com o clone:**

```bash
npm install && npm test        # regras + sync: a maior parte da lógica está coberta aqui
npm run lint
npm run build                  # sem env vars, builda no modo local (sem multiplayer)
git log --oneline -20
```

Revisão estática que rende: `supabase/migrations/*.sql` (RLS por linha), `supabase/functions/*`
(quem valida o quê antes de escrever), `src/multiplayer/*` (um módulo por fatia de estado sincronizada,
a maioria com `.test.ts` ao lado), `src/rules/` (TS puro, espelha `regras.md`).

**Com o MCP `supabase` autenticado** (read-only, apontado pra **produção**): schema real,
políticas RLS efetivas, logs, advisors, functions implantadas. É a única forma de confirmar se
uma migração do repo foi de fato aplicada — `git log` não diz isso (ver `deploy.md`).

**Com o MCP `cloudflare` autenticado**: projeto Pages, deploys recentes, bucket R2, CORS. Atenção
ao escopo — esse servidor expõe a API inteira da Cloudflare, não só R2.

**Com `gh`**: `gh run list` (o CI passou?), `gh secret list` (nomes, nunca valores).

**O que NÃO dá pra verificar de fora**: valores de secret; se um secret está setado no projeto
certo; conteúdo do bucket R2 de produção sem o MCP Cloudflare; e — o mais importante — **se as
migrações e functions do repo estão aplicadas em produção**, porque elas não sobem pelo CI.

## 7. Regras para quem avalia

1. **Produção é uma mesa de RPG real, com dados de jogadores reais.** Leitura à vontade;
   escrita, não. O MCP Supabase está em `read_only=true` de propósito.
2. **Nunca rodar `supabase db push`, `functions deploy` ou `secrets set`** durante uma avaliação
   — nem contra dev. Esses comandos exigem pedido explícito do dono, dizendo o projeto (ver
   `deploy.md`).
3. **Nunca pedir nem colar valor de credencial.** Se algo depende de um secret, o achado correto
   é "não verificável daqui", não uma tentativa de obter o valor.
4. **Não inferir nome de recurso externo** (bucket, secret, projeto) — confirmar. Já quebrou uma
   vez por isso.
5. Divergência entre código e [`regras.md`](regras.md): o **doc** é a fonte da verdade, o código
   é que está errado.
6. Achados de infraestrutura valem mais que achados de estilo aqui — sigilo (o que o jogador
   consegue ler), egress e "isso funcionaria num clone limpo?" são os eixos que importam.
