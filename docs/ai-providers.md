# Providers de IA

## Arquitetura desta fase

O chat usa exclusivamente Groq pelo adapter `@ai-sdk/groq` 3.x, compatível com o AI SDK 6 e seus contratos Provider V3. O modelo padrão é `openai/gpt-oss-20b`; `openai/gpt-oss-120b` pode ser selecionado por `CHAT_LLM_MODEL` quando a qualidade adicional justificar maior latência e custo.

O Groq não fornece embeddings. Para preservar o índice vetorial existente, os embeddings continuam em `gemini-embedding-001`, com 1536 dimensões, usando Google AI Studio por padrão ou Vertex AI opcionalmente. Trocar modelo ou dimensão exige reingerir todos os documentos.

O fluxo RAG completo precisa de duas credenciais independentes:

- `GROQ_API_KEY` para gerar a resposta;
- `GOOGLE_GENERATIVE_AI_API_KEY` para gerar embeddings quando `EMBEDDING_PROVIDER=google`.

## Configuração local mínima

```dotenv
CHAT_LLM_PROVIDER=groq
CHAT_LLM_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=gsk_...

EMBEDDING_PROVIDER=google
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSION=1536
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Após preencher também as variáveis do Supabase, execute `npm run dev`. O health check valida apenas a presença e a consistência da configuração; ele não chama modelos e não consome tokens.

## Embeddings opcionais com Vertex AI

O adapter Vertex usa exclusivamente Application Default Credentials (ADC). A aplicação fornece apenas projeto e localização e rejeita API key do Vertex, chave privada ou caminho de arquivo JSON.

Em desenvolvimento local:

```sh
gcloud auth application-default login
```

Configure `EMBEDDING_PROVIDER=vertex` e use `EMBEDDING_VERTEX_PROJECT`/`EMBEDDING_VERTEX_LOCATION` ou os fallbacks compartilhados `GOOGLE_VERTEX_PROJECT`/`GOOGLE_VERTEX_LOCATION`. No Cloud Run, a service account de runtime precisa de `roles/aiplatform.user`.

O script `scripts/smoke-vertex.mjs` verifica somente o embedding e sua dimensão. O Vertex não é um provider de chat suportado.

## Produção

O Secret Manager usa `groq-api-key` para o chat e `google-generative-ai-api-key` para embeddings Google. `scripts/fill-secrets.sh` valida as chaves por status HTTP sem imprimir seus valores; `scripts/preflight-deploy.sh` exige versões habilitadas antes do deploy.

O Cloud Run recebe `CHAT_LLM_PROVIDER=groq` e vincula `GROQ_API_KEY=groq-api-key:latest`. A revisão candidata é validada sem tráfego antes de qualquer promoção.
