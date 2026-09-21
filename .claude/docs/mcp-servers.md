# MCP servers conectados (Supabase, Cloudflare, Context7)

> Guia sobre ferramenta do Claude Code, não sobre a arquitetura do app — diferente de
> `storage-r2.md` (esse é sobre mídia). `.mcp.json` (repo root) já declara os três; falta só
> autenticar cada um, uma vez, no seu navegador. O que cada MCP consegue inspecionar de fato
> (e o que fica fora de alcance) está resumido em [`infraestrutura.md`](infraestrutura.md).

## Por quê

Antes disso, qualquer coisa envolvendo Supabase (RLS, schema, Edge Function, logs) era eu lendo
`supabase/migrations/*.sql` estático e inferindo comportamento — nunca consultando o banco real.
Cloudflare R2 (`storage-r2.md`) exige passos manuais no dashboard. Context7 dá doc atualizada de
libs menos comuns do projeto (`dice-box-threejs`, `aws4fetch`) em vez de eu confiar só em
conhecimento treinado ou ficar fazendo `WebFetch` manual.

Os três são servidores **remotos** (exceto Context7, que também roda local via `npx`) —
nenhum pede token estático salvo em arquivo; a autenticação é OAuth no navegador.

## Passo 1 — autenticar cada um

```bash
claude /mcp
```

Abre a lista dos três (`supabase`, `cloudflare`, `context7`) — selecione cada um → **Authenticate**
→ login normal no navegador (conta Supabase / conta Cloudflare). Context7 funciona sem
autenticação nenhuma (rate limit mais baixo sem conta); só autentica se quiser mais volume.

## Passo 2 — Supabase: trocar o `project_ref` do placeholder

**Já feito no `.mcp.json` versionado** — hoje ele traz `read_only=true` (decisão deliberada — é
o banco de uma mesa de RPG real, escrita acidental por engano não é risco que vale correr por
padrão) e `project_ref=ahhzgxcafoaodetwkyti` (produção). O passo abaixo fica registrado pra quem
for apontar pra outro projeto:

1. Dashboard do Supabase → seu projeto → *Settings* → *General* → **Reference ID** (também
   aparece na própria URL do dashboard: `supabase.com/dashboard/project/<ref>`).
2. Troca `SEU_PROJECT_REF` em `.mcp.json` por esse valor.

Sem o `project_ref`, o servidor expõe ferramentas de conta inteira (todos os projetos Supabase
da sua conta) em vez de só este — mais superfície do que precisa.

**Desde 27/08 existem dois projetos** (produção `ahhzgxcafoaodetwkyti` e dev `mjzgkszckwcnbzrltrww`,
ver `.claude/docs/deploy.md`) — o `.mcp.json` aponta só pra um por vez (hoje, produção). Pra
inspecionar o de dev via MCP, trocaria o `project_ref` na URL (não foi feito — não houve
necessidade ainda). **Isto é diferente da CLI `supabase` usada em `deploy.md`**: a CLI aceita
`--project-ref` por comando (não precisa reconfigurar nada), e foi ela (não este MCP, que é
`read_only`) que criou o projeto de dev, aplicou migrações e deployou functions — o MCP aqui serve
só pra leitura/inspeção assistida durante a conversa, não pra automação de deploy.

**Tirar o `read_only` só quando for de propósito** (ex.: aplicar uma migration nova direto): edita
a URL pra remover `read_only=true&`, faz a operação, bota de volta. Não deixar ligado por padrão.

Funcionalidades disponíveis (algumas desligadas por padrão, liga com `&features=...` na URL):
`database`, `debugging`, `development`, `docs`, `account`, `functions`, `branching` (experimental).
`storage` (Storage) vem **desligado por padrão** — se um dia quiser inspecionar o bucket `midia`
via MCP em vez de `supabase storage ls`, precisa adicionar `storage` na lista de features.

## Passo 3 — Cloudflare: atenção ao escopo

O servidor conectado (`mcp.cloudflare.com`) é o **"Cloudflare API MCP Server"** — dá acesso a
mais de 2500 endpoints da API deles (DNS, Workers, R2, Zero Trust, tudo), não só R2. Não existe
parâmetro de URL pra restringir só a R2 (diferente do Supabase, que tem `project_ref`/`features`)
— o único controle de escopo é a **tela de consentimento OAuth** durante o "Authenticate" do
Passo 1: revisar com atenção o que ela pede antes de aceitar.

Uso pretendido aqui: os passos manuais de `storage-r2.md` (criar bucket, configurar CORS, gerar
token S3-compatible) — em teoria o servidor cobre isso via API, mas não foi testado ponta a
ponta ainda nesta sessão (autenticação depende do seu navegador). Se algum passo não estiver
disponível pelo MCP na prática, o guia manual em `storage-r2.md` continua valendo como caminho
alternativo.

## Passo 4 — Context7 (sem passo obrigatório)

Já funciona depois do `.mcp.json` existir — primeira vez que uma pergunta precisar de doc de
lib, o Claude Code sobe `npx @upstash/context7-mcp` sozinho. Rate limit mais baixo sem conta; pra
mais volume, gerar uma chave em `context7.com/dashboard` e adicionar como header
`CONTEXT7_API_KEY` na configuração (não obrigatório, só se o rate limit incomodar).

## Verificação

- `claude /mcp` lista os três com status "connected" depois do Passo 1.
- Pergunta de teste pro Supabase: algo que exija ler o banco de verdade (ex.: "quantas fichas
  existem na tabela `characters_publico` hoje?") — se responder com um número real, funcionou.
- Pergunta de teste pro Context7: pedir a assinatura atual de uma função de uma lib do projeto
  (ex.: `AwsClient.sign` do `aws4fetch`) — se trouxer doc real em vez de "não tenho certeza",
  funcionou.
- Cloudflare: só confirma de verdade quando for usar de fato pro Passo 1 do `storage-r2.md`.
