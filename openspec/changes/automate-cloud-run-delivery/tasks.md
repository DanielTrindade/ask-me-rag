## 1. Preparar guardas de saúde e regressão

- [x] 1.1 Implementar `GET /api/health` com validação de configuração, consulta mínima ao Supabase, timeout, resposta não sensível e `Cache-Control: no-store`.
- [x] 1.2 Adicionar testes unitários do endpoint para prontidão, configuração ausente, indisponibilidade e timeout do Supabase.
- [x] 1.3 Criar um script de smoke test com timeout, tentativas limitadas, backoff e saída sem dados sensíveis.
- [x] 1.4 Adicionar ao CI validação da configuração dos workflows e execução dos testes do endpoint/script.
- [x] 1.5 Adicionar build do Dockerfile sem push e auditoria bloqueante para vulnerabilidades de produção altas/críticas, reportando as moderadas atuais.

## 2. Tornar as migrações reproduzíveis e seguras

- [ ] 2.1 Comparar `supabase/schema.sql`, as migrações versionadas e o schema remoto para identificar lacunas de linha de base.
- [x] 2.2 Criar migração de linha de base idempotente que permita preparar um banco vazio sem SQL manual no painel.
- [x] 2.3 Atualizar o script de migração para modo não interativo, sem login/link persistente e com credenciais somente por ambiente.
- [ ] 2.4 Validar a sequência completa em uma instância descartável e validar o plano contra produção sem mutação destrutiva.
- [x] 2.5 Documentar e adicionar ao checklist de revisão a política expand/contract para mudanças incompatíveis.

## 3. Preparar identidade e privilégios mínimos

- [x] 3.1 Inventariar os papéis efetivamente necessários para disparo do build, build/deploy e runtime.
- [x] 3.2 Criar ou ajustar contas distintas para GitHub, Cloud Build/deploy e runtime, removendo o uso da conta padrão de Compute Engine.
- [x] 3.3 Configurar Workload Identity Pool/Provider com condição restrita ao repositório e à branch `main`.
- [ ] 3.4 Configurar variáveis e segredos no environment `production` e comprovar que autenticação fora da condição é recusada.
- [x] 3.5 Adicionar preflight somente leitura para verificar APIs, recursos, permissões e presença das referências de segredos antes do deploy.

## 4. Construir artefatos imutáveis

- [x] 4.1 Alterar `cloudbuild.yaml` para exigir SHA completo, construir uma vez e publicar a imagem com tag por commit.
- [x] 4.2 Resolver e registrar o digest da imagem e adicionar labels de commit, repositório e build à revisão.
- [x] 4.3 Remover `latest` como entrada de deploy e, se mantido, atualizá-lo somente após promoção bem-sucedida como alias informativo.
- [x] 4.4 Configurar o Cloud Build para usar a conta dedicada e confirmar permissões mínimas no Artifact Registry, Cloud Run e Secret Manager.

## 5. Implementar promoção segura e rollback

- [x] 5.1 Criar o script de entrega que captura a revisão estável atual e implanta a candidata por digest com tag exclusiva e sem tráfego.
- [x] 5.2 Aguardar Ready e executar o smoke test na URL da candidata antes de qualquer alteração de tráfego.
- [x] 5.3 Promover 100% do tráfego, verificar a URL pública e restaurar a revisão capturada se a verificação falhar.
- [x] 5.4 Garantir que falhas de preflight, migração, build ou candidata preservem integralmente o tráfego existente.
- [x] 5.5 Adicionar testes do script com comandos Google simulados para sucesso, falha pré-promoção e rollback pós-promoção.

## 6. Conectar a entrega ao GitHub Actions

- [x] 6.1 Substituir o workflow de hook da Vercel por um job de Cloud Run dependente de `Quality` e restrito a push em `main`.
- [x] 6.2 Autenticar com OIDC/Workload Identity Federation, fixar actions de terceiros em SHA e conceder somente `contents: read` e `id-token: write` ao job.
- [x] 6.3 Serializar o environment de produção e abortar antes da promoção se o SHA não for mais o HEAD de `main`.
- [x] 6.4 Adicionar `workflow_dispatch` para promover uma imagem existente por SHA usando o mesmo fluxo seguro, sem rebuild.
- [x] 6.5 Configurar Dependabot para atualizações semanais das GitHub Actions fixadas.

## 7. Ensaiar, ativar e documentar

- [x] 7.1 Executar localmente lint, testes, build e validação do container com variáveis não secretas equivalentes às do CI.
- [ ] 7.2 Ensaiar manualmente o pipeline com o SHA já em produção e comprovar rastreabilidade, ausência de tráfego na candidata e promoção correta.
- [ ] 7.3 Forçar uma falha controlada antes da promoção e outra após a promoção para comprovar preservação/rollback do tráfego.
- [ ] 7.4 Ativar o deploy automático de `main`, observar o primeiro merge e confirmar commit, digest, revisão e endpoint público.
- [x] 7.5 Atualizar o README com bootstrap único, fluxo normal, migrações, promoção manual, rollback, troubleshooting e responsabilidades de cada conta.
- [x] 7.6 Remover referências operacionais à Vercel e aos passos manuais substituídos, preservando apenas o procedimento de emergência por SHA.
