# Identidades do CI/CD

## Estado encontrado

- `ask-me-rag-sa@ask-me-rag.iam.gserviceaccount.com`: identidade de runtime do Cloud Run; acessa os segredos da aplicação.
- `238173721661-compute@developer.gserviceaccount.com`: conta padrão com `roles/editor`; foi usada pelos builds e aparece como último modificador do serviço.
- `238173721661@cloudbuild.gserviceaccount.com`: conta legada do Cloud Build com escrita no Artifact Registry, builder e administração do Cloud Run.
- Não havia Workload Identity Pool configurado.

## Estado desejado

| Identidade | Responsabilidade | Acessos |
| --- | --- | --- |
| `github-deploy@…` | Trocar o OIDC do GitHub por credencial temporária e enviar builds | criar builds, gravar somente no bucket de staging e atuar como `cloudbuild-deploy@…` |
| `cloudbuild-deploy@…` | Executar build, publicar imagem e promover revisões | gravar no repositório de imagens, atualizar Cloud Run, gravar logs e atuar como a identidade de runtime |
| `ask-me-rag-sa@…` | Executar a aplicação | acessar somente os segredos necessários à aplicação |

O provider OIDC aceita somente tokens cujo `repository` seja `DanielTrindade/ask-me-rag` e cujo `ref` seja `refs/heads/main`. Nenhuma conta usa chave JSON.

Após o primeiro deploy automatizado ser comprovado, remova `roles/editor` da conta padrão de Compute Engine e os papéis de deploy da conta legada do Cloud Build. Essa remoção é deliberadamente separada do bootstrap para preservar o rollback durante a adoção.

