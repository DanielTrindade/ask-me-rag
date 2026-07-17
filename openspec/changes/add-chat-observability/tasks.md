## 1. Configuração e utilitários de privacidade

- [ ] 1.1 Confirmar a topologia de produção e documentar o número de proxies confiáveis à direita de `X-Forwarded-For` antes de habilitar a captura de IP.
- [x] 1.2 Definir e documentar `CHAT_OBSERVABILITY_ENABLED`, saltos confiáveis, retenções 7/30/90 e nomes/versionamento dos segredos em `.env.example` e na documentação de deploy.
- [x] 1.3 Implementar e testar normalização IPv4/IPv6, seleção por proxies confiáveis e comportamento `unknown` para configuração ou cabeçalho inválido.
- [x] 1.4 Implementar e testar HMAC-SHA-256, mascaramento e envelope AES-256-GCM versionado para IP, incluindo chave inválida, adulteração e rotação.
- [x] 1.5 Implementar e testar a classificação minimizada com `userAgent(request)`, mapeando dispositivo, bot, navegador, sistema, versões principais e idioma sem reter User-Agent bruto.
- [x] 1.6 Implementar validação do corpo do chat com UUID, quantidade/tamanho de mensagens, partes permitidas e categorias sanitizadas de erro.

## 2. Modelo de dados e funções SQL

- [x] 2.1 Criar migração aditiva para `chat_conversations`, `chat_messages`, `chat_requests`, `chat_telemetry_audit` e controle das execuções de retenção, com constraints e exclusão em cascata.
- [x] 2.2 Adicionar índices para cursores temporais, estado, hash do IP, dispositivo, navegador, bot e busca textual limitada das mensagens.
- [x] 2.3 Habilitar RLS e negar acesso direto aos papéis `anon` e `authenticated` em todas as tabelas e funções de telemetria.
- [x] 2.4 Criar e testar RPC transacional idempotente para iniciar uma execução, fazer upsert da conversa e persistir somente o novo turno do usuário.
- [x] 2.5 Criar e testar RPC idempotente para finalizar uma execução e persistir resposta completa ou parcial, métricas, tokens, fontes permitidas e estado terminal.
- [x] 2.6 Criar funções administrativas para resumo, paginação por cursor, filtros, busca textual e detalhe de conversa, retornando apenas os campos autorizados.
- [x] 2.7 Criar função transacional de exclusão e função idempotente de retenção para apagar IP, conversas e auditorias conforme seus prazos.
- [x] 2.8 Atualizar `supabase/schema.sql`, registrar a migração e verificar aplicação repetida em banco local sem perda ou duplicação.

## 3. Captura no cliente e na API de chat

- [x] 3.1 Adicionar ao armazenamento de sessão a criação, restauração e renovação do UUID de conversa, com testes para hidratação inválida e “Nova conversa”.
- [x] 3.2 Incluir `conversationId` no transporte de `useChat` sem persistir identificador entre sessões do navegador.
- [x] 3.3 Adicionar aviso público e textos pt-BR/en sobre registro de mensagens, dados técnicos e retenção antes do primeiro envio.
- [x] 3.4 Adaptar `POST /api/chat` para `NextRequest`, validar entrada e derivar IP protegido e dispositivo minimizado antes da geração.
- [x] 3.5 Integrar a RPC de início em modo fail-open, medindo sua duração e garantindo que falhas não incluam mensagem, IP ou User-Agent nos logs.
- [x] 3.6 Integrar callbacks oficiais do AI SDK para conclusão, falha e cancelamento com um finalizador único, idempotente e compatível com o stream de fontes atual.
- [x] 3.7 Persistir somente texto visível, identificadores de fontes exibidas e métricas permitidas, excluindo prompt interno, contexto RAG e partes desconhecidas.
- [x] 3.8 Cobrir a rota com testes de sucesso, repetição, falha antes do stream, falha durante o stream, cancelamento, telemetria indisponível e observabilidade desabilitada.

## 4. APIs administrativas e autorização

- [x] 4.1 Ampliar a proteção de `proxy.ts` para as novas páginas/APIs administrativas sem bloquear login e logout, mantendo validação de sessão dentro de cada handler.
- [x] 4.2 Criar API de resumo por período com validação de intervalo e representação explícita de métricas indisponíveis.
- [x] 4.3 Criar API paginada de conversas com filtros validados e filtro de IP calculado por HMAC somente no servidor.
- [x] 4.4 Criar API de detalhe com mensagens e execuções cronológicas, IP mascarado e resposta `404` uniforme para conversa ausente ou expirada.
- [x] 4.5 Criar API `POST` de revelação do IP com verificação de mesma origem, resposta sem cache, descriptografia unitária e auditoria de sucesso ou negação.
- [x] 4.6 Criar API `DELETE` de conversa com confirmação de mesma origem, exclusão transacional, comportamento idempotente e auditoria sem conteúdo.
- [x] 4.7 Adicionar testes de autorização, CSRF/origem, validação, paginação, mascaramento, revelação expirada, auditoria e ausência de vazamento nas APIs.

## 5. Monitor no painel administrativo

- [x] 5.1 Adicionar navegação entre gestão de documentos e `/admin/observability`, preservando o layout e o design system existentes.
- [x] 5.2 Implementar indicadores de conversas, mensagens, estados, latência, tokens, dispositivos e navegadores por período.
- [x] 5.3 Implementar tabela paginada com filtros, busca textual explícita, IP mascarado e estados de carregamento, vazio e erro.
- [x] 5.4 Implementar detalhe em linha do tempo com perguntas, respostas, horários, dispositivo resumido, fontes permitidas e métricas de execução.
- [x] 5.5 Implementar ações confirmadas de revelar IP e excluir conversa, sem incluir o IP completo no HTML inicial, estado global ou cache do cliente.
- [x] 5.6 Exibir saúde e última execução da retenção, com alerta quando o job diário estiver atrasado.
- [x] 5.7 Adicionar textos pt-BR/en, responsividade, navegação por teclado, foco e testes dos fluxos administrativos críticos.

## 6. Retenção e infraestrutura

- [x] 6.1 Criar comando server-side de retenção que valide configuração, chame a função SQL e registre somente contagens e duração sanitizadas.
- [x] 6.2 Criar testes do comando para execução normal, repetida, falha de banco e ausência de credenciais.
- [x] 6.3 Configurar Cloud Run Job com service account mínima, segredos necessários e o mesmo artefato versionado da aplicação.
- [x] 6.4 Configurar Cloud Scheduler para executar o job diariamente e documentar criação, atualização, verificação e remoção dos recursos.
- [x] 6.5 Integrar job e scheduler ao fluxo de deploy sem habilitar captura antes de as chaves, migração e topologia de proxy estarem validadas.

## 7. Verificação de segurança e rollout

- [x] 7.1 Testar que papéis públicos do Supabase não conseguem ler, gravar ou executar funções de telemetria.
- [x] 7.2 Auditar logs e respostas de erro automatizados para garantir ausência de mensagens, IP, User-Agent, prompts, contexto RAG e segredos.
- [x] 7.3 Executar testes unitários e de integração, lint e build de produção, corrigindo regressões no chat público e no painel existente.
- [x] 7.4 Aplicar migrações em ambiente de teste, executar conversas de smoke test e verificar idempotência, estados de stream, métricas, filtros e exclusão.
- [ ] 7.5 Validar em Cloud Run o IP obtido com requisições controladas, proxy/load balancer real e cabeçalhos maliciosos antes de habilitar produção.
- [ ] 7.6 Habilitar `CHAT_OBSERVABILITY_ENABLED` gradualmente, acompanhar latência e falhas de captura e confirmar a primeira limpeza automática.
- [x] 7.7 Documentar operação, retenção, rotação de chaves, investigação por IP, exclusão, rollback pela feature flag e limitações de atribuição por IP/dispositivo.
