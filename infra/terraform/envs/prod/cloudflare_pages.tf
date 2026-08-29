# Projeto do Cloudflare Pages que hospeda o front (Vite SPA), o domínio customizado
# app.<domínio> e as env vars de build.
#
# O Terraform cria e configura o projeto. O BUILD e o DEPLOY são disparados pela
# Cloudflare quando há push no repositório conectado — não por este código.

# -------------------------------------------------------------------------------------
# As env vars VITE_* do build no Pages.
#
# ESTA LISTA FOI CORRIGIDA CONTRA A REALIDADE. O critério é uma coisa só:
#
#     grep -rn "import.meta.env.VITE_" apps/web/src
#
# Ele devolve seis nomes — API_URL, GOOGLE_CLIENT_ID, MODEL_CDN_BASE_URL, SENTRY_DSN,
# SENTRY_ENVIRONMENT, SENTRY_RELEASE. Antes desta mudança o Terraform definia
# VITE_LINKEDIN_CLIENT_ID e VITE_LINKEDIN_REDIRECT_URI (que o front nunca leu — o login
# do LinkedIn é server-side, o botão só aponta para ${VITE_API_URL}/auth/linkedin) e não
# definia nenhum dos quatro que o front realmente lê. O resultado era um bundle sem
# Sentry e sem CDN de modelo, configurado com duas variáveis mortas.
#
# VITE_SENTRY_RELEASE fica de fora de propósito: o valor certo é o SHA do commit, e um
# valor estático marcaria todo erro com o mesmo release.
#
# `plain_text` e não `secret_text`: tudo que começa com VITE_ é embutido no bundle
# JavaScript em tempo de build e, portanto, é público por construção. Marcar como secret
# daria uma falsa sensação de proteção. Client ID de OAuth e DSN de browser são públicos
# por design; o client SECRET fica na API, nunca aqui.
#
# As opcionais entram por merge() em vez de virem com string vazia: uma env var definida
# como "" não é o mesmo que ausente — `import.meta.env.VITE_SENTRY_DSN` viraria "" e o
# código que testa a variável com truthiness passaria a ver uma string vazia em vez de
# undefined.
# -------------------------------------------------------------------------------------
locals {
  pages_env_vars = merge(
    {
      VITE_API_URL = {
        type  = "plain_text"
        value = "https://${local.api_hostname}"
      }
      VITE_GOOGLE_CLIENT_ID = {
        type  = "plain_text"
        value = var.vite_google_client_id
      }
    },
    var.vite_model_cdn_base_url == null ? {} : {
      VITE_MODEL_CDN_BASE_URL = {
        type  = "plain_text"
        value = var.vite_model_cdn_base_url
      }
    },
    var.vite_sentry_dsn == null ? {} : {
      VITE_SENTRY_DSN = {
        type  = "plain_text"
        value = var.vite_sentry_dsn
      }
      VITE_SENTRY_ENVIRONMENT = {
        type  = "plain_text"
        value = var.vite_sentry_environment
      }
    },
  )
}

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
      env_vars = local.pages_env_vars
    }

    # As mesmas variáveis nos deploys de preview, mas apontando para a mesma API. Se um dia
    # houver uma API de staging, é aqui que muda.
    #
    # VITE_SENTRY_ENVIRONMENT é o único que difere: erro de preview marcado como
    # "production" polui o painel do Sentry e faz alerta de produção disparar por causa de
    # um branch de teste.
    preview = {
      env_vars = merge(
        local.pages_env_vars,
        var.vite_sentry_dsn == null ? {} : {
          VITE_SENTRY_ENVIRONMENT = {
            type  = "plain_text"
            value = "preview"
          }
        },
      )
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

# -------------------------------------------------------------------------------------
# Domínio customizado do projeto Pages
#
# SEM ISTO O SITE NÃO ABRE. O CNAME de app.<domínio> em cloudflare_dns.tf aponta para
# <projeto>.pages.dev, mas o Pages só serve um hostname que o PROJETO reconhece como seu.
# Um CNAME sem este recurso resulta em `apply` verde, DNS resolvendo e a borda devolvendo
# a página de erro do Pages ("project not found" / 522) — a pior combinação possível,
# porque nada no Terraform indica problema.
#
# A documentação do provider é explícita: "a DNS record for the domain is not
# automatically created" — os dois recursos são independentes e são necessários os dois.
#
# depends_on no registro DNS: a Cloudflare valida a posse do hostname assim que ele é
# reivindicado, e a validação usa o próprio DNS. Reivindicar antes de o CNAME existir
# deixa o domínio parado em `status = "pending"` até alguém reparar.
# -------------------------------------------------------------------------------------
resource "cloudflare_pages_domain" "app" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.web.name
  name         = local.app_hostname

  depends_on = [cloudflare_dns_record.app]
}
