## Why

O projeto valida os merges em `main`, mas o deploy real no Cloud Run continua desacoplado do CI: o workflow de produção aponta para Vercel, permanece desabilitado e os builds no Google Cloud são disparados manualmente com imagens `latest`. Isso aumenta o trabalho operacional, dificulta saber qual commit está em produção e permite que uma falha seja percebida somente depois que a nova revisão já recebeu tráfego.

## What Changes

- Substituir o workflow de deploy da Vercel por uma entrega contínua do commit validado de `main` ao Google Cloud Run.
- Ampliar os gates de pull request com build do container, validação dos workflows e auditoria bloqueante para vulnerabilidades de produção altas/críticas.
- Autenticar o GitHub Actions no Google Cloud por Workload Identity Federation, sem armazenar chave JSON de longa duração.
- Construir uma única imagem por commit, identificada pelo SHA imutável, publicá-la no Artifact Registry e promover exatamente esse artefato.
- Implantar a nova revisão inicialmente sem tráfego, executar smoke tests determinísticos e somente então promover 100% do tráfego.
- Reverter automaticamente o tráfego para a revisão estável quando a validação da nova revisão falhar.
- Automatizar migrações idempotentes do Supabase com validação anterior ao deploy e serialização dos deploys de produção.
- Adicionar um endpoint de saúde que valide apenas a prontidão da aplicação e de suas dependências essenciais, sem consumir uma chamada de LLM.
- Manter um acionamento manual de emergência que permita promover novamente um SHA conhecido, sem reconstruir a imagem.
- Tornar configuração, permissões, pré-requisitos, observabilidade e procedimento de rollback reproduzíveis e documentados.

## Capabilities

### New Capabilities

- `continuous-cloud-run-delivery`: entrega automática ao Cloud Run, iniciada somente para o commit de `main` que concluiu as validações obrigatórias.
- `safe-production-promotion`: implantação sem tráfego, smoke test, promoção atômica, serialização e rollback automático da revisão.
- `automated-database-migrations`: aplicação não interativa, idempotente e auditável das migrações do Supabase antes da promoção da aplicação.
- `deployment-health-verification`: verificação determinística de saúde e prontidão usada pela esteira e pela operação.

### Modified Capabilities

Nenhuma. O repositório ainda não possui especificações OpenSpec principais; esta mudança introduz os primeiros contratos de entrega e operação.

## Impact

- Workflows em `.github/workflows/`, especialmente `ci.yml` e o atual `deploy.yml`.
- Pipeline `cloudbuild.yaml`, estratégia de tags no Artifact Registry e configuração de revisão/tráfego do Cloud Run.
- Scripts em `scripts/`, configuração do Supabase e processo de migração.
- Nova rota HTTP de saúde na aplicação Next.js e seus testes.
- IAM no Google Cloud: Workload Identity Pool/Provider, conta de serviço de deploy e permissões mínimas para Cloud Build, Artifact Registry, Cloud Run e Secret Manager.
- Configurações de ambiente do GitHub e documentação operacional no `README.md`.
- Nenhuma alteração funcional esperada no chat, na administração de documentos ou no formato dos dados existentes.
