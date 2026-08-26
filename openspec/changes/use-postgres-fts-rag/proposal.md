## Why

O chat de produção depende de um segundo provedor de IA apenas para transformar perguntas e documentos em vetores; quando os créditos do Google AI Studio acabaram, a recuperação falhou antes de o Groq ser chamado. Para reduzir custo operacional e pontos de falha, a recuperação deve usar recursos nativos do PostgreSQL enquanto o Groq permanece como o único provedor de IA.

## What Changes

- Substituir a busca semântica com pgvector por Full-Text Search bilíngue (português e inglês), insensível a acentos, indexada por GIN no PostgreSQL.
- Atualizar a ingestão para persistir somente conteúdo e metadados; o banco mantém o índice textual automaticamente.
- Atualizar o chat para recuperar e ranquear trechos pelo RPC textual antes de gerar a resposta com Groq GPT-OSS.
- Remover runtime, cache, dependências, variáveis, segredos e verificações operacionais de embeddings Google/Vertex.
- Fazer o health check validar o RPC de recuperação textual, para impedir a promoção de uma revisão sem a migração correspondente.
- Manter temporariamente a coluna `documents.embedding`, o índice HNSW, o RPC `match_documents` e o cache persistente de embeddings somente para permitir rollback da revisão atualmente em produção. Uma migração de contração posterior os removerá depois da promoção integral do runtime FTS.
- Reindexar automaticamente o conteúdo existente durante a migração, sem exigir novo envio dos documentos.

## Capabilities

### New Capabilities

- `postgres-fts-retrieval`: ingestão sem chamadas de IA e recuperação RAG bilíngue, insensível a acentos e ranqueada pelo PostgreSQL Full-Text Search.

### Modified Capabilities

Nenhuma. Ainda não há especificações consolidadas em `openspec/specs`; a geração Groq continua com o contrato já implementado pela mudança `migrate-chat-to-groq`.

## Impact

- Banco: nova migração Supabase expansiva, coluna `tsvector`, trigger de indexação, índice GIN e RPC `search_documents`; os artefatos pgvector deixam de ser usados, mas permanecem disponíveis durante a janela de rollback.
- Aplicação: `lib/rag.ts`, ingestão, health check, contratos/configurações de IA e respectivos testes.
- Dependências: remoção dos adapters Google/Vertex e da biblioteca de autenticação Google.
- Entrega: Cloud Build, GitHub Actions e scripts GCP deixam de exigir ou montar configuração de embeddings.
- Operação: apenas `GROQ_API_KEY` permanece como credencial de IA no novo runtime; o segredo Google existente e os artefatos pgvector podem ser removidos depois que a nova revisão estiver integralmente promovida e a janela de rollback terminar.
