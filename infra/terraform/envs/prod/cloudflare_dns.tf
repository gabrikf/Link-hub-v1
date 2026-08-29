# Zona, modo de TLS, os dois registros de aplicação e os registros de e-mail.

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
# Registros da aplicação
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

# =====================================================================================
# Registros de e-mail — SPF, DKIM, DMARC e (opcional) MX
#
# Tudo aqui é NO-OP enquanto var.email_provider for null, que é o default. Um operador
# que ainda não escolheu provedor de e-mail aplica este diretório e não vê nenhum
# registro novo. Ver a descrição da variável em variables.tf.
#
# POR QUE ISTO IMPORTA: sem SPF/DKIM/DMARC, (a) qualquer um pode mandar e-mail se
# passando por @<domínio> e nenhum receptor tem como detectar, e (b) o e-mail legítimo de
# verificação de conta cai em spam com frequência alta — Gmail e Outlook penalizam
# remetente não autenticado desde 2024. Uma verificação de e-mail que não chega é um
# cadastro que não se completa.
#
# NENHUM DESTES REGISTROS É PROXIÁVEL. Proxy só existe para HTTP; TXT e MX nem aparecem
# com a opção. `proxied = false` está explícito para não deixar dúvida a quem lê.
#
# ttl = 1 é "automático" (a Cloudflare resolve para 300s em registro não proxiado). Vale
# tanto para propagar rápido a primeira configuração quanto para uma troca de provedor.
#
# SOBRE ASPAS EM TXT: o `content` vai SEM aspas envolvendo o valor. É o que o provider v5
# espera — o teste de migração v4→v5 do próprio provider afirma `content == "v=spf1 -all"`
# sem aspas. Escrever "\"v=spf1 ...\"" criaria um TXT cujo texto contém aspas literais, e
# nenhum validador de SPF reconheceria.
# =====================================================================================

# -------------------------------------------------------------------------------------
# SPF — quem tem autorização para mandar e-mail em nome do domínio.
#
# Fica no APEX do domínio (não em um subdomínio) porque é o envelope-from que o receptor
# checa, e ele usa <algo>@<domínio>.
#
# `-all` (hard fail) e não `~all` (soft fail): soft fail pede ao receptor que aceite o
# e-mail não autorizado e apenas o marque, o que na prática significa que a falsificação
# continua entregando. Com um único provedor declarado, hard fail é a resposta correta e
# não tem ambiguidade.
#
# UM DOMÍNIO SÓ PODE TER UM REGISTRO SPF. Se você já manda e-mail por outro serviço
# (Google Workspace, por exemplo), NÃO adicione um segundo TXT: junte os includes no
# mesmo valor. Este recurso assume que este provedor é o único.
# -------------------------------------------------------------------------------------
resource "cloudflare_dns_record" "spf" {
  count = var.email_provider == null ? 0 : 1

  zone_id = data.cloudflare_zone.main.id

  # APEX ou SUBDOMINIO DE ENVIO, conforme o provedor.
  #
  # O SPF e verificado contra o dominio do MAIL FROM (envelope), nao contra o cabecalho
  # From que o usuario ve. Provedores que usam return-path proprio (`send.<dominio>`)
  # exigem o registro NESSE nome — publicar no apex, nesse caso, nao autentica nada e a
  # verificacao do provedor fica "pending" para sempre.
  name    = local.email_sending_hostname
  type    = "TXT"
  content = "v=spf1 include:${var.email_provider.spf_include} ${var.email_provider.spf_qualifier}"
  proxied = false
  ttl     = 1
  comment = "SPF - autoriza ${var.email_provider.spf_include} a mandar e-mail (Terraform)"
}

# -------------------------------------------------------------------------------------
# DKIM — a assinatura criptográfica que prova que a mensagem não foi forjada nem alterada.
#
# TXT ou CNAME, conforme o provedor: quem publica CNAME (Resend, SES) mantém a chave do
# lado dele e pode rotacioná-la sem tocar no seu DNS; quem publica TXT põe a chave pública
# aqui. Os dois são legítimos — o que não pode é escolher o tipo errado, e por isso a
# variável tem validação.
#
# Um `dynamic` não serve aqui: type é atributo obrigatório e muda o recurso inteiro.
# Dois recursos com `count` mutuamente exclusivo é mais longo e muito mais fácil de ler
# num plan.
# -------------------------------------------------------------------------------------
resource "cloudflare_dns_record" "dkim_txt" {
  count = var.email_provider != null && try(var.email_provider.dkim_record_type, "") == "TXT" ? 1 : 0

  zone_id = data.cloudflare_zone.main.id
  name    = "${var.email_provider.dkim_record_name}.${var.domain}"
  type    = "TXT"
  content = var.email_provider.dkim_record_value
  proxied = false
  ttl     = 1
  comment = "DKIM (TXT) - chave publica de assinatura do provedor de e-mail (Terraform)"
}

resource "cloudflare_dns_record" "dkim_cname" {
  count = var.email_provider != null && try(var.email_provider.dkim_record_type, "") == "CNAME" ? 1 : 0

  zone_id = data.cloudflare_zone.main.id
  name    = "${var.email_provider.dkim_record_name}.${var.domain}"
  type    = "CNAME"
  content = var.email_provider.dkim_record_value

  # Proxy em um CNAME de DKIM quebraria a validação: o resolvedor receberia um IP da
  # Cloudflare em vez do alvo, e o provedor nunca acharia a chave.
  proxied = false
  ttl     = 1
  comment = "DKIM (CNAME) - delega a chave de assinatura ao provedor de e-mail (Terraform)"
}

# -------------------------------------------------------------------------------------
# DMARC — o que o receptor deve fazer quando SPF e DKIM falham, e para onde mandar o
# relatório.
#
# Sem DMARC, SPF e DKIM produzem um veredito que ninguém age sobre: cada receptor decide
# sozinho. DMARC é o registro que transforma os dois em política.
#
# `pct` não é declarado (default 100) e `sp` herda de `p`. Se você precisar de rollout
# gradual, isso é uma decisão consciente e vira campo no objeto — não um default
# escondido.
# -------------------------------------------------------------------------------------
resource "cloudflare_dns_record" "dmarc" {
  count = var.email_provider == null ? 0 : 1

  zone_id = data.cloudflare_zone.main.id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  content = "v=DMARC1; p=${var.email_provider.dmarc_policy}; rua=mailto:${var.email_provider.dmarc_report_email}; fo=1"
  proxied = false
  ttl     = 1
  comment = "DMARC - politica '${var.email_provider.dmarc_policy}' e relatorios para ${var.email_provider.dmarc_report_email} (Terraform)"
}

# -------------------------------------------------------------------------------------
# MX — só para RECEBER e-mail. Default [] = nenhum MX criado.
#
# Mandar e-mail não precisa de MX. Isto existe porque o endereço de rua= do DMARC e o
# no-reply do MAIL_FROM ficam melhores em um domínio que também recebe (bounce, resposta
# de usuário confuso). Se o domínio já recebe e-mail em outro lugar, DEIXE VAZIO: declarar
# MX aqui substituiria o roteamento existente e o e-mail pararia de chegar.
# -------------------------------------------------------------------------------------
resource "cloudflare_dns_record" "mx" {
  count = var.email_provider == null ? 0 : length(var.email_provider.mx)

  zone_id = data.cloudflare_zone.main.id

  # Mesmo nome do SPF. Com `sending_subdomain` preenchido isto NAO e o MX do dominio: e o
  # MX do return-path, que existe para o provedor receber bounces e reclamacoes. Ele nao
  # toca o roteamento de e-mail do apex — que e exatamente por que essa disposicao e mais
  # segura do que declarar MX na raiz.
  name     = local.email_sending_hostname
  type     = "MX"
  content  = var.email_provider.mx[count.index].host
  priority = var.email_provider.mx[count.index].priority
  proxied  = false
  ttl      = 1
  comment  = "MX - recebimento de e-mail do dominio (Terraform)"
}
