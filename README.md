# Mesa de Estática

Painel de controle do mestre para o RPG **Estática** — ficha viva, motor de regras, dados 3D físicos, mapa com tokens. A tela do mestre é compartilhada por screen share no Discord; os jogadores abrem um app reduzido (`jogador.html`) pelo próprio link.

> *A Estática é o mundo parado. O Ruído é o que se move por baixo.*

O estado vive no navegador (localStorage). A sincronização com os jogadores usa Supabase e é **opcional**: sem as env vars, o app roda 100% local, sem multiplayer.

Publicado em **https://estatica-stc.pages.dev** (Cloudflare Pages, deploy automático a cada push em `main`). O inventário completo do que está conectado fora do repositório — GitHub, Cloudflare Pages/R2, os dois projetos Supabase, Freesound, Groq/OpenRouter — está em [infraestrutura.md](.claude/docs/infraestrutura.md).

## Rodando numa máquina nova

**Pré-requisitos**: [Node.js LTS](https://nodejs.org) (Windows: `winget install OpenJS.NodeJS.LTS`) e um navegador com WebGL.

```bash
git clone <repo>
cd "RPG Estatica"
npm install        # postinstall copia os assets 3D dos dados
npm run dev        # http://localhost:5173
```

Se os dados 3D não aparecerem (`public/assets/dice-box-threejs/` vazia), rode `npm run setup`.

Para multiplayer, copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.

## Abas e atalhos

`1` Sessão · `2` Personagens · `3` Dados & Regras · `4` Mapa · `5` NPCs & Iniciativa · `6` Pistas (GM-only) · `7` Log · `8` Mídia

| Tecla | Ação |
|---|---|
| `1`–`8` | troca de aba |
| `R` / `X` | abre a rolagem rápida e rola / fecha |
| `C` | abre a janela de controle secreta |
| espaço ou `N` | próximo turno (em combate) |

Ignorados enquanto o foco está num campo de texto.

## Transferindo o estado da mesa

O estado **não** viaja com o git: exporte pelo botão **exportar** (JSON), leve o arquivo, importe na máquina nova. Faça isso antes de cada sessão — confie no papel, não na nuvem.

## Janela de controle secreta

Clique no título "Estática — Mesa" (ou tecle `C`) para abrir a janela `#controle`, com a fila de rolagem forçada. O padrão é honesto; valores enfileirados aqui fazem o dado cair no resultado escolhido, indistinguível na tela. Mantenha **fora** da janela compartilhada no Discord.

## Sistema de ruído

A Sanidade da ficha ativa controla uma camada visual global: tier 0 limpo (>75%), 1 interferência (50–75%), 2 ruído (25–50%), 3 colapso (≤25%). Surto dispara um burst de 1,5s que decai para o tier atual.

## Comandos

`npm run dev` · `build` · `preview` · `setup` (recopia assets 3D) · `test` · `test:watch`

## Documentação

[ROADMAP.md](ROADMAP.md) · [regras](.claude/docs/regras.md) (fonte da verdade) · [ficha](.claude/docs/ficha.md) · [arquitetura](.claude/docs/arquitetura.md) · [arte](.claude/docs/arte.md) · [infraestrutura](.claude/docs/infraestrutura.md) (o que está conectado fora do repo) · [deploy](.claude/docs/deploy.md)

O checklist do dia da sessão está no [ROADMAP.md](ROADMAP.md).
