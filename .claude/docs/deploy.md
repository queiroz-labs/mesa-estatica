# Deploy — o que sobe sozinho e o que precisa de pedido explícito

> Inventário de tudo que está conectado (identificadores, secrets, o que dá pra verificar de
> fora): [`infraestrutura.md`](infraestrutura.md). Este doc aqui é só o **procedimento**.

Criado em 27/08, quando o ambiente de dev isolado (ROADMAP.md item 2, Parte C) separou de vez
"testar" de "produção" — antes disso só existia um projeto Supabase, então a distinção deste
doc não existia na prática.

## As duas trilhas de deploy são independentes

**Frontend (`src/`, `index.html`, `jogador.html`, tudo que vira `dist/`)** — `.github/workflows/deploy.yml`
builda e publica no Cloudflare Pages a cada `git push` pra `main`. Automático, sem passo manual:
commit + push já é o deploy inteiro. O build usa as credenciais de **produção** injetadas como
secret do GitHub Actions (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) — o `.env.development.local`
da sua máquina nunca entra no build de CI, só afeta `npm run dev` local.

**Backend (`supabase/migrations/*.sql`, `supabase/functions/*`)** — o CI **não toca nisso**.
`git push` só sobe o arquivo pro histórico do GitHub; virar realidade no banco/functions exige
rodar `supabase db push` / `supabase functions deploy` manualmente, contra o projeto certo. Um
PR pode ficar mergeado em `main` por dias com uma migração nunca aplicada em lugar nenhum — não
é sinal de bug, é o normal até alguém (você ou eu, sob pedido) rodar o comando.

**Regra prática**: se a mudança só mexeu em `src/`, "commit e push" já resolve tudo. Se mexeu em
`supabase/migrations/` ou `supabase/functions/`, commit/push é só metade — a outra metade é um
pedido explícito de deploy, dizendo pra qual projeto (dev ou produção).

## Os dois projetos Supabase

| | ref | pra quê |
|---|---|---|
| Produção | `ahhzgxcafoaodetwkyti` | mesa real — CI de frontend fala com ele, é o que os jogadores usam |
| Dev | `mjzgkszckwcnbzrltrww` | descartável — `npm run dev` local fala com ele via `.env.development.local` |

A CLI do Supabase sempre tem UM projeto "linkado" por vez (`supabase/.temp/project-ref`, não
versionado). Comandos como `db push`/`secrets set` sem `--project-ref` explícito agem no
linkado — **hoje o link fica em produção por padrão** (é o que os outros comandos do dia a dia,
tipo checar migração pendente, esperam). Pra mexer no de dev sem trocar esse link (e arriscar
esquecer de trocar de volta), use sempre `--project-ref mjzgkszckwcnbzrltrww` explícito nos
comandos, em vez de `supabase link` pra lá e depois de volta.

```bash
# aplicar migração nova só no dev, sem mexer no link
npx supabase link --project-ref mjzgkszckwcnbzrltrww  # db push não aceita --project-ref direto
npx supabase db push --yes
npx supabase link --project-ref ahhzgxcafoaodetwkyti  # sempre volta pro link de produção depois

# deploy de function e secrets aceitam --project-ref direto, sem precisar trocar o link
npx supabase functions deploy nome-da-function --project-ref mjzgkszckwcnbzrltrww --use-api
npx supabase secrets set CHAVE=valor --project-ref mjzgkszckwcnbzrltrww
```

## Cuidados antes de rodar contra produção

- **Projeto Supabase novo vem com "Anonymous sign-ins" desligado** — `iniciarAuthMultiplayer()`
  (`src/multiplayer/auth.ts`) depende disso; sem habilitar, todo o multiplayer falha calado (422
  `anonymous_provider_disabled`). Habilita via dashboard (Authentication → Sign In → Anonymous)
  ou API de management (`PATCH /v1/projects/{ref}/config/auth`, campo
  `external_anonymous_users_enabled`). Só relevante ao criar um projeto — o de dev atual
  (`mjzgkszckwcnbzrltrww`) já está configurado.
- **Sempre testar no dev primeiro** — migração nova, function nova ou editada. Só depois de
  confirmado ali (local, com os `.bat` da raiz — `iniciar-mestre.bat`/`iniciar-jogador.bat`),
  repetir o mesmo comando trocando `--project-ref` (ou o link) pra `ahhzgxcafoaodetwkyti`.
- **Migração é aditiva por natureza aqui** (`create table if not exists`, `create or replace
  function`) — rodar de novo não duplica nem quebra, mas **não existe rollback automático**: uma
  migração errada em produção precisa de uma migração nova corrigindo, não de desfazer a
  anterior.
- **Secrets de produção e de dev são independentes** — `GM_TOKEN`/`RESET_TOKEN`/`R2_*` setados
  num projeto não existem no outro. Setar num projeto errado por engano não quebra nada na hora
  (só fica sem efeito), mas confunde depois — sempre conferir o `--project-ref` antes de rodar
  `secrets set`.
- **Nunca assumir nome/valor de recurso externo** (bucket R2, nome de secret) — confirmar com
  quem criou. Lição de 27/08: assumi `R2_BUCKET_NAME=estatica-audio-dev` sem perguntar; o nome
  real era `estatica-dev`. O secret foi setado sem erro nenhum na hora — só quebrou depois, na
  1ª chamada real da function (`ListObjectsV2` num bucket que não existe → 502 confuso). Detalhe
  completo em `storage-r2.md` Parte 6, Passo 3.
- **Nunca commitar `.env.development.local`** (já coberto pelo `*.local` do `.gitignore`) nem
  colar valor de secret em código/doc versionado — só via `supabase secrets set`.
- **Pedir confirmação antes de qualquer comando contra produção** — `db push`, `secrets set` ou
  `functions deploy` sem `--project-ref` (ou com o link em produção) afeta a mesa real na hora,
  sem stage/preview. Ver runbook completo do ambiente de dev em `storage-r2.md` Parte 6.
