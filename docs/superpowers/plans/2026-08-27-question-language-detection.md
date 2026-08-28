# Question Language Detection Implementation Plan

> **For agentic workers:** execute the tasks below sequentially in the current worktree. Subagent execution is intentionally disabled for this request.

**Goal:** Detect Portuguese or English from each user question, answer and fail safely in that language, improve English retrieval against a Portuguese source, and add compact bilingual search anchors to the canonical profile document.

**Architecture:** A small pure locale detector will compare unambiguous Portuguese and English markers and fall back to the interface locale for technical or ambiguous prompts. The chat route will resolve the question locale immediately after validation and use it consistently for deterministic answers, governance responses, retrieval, prompting, refusals, and response-cache identity. English retrieval expansion and bilingual Markdown headings will bridge English questions to Portuguese evidence without duplicating the profile.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, PostgreSQL FTS query expansion, Markdown.

## Global Constraints

- Preserve UTF-8 and Brazilian Portuguese characters.
- Do not add a language-detection dependency or an extra model call.
- Ambiguous questions such as `.NET?` must retain the interface locale.
- The canonical document remains primarily in Portuguese and gains only compact English headings and FAQ questions.
- Do not create a Git commit; leave the verified changes ready for the user's manual pipeline.

---

### Task 1: Pure question-locale detector

**Files:**
- Create: `lib/ai/question-locale.ts`
- Create: `lib/ai/question-locale.test.ts`

**Interfaces:**
- Consumes: `Locale` from `lib/i18n.ts` and a fallback interface locale.
- Produces: `resolveQuestionLocale(question: string, fallbackLocale: Locale): Locale`.

- [ ] Add failing tests for representative English, Portuguese, accentless Portuguese, technical-only, empty, and mixed questions.
- [ ] Run `npm test -- lib/ai/question-locale.test.ts` and confirm the missing module/function failure.
- [ ] Implement Unicode-safe normalization and marker scoring. Resolve only when one language has a strictly stronger signal; otherwise return the fallback locale.
- [ ] Run the focused test until it passes.

### Task 2: Chat route integration and cache revision

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/chat/route.test.ts`
- Modify: `lib/ai/cache.ts`

**Interfaces:**
- Consumes: `resolveQuestionLocale(question, interfaceLocale)` from Task 1.
- Produces: one request-scoped `locale` derived from the current question.

- [ ] Add a route test that sends an English question with `Accept-Language: pt-BR` and expects `language: 'en'` in retrieval.
- [ ] Assert that an English missing-evidence fallback is selected even when the interface header is Portuguese.
- [ ] Resolve `interfaceLocale` from the header, then resolve `locale` from `userQuestion` and use it in all existing localized branches.
- [ ] Change `CHAT_PROMPT_REVISION` to `portfolio-chat-v3-question-locale` so prior answers created under the interface-only policy are not reused.
- [ ] Run the focused route and cache tests.

### Task 3: Cross-language retrieval anchors

**Files:**
- Modify: `lib/rag.ts`
- Modify: `lib/rag.test.ts`

**Interfaces:**
- Consumes: English intent detected from the question.
- Produces: English expansion terms plus their Portuguese portfolio equivalents.

- [ ] Add tests proving English responsibility, payment, messaging, production, AI, database, quality, infrastructure, education, and interest questions generate Portuguese search anchors.
- [ ] Extend English expansion rules with compact Portuguese equivalents while retaining the original English terms.
- [ ] Run `npm test -- lib/rag.test.ts`.

### Task 4: Canonical document bilingual anchors

**Files:**
- Modify: `C:/Users/DanielTrindade/Downloads/resumo_profissional.md`

**Interfaces:**
- Consumes: existing Portuguese profile content.
- Produces: the same source with bilingual section/FAQ headings colocated with their answers.

- [ ] Translate the major section headings and every recruiter FAQ question using `Português / English` on one heading line.
- [ ] Translate responsibility, impact, AI-assisted engineering, technologies, and delivery subheadings where they improve retrieval.
- [ ] Keep all factual answer bodies in Portuguese to avoid duplicate evidence.
- [ ] Verify every English heading is adjacent to the Portuguese evidence it describes.

### Task 5: Verification

**Files:**
- Verify all files above.

**Interfaces:**
- Produces: deploy-ready source changes and an upload-ready canonical Markdown document.

- [ ] Run the focused Vitest suites.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build` if focused tests and lint pass.
- [ ] Read the Markdown as UTF-8, confirm no `U+FFFD`, and check the final word count remains compact.
- [ ] Review `git diff --check`, `git diff`, and `git status --short` without modifying unrelated files.
