# Zona, modo de TLS e os dois registros DNS.

# A zona JÁ EXISTE. O Terraform só a lê para descobrir o zone_id.
data "cloudflare_zone" "main" {
  filter = {
    name = var.domain
  }
}

# -------------------------------------------------------------------------------------
# Modo SSL/TLS da zona
#
# "strict" é o que o painel chama de "Full (strict)": a Cloudflare exige HTTPS até a
# origem E valida o certificado dela. É a única configuração em que o Origin Certificate
# gerado em cloudflare_tls.tf tem alguma função de segurança — em "full" (sem strict) a
# Cloudflare aceita qualquer certificado, inclusive autoassinado por um atacante no meio
# do caminho; em "flexible" o trecho Cloudflare -> origem vai em texto claro.
#
# Isto é gerenciado pelo Terraform, não apenas verificado: alguém mexendo no painel é
# revertido no próximo apply.
# -------------------------------------------------------------------------------------
resource "cloudflare_zone_setting" "ssl_mode" {
  count = var.manage_zone_ssl_mode ? 1 : 0

  zone_id    = data.cloudflare_zone.main.id
  setting_id = "ssl"
  value      = "strict"
}

# -------------------------------------------------------------------------------------
# Registros
#
# Os dois estão PROXIADOS (nuvem laranja). Isso é deliberado:
#
#   - Com o proxy desligado, o tráfego não passa pela Cloudflare. WAF, mitigação de DDoS
#     e a regra de rate limit de borda (cloudflare_ratelimit.tf) simplesmente não são
#     aplicados — eles rodam na borda, e sem proxy não há borda.
#   - Sem proxy o IP do servidor fica publicado no DNS, e aí dá para furar o rate limit
#     batendo direto no IP. Por isso o firewall também restringe 80/443 aos ranges da
#     Cloudflare (var.restrict_http_to_cloudflare).
#
# ttl = 1 significa "automático". Registro proxiado não aceita outro valor: quem responde
# ao cliente é a Cloudflare, então o TTL do registro de origem não tem efeito.
# -------------------------------------------------------------------------------------

resource "cloudflare_dns_record" "app" {
  zone_id = data.cloudflare_zone.main.id
  name    = local.app_hostname
  type    = "CNAME"
  content = cloudflare_pages_project.web.subdomain
  proxied = true
  ttl     = 1
  comment = "Front (Vite SPA) no Cloudflare Pages - gerenciado por Terraform"
}

resource "cloudflare_dns_record" "api" {
  zone_id = data.cloudflare_zone.main.id
  name    = local.api_hostname
  type    = "A"
  content = hcloud_server.main.ipv4_address
  proxied = true
  ttl     = 1
  comment = "API Fastify na VPS Hetzner - gerenciado por Terraform"
}
