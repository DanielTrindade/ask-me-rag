# Custos no GCP (cota gratuita)

O projeto roda dentro da cota gratuita permanente do Google Cloud. Ela **exige faturamento ativo** (conta com forma de pagamento): sem faturamento o Cloud Run recusa todas as requisições com `The request failed because billing is disabled for this project`.

Limites gratuitos por mês, conferidos em https://docs.cloud.google.com/free/docs/free-cloud-features (2026-09-25):

| Serviço | Grátis/mês | Como o projeto fica dentro |
|---|---|---|
| Cloud Run | 2 mi de requisições, 180 mil vCPU·s, 360 mil GiB·s (cobrança por requisição) | `--min-instances=0 --max-instances=3 --cpu-throttling` no deploy (`scripts/deploy-cloud-run.sh`) |
| Cloud Build | 2.500 min **só em `e2-standard-2`** | `cloudbuild.yaml` sem `machineType` (antes `E2_HIGHCPU_8`, cobrado por minuto) |
| Artifact Registry | 0,5 GB | política `scripts/artifact-cleanup-policy.json`: mantém a tag `production` e as 5 imagens mais recentes; apaga o resto após 7 dias |
| Secret Manager | 6 versões ativas, 10 mil acessos | uma versão ativa por secret em uso; versões antigas e secrets legados destruídos |
| Cloud Storage (staging do build) | 5 GB só em buckets regionais `us-*` | bucket `ask-me-rag_cloudbuild` é multi-região `US`: regra de ciclo de vida apaga tarballs com mais de 7 dias |
| Cloud Logging | 50 GiB | uso baixo |

## Tag `production`

O deploy marca a imagem promovida com a tag `production` (`gcloud artifacts docker tags add`). A política de limpeza nunca apaga essa tag. Sem isso, várias candidatas não promovidas poderiam tirar a imagem em produção das 5 mais recentes, e o Cloud Run deixaria de conseguir subir instâncias novas.

## Alerta de orçamento

Orçamento "ask-me-rag free tier guard" de R$ 10/mês na conta de faturamento, com e-mail aos administradores em 50%, 90% e 100%. Ele só avisa, não desliga nada.

```bash
gcloud billing budgets list --billing-account <ID>
```

## Higiene de secrets

Cada `gcloud secrets versions add` cria uma versão ativa. Ao trocar uma chave, destrua a antiga depois de confirmar que a nova funciona:

```bash
gcloud secrets versions destroy <versão> --secret <nome> --project ask-me-rag
```

## Reaplicar as políticas

`scripts/bootstrap-gcp-cicd.sh` aplica a política de limpeza de imagens e o ciclo de vida do bucket. Para aplicar só elas:

```bash
gcloud artifacts repositories set-cleanup-policies ask-me-rag --location us-central1 \
  --policy scripts/artifact-cleanup-policy.json --no-dry-run
gcloud storage buckets update gs://ask-me-rag_cloudbuild \
  --lifecycle-file scripts/cloudbuild-staging-lifecycle.json
```
