# Observabilidade do chat

A observabilidade registra conversas, mensagens, latência, status, IP protegido e classificação de dispositivo. A captura permanece desabilitada até `CHAT_OBSERVABILITY_ENABLED=true`.

## Teste local completo

Pré-requisitos: Node.js 22+, dependências instaladas e Docker Desktop ativo.

~~~bash
npm run observability:local
~~~

Esse comando inicia uma pilha Supabase local mínima (Postgres, PostgREST, gateway e Auth para as credenciais locais), recria o banco usando todas as migrações, executa os testes pgTAP e o lint SQL, gera chaves efêmeras somente em memória e inicia a aplicação. Ele não altera o `.env.local`.

O monitor fica em [http://localhost:3000/admin/observability](http://localhost:3000/admin/observability), com a senha local `local-observability-admin-2026`. Em outro terminal, execute o teste ponta a ponta:

~~~bash
npm run observability:smoke
~~~

O smoke cria uma conversa com IP e dispositivo controlados, consulta lista e detalhe pelo painel administrativo, valida o mascaramento e exclui os dados criados. Para encerrar os contêineres:

~~~bash
npm run observability:local:stop
~~~

Para validar somente migrações, pgTAP e lint SQL, inclusive no CI:

~~~bash
npm run observability:local:test
~~~

## IP e proxies confiáveis

`CHAT_TRUSTED_PROXY_HOPS` informa quantas entradas controladas devem ser ignoradas a partir da direita de `X-Forwarded-For`. Em um Google External Application Load Balancer com o formato `<valor-existente>,<cliente>,<load-balancer>`, o valor esperado é `1`. Não presuma esse valor: confirme no serviço implantado com requisições controladas. Configuração ausente ou cadeia inválida produz `unknown`.

O IP é armazenado como HMAC para agrupamento e como envelope AES-256-GCM para revelação administrativa. O valor integral não aparece nos logs. O bootstrap gera duas chaves independentes de 32 bytes:

- `ask-me-chat-ip-hmac-key`;
- `ask-me-chat-ip-encryption-keys`, no formato `{"v1":"<base64>"}`.

`CHAT_IP_ENCRYPTION_KEYS_JSON` é um objeto versionado. Para rotacionar, acrescente a nova chave, altere `CHAT_IP_ACTIVE_KEY_VERSION` e mantenha a versão anterior somente durante a retenção máxima dos IPs.

## Deploy automático após merge

O workflow de CI executa as migrações em um banco local descartável antes de permitir o deploy. Após merge em `main`, quando `GCP_DEPLOY_ENABLED=true`, ele:

1. aplica as migrações no Supabase de produção;
2. executa o preflight de APIs, contas de serviço e versões dos segredos;
3. constrói uma imagem imutável pelo SHA;
4. cria e testa uma revisão candidata sem tráfego;
5. promove a revisão ou restaura automaticamente a anterior;
6. cria ou atualiza o Cloud Run Job e o Cloud Scheduler de retenção.

O bootstrap de GCP é idempotente e deve ser executado uma vez por um administrador:

~~~bash
GCP_PROJECT_ID=ask-me-rag \
GITHUB_REPOSITORY=DanielTrindade/ask-me-rag \
bash scripts/bootstrap-gcp-cicd.sh
~~~

Ele habilita as APIs, cria as identidades do runtime, build, job e scheduler, configura o OIDC, cria os recursos de segredo e gera somente as chaves de IP. Os segredos `google-generative-ai-api-key`, `supabase-service-role-key` e `admin-password` continuam exigindo uma versão cadastrada pelo administrador.

No environment `production` do GitHub, configure também:

- `CHAT_OBSERVABILITY_ENABLED=false`;
- `CHAT_TRUSTED_PROXY_HOPS=unset`;
- `DEPLOY_OBSERVABILITY_RETENTION=true`.

Mantenha a captura desabilitada no primeiro deploy. Depois de confirmar a topologia real, altere `CHAT_TRUSTED_PROXY_HOPS` para o número verificado e habilite a captura em um novo deploy.

## Retenção

- IP criptografado: 7 dias por padrão.
- Conversas, mensagens, execuções e hash do IP: 30 dias.
- Auditoria administrativa: 90 dias.

O mesmo contêiner executa `scripts/chat-observability-retention.mjs` diariamente, às `03:15 America/Manaus`. O job chama somente `purge_chat_telemetry` e registra contagens e duração — nunca conteúdo, IP ou segredos.

Verificação manual:

~~~bash
gcloud run jobs execute ask-me-chat-retention \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --wait

gcloud run jobs executions list \
  --job=ask-me-chat-retention \
  --project="$PROJECT_ID" \
  --region="$REGION"

gcloud scheduler jobs run ask-me-chat-retention-daily \
  --project="$PROJECT_ID" \
  --location="$REGION"
~~~

## Ordem segura de rollout

1. Executar o bootstrap e cadastrar as versões dos segredos da aplicação.
2. Fazer o primeiro deploy com `CHAT_OBSERVABILITY_ENABLED=false`.
3. Executar manualmente o job de retenção e verificar sua execução.
4. Validar o IP com tráfego controlado no caminho real do Cloud Run.
5. Configurar o número confirmado de proxies e habilitar `CHAT_OBSERVABILITY_ENABLED=true`.
6. Acompanhar `begin_failed`, `finish_failed`, latência do chat e saúde da retenção no monitor.
7. Em rollback, voltar a flag para `false`; os dados existentes continuam sujeitos à retenção e podem ser excluídos pelo painel.

## Limitações de atribuição

IP e classificação de dispositivo são sinais técnicos, não identidade garantida. NAT, VPN, proxies, redes corporativas e User-Agent reduzido podem agrupar pessoas distintas ou mudar a classificação. O monitor deve apoiar investigação operacional, nunca decisões automáticas sobre uma pessoa.
