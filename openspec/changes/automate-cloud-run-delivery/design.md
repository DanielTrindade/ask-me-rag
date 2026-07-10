## Context

O repositório possui CI funcional no GitHub Actions: `npm ci`, ESLint, Vitest e `next build` são executados em pull requests e em pushes para `main`. O workflow separado de produção, porém, dispara somente um hook da Vercel e está desabilitado. A produção documentada e ativa usa Cloud Build, Artifact Registry e Cloud Run.

Os dados observados em 10/07/2026 confirmam a lacuna: os workflows recentes de CI concluíram com sucesso, todos os jobs recentes de produção foram ignorados e os builds do Cloud Build foram enviados manualmente. As imagens recentes foram publicadas como `latest`; tentativas anteriores usaram tags `manual-*`, duas delas falharam. O Cloud Build também executa atualmente com a conta de serviço padrão de Compute Engine e envia tráfego à nova revisão no próprio comando de deploy.

As restrições principais são: não alterar o comportamento funcional do RAG; preservar a disponibilidade durante deploys; não expor chaves de API ou do banco; manter migrações já existentes idempotentes; permitir recuperação simples; e evitar que dois merges concorrentes promovam revisões fora de ordem.

## Goals / Non-Goals

**Goals:**

- Fazer cada merge validado em `main` chegar automaticamente ao Cloud Run.
- Manter uma relação auditável `commit → build → digest da imagem → revisão`.
- Impedir que uma revisão não validada receba tráfego de produção.
- Falhar antes da promoção quando migrações, build, configuração ou smoke tests falharem.
- Restaurar automaticamente a revisão estável se a verificação após a promoção falhar.
- Usar identidades temporárias e contas de serviço com privilégio mínimo.
- Manter um caminho manual seguro para reimplantar um artefato conhecido.

**Non-Goals:**

- Criar um ambiente completo de staging nesta mudança.
- Adotar Kubernetes, Terraform ou Google Cloud Deploy para um único serviço.
- Alterar provedores de LLM, lógica de RAG ou autenticação administrativa.
- Automatizar rotação ou criação inicial dos segredos de aplicação.
- Fazer rollback destrutivo de banco de dados.

## Decisions

### 1. GitHub Actions permanece como orquestrador da entrega

O job de produção será ligado ao mesmo grafo do job `Quality`, com `needs: quality` e condição de push para `main`. Assim, o SHA construído é exatamente o SHA que passou pelas validações, sem depender de um hook da Vercel ou de um `workflow_run` desacoplado. O workflow terá `concurrency` global de produção sem cancelamento em andamento.

Alternativas consideradas:

- **Cloud Build Trigger direto do GitHub:** reduz YAML no GitHub, mas duplica a decisão de qualidade e dificulta tornar os checks do pull request a única porta de entrada.
- **Manter `workflow_run`:** separa arquivos, porém exige cuidado adicional para fazer checkout do `head_sha` correto e torna a cadeia de confiança menos óbvia.
- **Google Cloud Deploy:** oferece promoção avançada, mas acrescenta custo e infraestrutura desproporcionais para um serviço e um ambiente.

### 2. GitHub usa Workload Identity Federation e o Cloud Build usa conta dedicada

O GitHub solicitará um token OIDC de curta duração (`id-token: write`) e o trocará via Workload Identity Federation por uma conta de serviço dedicada a disparar builds. Não haverá chave JSON do Google Cloud no GitHub. O Cloud Build executará com outra conta dedicada, com permissões mínimas para gravar no repositório específico do Artifact Registry, criar revisões/alterar tráfego no serviço específico, atuar como a conta de runtime e ler somente os segredos referenciados.

O provider restringirá o atributo ao repositório `DanielTrindade/ask-me-rag` e à branch `main`. O environment `production` limitará segredos e variáveis ao job de produção. Actions de terceiros serão fixadas em SHA imutável e atualizadas por Dependabot.

Alternativa considerada: uma chave de conta de serviço em `secrets`. Foi rejeitada porque é uma credencial de longa duração que exige rotação e aumenta o impacto de vazamento.

### 3. Uma imagem é construída uma vez e identificada pelo commit

O Cloud Build receberá `_IMAGE_TAG=$GITHUB_SHA` e publicará `ask-me-rag:$GITHUB_SHA`. O deploy usará o digest resolvido dessa imagem; `latest` poderá ser atualizado apenas como referência humana depois da promoção, mas nunca será a entrada de um deploy ou rollback. Labels na imagem/revisão registrarão SHA, repositório e ID do build.

O pipeline não reconstruirá a aplicação durante promoção manual. Um `workflow_dispatch` receberá um SHA, verificará que a imagem existe e executará o mesmo procedimento de deploy seguro.

Alternativa considerada: timestamp ou número incremental. Foi rejeitada porque não identifica de forma direta o código-fonte.

### 4. A promoção usa revisão candidata sem tráfego

Antes do deploy, o pipeline captura a revisão que atualmente recebe 100% do tráfego. A imagem nova é implantada com nome/sufixo derivado do SHA, tag de URL candidata e `--no-traffic`. O pipeline aguarda a condição Ready e chama o endpoint de saúde pela URL da tag.

Se o smoke test da candidata passar, o tráfego muda atomicamente para 100% da nova revisão. Um segundo smoke test usa a URL pública. Se essa verificação falhar, um handler de erro restaura 100% do tráfego à revisão capturada no início e encerra o build com falha. A revisão candidata malsucedida permanece sem tráfego para diagnóstico e poderá ser removida por política de retenção.

Alternativa considerada: canário percentual. Embora suportado, o tráfego baixo deste projeto pode não produzir amostra suficiente; revisão sem tráfego mais promoção atômica oferece resultado determinístico com menor complexidade.

### 5. O endpoint de saúde é determinístico e não chama LLM

Será criada uma rota `GET /api/health` com resposta curta, `Cache-Control: no-store` e sem informações sensíveis. Ela validará que o processo está ativo, que variáveis obrigatórias estão presentes e que uma consulta mínima ao Supabase pode ser concluída dentro de timeout. Retornará HTTP 200 quando pronto e 503 em falha. Testes unitários cobrirão sucesso, configuração ausente, timeout e indisponibilidade do banco.

O smoke test do chat atual continuará disponível para diagnóstico manual, mas deixará de ser a porta automática de promoção, pois consome serviços de IA, depende do conteúdo do RAG e pode falhar por quota sem indicar que a revisão está quebrada.

### 6. Migrações são um gate anterior à criação da revisão

O deploy executará `supabase db push` em modo não interativo usando credenciais do environment de produção. O repositório passará a conter uma linha de base reproduzível para banco novo; `schema.sql` deixará de ser um pré-passo manual separado. Migrações deverão seguir expand/contract: mudanças compatíveis e idempotentes entram antes do código que as usa; remoções incompatíveis exigem mudança posterior, depois que nenhuma revisão antiga depender delas.

Falha de migração interrompe o pipeline antes do deploy. Não haverá rollback SQL automático, pois desfazer dados ou DDL pode ser destrutivo; a recuperação será uma migração corretiva. A serialização de produção impede duas execuções simultâneas.

Alternativa considerada: executar migrações no startup do container. Foi rejeitada porque múltiplas instâncias podem competir e uma falha passa a afetar inicialização e disponibilidade.

### 7. Configuração operacional é validada antes de mutações

Uma etapa de preflight verificará formato do SHA, existência da imagem quando aplicável, APIs/recursos esperados, permissões efetivas, segredos obrigatórios e estado do serviço. O arquivo de configuração evitará valores de projeto sensíveis ao ambiente quando puder usar variáveis do GitHub/Cloud Build. O README documentará bootstrap único, fluxo normal, promoção manual, diagnóstico e rollback.

### 8. Os gates de qualidade cobrem o artefato e a automação

Além de lint, Vitest e build do Next.js, pull requests executarão build local do Dockerfile sem push, validação estática dos workflows e `npm audit --omit=dev --audit-level=high`. Vulnerabilidades moderadas serão reportadas, mas não bloquearão automaticamente enquanto não houver correção; altas e críticas impedem merge/deploy. Após o push, a análise do Artifact Registry será registrada para acompanhamento de vulnerabilidades do sistema operacional da imagem.

Alternativa considerada: bloquear qualquer severidade. Foi rejeitada porque a base atual contém duas ocorrências moderadas transitivas do `postcss` interno do Next.js sem correção disponível; bloquear sem remediação tornaria a esteira permanentemente vermelha sem reduzir o risco de deploy.

## Risks / Trade-offs

- [Migração compatível com o código novo, mas incompatível com a revisão anterior] → exigir expand/contract e revisar migrações como parte do CI; a revisão anterior deve continuar funcionando após a fase expand.
- [Smoke test do Supabase sofre falha transitória] → timeout curto, poucas tentativas com backoff e nenhum tráfego à candidata enquanto o teste falha.
- [Promoção ocorre entre dois merges próximos] → `concurrency` serializa produção; antes de promover, o job confirma que seu SHA ainda é o HEAD de `main`, evitando promover commit obsoleto.
- [Permissões insuficientes interrompem o primeiro deploy automatizado] → script de preflight e bootstrap IAM documentado; nenhuma alteração de tráfego ocorre antes dessas verificações.
- [Permissões amplas demais aumentam impacto de comprometimento] → contas distintas para disparo, build/deploy e runtime, escopo por repositório/branch e papéis no menor recurso possível.
- [Fixar actions em SHA aumenta manutenção] → Dependabot semanal para GitHub Actions.
- [Atualizar `latest` pode sugerir que ele é implantável] → tratá-lo apenas como alias informativo; toda automação usa SHA/digest.
- [Auditoria de dependências gera falso senso de segurança ou bloqueios sem correção] → combinar limiar alto/crítico com revisão dos moderados e análise da imagem publicada.
- [O primeiro baseline de banco diverge do banco existente] → comparar o schema remoto antes de consolidar a linha de base e testar `db push --dry-run`/ambiente descartável antes de produção.

## Migration Plan

1. Adicionar e testar `/api/health`, o script de smoke test e validações locais sem alterar o deploy existente.
2. Consolidar a linha de base de migrações e validar contra banco descartável e contra o schema remoto em modo de planejamento.
3. Criar contas de serviço, Workload Identity Pool/Provider e bindings mínimos; validar autenticação por um workflow manual sem permissão de deploy.
4. Atualizar o Cloud Build para imagem por SHA, conta dedicada, revisão sem tráfego e promoção/rollback; executar primeiro via `workflow_dispatch` com aprovação do environment.
5. Fazer um deploy de ensaio do mesmo SHA já em produção e confirmar rastreabilidade, smoke test e rollback.
6. Ligar o job ao push validado de `main` e remover o hook da Vercel.
7. Manter `workflow_dispatch` como recuperação e documentar como retornar o tráfego a uma revisão conhecida.

Rollback da adoção: desabilitar temporariamente o job automático por variável de segurança e usar o fluxo manual por SHA. Rollback de aplicação: promover a imagem/revisão estável anterior; não reconstruir nem reaplicar uma tag mutável. Mudanças de banco são recuperadas por migração corretiva compatível.

## Open Questions

- Confirmar durante a implementação os nomes definitivos do Workload Identity Pool/Provider e das duas contas de serviço, reutilizando recursos existentes somente se já tiverem privilégio mínimo.
- Decidir após o primeiro ensaio se o environment `production` terá aprovação humana temporária durante a adoção; o estado final desejado é automático.
- Definir retenção de revisões e imagens por custo/diagnóstico (sugestão inicial: 10 revisões e 30 dias de imagens não promovidas).
