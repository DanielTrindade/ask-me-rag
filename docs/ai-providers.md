# Providers de IA

## Arquitetura desta fase

O chat usa exclusivamente Groq pelo adapter `@ai-sdk/groq` 3.x, compatível com o AI SDK 6 e seus contratos Provider V3. O modelo padrão é `openai/gpt-oss-20b`; `openai/gpt-oss-120b` pode ser selecionado por `CHAT_LLM_MODEL` quando a qualidade adicional justificar maior latência e custo.

A recuperação não usa embeddings. As perguntas e os trechos são indexados pelo PostgreSQL Full-Text Search, que combina análise portuguesa e inglesa normalizada por `unaccent`. A aplicação expande um vocabulário pequeno de intenções de portfólio e chama o RPC `search_documents_v2`, que combina bônus para correspondência estrita, fallback OR, cobertura de termos e densidade textual antes de enviar o contexto recuperado ao Groq.

Esse refinamento melhora o recall de perguntas naturais como “Resuma sua trajetória e principais competências”, mas não torna o FTS semanticamente equivalente a embeddings. Conceitos fora do vocabulário mapeado e sem termos relacionados nos documentos ainda podem exigir uma nova regra de expansão, avaliação de recuperação ou uma futura abordagem híbrida.

O fluxo RAG completo precisa de uma única credencial de IA:

- `GROQ_API_KEY` para gerar a resposta.

## Configuração local mínima

```dotenv
CHAT_LLM_PROVIDER=groq
CHAT_LLM_MODEL=openai/gpt-oss-20b
GROQ_API_KEY=gsk_...
```

Após preencher também as variáveis do Supabase, execute `npm run dev`. O health check exercita o RPC FTS e valida a presença e a consistência da configuração; ele não chama o Groq e não consome tokens.

## Produção

O Secret Manager usa `groq-api-key` como única credencial de IA. `scripts/fill-secrets.sh` valida a chave por status HTTP sem imprimir seu valor; `scripts/preflight-deploy.sh` exige versões habilitadas antes do deploy.

O Cloud Run recebe `CHAT_LLM_PROVIDER=groq` e vincula `GROQ_API_KEY=groq-api-key:latest`. A revisão candidata é validada sem tráfego antes de qualquer promoção, e variáveis/segredos legados (Google/Vertex/embeddings) são removidos da nova revisão por `--remove-env-vars` e `--remove-secrets`.

## Rollout e limpeza do contrato vetorial

O índice pgvector, a coluna `documents.embedding` e o RPC `match_documents` permanecem presentes durante a janela de rollback, mas não são mais usados pelo código. Eles devem ser contraídos em uma migração posterior, somente depois de 100% do tráfego estar na revisão FTS e a janela de rollback terminar.
