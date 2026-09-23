# AGENTS.md

Guia para agentes de código neste repo. Fonte única das regras: Codex e opencode leem este arquivo; o Claude Code importa via `.claude/CLAUDE.md`.

## Projeto

ask-me-rag: chat RAG sobre o portfólio profissional do Daniel (ask.danieltrindade.dev).

- Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres FTS), Groq via AI SDK.
- Deploy: Cloud Run (`cloudbuild.yaml`); migrações em `supabase/migrations/`.
- Docs de operação: `docs/`.
- PR: base em `.github/pull_request_template.md`; commits no padrão conventional.

## Comandos

- `npm run dev` · `npm run lint` · `npm test` · `npm run build`

## GitHub

- Sempre use a conta `DanielTrindade` em comandos `gh`: `gh auth switch --user DanielTrindade` (a conta `DanielTrindadeKodigos` nao tem permissao neste repo).

<!-- agent-workflow:start -->
## Fluxo de trabalho

1. **Planejar sempre.** Antes de editar, proponha um plano curto. Se a tarefa for grande (muitos arquivos ou frentes independentes), sugira subagents e pergunte antes de executar.
2. **Tarefa grande**: crie `docs/tasks/<slug>.md` (status `[ ]` / `[~]` / `[x]`) e mantenha atualizado.
3. **Antes do PR**: crie `docs/changes/<slug>.md` com o texto da PR (base: `.github/pull_request_template.md`, se existir) e abra com `gh pr create --body-file docs/changes/<slug>.md`.
4. **Depois do PR**: rode o cleanup (`node ~/.agents/workflow/hooks/workflow-guard.mjs cleanup`) e confirme que `docs/tasks` e `docs/changes` foram removidos.
5. `docs/tasks/` e `docs/changes/` sao artefatos locais: nunca commite, nunca inclua em commits.
6. Tarefa trivial (1 arquivo/typo) nao precisa de artefatos: branch + PR direto.
7. Branch no padrao `<tipo>/<slug>`; `<slug>` = branch sem o prefixo (`feat/login-social` -> `login-social`).

Os hooks dos agentes bloqueiam `gh pr create` sem o changes file e avisam sobre tasks abertas e cleanup pendente.
<!-- agent-workflow:end -->
