# Ativação da observabilidade em produção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ativar a observabilidade do chat com retenção funcional e promover o commit `5419177af75932580ba6f2cd283b544fa6576778` para `ask.danieltrindade.dev` com rollback seguro.

**Architecture:** A mesma imagem imutável atende o serviço web e o Cloud Run Job de retenção. A imagem precisa conter as dependências Node usadas pelo script fora do grafo standalone do Next.js; depois, uma revisão sem tráfego recebe as variáveis de observabilidade, passa por smoke ponta a ponta e só então recebe tráfego do domínio público.

**Tech Stack:** Docker multi-stage, Next.js 16 standalone, Node.js 22, Supabase JS, Cloud Build, Cloud Run service/job, Cloud Scheduler e GitHub Actions.

## Global Constraints

- Preservar UTF-8 e textos existentes.
- Não expor segredos, IP integral ou conteúdo de conversa em logs.
- Não direcionar tráfego público antes de o smoke de observabilidade e o job de retenção passarem.
- Manter a revisão atualmente estável disponível para rollback.
- Não incluir alterações não relacionadas no commit operacional.

---

### Task 1: Tornar a imagem compatível com o job de retenção

**Files:**
- Modify: `Dockerfile`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/chat-observability-retention.mjs`, que importa `@supabase/supabase-js` por nome de pacote.
- Produces: imagem final em que `import('@supabase/supabase-js')` funciona fora do bundle standalone.

- [ ] **Step 1: Adicionar dependências de produção à imagem final**

Criar um estágio derivado de `deps` e remover dependências de desenvolvimento:

```dockerfile
FROM deps AS prod-deps
RUN npm prune --omit=dev
```

Copiar `/app/node_modules` de `prod-deps` para `/app/node_modules` no estágio `runner`, mantendo o usuário `nextjs` como proprietário.

- [ ] **Step 2: Adicionar smoke da dependência no CI**

Depois de `docker build --tag ask-me-rag:ci .`, executar:

```bash
docker run --rm --entrypoint node ask-me-rag:ci \
  -e "import('@supabase/supabase-js').then(() => console.log('retention dependency ok'))"
```

- [ ] **Step 3: Verificar o patch localmente**

Run: `npm test -- scripts/chat-observability-retention.test.ts scripts/deploy-cloud-run.test.ts`

Expected: todos os testes passam.

- [ ] **Step 4: Commitar e publicar a correção**

```bash
git add Dockerfile .github/workflows/ci.yml docs/superpowers/plans/2026-08-27-activate-production-observability.md
git commit -m "fix: package retention runtime dependencies"
git push origin main
```

### Task 2: Implantar e validar observabilidade sem tráfego público

**Files:**
- Existing: `.github/workflows/ci.yml`
- Existing: `scripts/deploy-cloud-run.sh`
- Existing: `scripts/local-observability-smoke.mjs`

**Interfaces:**
- Consumes: imagem imutável gerada pelo SHA do commit e segredos já presentes no Secret Manager.
- Produces: revisão candidata com `CHAT_OBSERVABILITY_ENABLED=true` e `CHAT_TRUSTED_PROXY_HOPS=1` em 0% do tráfego.

- [ ] **Step 1: Atualizar as variáveis do environment `production`**

```bash
gh variable set CHAT_OBSERVABILITY_ENABLED --env production --body true
gh variable set CHAT_TRUSTED_PROXY_HOPS --env production --body 1
gh variable set DEPLOY_OBSERVABILITY_RETENTION --env production --body true
```

- [ ] **Step 2: Aguardar CI e identificar a URL candidata**

Run: `gh run watch --exit-status`

Expected: jobs `quality`, `database` e `deploy` aprovados, com revisão candidata em 0%.

- [ ] **Step 3: Executar o job de retenção manualmente**

```bash
gcloud run jobs execute ask-me-chat-retention \
  --project=ask-me-rag \
  --region=us-central1 \
  --wait
```

Expected: execução concluída com sucesso e evento `chat_observability_retention_completed` sem dados sensíveis.

- [ ] **Step 4: Executar o smoke ponta a ponta na candidata**

```powershell
$env:OBSERVABILITY_SMOKE_URL='https://URL-DA-CANDIDATA'
$env:ADMIN_PASSWORD='<valor do segredo admin-password>'
npm run observability:smoke
```

Expected: captura, IP protegido, dispositivo, consulta, detalhe e exclusão aprovados.

### Task 3: Promover para o domínio principal e confirmar rollback

**Files:**
- Existing: `.github/workflows/deploy.yml`
- Existing: `scripts/deploy-cloud-run.sh`

**Interfaces:**
- Consumes: SHA validado da Task 2.
- Produces: revisão validada atendendo `ask.danieltrindade.dev` e revisão anterior preservada.

- [ ] **Step 1: Promover 5% pelo workflow `Roll out production image`**

Usar `git_sha` completo, `governance_mode=shadow` e `traffic_percent=5`.

- [ ] **Step 2: Validar domínio e painel**

Run: `curl --fail --silent --show-error https://ask.danieltrindade.dev/api/health`

Expected: `{"status":"ok"}` e novas conversas aparecem em `/admin/observability`.

- [ ] **Step 3: Promover para 100%**

Executar novamente `Roll out production image` com o mesmo `git_sha`, `governance_mode=shadow` e `traffic_percent=100`.

- [ ] **Step 4: Confirmar o tráfego**

```bash
gcloud run services describe ask-me-rag \
  --project=ask-me-rag \
  --region=us-central1 \
  --format='table(status.traffic.revisionName,status.traffic.percent,status.traffic.tag)'
```

Expected: 100% na revisão do SHA validado; `ask.danieltrindade.dev/api/health` permanece 200.

- [ ] **Step 5: Registrar o rollback operacional**

Se o smoke público falhar, restaurar a revisão estável anterior para 100%; para interromper apenas a coleta, definir `CHAT_OBSERVABILITY_ENABLED=false` e criar nova revisão sem alterar ou excluir dados já sujeitos à retenção.
