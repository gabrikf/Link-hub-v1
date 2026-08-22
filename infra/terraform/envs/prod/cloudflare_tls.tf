# TLS entre a Cloudflare e a origem (Cloudflare Origin Certificate).
#
# POR QUE ISTO É NECESSÁRIO:
# Com o registro api.<domain> proxiado, quem responde ao mundo é a Cloudflare, e a origem
# nunca recebe o desafio HTTP-01/TLS-ALPN-01 do Let's Encrypt — os desafios chegam na
# borda, não no servidor. Logo, a emissão automática de certificado do Caddy NÃO consegue
# validar. (A alternativa seria o desafio DNS-01, que exigiria dar um token da Cloudflare
# com permissão de escrita em DNS para o Caddy dentro do container.)
#
# O Origin Certificate resolve isso: é emitido pela CA privada da Cloudflare, é aceito
# apenas por ela, e vale 15 anos. Ele NUNCA é visto pelo navegador — o certificado público
# é o Universal SSL da Cloudflare.
#
# Ele só tem valor se o modo da zona estiver em "Full (strict)" — ver
# cloudflare_zone_setting.ssl_mode em cloudflare_dns.tf.

resource "tls_private_key" "origin" {
  # ECDSA P-256: handshake mais barato que RSA-2048 e suportado por toda a borda da
  # Cloudflare.
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "origin" {
  private_key_pem = tls_private_key.origin.private_key_pem

  subject {
    common_name  = local.api_hostname
    organization = var.project_name
  }

  dns_names = local.origin_cert_hostnames
}

resource "cloudflare_origin_ca_certificate" "origin" {
  csr = tls_cert_request.origin.cert_request_pem

  hostnames = local.origin_cert_hostnames

  # "origin-ecc" precisa casar com o algoritmo da chave acima.
  request_type       = "origin-ecc"
  requested_validity = var.origin_cert_validity_days
}
