# Versões de Terraform e dos providers, e onde o state fica guardado.
#
# As versões abaixo foram conferidas no registry/GitHub em 2026-08-15. O operador `~>`
# permite subir só o patch/minor, nunca o major — o pulo de major do provider Cloudflare
# (v4 -> v5) renomeou dezenas de resources e é exatamente o tipo de coisa que não pode
# acontecer sozinha.
#
# A versão exata que será usada fica travada em .terraform.lock.hcl, que É commitado.

terraform {
  # >= 1.11 porque o `use_lockfile` do backend s3 (lock de state sem DynamoDB) só ficou
  # GA nessa versão.
  required_version = ">= 1.11.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.68" # 1.68.0, publicado em 2026-07-28
    }

    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.23" # 5.23.0, publicado em 2026-08-05
    }

    # Gera o par de chaves e o CSR do Cloudflare Origin Certificate.
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }

    # Só para baixar a lista oficial de ranges de IP da Cloudflare e usá-la no firewall.
    http = {
      source  = "hashicorp/http"
      version = "~> 3.5"
    }
  }

  # ---------------------------------------------------------------------------------
  # State no R2, via a API S3-compatível.
  #
  # As flags skip_* existem porque o R2 não é a AWS: não tem STS, não tem IAM, não tem
  # metadata API de EC2, e a implementação de checksum diverge. Sem elas o backend falha
  # antes mesmo de tentar ler o state.
  #
  # `access_key`, `secret_key` e `endpoints.s3` NÃO ficam aqui — são segredos. Eles vêm
  # de backend.hcl (gitignored):
  #
  #     terraform init -backend-config=backend.hcl
  #
  # Sobre o ovo e a galinha (o bucket de state é criado por este mesmo Terraform):
  # resolvido criando o bucket À MÃO antes do primeiro init e adotando-o depois com um
  # bloco `import`. Ver README, seção "Bootstrap".
  # ---------------------------------------------------------------------------------
  backend "s3" {
    bucket = "linkhub-tfstate"
    key    = "prod/terraform.tfstate"
    region = "auto" # o R2 não tem regiões no sentido da AWS

    skip_credentials_validation = true # não existe STS no R2
    skip_region_validation      = true # "auto" não é uma região AWS válida
    skip_metadata_api_check     = true # não estamos em uma EC2
    skip_requesting_account_id  = true # não existe IAM no R2
    skip_s3_checksum            = true # o R2 rejeita o checksum extra que a AWS espera
    use_path_style              = true # https://<host>/<bucket>, não <bucket>.<host>

    # Lock nativo de state: grava um objeto .tflock ao lado do state usando PUT
    # condicional (If-None-Match), que o R2 suporta. Ver README, seção "Lock de state",
    # para o teste que confirma que está mesmo funcionando na sua conta.
    use_lockfile = true
  }
}
