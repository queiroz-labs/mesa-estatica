# Mesa de Estática — painel de mestre

Painel de mestre do RPG "Estática" (investigação/horror, São Paulo distópica, d20 + atributo + perícia). Tela do mestre compartilhada por screen share no Discord + app reduzido do jogador (`jogador.html`). Estado local em localStorage (Zustand persist) com export JSON, mais sync opcional via Supabase. Publicado no Cloudflare Pages (migrado do GitHub Pages, ver `.claude/docs/storage-r2.md` Parte 3).

## Documentos de referência (Grep pela seção — nunca ler o arquivo inteiro)

- [.claude/docs/regras.md](.claude/docs/regras.md) — **fonte da verdade das regras.** Se o código divergir, o código está errado. Não inventar regra.
- [.claude/docs/ficha.md](.claude/docs/ficha.md) — spec campo a campo da ficha (**15 perícias**, incluindo Erudição).
- [.claude/docs/arte.md](.claude/docs/arte.md) — design tokens, tipografia, sistema de ruído, microcopy, os 3 clichês proibidos.
- [.claude/docs/arquitetura.md](.claude/docs/arquitetura.md) — stack e decisões fechadas.
- [mesa-estatica-multiplayer-completo.md](mesa-estatica-multiplayer-completo.md) — spec do multiplayer (Supabase, RLS, Edge Functions); comentários no código citam suas seções (§11, Parte IV…).
- [.claude/docs/storage-r2.md](.claude/docs/storage-r2.md) — guia operacional de mídia: Cloudflare R2 (egress), Freesound (soundpad), migração do site pro Cloudflare Pages.
- [.claude/docs/infraestrutura.md](.claude/docs/infraestrutura.md) — **mapa das conexões externas** (GitHub, Cloudflare Pages/R2, os dois projetos Supabase, Freesound, Groq/OpenRouter, MCP): identificadores, tabelas/functions, onde cada secret vive e o que dá pra verificar de fora. Ponto de partida de qualquer auditoria.
- [.claude/docs/mcp-servers.md](.claude/docs/mcp-servers.md) — setup dos MCP servers conectados (Supabase, Cloudflare, Context7) — ferramenta do Claude Code, não arquitetura do app.
- [.claude/docs/deploy.md](.claude/docs/deploy.md) — **ler antes de rodar `supabase db push`/`functions deploy`/`secrets set`.** Frontend sobe sozinho no push pra `main`; migração/function não — exige comando manual contra o projeto certo (dev `mjzgkszckwcnbzrltrww` vs produção `ahhzgxcafoaodetwkyti`).
- [ROADMAP.md](ROADMAP.md) — o que já foi feito e o que vem a seguir.

## Stack

Vite 8 + React 18 + TS + Zustand(persist) · `@3d-dice/dice-box-threejs` nos dados 3D · Three.js nos tokens · @fontsource self-host · `docx` no export de ficha · Supabase (Realtime + Edge Functions) opcional. Porquê de cada escolha: `arquitetura.md`.

`npm run dev` · `build` · `preview` · `test` (vitest) · `test:watch`. CI: push em `main` → build + test → deploy no Cloudflare Pages (`.github/workflows/deploy.yml`) — **só o frontend**; migração/Edge Function não sobem sozinhas, ver `deploy.md`.

**Ambiente de dev isolado** (desde 27/08, ver `deploy.md`): `.env.development.local` (fora do git) aponta `npm run dev` pro projeto Supabase de dev (`mjzgkszckwcnbzrltrww`) + bucket R2 próprio — produção (`ahhzgxcafoaodetwkyti`) fica intocada mesmo testando com o multiplayer ligado. `iniciar-mestre.bat`/`iniciar-jogador.bat` (raiz) sobem o servidor (reiniciando se já tiver um rodando) e abrem a tela certa — atalho pro usuário, não é parte do app.

## Convenções

- `src/rules/` é TS puro (sem React/Three) e espelha `regras.md`; **toda regra nova ganha teste**. `src/rules/data/` guarda as tabelas tipadas do jogo.
- `src/state/store.ts` = Zustand + persist + migrations (regra de `SCHEMA_VERSION`: `arquitetura.md`).
- **Rolagem é honesta por padrão** — exceção deliberada só pela janela secreta `#controle` (`src/dice/forcarRolagem.ts`), **nunca exposta na janela compartilhada**. Mecanismo completo: `arquitetura.md`.
- `src/features/` = uma pasta por aba. Abas usam `visibility`/`pointer-events`, não render condicional (por quê: `arquitetura.md`).
- Bundle do jogador (`jogador.html` → `PlayerApp.tsx`) nunca importa código exclusivo de mestre — o sigilo depende disso.
- `src/hooks/useIniciativa.ts` + `features/iniciativa/IniciativaPanel.tsx` centralizam iniciativa/combate (usados por `CombatOverlay` e `NpcsTab`).
- Ruído visual global: tiers 0–3 via `data-ruido` no `<html>` (`features/ruido/RuidoOverlay.tsx`), CSS puro, dirigido pela Sanidade da ficha ativa.
- UI em pt-BR seguindo a microcopy de `arte.md`: sem exclamação, sem emoji, log em minúsculas mono.
- Assets/libs 100% locais (sem CDN em runtime). Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` o app roda 100% local, sem multiplayer.
- **Portabilidade é requisito**: esta máquina de dev NÃO é a da sessão. Tudo tem que funcionar num clone limpo com `npm install && npm run dev`. Nunca versionar caminho absoluto; estado migra por export/import JSON. Antes de fechar um item do roadmap: "isso funcionaria num clone limpo?"

## Economia de tokens (pedido do usuário — sessões devem ser baratas)

- **Docs por trecho**: Grep pela seção, nunca o arquivo inteiro. ROADMAP: `grep "^## "` e ler só a seção relevante (histórico concluído está comprimido de propósito; detalhe fica no `git log`).
- **Vitest antes de navegador**: lógica valida com `npm test` (barato). Navegador só pro visual/interativo, **uma rodada por feature** — não por edit.
- **No navegador**: `read_console_messages(onlyErrors)` e `get_page_text`/`find` antes de `read_page` (a árvore repete as 15 perícias em cada select — cara). Screenshot só quando a confirmação precisa ser visual.
- **HMR conhecido**: "Invalid hook call"/"change in the order of Hooks" em aba antiga depois de editar hook NÃO é bug — abrir UMA aba nova e seguir, não investigar.
- **Escrita enxuta**: commits e entradas de ROADMAP em 1–3 frases (o quê + por quê); o detalhe fica no diff.
