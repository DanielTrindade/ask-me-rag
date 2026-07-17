# Identidades do CI/CD

O bootstrap idempotente está em `scripts/bootstrap-gcp-cicd.sh`. Ele configura Workload Identity Federation restrita ao repositório `DanielTrindade/ask-me-rag` e à referência `refs/heads/main`; nenhuma conta usa chave JSON.

## Estado desejado

| Identidade | Responsabilidade | Acessos principais |
| --- | --- | --- |
| `github-deploy@…` | Trocar o OIDC do GitHub por credencial temporária, executar preflight e enviar builds | criar builds, ler metadados de Run, IAM, APIs, imagens e segredos, gravar no bucket de staging e atuar como `cloudbuild-deploy@…` |
| `cloudbuild-deploy@…` | Construir, publicar, implantar e promover revisões e jobs | Artifact Registry writer, Cloud Run admin, Cloud Scheduler admin, logs e atuação como as identidades de runtime |
| `ask-me-rag-sa@…` | Executar a aplicação | acessar somente os segredos da aplicação e das chaves de IP |
| `ask-me-retention-job@…` | Executar a limpeza diária | acessar somente `supabase-service-role-key` |
| `ask-me-retention-scheduler@…` | Disparar o job pela API do Cloud Run | `roles/run.invoker` somente no job de retenção |

O bootstrap cria os recursos de segredo caso não existam e gera automaticamente somente:

- `ask-me-chat-ip-hmac-key`;
- `ask-me-chat-ip-encryption-keys`.

Os segredos `google-generative-ai-api-key`, `supabase-service-role-key` e `admin-password` exigem uma versão fornecida por um administrador. Os valores nunca são exibidos pelo bootstrap.

Após o primeiro deploy automatizado ser comprovado, remova `roles/editor` da conta padrão de Compute Engine e os papéis de deploy da conta legada do Cloud Build. Essa remoção é deliberadamente separada do bootstrap para preservar o rollback durante a adoção.
