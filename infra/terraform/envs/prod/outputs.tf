# Saídas.
#
# Para ler um valor sensitive:
#     terraform output -raw origin_private_key
#
# Nunca redirecione um valor sensitive para um arquivo dentro do repositório.

# -------------------------------------------------------------------------------------
# Servidor
# -------------------------------------------------------------------------------------

output "server_ipv4" {
  description = "IP público IPv4 do servidor. É o alvo do registro A de api.<domain> e o host para o SSH do deploy."
  value       = hcloud_server.main.ipv4_address
}

output "server_ipv6" {
  description = "IP público IPv6 do servidor."
  value       = hcloud_server.main.ipv6_address
}

output "server_type_chosen" {
  description = "Tipo de servidor efetivamente usado (escolhido automaticamente ou forçado por var.server_type)."
  value       = local.server_type
}

output "server_type_candidates" {
  description = "Todos os tipos disponíveis na location que atendem os pisos de vCPU/RAM, com specs. Confira esta lista antes do primeiro apply: o provider não expõe preço, então a escolha automática usa (memória, vCPU, disco) como aproximação do mais barato."
  value       = local.server_type_candidates
}

output "ssh_command" {
  description = "Comando pronto para abrir sessão no servidor."
  value       = "ssh deploy@${hcloud_server.main.ipv4_address}"
}

# -------------------------------------------------------------------------------------
# DNS
# -------------------------------------------------------------------------------------

output "app_url" {
  description = "URL pública do front."
  value       = "https://${local.app_hostname}"
}

output "api_url" {
  description = "URL pública da API. É este valor que vai em VITE_API_URL."
  value       = "https://${local.api_hostname}"
}

output "cloudflare_zone_id" {
  description = "ID da zona Cloudflare, útil para configurar outras integrações."
  value       = data.cloudflare_zone.main.id
}

# -------------------------------------------------------------------------------------
# Origin Certificate
#
# Estes dois viram DOIS SECRETS DO REPOSITÓRIO, em base64, e o job de deploy os escreve
# no servidor a cada release. O passo existe de verdade — "Entregar o Origin Certificate"
# em .github/workflows/deploy.yml — e o Caddyfile os consome com a diretiva `tls`.
#
# Como preencher os secrets (base64 numa linha só; o `envs:` do appleboy/ssh-action não
# atravessa valor multi-linha, e um PEM é multi-linha por definição):
#
#     terraform output -raw origin_certificate | base64 -w0   # -> CADDY_ORIGIN_CERT_B64
#     terraform output -raw origin_private_key | base64 -w0   # -> CADDY_ORIGIN_KEY_B64
#
# No macOS o flag é `base64` sem -w0 (ele já não quebra linha).
#
# base64 NÃO é criptografia — é só transporte. O sigilo continua sendo o do GitHub
# Secrets.
# -------------------------------------------------------------------------------------

output "origin_certificate" {
  description = "Cloudflare Origin Certificate em PEM. Vai em /etc/caddy/origin.pem no servidor."
  value       = cloudflare_origin_ca_certificate.origin.certificate
}

output "origin_private_key" {
  description = "Chave privada do Origin Certificate em PEM. Vai em /etc/caddy/origin.key no servidor, com permissão 0600."
  value       = tls_private_key.origin.private_key_pem
  sensitive   = true
}

output "origin_certificate_expires_on" {
  description = "Data de expiração do Origin Certificate."
  value       = cloudflare_origin_ca_certificate.origin.expires_on
}

# -------------------------------------------------------------------------------------
# R2 / credenciais S3 da aplicação
# -------------------------------------------------------------------------------------

output "r2_uploads_bucket" {
  description = "Nome do bucket R2 de uploads."
  value       = cloudflare_r2_bucket.uploads.name
}

output "s3_endpoint" {
  description = "Endpoint S3 do R2. Vai na env var S3_ENDPOINT da API."
  value       = local.s3_endpoint
}

output "s3_access_key_id" {
  description = "S3_ACCESS_KEY_ID da aplicação. É o id do API token (ver cloudflare_r2.tf)."
  value       = local.s3_access_key_id
  sensitive   = true
}

output "s3_secret_access_key" {
  description = "S3_SECRET_ACCESS_KEY da aplicação. É o SHA-256 do value do API token — derivação documentada pela Cloudflare, não invenção. Teste o par antes de confiar nele (ver README)."
  value       = local.s3_secret_access_key
  sensitive   = true
}

# -------------------------------------------------------------------------------------
# Pages
# -------------------------------------------------------------------------------------

output "pages_project_name" {
  description = "Nome do projeto no Cloudflare Pages."
  value       = cloudflare_pages_project.web.name
}

output "pages_subdomain" {
  description = "Subdomínio *.pages.dev do projeto. É o alvo do CNAME de app.<domain>."
  value       = cloudflare_pages_project.web.subdomain
}

output "pages_repo_connected_by_terraform" {
  description = "false significa que a conexão do repositório Git precisa ser feita à mão no painel da Cloudflare."
  value       = var.pages_git_source != null
}

# -------------------------------------------------------------------------------------
# Firewall
# -------------------------------------------------------------------------------------

output "http_allowed_source_ips" {
  description = "CIDRs que podem falar 80/443 com a origem. Quando restrict_http_to_cloudflare é true, é a lista oficial de ranges da Cloudflare."
  value       = local.http_source_ips
}

# -------------------------------------------------------------------------------------
# E-mail
# -------------------------------------------------------------------------------------

output "email_dns_managed" {
  description = "false significa que var.email_provider está null e NENHUM registro de e-mail (SPF/DKIM/DMARC/MX) é gerenciado — o domínio continua falsificável e a API precisa rodar com MAIL_TRANSPORT=log."
  value       = var.email_provider != null
}

output "email_dns_records" {
  description = "Os registros de e-mail que este diretório gerencia, para conferir contra o painel do provedor. Vazio quando email_provider é null."
  value = var.email_provider == null ? [] : concat(
    [
      "TXT  ${local.email_sending_hostname}  ->  v=spf1 include:${var.email_provider.spf_include} ${var.email_provider.spf_qualifier}",
      "TXT  _dmarc.${var.domain}  ->  v=DMARC1; p=${var.email_provider.dmarc_policy}; rua=mailto:${var.email_provider.dmarc_report_email}; fo=1",
      "${var.email_provider.dkim_record_type}  ${var.email_provider.dkim_record_name}.${var.domain}  ->  ${var.email_provider.dkim_record_value}",
    ],
    [
      for record in var.email_provider.mx :
      "MX   ${local.email_sending_hostname}  ->  ${record.host} (prioridade ${record.priority})"
    ],
  )
}

output "app_pages_domain_status" {
  description = "Status do domínio customizado no projeto Pages. 'active' é o que faz app.<domínio> realmente servir o site; 'pending' significa que a Cloudflare ainda está validando a posse pelo DNS."
  value       = cloudflare_pages_domain.app.status
}
