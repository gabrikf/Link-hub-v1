# Projeto do Cloudflare Pages que hospeda o front (Vite SPA).
#
# O Terraform cria e configura o projeto. O BUILD e o DEPLOY são disparados pela
# Cloudflare quando há push no repositório conectado — não por este código.

resource "cloudflare_pages_project" "web" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.pages_production_branch

  build_config = {
    build_command = var.pages_build_command

    # Caminhos relativos à raiz do monorepo. `npm run build:web` roda o turbo com filtro
    # no workspace `web`, e o Vite escreve em apps/web/dist.
    destination_dir = var.pages_output_dir
    root_dir        = "/"

    build_caching = true
  }

  deployment_configs = {
    production = {
      # Em v5 o atributo chama `env_vars` (na v4 era `environment_variables`), e cada
      # entrada é um objeto com `type` e `value`.
      #
      # `plain_text` e não `secret_text`: tudo que começa com VITE_ é embutido no bundle
      # JavaScript em tempo de build e, portanto, é público por construção. Marcar como
      # secret daria uma falsa sensação de proteção. Client ID de OAuth é público por
      # design; o client SECRET fica na API, nunca aqui.
      env_vars = {
        VITE_API_URL = {
          type  = "plain_text"
          value = "https://${local.api_hostname}"
        }
        VITE_GOOGLE_CLIENT_ID = {
          type  = "plain_text"
          value = var.vite_google_client_id
        }
        VITE_LINKEDIN_CLIENT_ID = {
          type  = "plain_text"
          value = var.vite_linkedin_client_id
        }
        VITE_LINKEDIN_REDIRECT_URI = {
          type  = "plain_text"
          value = var.vite_linkedin_redirect_uri
        }
      }
    }

    # As mesmas variáveis nos deploys de preview, mas apontando para a mesma API. Se um dia
    # houver uma API de staging, é aqui que muda.
    preview = {
      env_vars = {
        VITE_API_URL = {
          type  = "plain_text"
          value = "https://${local.api_hostname}"
        }
        VITE_GOOGLE_CLIENT_ID = {
          type  = "plain_text"
          value = var.vite_google_client_id
        }
        VITE_LINKEDIN_CLIENT_ID = {
          type  = "plain_text"
          value = var.vite_linkedin_client_id
        }
        VITE_LINKEDIN_REDIRECT_URI = {
          type  = "plain_text"
          value = var.vite_linkedin_redirect_uri
        }
      }
    }
  }

  # Conexão com o repositório Git.
  #
  # HISTÓRICO: no começo da v5 o bloco `source` era read-only, o que tornava impossível
  # criar um projeto ligado ao GitHub por Terraform (issues #5093 e #5176 do provider).
  # Ambas estão fechadas e na 5.23 o `source` aparece como Optional no schema — mas isso
  # só se confirma de fato em um `apply` real, e o apply está fora do escopo deste
  # diretório.
  #
  # Por isso o default de var.pages_git_source é null: o projeto sobe sem conexão de repo,
  # e você conecta pelo painel (Workers & Pages > o projeto > Settings > Builds > Git
  # repository). Se quiser tentar por Terraform, preencha a variável. Se o apply falhar
  # aqui, volte para null — o resto do projeto continua gerenciado normalmente.
  # (`source` é um atributo, não um bloco, no provider v5 — por isso `=` e um ternário em
  # vez de um bloco `dynamic`.)
  source = var.pages_git_source == null ? null : {
    type = "github"
    config = {
      owner                          = var.pages_git_source.owner
      repo_name                      = var.pages_git_source.repo
      production_branch              = var.pages_production_branch
      production_deployments_enabled = true
      preview_deployment_setting     = "all"
      pr_comments_enabled            = true
    }
  }
}
