## 1. Runtime e dependências

- [x] 1.1 Adicionar testes do runtime Groq para modelo padrão, override, provider legado e credencial ausente.
- [x] 1.2 Instalar `@ai-sdk/groq` 3.x compatível com AI SDK 6 e remover adapters de chat sem uso quando não forem necessários aos embeddings.
- [x] 1.3 Restringir `ChatProvider` e `resolveChatRuntime` a Groq GPT-OSS, preservando o contrato de streaming consumido pela rota.

## 2. Configuração e telemetria

- [x] 2.1 Atualizar o health check e seus testes para exigir `GROQ_API_KEY` sem chamada externa.
- [x] 2.2 Atualizar o validador de configuração e seus testes para usar `groq` como único provider de chat e manter embeddings independentes.
- [x] 2.3 Registrar e testar preços oficiais de `openai/gpt-oss-20b` e `openai/gpt-oss-120b` no catálogo atual.

## 3. Secret Manager e deploy

- [x] 3.1 Atualizar bootstrap, preenchimento e preflight para criar, autorizar e exigir o segredo `groq-api-key` sem expor seu valor.
- [x] 3.2 Atualizar deploy e testes para definir `CHAT_LLM_PROVIDER=groq` e vincular `GROQ_API_KEY=groq-api-key:latest` ao Cloud Run.
- [x] 3.3 Atualizar `cloudbuild.yaml` e `cloudbuild-promote.yaml` para usar Groq como default da candidata e da promoção.
- [x] 3.4 Atualizar o verificador operacional para validar a chave Groq por status HTTP sanitizado.

## 4. Ambiente e documentação

- [x] 4.1 Atualizar `.env.example` e placeholders do CI com Groq chat e Google embeddings separados.
- [x] 4.2 Atualizar README e documentação de providers com setup local, modelo padrão/override e a dependência temporária de embeddings Google.
- [x] 4.3 Remover instruções ativas que apresentem Google, Vertex, Anthropic ou OpenAI como providers de chat suportados.

## 5. Verificação

- [x] 5.1 Executar testes focados de runtime, health, preço, configuração e deploy e corrigir regressões.
- [x] 5.2 Executar a suíte completa e o lint com sucesso.
- [x] 5.3 Executar o build de produção sem chamada real a providers.
- [x] 5.4 Verificar apenas a presença das variáveis locais obrigatórias e documentar credenciais ausentes sem revelar valores.
