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
  # app_subdomain = "" significa APEX: o front serve em https://<domain>, sem subdominio.
  # Sem esta condicional, "" produziria ".crafthub.dev" — um hostname invalido que a
  # Cloudflare aceita criar e que nunca resolve, ou seja, uma falha silenciosa.
  #
  # CNAME no apex normalmente e proibido (um CNAME nao pode coexistir com os registros SOA
  # e NS que a raiz de uma zona obriga). A Cloudflare resolve isso com CNAME flattening:
  # ela segue o alvo do lado dela e responde A/AAAA. Como o registro aqui e proxiado, a
  # resposta ja seria o IP anycast da Cloudflare de qualquer jeito. Os registros de e-mail
  # do apex (SPF em TXT, e MX se houver) continuam funcionando normalmente — flattening
  # nao os afeta.
  app_hostname = var.app_subdomain == "" ? var.domain : "${var.app_subdomain}.${var.domain}"
  api_hostname = "${var.api_subdomain}.${var.domain}"

  origin_cert_hostnames = distinct(concat([local.api_hostname], var.origin_cert_extra_hostnames))

  # Onde SPF e MX do e-mail vao: no subdominio de envio quando o provedor usa return-path
  # proprio (Resend, SES), ou no apex quando nao usa. O DKIM e o DMARC NAO seguem esta
  # regra — DKIM fica em <dkim_record_name>.<dominio> e DMARC em _dmarc.<dominio>, sempre
  # relativos ao dominio do cabecalho From, porque e o alinhamento com ele que o DMARC
  # avalia.
  email_sending_hostname = var.email_provider == null ? var.domain : (
    try(var.email_provider.sending_subdomain, null) == null
    ? var.domain
    : "${var.email_provider.sending_subdomain}.${var.domain}"
  )
}

# -------------------------------------------------------------------------------------
# Ranges de IP da Cloudflare, para o firewall da Hetzner
#
# Só é baixado quando var.restrict_http_to_cloudflare é true — o `count` nos data sources
# evita a chamada HTTP quando ela não vai ser usada.
#
# ---------------------------------------------------------------------------------
# ISTO É UMA RESPOSTA HTTP EXTERNA VIRANDO REGRA DE FIREWALL DE PRODUÇÃO.
# ---------------------------------------------------------------------------------
# Vale insistir no que essas duas chamadas fazem: o corpo de uma resposta HTTP, buscada
# a cada plan, é escrito diretamente em `source_ips` do hcloud_firewall. Não há passo
# humano entre uma coisa e outra.
#
# Sem validação, um 200 com corpo inesperado — uma página de erro em HTML da borda, um
# corpo vazio, uma resposta de captive portal em uma rede de aeroporto, um proxy
# corporativo interceptando — reescreveria o firewall de produção sem nada errado
# aparecer no plan. Corpo vazio é o caso mais cruel: `compact()` devolveria uma lista
# vazia, o firewall ficaria sem NENHUMA origem permitida em 80/443, e a API sairia do ar
# de um jeito que não parece um erro de firewall.
#
# As postconditions abaixo transformam todos esses casos em falha de plan. Elas rodam na
# leitura do data source, ou seja, ANTES de qualquer recurso ser tocado.
#
# `postcondition` e não `check`: um bloco `check` só emite aviso e o apply continua. Aqui
# continuar é justamente o que não pode acontecer.
# -------------------------------------------------------------------------------------

data "http" "cloudflare_ips_v4" {
  count = var.restrict_http_to_cloudflare ? 1 : 0
  url   = "https://www.cloudflare.com/ips-v4"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "https://www.cloudflare.com/ips-v4 respondeu ${self.status_code}, não 200. Nenhuma regra de firewall foi alterada. Tente de novo, ou aplique com restrict_http_to_cloudflare = false se precisar seguir sem a restrição (e entenda que isso expõe o IP da origem)."
    }

    # O piso de 5 não é decorativo: a Cloudflare publica cerca de 15 ranges IPv4 e esse
    # número não muda há anos. Uma resposta com menos de 5 linhas válidas não é uma lista
    # que encolheu, é uma lista truncada ou outra coisa completamente.
    postcondition {
      condition = length([
        for line in split("\n", self.response_body) : trimspace(line)
        if trimspace(line) != ""
      ]) >= 5
      error_message = "A lista de IPv4 da Cloudflare veio com menos de 5 entradas. Isso é resposta corrompida, não uma lista que encolheu — o firewall NÃO foi alterado."
    }

    postcondition {
      condition = alltrue([
        for line in split("\n", self.response_body) :
        can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", trimspace(line)))
        if trimspace(line) != ""
      ])
      error_message = "A resposta de cloudflare.com/ips-v4 tem linha que não é um CIDR IPv4. Provavelmente veio HTML (página de erro, proxy corporativo ou captive portal) em vez da lista. O firewall NÃO foi alterado."
    }
  }
}

data "http" "cloudflare_ips_v6" {
  count = var.restrict_http_to_cloudflare ? 1 : 0
  url   = "https://www.cloudflare.com/ips-v6"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "https://www.cloudflare.com/ips-v6 respondeu ${self.status_code}, não 200. Nenhuma regra de firewall foi alterada."
    }

    # A lista IPv6 é bem menor que a IPv4 — cerca de 7 entradas. Daí o piso de 3.
    postcondition {
      condition = length([
        for line in split("\n", self.response_body) : trimspace(line)
        if trimspace(line) != ""
      ]) >= 3
      error_message = "A lista de IPv6 da Cloudflare veio com menos de 3 entradas — resposta corrompida. O firewall NÃO foi alterado."
    }

    postcondition {
      condition = alltrue([
        for line in split("\n", self.response_body) :
        can(regex("^[0-9A-Fa-f:]+/[0-9]{1,3}$", trimspace(line)))
        if trimspace(line) != ""
      ])
      error_message = "A resposta de cloudflare.com/ips-v6 tem linha que não é um CIDR IPv6. Provavelmente veio HTML em vez da lista. O firewall NÃO foi alterado."
    }
  }
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
