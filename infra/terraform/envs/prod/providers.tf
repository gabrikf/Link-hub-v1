# Configuração dos providers.
#
# Nenhum token aparece aqui. Todos vêm de variável de ambiente, para que um `cat` em
# qualquer arquivo deste diretório nunca revele credencial:
#
#   export HCLOUD_TOKEN="..."            # Hetzner Cloud > Security > API tokens (Read & Write)
#   export CLOUDFLARE_API_TOKEN="..."    # Cloudflare > Manage Account > API Tokens
#
# As permissões que o token da Cloudflare precisa estão listadas no README.

provider "hcloud" {
  # token via HCLOUD_TOKEN
}

provider "cloudflare" {
  # api_token via CLOUDFLARE_API_TOKEN
  #
  # Nota: o Origin CA (cloudflare_origin_ca_certificate) já aceita API token desde a
  # v3.32.0 do provider, com a permissão de zona "SSL and Certificates: Edit". A chave
  # legada X-Auth-User-Service-Key não é mais necessária, e por isso não há um provider
  # alias separado aqui.
}

provider "tls" {}

provider "http" {}
