## Context

O chat público usa Next.js 16 e AI SDK 6. O cliente mantém o histórico apenas em `sessionStorage` e envia esse histórico completo a cada `POST /api/chat`; o servidor consulta o RAG e devolve uma resposta em streaming, sem persistir conversas ou métricas. A aplicação já possui Supabase/PostgreSQL acessado exclusivamente no servidor, um painel `/admin` protegido por sessão HTTP-only e deploy no Cloud Run.

A mudança cruza cliente, streaming, banco, infraestrutura e painel administrativo. IP, conteúdo das mensagens e a combinação de metadados de acesso podem constituir dados pessoais, portanto o desenho precisa minimizar a coleta, restringir o acesso e aplicar retenção previsível.

## Goals / Non-Goals

**Goals:**

- Persistir, de forma idempotente, o turno enviado e a resposta visível ao usuário.
- Observar volume, erros, cancelamentos, latência, modelo/provedor e tokens quando disponíveis.
- Permitir agrupamento e investigação por IP sem exibi-lo integralmente por padrão.
- Classificar dispositivo, navegador, sistema operacional e bot com baixa granularidade.
- Disponibilizar indicadores e inspeção de conversas somente no painel administrativo.
- Manter a observabilidade fora do caminho crítico sempre que possível e nunca tornar sua indisponibilidade motivo para impedir o chat.
- Aplicar minimização, transparência, auditoria, exclusão e retenção automática.

**Non-Goals:**

- Identificar nominalmente visitantes anônimos ou correlacioná-los entre sessões independentes.
- Implementar fingerprinting com modelo do aparelho, fabricante, CPU, resolução, fontes, canvas ou Client Hints de alta entropia.
- Armazenar system prompt, contexto RAG completo, embeddings, cookies, credenciais ou todos os cabeçalhos HTTP.
- Fornecer analytics de marketing, replay de sessão, geolocalização precisa ou rastreamento entre sites.
- Substituir Cloud Logging/Cloud Monitoring para saúde de infraestrutura.

## Decisions

### 1. Identidade limitada à conversa no `sessionStorage`

O cliente gerará um UUID de conversa, enviará `conversationId` em cada requisição e o renovará ao escolher “Nova conversa”. O identificador ficará apenas em `sessionStorage`, junto do histórico já existente, e não será persistido em cookie ou `localStorage`.

Isso permite idempotência e navegação dentro da conversa sem criar um identificador duradouro do visitante. A alternativa de cookie persistente facilitaria métricas de recorrência, mas ampliaria o rastreamento e foi descartada.

### 2. Modelo relacional separado por conversa, mensagem, execução e auditoria

Serão criadas quatro tabelas privadas:

- `chat_conversations`: UUID, início, última atividade, hash e valor criptografado do IP, além dos campos derivados de dispositivo e idioma.
- `chat_messages`: chave composta por conversa e `message_id`, papel, conteúdo visível, estado e horário. Um `upsert` pela chave impede duplicação do histórico reenviado.
- `chat_requests`: uma linha por chamada ao modelo, vinculada ao novo turno, com início/fim, duração, estado, modelo/provedor, motivo de término, tokens, categoria de erro e identificador de trace quando disponível.
- `chat_telemetry_audit`: ações administrativas sensíveis, como revelar IP e excluir conversa, sem copiar conteúdo ou IP para a auditoria.

As tabelas terão RLS habilitada sem políticas para `anon`/`authenticated`; somente o cliente server-side com service role poderá acessá-las. Índices cobrirão data, estado, hash do IP, tipo de dispositivo e paginação por cursor.

Guardar toda a observabilidade em Cloud Logging foi descartado porque mensagens são dados de produto consultáveis, exigem exclusão transacional e não devem ser espalhadas por logs operacionais.

### 3. Registro em duas fases e finalização idempotente do stream

Antes de iniciar RAG/modelo, a rota validará o corpo, fará `upsert` da conversa e da última mensagem do usuário e criará `chat_request` com estado `running`. As operações serão agrupadas em RPC/transação para limitar round-trips.

O AI SDK 6 será integrado por seus callbacks oficiais de término e cancelamento. A finalização gravará uma única vez a resposta visível, duração, tokens e estado `completed`, `aborted` ou `failed`. A combinação de chave única e atualização condicional tornará tentativas repetidas seguras.

Falhas de telemetria serão registradas de forma estruturada e sanitizada no Cloud Logging, mas a geração continuará quando o RAG e o modelo estiverem saudáveis. O erro da geração atualizará a execução quando possível e continuará retornando a resposta pública já padronizada.

Persistir apenas no fim foi descartado porque perderia todas as requisições que falham antes do primeiro token. Persistir toda a lista recebida foi descartado por duplicar mensagens anteriores.

### 4. IP extraído somente de uma topologia de proxies configurada

O extrator receberá o número de saltos confiáveis à direita em `X-Forwarded-For` por configuração de ambiente. Ele validará cada candidato como IPv4/IPv6, removerá portas e normalizará a representação. Sem configuração válida, o IP será `unknown`; o sistema não confiará automaticamente no primeiro nem no último valor fornecido.

O IP canônico terá dois derivados:

- `ip_hash`: HMAC-SHA-256 com segredo exclusivo, usado para agrupamento, filtros e contagem sem expor o endereço.
- `ip_encrypted`: AES-256-GCM com chave exclusiva e versão do formato, usado somente para revelação administrativa explícita.

O IP não será escrito em logs. O segredo de HMAC e a chave de criptografia serão fornecidos por Secret Manager e não reutilizarão `ADMIN_PASSWORD` ou a chave do Supabase.

Armazenar apenas o IP em texto foi descartado por ampliar o impacto de vazamento. Armazenar apenas hash foi descartado porque não atenderia à investigação explícita solicitada.

### 5. Dispositivo derivado pelo helper nativo do Next.js

A rota passará a receber `NextRequest` e usará `userAgent(request)` de `next/server`, disponível na versão instalada. Serão persistidos somente:

- `device_type`: `desktop`, `mobile`, `tablet`, `bot`, `other` ou `unknown`;
- `os_name` e versão principal;
- `browser_name` e versão principal;
- `preferred_language`, normalizado a partir de `Accept-Language`;
- `is_bot`.

Modelo, fabricante, arquitetura de CPU, versão completa e User-Agent bruto serão descartados após a classificação. Não serão solicitados Client Hints de alta entropia. A classificação é observacional e nunca será tratada como identidade ou prova de autoria.

Adicionar UAParser.js foi descartado: o helper nativo cobre o escopo e evita uma dependência adicional, além das implicações de licença da versão atual do pacote externo.

### 6. Monitor em rota administrativa própria

O monitor ficará em `/admin/observability`, mantendo a gestão de documentos existente em `/admin`. APIs sob `/api/admin/observability` oferecerão:

- resumo por período;
- lista paginada por cursor, com filtros por período, estado, dispositivo, navegador, bot e IP exato transformado em HMAC no servidor;
- detalhe da conversa com mensagens em ordem cronológica e métricas de cada execução;
- revelação explícita do IP completo por `POST`, com verificação de origem e auditoria;
- exclusão da conversa por `DELETE`, também auditada.

Todas as rotas validarão `hasAdminSession()` no handler. O `proxy.ts` será ampliado para cobrir as novas páginas e APIs como defesa adicional, sem tornar login e logout inacessíveis. A lista mostrará IP mascarado; o valor completo nunca será incluído no HTML inicial nem nas respostas de listagem.

Busca textual de mensagens ficará limitada a uma consulta explícita, paginada e administrativa. Não haverá exportação em massa no primeiro incremento.

### 7. Retenção curta e executada fora da requisição do usuário

Os padrões serão configuráveis, inicialmente:

- IP criptografado: 7 dias, depois será apagado mantendo apenas o hash até o fim da conversa.
- Conversas, mensagens, execuções e hash do IP: 30 dias.
- Auditoria administrativa: 90 dias.

Uma função SQL idempotente aplicará esses prazos e fará exclusão em cascata. Um Cloud Run Job autenticado, agendado diariamente pelo Cloud Scheduler, executará a função usando o mesmo artefato da aplicação e credenciais de service role. O painel exibirá quando a limpeza foi executada pela última vez.

Executar limpeza apenas durante acessos ao chat foi descartado por ser imprevisível. `pg_cron` não foi escolhido para evitar depender de disponibilidade/configuração específica da extensão no projeto Supabase.

### 8. Aviso de privacidade no chat e limites de conteúdo

A interface pública informará, antes da primeira mensagem, que perguntas, respostas e dados técnicos básicos são registrados para segurança, suporte e melhoria, com link para detalhes de retenção. A API continuará impondo limites de formato e adicionará limites explícitos de quantidade e tamanho de mensagens antes de persistir ou enviar ao modelo.

Somente texto visível de `user` e `assistant` e identificadores das fontes exibidas serão persistidos. Partes desconhecidas, ferramentas futuras, contexto recuperado e prompts internos serão ignorados por padrão até haver requisito específico.

## Risks / Trade-offs

- [Cabeçalho de IP configurado incorretamente identifica o proxy ou aceita valor falsificado] → falhar como `unknown`, validar a topologia em produção e cobrir os formatos esperados com testes.
- [Mensagem pode conter dado sensível digitado pelo próprio visitante] → aviso claro, acesso restrito, retenção curta e exclusão administrativa; não replicar conteúdo em logs.
- [Falha no Supabase cria lacunas na observabilidade] → comportamento fail-open, log estruturado sem conteúdo e indicador de integridade no painel.
- [Persistência inicial aumenta a latência antes do stream] → uma RPC transacional, índices adequados e medição separada da latência de telemetria.
- [Callback de streaming pode ser chamado em conclusão, erro ou cancelamento] → finalizador único e idempotente, com testes de corrida e estados terminais.
- [User-Agent e IP podem ser falsificados ou compartilhados] → apresentá-los como sinais aproximados, nunca como identidade comprovada.
- [Senha administrativa compartilhada limita a atribuição da auditoria] → registrar sessão/ação/horário agora; autenticação nominal e MFA ficam como evolução futura.
- [Criptografia na aplicação exige rotação de chave] → versionar o envelope criptográfico e documentar rotação; manter chaves antigas somente durante a retenção máxima.

## Migration Plan

1. Criar migração aditiva com tabelas, índices, RLS, RPCs de captura/consulta e função de retenção.
2. Adicionar segredos e configurações com captura desabilitada por padrão quando chaves ou topologia de proxy não estiverem válidas.
3. Implantar captura server-side em modo fail-open e validar métricas/logs sem liberar ainda o painel.
4. Atualizar o cliente para enviar o UUID da conversa e publicar o aviso de privacidade.
5. Liberar APIs e página `/admin/observability` atrás da sessão existente.
6. Criar e agendar o Cloud Run Job de retenção; executar uma limpeza de teste.
7. Habilitar `CHAT_OBSERVABILITY_ENABLED` em produção e acompanhar latência, erros e volume.

Rollback: desabilitar a flag interrompe novas gravações sem afetar o chat. O painel pode ser removido independentemente; tabelas e dados permanecem até a rotina de retenção ou uma migração posterior explícita. Migrações destrutivas não fazem parte do rollback imediato.

## Open Questions

- Confirmar no ambiente de produção quantos saltos confiáveis existem entre o cliente e o serviço Cloud Run antes de habilitar captura de IP.
- Confirmar se os prazos iniciais de 7/30/90 dias atendem à política de privacidade desejada antes do deploy de produção.

