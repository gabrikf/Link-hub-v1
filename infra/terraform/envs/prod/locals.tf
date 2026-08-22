# Valores derivados. Nada aqui cria recurso — é só cálculo.

# -------------------------------------------------------------------------------------
# Escolha do tipo de servidor
#
# Por que isto existe: os tipos cx22/cx32/cx42/cx52 saíram de linha para novos pedidos em
# 01/01/2026, e a família que os substituiu (CX Gen3: cx23, cx33, ...) NÃO é oferecida em
# todas as locations — em Ashburn ela não existe. Hardcodar um nome de tipo é, portanto,
# uma bomba-relógio. Aqui a lista vem da API, filtrada pela location de verdade.
# -------------------------------------------------------------------------------------

data "hcloud_server_types" "all" {}

locals {
  # Tipos que (a) atendem o piso de CPU/RAM, (b) são da arquitetura certa e
  # (c) estão realmente disponíveis e não depreciados NA location escolhida.
  server_type_candidates = [
    for t in data.hcloud_server_types.all.server_types : {
      name         = t.name
      cores        = t.cores
      memory       = t.memory
      disk         = t.disk
      cpu_type     = t.cpu_type
      architecture = t.architecture
    }
    if t.architecture == var.server_architecture
    && t.cores >= var.min_vcpu
    && t.memory >= var.min_memory_gb
    && anytrue([
      for l in t.locations : l.name == var.hcloud_location && l.available && !l.is_deprecated
    ])
  ]

  # RESSALVA IMPORTANTE: o provider hcloud não expõe preço em nenhum data source. Então
  # "mais barato" aqui é uma aproximação: o menor conjunto (memória, vCPU, disco) entre os
  # candidatos. Isso reproduz a ordem de preço da tabela da Hetzner, mas é uma proxy, não
  # o preço em si. Confira o output `server_type_candidates` antes do primeiro apply.
  #
  # Truque: Terraform não tem sort-by-key. Monta-se uma chave de texto com números
  # zero-preenchidos (largura fixa), aí a ordenação lexicográfica de sort() = ordenação
  # numérica.
  server_type_ranking = {
    for t in local.server_type_candidates :
    format("%09.2f|%09.2f|%09.2f|%s", t.memory, t.cores, t.disk, t.name) => t.name
  }

  cheapest_server_type = length(local.server_type_ranking) > 0 ? local.server_type_ranking[sort(keys(local.server_type_ranking))[0]] : null

  # var.server_type sempre vence, se preenchida.
  server_type = var.server_type != null ? var.server_type : local.cheapest_server_type
}

# -------------------------------------------------------------------------------------
# Hostnames
# -------------------------------------------------------------------------------------

locals {
  app_hostname = "${var.app_subdomain}.${var.domain}"
  api_hostname = "${var.api_subdomain}.${var.domain}"

  origin_cert_hostnames = distinct(concat([local.api_hostname], var.origin_cert_extra_hostnames))
}

# -------------------------------------------------------------------------------------
# Ranges de IP da Cloudflare, para o firewall da Hetzner
#
# Só é baixado quando var.restrict_http_to_cloudflare é true — o `count` nos data sources
# evita a chamada HTTP quando ela não vai ser usada.
# -------------------------------------------------------------------------------------

data "http" "cloudflare_ips_v4" {
  count = var.restrict_http_to_cloudflare ? 1 : 0
  url   = "https://www.cloudflare.com/ips-v4"
}

data "http" "cloudflare_ips_v6" {
  count = var.restrict_http_to_cloudflare ? 1 : 0
  url   = "https://www.cloudflare.com/ips-v6"
}

locals {
  cloudflare_ip_ranges = var.restrict_http_to_cloudflare ? compact(concat(
    [for line in split("\n", data.http.cloudflare_ips_v4[0].response_body) : trimspace(line)],
    [for line in split("\n", data.http.cloudflare_ips_v6[0].response_body) : trimspace(line)],
  )) : []

  # Quem pode falar 80/443 com a origem.
  http_source_ips = var.restrict_http_to_cloudflare ? local.cloudflare_ip_ranges : ["0.0.0.0/0", "::/0"]
}

# -------------------------------------------------------------------------------------
# Tags comuns (labels da Hetzner)
# -------------------------------------------------------------------------------------

locals {
  common_labels = {
    project   = var.project_name
    env       = "prod"
    managedby = "terraform"
  }
}
