# Providers de IA

## Decisão de dependência

O projeto usa AI SDK 6. O adapter opcional do Vertex AI fica fixado em `@ai-sdk/google-vertex` 4.x, compatível com `@ai-sdk/provider` 3.x. A linha 5.x foi descartada porque usa os contratos V4, incompatíveis com a versão atual do AI SDK.

O Google AI Studio continua sendo o provider `free-first` padrão. O Vertex AI só é selecionado explicitamente por variável de ambiente, de forma independente para chat e embeddings.

## Autenticação Vertex

O adapter Node.js usa exclusivamente Application Default Credentials (ADC). A aplicação fornece ao SDK apenas projeto e localização; não aceita API key do Vertex, e-mail ou chave privada de service account, nem caminho de arquivo JSON de credenciais.

Em desenvolvimento local, autentique o operador com:

```sh
gcloud auth application-default login
```

No Cloud Run, associe uma service account dedicada com os papéis mínimos necessários. Não copie credenciais pessoais ou arquivos JSON para a imagem, variáveis de ambiente ou volume.

As configurações compartilhadas são:

- `GOOGLE_VERTEX_PROJECT`
- `GOOGLE_VERTEX_LOCATION`

Cada função pode sobrescrever esses valores de forma independente:

- `CHAT_VERTEX_PROJECT` e `CHAT_VERTEX_LOCATION`
- `EMBEDDING_VERTEX_PROJECT` e `EMBEDDING_VERTEX_LOCATION`

O embedding Vertex usa `gemini-embedding-001` com `outputDimensionality=1536`, preservando a dimensão esperada pelo banco vetorial.

## Validação sem consumo de modelo

O health check resolve as configurações de chat e embedding e, quando algum provider Vertex está selecionado, confirma que o ADC pode ser descoberto. Essa verificação não faz chamada de chat ou embedding e, portanto, não deve consumir tokens de modelo.

Smokes que exercitam permissões e inferência devem ser executados isoladamente, primeiro em revisão Cloud Run sem tráfego. O provider padrão deve permanecer Google AI Studio até a aprovação explícita do rollout.

## Resultado da verificação local

Em 25/07/2026, a validação confirmou o SDK `gcloud`, o projeto ativo `ask-me-rag`, o serviço Cloud Run em `us-central1` e a identidade `ask-me-rag-sa@ask-me-rag.iam.gserviceaccount.com`. A configuração estática Vertex passou em `scripts/check-ai-config.mjs` sem chamar chat ou embedding.

A API `aiplatform.googleapis.com` foi habilitada e `roles/aiplatform.user` foi concedido e verificado para a service account de runtime.

O smoke local foi executado com `scripts/smoke-vertex.mjs` após `gcloud auth application-default login`. A chamada de embedding usou `gemini-embedding-001`, retornou exatamente 1536 dimensões, e a geração curta usou `gemini-2.5-flash-lite` com `finishReason=stop`. O script registrou somente projeto, localização, modelos, dimensão e motivo de término.

O smoke Cloud Run foi executado em revisão marcada com zero por cento de tráfego; o resultado operacional está registrado abaixo.

A verificação não exibiu tokens, não registrou credenciais e manteve o Google AI Studio na revisão que recebe 100% do tráfego.

## Resultado da revisão Cloud Run sem tráfego

Em 25/07/2026, a imagem do commit `7143769e90e5f6b0b0beb480a62927cb4d7af8b0` foi publicada no Artifact Registry e implantada como a revisão `ask-me-rag-vertex-7143769`, marcada por `vertex-smoke-7143769` e com zero por cento do tráfego. A produção permaneceu 100% na revisão `ask-me-rag-sha-f2b8b394d42d`, usando Google AI Studio.

A revisão Vertex ficou `Ready`, descobriu ADC pela service account `ask-me-rag-sa@ask-me-rag.iam.gserviceaccount.com` e passou pela validação estática dos runtimes. A primeira verificação encontrou o Supabase pausado e retornou `503 dependency`; depois da retomada do projeto, tanto a revisão pública quanto a revisão Vertex retornaram HTTP 200 em `/api/health`.

O smoke funcional de `/api/chat` foi repetido após a retomada do Supabase e retornou HTTP 200. O fluxo usou embedding Vertex, recuperou três chunks de `curriculo_daniel_trindade.md` e concluiu a geração curta com `OK.` e `finishReason=stop`. A tarefa 11.7 foi concluída sem promover a revisão Vertex; o Google AI Studio permaneceu recebendo 100% do tráfego.
