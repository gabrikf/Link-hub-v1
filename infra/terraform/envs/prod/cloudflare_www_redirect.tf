# Redirecionamento de www.<domínio> para o apex.
#
# POR QUE ISTO PRECISA DE DOIS RECURSOS, e não de um "alias":
#
#   1. Uma Redirect Rule só roda na BORDA da Cloudflare. Se `www` não resolve para um IP
#      da Cloudflare, o navegador nunca chega na borda e a regra nunca é avaliada — o
#      usuário vê NXDOMAIN. Por isso existe o registro DNS abaixo, proxiado.
#   2. O registro sozinho também não basta: um CNAME proxiado de `www` para o apex faria
#      a borda servir o projeto Pages em www, e o Pages devolveria erro porque `www` não
#      é um custom domain dele. O que queremos é um 301, não conteúdo.
#
# Efeito final: https://www.crafthub.dev/qualquer/coisa?a=1 -> https://crafthub.dev/qualquer/coisa?a=1

resource "cloudflare_dns_record" "www" {
  count = var.redirect_www_to_apex ? 1 : 0

  zone_id = data.cloudflare_zone.main.id
  name    = "www.${var.domain}"
  type    = "CNAME"
  content = var.domain

  # Obrigatoriamente proxiado: é o que faz a requisição passar pela borda, onde a regra
  # abaixo existe. Com a nuvem cinza, o redirect simplesmente não acontece.
  proxied = true
  ttl     = 1
  comment = "www -> apex; existe so para a Redirect Rule ser avaliada (Terraform)"
}

resource "cloudflare_ruleset" "www_redirect" {
  count = var.redirect_www_to_apex ? 1 : 0

  zone_id = data.cloudflare_zone.main.id
  name    = "Redirect www to apex"
  kind    = "zone"

  # Fase de redirect dinâmico (Single Redirects). Disponível no plano free.
  # Não use `http_request_transform` para isto: transform reescreve a requisição sem
  # devolver 301, então o conteúdo passaria a existir em dois hostnames — que é
  # exatamente o problema de SEO que um redirect resolve.
  phase = "http_request_dynamic_redirect"

  rules = [{
    ref         = "www_to_apex"
    description = "301 de www.${var.domain} para ${var.domain}"
    expression  = "(http.host eq \"www.${var.domain}\")"
    action      = "redirect"

    action_parameters = {
      from_value = {
        # 301 (permanente) e não 302: o navegador e os buscadores passam a tratar o apex
        # como a URL canônica. É cacheado agressivamente pelo navegador — se algum dia
        # `www` precisar servir conteúdo próprio, contar com a troca do 301 para 302 não
        # funciona para quem já visitou.
        status_code = 301

        target_url = {
          # `concat` com o path preserva a rota: um link para /u/gabriel em www não pode
          # cair na home do apex.
          expression = "concat(\"https://${var.domain}\", http.request.uri.path)"
        }

        # Mantém ?utm_source=... e afins. Sem isto, toda atribuição de campanha que
        # chegasse por www seria perdida no redirect.
        preserve_query_string = true
      }
    }
  }]
}
