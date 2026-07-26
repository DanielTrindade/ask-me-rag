## 1. Baseline e decisões operacionais

- [x] 1.1 Reconciliar as alterações pendentes de `add-chat-observability` nas tabelas, RPCs, stores e monitor antes de criar a nova migração.
- [x] 1.2 Registrar em documentação privada os limites atuais de RPM, TPM e RPD exibidos pelo AI Studio para chat e embeddings.
- [x] 1.3 Definir valores iniciais para limite por minuto, limite diário por visitante, teto global, reserva para ingestão/testes e zona de reset.
- [x] 1.4 Definir TTLs de lease, cache de resposta e cache de embedding e documentar a justificativa operacional.
- [x] 1.5 Adicionar parser server-only tipado para todas as variáveis de governança, orçamento, cache e rollout, com validação fail-fast em produção.
- [x] 1.6 Adicionar testes unitários do parser para defaults, limites inválidos, kill switch e modos `off`, `shadow` e `enforce`.

## 2. Runtime e configuração de providers

- [x] 2.1 Criar contratos server-only independentes para runtime de chat e runtime de embeddings com modelo, provider, dimensão, opções e capacidades.
- [x] 2.2 Refatorar `lib/llm.ts` para resolver providers pelo contrato sem alterar o protocolo de streaming da rota.
- [x] 2.3 Tornar `gemini-2.5-flash-lite` o modelo Google padrão e atualizar os testes de seleção e thinking config.
- [x] 2.4 Refatorar `lib/embeddings.ts` para resolver provider/modelo/dimensão independentemente do provider de chat.
- [x] 2.5 Adicionar validação explícita de dimensão 1536 e rejeitar configurações incompatíveis antes de acessar pgvector.
- [x] 2.6 Atualizar o health check para validar a configuração efetiva dos dois runtimes sem realizar chamada faturável.
- [x] 2.7 Cobrir runtimes e health check com testes para Google, Anthropic/OpenAI com embedding Google, provider desconhecido e configuração incompleta.

## 3. Persistência transacional de governança

- [x] 3.1 Criar migração expand-only para buckets de uso, reservas/leases, cache de respostas, cache de embeddings e revisão de conhecimento.
- [x] 3.2 Adicionar constraints, índices e chaves únicas para janelas, escopos, idempotência, leases ativos e chaves de cache.
- [x] 3.3 Habilitar RLS nas novas tabelas, revogar acesso público e conceder somente operações mínimas ao `service_role`.
- [x] 3.4 Implementar RPC atômica de admissão que avalia kill switch, duplicidade, lease, limite curto, limite diário do visitante e teto global.
- [x] 3.5 Implementar cálculo de janela diária na zona configurada e retorno do instante seguro de reset.
- [x] 3.6 Implementar RPC idempotente de finalização/liberação de lease para conclusão, falha, cancelamento e timeout.
- [x] 3.7 Implementar recuperação segura de leases expirados sem autorizar duas execuções concorrentes.
- [x] 3.8 Implementar RPCs mínimas para leitura/escrita de caches e incremento transacional da revisão de conhecimento.
- [x] 3.9 Implementar limpeza idempotente de reservas finalizadas, leases expirados e entradas de cache vencidas.
- [x] 3.10 Atualizar `supabase/schema.sql` para refletir integralmente a nova migração.
- [x] 3.11 Adicionar pgTAP para grants/RLS, limites, última vaga concorrida, idempotência, lease, reset por zona, cache e revisão de conhecimento.

## 4. Serviço de admissão no servidor

- [x] 4.1 Criar store server-only que chama as RPCs de reserva, finalização e leitura do orçamento diário com tipos fechados de decisão.
- [x] 4.2 Criar serviço de governança que converte configuração e identidade protegida em pedido de admissão.
- [x] 4.3 Reutilizar o HMAC de IP existente sem persistir IP bruto/cabeçalhos nas estruturas de governança.
- [x] 4.4 Aplicar fallback para limites por conversa e global quando não houver IP protegido confiável.
- [x] 4.5 Integrar idempotência por `conversationId + messageId` e retorno consistente para requisições duplicadas.
- [x] 4.6 Integrar exclusão mútua por conversa e garantir liberação do lease em todos os caminhos terminais da rota.
- [x] 4.7 Posicionar a admissão antes de embedding/RAG/LLM e impedir chamadas externas quando a decisão for negativa ou indisponível.
- [x] 4.8 Implementar modo sombra que registra a decisão sem bloquear e modo enforce que aplica a decisão.
- [x] 4.9 Adicionar testes unitários e de rota para allowed, duplicate, visitor_limited, global_limited, conversation_busy, disabled e store indisponível.

## 5. Classificação de erros e resiliência do stream

- [x] 5.1 Criar taxonomia tipada de erros públicos e internos para quota, rate limit, indisponibilidade, autenticação, configuração, request inválido, timeout, abort, retrieval e desconhecido.
- [x] 5.2 Implementar classificador do AI SDK/provider que leia apenas status e metadados estruturados conhecidos e produza resultado sanitizado.
- [x] 5.3 Adicionar testes do classificador com `429` diário, `429` transitório, `401/403`, `400`, `408`, `5xx`, timeout, abort e erro sem shape conhecido.
- [x] 5.4 Implementar logger seguro com allowlist de campos e testes que impeçam prompt, contexto RAG, response body, chave, token, IP e cookie.
- [x] 5.5 Implementar retry com no máximo duas novas tentativas, backoff exponencial, jitter e `Retry-After`, somente antes do primeiro delta.
- [x] 5.6 Garantir que quota diária, autenticação, configuração, request inválido e falha após delta nunca sejam repetidos automaticamente.
- [x] 5.7 Criar respostas degradadas PT/EN para limite temporário, indisponibilidade, conversa ocupada, governança indisponível e kill switch.
- [x] 5.8 Integrar classificação, retry e degradação no `/api/chat` preservando telemetria, fontes, cancelamento e texto parcial.
- [x] 5.9 Testar o stream para falha antes do primeiro delta, falha após delta, retry bem-sucedido, retry esgotado e cancelamento do cliente.

## 6. Orçamentos de histórico, RAG e saída

- [x] 6.1 Criar estimador determinístico/conservador de tokens com testes para PT-BR, inglês, Unicode, Markdown e mensagens vazias.
- [x] 6.2 Criar `PromptBudget` que preserve system prompt e pergunta atual e distribua limites entre histórico e RAG.
- [x] 6.3 Implementar seleção dos turnos mais recentes removendo pares antigos completos quando o orçamento de histórico for excedido.
- [x] 6.4 Ajustar validação da API para rejeitar mensagem individual excessiva antes de reserva e registrar apenas categoria sanitizada.
- [x] 6.5 Alterar retrieval para três chunks por padrão, ordenação por relevância e teto configurável de contexto.
- [x] 6.6 Implementar truncamento/omissão de chunks em fronteira segura mantendo apenas referências das fontes realmente incluídas.
- [x] 6.7 Aplicar limite total de entrada antes de `convertToModelMessages`/`streamText` e testar conversas longas.
- [x] 6.8 Definir `maxOutputTokens=500` por padrão, permitir override validado e registrar `finishReason=length` sem retry.
- [x] 6.9 Adicionar testes de regressão garantindo grounding, locale, streaming e fontes com os novos orçamentos.

## 7. Cache e revisão da base de conhecimento

- [x] 7.1 Criar normalização e hash de chave de resposta incluindo locale, provider/modelo, revisão de prompt e revisão de conhecimento.
- [x] 7.2 Implementar política de elegibilidade que permita cache compartilhado apenas para primeiro turno completo e sem ferramentas/contexto personalizado.
- [x] 7.3 Consultar cache de resposta válido antes de reservar consumo de LLM e servir hit no mesmo protocolo de UI stream.
- [x] 7.4 Persistir somente respostas completas elegíveis com fontes públicas e impedir escrita de aborts, falhas ou conteúdo parcial.
- [x] 7.5 Incrementar revisão de conhecimento após ingestão que realmente insere chunks.
- [x] 7.6 Integrar incremento de revisão à exclusão administrativa bem-sucedida de documentos e preservar a revisão em no-op.
- [x] 7.7 Criar chave de cache de embedding por hash, provider, modelo, dimensão e finalidade sem armazenar texto bruto.
- [x] 7.8 Integrar cache de embedding em `embedText`/retrieval e impedir reuso incompatível.
- [x] 7.9 Adicionar testes de hit, miss, TTL, alteração de locale/modelo/prompt, mutação documental, conversa com histórico e incompatibilidade vetorial.

## 8. Métricas de tokens, custo e governança

- [x] 8.1 Estender a migração/telemetria de requisições com decisão de governança, cache status, tentativas, categoria refinada e campos de custo estimado.
- [x] 8.2 Atualizar tipos e stores de observabilidade para persistir os novos campos sem alterar a política de minimização.
- [x] 8.3 Criar catálogo versionado de preços por provider/modelo com moeda USD, vigência e testes de lookup.
- [x] 8.4 Implementar cálculo separado de custo de entrada, saída e total usando tokens reais; retornar `null` quando preço ou uso faltar.
- [x] 8.5 Finalizar telemetria com tokens/custo em sucesso, parcial, falha e abort sem sobrescrever dados já conhecidos.
- [x] 8.6 Registrar bloqueios, cache hits e modo sombra separadamente de chamadas efetivamente enviadas ao provider.
- [x] 8.7 Estender RPC de resumo administrativo com uso diário, limite, reset, tokens, custo conhecido/desconhecido, cache hit rate e distribuição de falhas.
- [x] 8.8 Estender detalhe de execução com campos sanitizados de governança, retry, cache e custo.
- [x] 8.9 Emitir eventos operacionais sanitizados ao cruzar 50%, 75%, 90% e 100% do teto interno sem duplicação excessiva.
- [x] 8.10 Adicionar testes SQL e TypeScript para agregações, custos nulos, bloqueios sem tokens e retenção dos novos dados.

## 9. Monitor administrativo

- [x] 9.1 Atualizar endpoints e validações administrativas para expor o novo resumo/detalhe somente a sessões autorizadas.
- [x] 9.2 Atualizar tipos do monitor e traduções PT/EN para consumo, custo estimado, cache, limites, reset e categorias de erro.
- [x] 9.3 Adicionar cards de requisições admitidas/bloqueadas, tokens, custo conhecido, cache hit rate e percentual do teto diário.
- [x] 9.4 Adicionar visualização por provider/modelo e categorias de falha sem expor payloads brutos.
- [x] 9.5 Exibir estado do kill switch, modo shadow/enforce, horário de reset e alertas de 50/75/90/100%.
- [x] 9.6 Enriquecer o detalhe de execução com tentativas, decisão, cache e custo, preservando as garantias de mascaramento existentes.
- [x] 9.7 Adicionar testes de componente e rota para dados completos, métricas parciais, custo desconhecido, limite atingido e acesso não autorizado.

## 10. Experiência pública degradada

- [x] 10.1 Estender o protocolo/tipos do chat para representar limitação, indisponibilidade, resposta parcial e cache hit sem revelar categoria interna sensível.
- [x] 10.2 Desabilitar envio enquanto houver geração ativa e impedir duplo submit no cliente.
- [x] 10.3 Exibir mensagens localizadas e ações públicas de GitHub, LinkedIn e currículo quando o LLM não puder responder.
- [x] 10.4 Preservar texto parcial e apresentar nota de interrupção separada do conteúdo do modelo.
- [x] 10.5 Disponibilizar retry explícito apenas para categorias públicas retryable, respeitando idempotência da mensagem.
- [x] 10.6 Adicionar respostas determinísticas para perguntas frequentes como último fallback sem chamada de embedding/LLM.
- [x] 10.7 Adicionar testes de UI para limite, kill switch, provider indisponível, parcial, retry, cache e acessibilidade dos estados.

## 11. Adapter opcional do Vertex AI

- [x] 11.1 Adicionar `@ai-sdk/google-vertex` na versão compatível com AI SDK 6 e documentar a decisão de dependência.
- [x] 11.2 Implementar adapter de chat Vertex com projeto/localização configuráveis e autenticação exclusiva por ADC.
- [x] 11.3 Implementar adapter de embedding Vertex para `gemini-embedding-001` com `outputDimensionality=1536`.
- [x] 11.4 Validar configuração Vertex sem arquivo de perfil, OAuth pessoal ou chave JSON embutida.
- [x] 11.5 Adicionar testes com provider mockado para resolução, opções, falha de ADC e isolamento entre chat/embedding.
- [x] 11.6 Executar smoke manual local com `gcloud auth application-default login` e documentar o resultado sem registrar credenciais.
- [ ] 11.7 Executar smoke em revisão Cloud Run sem tráfego usando service account com papel mínimo e manter Google AI Studio como padrão.

## 12. Segurança, documentação e rollout

- [x] 12.1 Adicionar `gemini-profile/` a `.gitignore`, `.dockerignore` e `.gcloudignore` e confirmar que nenhum dado de perfil entra no build context.
- [x] 12.2 Atualizar `.env.example` com providers independentes, Flash-Lite, budgets, limites, cache, kill switch e modos de rollout sem valores secretos.
- [x] 12.3 Atualizar README com arquitetura free-first, reset de quota, tratamento de `429`, configuração de limites e opção Vertex ADC.
- [x] 12.4 Criar runbook para confirmar RPM/TPM/RPD, ativar kill switch, ajustar teto, investigar 429/503 e executar rollback.
- [x] 12.5 Documentar que alertas de Billing não são hard cap e configurar budget alerts externos conforme o ambiente de produção.
- [x] 12.6 Atualizar scripts/preflight de deploy para validar novas variáveis, permissões e coerência de providers sem chamar LLM.
- [x] 12.7 Adicionar smoke tests de produção para configuração, limite interno, fallback e health check sem consumo faturável.
- [x] 12.8 Executar pgTAP, lint SQL, testes unitários, testes de componentes, lint, auditoria, build Next.js e build do container.
- [ ] 12.9 Implantar em modo shadow, comparar decisões e tokens por uma janela representativa e registrar os limites aprovados.
- [ ] 12.10 Ativar enforce gradualmente, verificar alertas/monitor e manter procedimento de rollback por flags e revisão Cloud Run.
