## Context

O endpoint `/api/chat` já usa `streamText` do AI SDK 6 e recebe um `LanguageModelV3` de `resolveChatRuntime()`. O runtime atual suporta Google AI Studio, Vertex, Anthropic e OpenAI, mas nenhuma credencial de geração foi integrada ao ambiente operacional; o produto não completa o fluxo RAG de produção. Os embeddings estão acoplados separadamente a `gemini-embedding-001` com 1.536 dimensões, contrato persistido no pgvector.

A mudança atravessa runtime, dependências, health check, preflight, Secret Manager, Cloud Run, CI e documentação. Ela não altera o protocolo de streaming, o schema nem a recuperação de contexto.

## Goals / Non-Goals

**Goals:**

- Fazer Groq ser o único runtime de geração aceito nesta fase.
- Usar um modelo open-weight de produção com bom custo/latência para RAG curto.
- Falhar antes de acessar banco ou provider quando a configuração Groq estiver ausente ou inválida.
- Preservar streaming, retries anteriores ao primeiro delta, fontes, telemetria e cancelamento existentes.
- Tornar a configuração local e o deploy Cloud Run reproduzíveis.

**Non-Goals:**

- Trocar embeddings, sua dimensão ou reingerir documentos.
- Alterar Supabase/PostgreSQL, RPCs, migrations ou tabelas.
- Remover nesta entrega toda a governança, observabilidade ou os adapters Vertex usados por embeddings.
- Adicionar fallback automático para outro LLM.
- Realizar chamadas reais de IA na suíte automatizada.

## Decisions

### 1. Usar o adapter oficial `@ai-sdk/groq` Provider V3

O projeto permanece em AI SDK 6 e `@ai-sdk/provider` 3.x. Será usada a linha 3.x de `@ai-sdk/groq`; a linha 4.x depende do Provider V4 e não é compatível com o runtime atual.

Alternativa considerada: usar `groq-sdk` diretamente ou a compatibilidade OpenAI. Rejeitada porque exigiria adaptar manualmente o protocolo de streaming já fornecido pelo AI SDK.

### 2. Adotar `openai/gpt-oss-20b` como default

O modelo é classificado pela Groq como produção, open-weight, possui custo menor e throughput maior que o GPT-OSS 120B. O modelo permanece configurável por `CHAT_LLM_MODEL`, permitindo experimentar `openai/gpt-oss-120b` sem reintroduzir múltiplos providers.

O runtime enviará `reasoningEffort: low` e `reasoningFormat: hidden`, pois o produto precisa de respostas curtas fundamentadas no contexto e não deve expor raciocínio interno.

Alternativa considerada: usar Llama 3.1/3.3. Rejeitada porque esses IDs foram removidos dos planos free/developer em agosto de 2026.

### 3. Restringir o provider de chat sem acoplar embeddings

`ChatProvider` passa a ser somente `groq`. `EmbeddingProvider` continua `google | vertex`, e `@ai-sdk/google`/`@ai-sdk/google-vertex` permanecem instalados enquanto os vetores existentes dependerem deles.

Alternativa considerada: manter os quatro providers “para flexibilidade”. Rejeitada porque eles aumentam configuração, testes e dependências sem uso comprovado.

### 4. Manter validação local sem chamada faturável

`resolveChatRuntime`, o health check e `check-ai-config` validam presença e seleção, mas não consultam a Groq. A verificação live da chave ficará somente no comando operacional explícito `scripts/check-deploy.sh`.

### 5. Gerenciar Groq pelo Secret Manager

O segredo terá o nome `groq-api-key` e será exposto ao container como `GROQ_API_KEY`. Bootstrap, preflight e deploy devem tratar criação, permissão e vínculo de maneira reproduzível; nenhum script imprimirá o valor.

### 6. Preservar a telemetria existente durante a transição

O catálogo atual receberá preços oficiais de GPT-OSS 20B e 120B para evitar custos `null` durante a primeira fase. A decisão de remover o catálogo será tomada na mudança posterior de simplificação.

## Risks / Trade-offs

- [O RAG ainda exige uma chave Google para embeddings] → Documentar claramente as duas credenciais e separar a futura troca de embeddings, que exige reingestão.
- [Modelos Groq podem ser descontinuados] → Manter o ID em variável de ambiente e usar somente modelos classificados como produção.
- [Provider options podem divergir entre versões] → Fixar a linha 3.x compatível, testar tipos e executar build de produção.
- [Alterar o provider padrão pode quebrar ambientes antigos] → Tratar como mudança intencionalmente breaking, atualizar preflight e falhar com categoria de configuração clara.
- [Chave válida não garante quota disponível] → Reutilizar o tratamento atual de `429`, retry seguro e resposta degradada.

## Migration Plan

1. Adicionar testes do runtime Groq, health check, preços e scripts.
2. Instalar `@ai-sdk/groq` 3.x e implementar o runtime único.
3. Atualizar Secret Manager, preflight, deploy e CI.
4. Atualizar ambiente e documentação, destacando que embeddings continuam Google.
5. Executar testes, lint e build sem chamada real.
6. Cadastrar `GROQ_API_KEY` e manter `GOOGLE_GENERATIVE_AI_API_KEY` no ambiente operacional.
7. Implantar candidata sem tráfego e validar o chat RAG antes da promoção.

Rollback: restaurar a revisão anterior do Cloud Run. O schema e os vetores não mudam, portanto não existe rollback de banco.

## Open Questions

- A qualidade de `openai/gpt-oss-20b` será suficiente para as perguntas PT-BR/EN do portfólio? A decisão de subir para 120B será baseada em avaliação posterior, não em suposição.
- A futura mudança de embeddings manterá um serviço externo ou executará um modelo open-weight no próprio runtime? Fora do escopo atual.
