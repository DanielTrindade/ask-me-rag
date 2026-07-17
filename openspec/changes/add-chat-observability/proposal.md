## Why

A aplicação não persiste as conversas nem oferece visibilidade sobre uso, falhas, desempenho ou possíveis abusos do chat público. Precisamos de observabilidade administrativa que permita compreender as interações com segurança, sem transformar a solução em um mecanismo invasivo de identificação dos visitantes.

## What Changes

- Persistir conversas, mensagens e execuções do chat com identificadores idempotentes, evitando duplicar o histórico reenviado pelo cliente.
- Registrar metadados operacionais por execução, incluindo duração, estado final, provedor/modelo, consumo de tokens quando disponível e categoria de erro sanitizada.
- Capturar o endereço IP a partir de uma cadeia de proxies explicitamente confiável, armazenando uma representação protegida e exibindo-o mascarado por padrão.
- Derivar do User-Agent apenas características úteis do dispositivo, como tipo, sistema operacional, navegador e versões principais, sem fingerprinting invasivo.
- Adicionar ao painel protegido `/admin` um monitor com indicadores, filtros, lista de conversas e visualização cronológica das mensagens.
- Definir transparência, controle de acesso, minimização, retenção automática, exclusão e auditoria de acesso aos dados observados.
- Manter a coleta de observabilidade isolada do contexto RAG, das credenciais, dos cookies e dos cabeçalhos completos da requisição.

## Capabilities

### New Capabilities

- `chat-activity-capture`: Captura idempotente de conversas, mensagens, execução do modelo, IP protegido e características derivadas do dispositivo.
- `observability-admin-monitor`: Indicadores, busca, filtros e inspeção protegida das conversas e métricas no painel administrativo.
- `telemetry-data-governance`: Regras de transparência, acesso, mascaramento, minimização, retenção, exclusão e auditoria dos dados de telemetria.

### Modified Capabilities

Nenhuma.

## Impact

- API pública de chat em `app/api/chat/route.ts` e transporte do chat em `components/chat/chat.tsx`.
- Persistência Supabase/PostgreSQL, incluindo novas migrações, índices e políticas de segurança.
- Extração de IP atualmente compartilhada em `lib/rate-limit.ts` e configuração da topologia de proxies do Cloud Run/load balancer.
- Sessão, rotas, componentes, estilos e textos do painel administrativo.
- Configuração de ambiente para retenção, segredo de pseudonimização e proxies confiáveis.
- Testes unitários e de integração para captura, privacidade, autorização e consultas do monitor.
