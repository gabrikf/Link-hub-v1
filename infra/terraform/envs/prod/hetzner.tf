# Servidor Hetzner: chave SSH, firewall e a VPS em si.

resource "hcloud_ssh_key" "deploy" {
  name       = "${var.project_name}-deploy"
  public_key = trimspace(var.ssh_public_key)
  labels     = local.common_labels
}

# -------------------------------------------------------------------------------------
# Firewall
#
# É aplicado pela Hetzner ANTES do pacote chegar na máquina, então funciona mesmo que o
# ufw da VPS esteja desligado ou mal configurado. As duas camadas são redundantes de
# propósito.
#
# Só há regras de entrada. Saída fica liberada (o servidor precisa falar com apt,
# registry de imagens, OpenAI, R2, LinkedIn...).
# -------------------------------------------------------------------------------------

resource "hcloud_firewall" "main" {
  name   = "${var.project_name}-fw"
  labels = local.common_labels

  # ICMP: ping e, mais importante, Path MTU Discovery. Bloquear ICMP quebra conexões de
  # forma difícil de diagnosticar.
  rule {
    direction   = "in"
    protocol    = "icmp"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "ICMP (ping e path MTU discovery)"
  }

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.ssh_allowed_ips
    description = "SSH"
  }

  # 80 continua aberto porque a Cloudflare fala HTTP com a origem em alguns caminhos e
  # porque o redirect http->https do Caddy precisa responder.
  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = local.http_source_ips
    description = var.restrict_http_to_cloudflare ? "HTTP (somente ranges Cloudflare)" : "HTTP (aberto)"
  }

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = local.http_source_ips
    description = var.restrict_http_to_cloudflare ? "HTTPS (somente ranges Cloudflare)" : "HTTPS (aberto)"
  }

  # Segunda linha de defesa para a lista de IPs da Cloudflare, que é montada a partir de
  # uma resposta HTTP externa (ver locals.tf). As postconditions de lá já pegam corpo
  # vazio e corpo malformado; esta precondition existe porque o custo de errar aqui é
  # produção fora do ar, e uma checagem redundante no ponto exato do uso vale o parágrafo
  # que ocupa. Uma lista vazia é o modo de falha silencioso: o firewall seria criado sem
  # nenhuma origem permitida em 80/443 e a API pararia de responder sem erro nenhum.
  lifecycle {
    precondition {
      condition     = length(local.http_source_ips) > 0
      error_message = "A lista de origens permitidas em 80/443 ficou vazia. Isso deixaria a origem inalcançável. Confira o download dos ranges da Cloudflare em locals.tf ou aplique com restrict_http_to_cloudflare = false."
    }
  }
}

# -------------------------------------------------------------------------------------
# A VPS
# -------------------------------------------------------------------------------------

resource "hcloud_server" "main" {
  name        = "${var.project_name}-prod"
  image       = var.server_image
  server_type = local.server_type

  # `location`, não `datacenter`: o atributo datacenter está marcado para remoção desde a
  # v1.67.0 do provider e a API da Hetzner passa a responder 410 Gone depois de
  # 01/10/2026.
  location = var.hcloud_location

  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.main.id]

  backups = var.enable_backups

  # As duas precisam ter o mesmo valor — é exigência do provider.
  delete_protection  = var.enable_delete_protection
  rebuild_protection = var.enable_delete_protection

  shutdown_before_deletion = true

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  # ATENÇÃO: mudar o user_data RECRIA o servidor. É por isso que o cloud-init é
  # deliberadamente mínimo — ele para no "host pronto para receber deploy". Qualquer coisa
  # que mude com frequência (versão da app, compose, variáveis) é trabalho do GitHub
  # Actions, não daqui.
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    deploy_user    = "deploy"
    ssh_public_key = trimspace(var.ssh_public_key)
  })

  labels = local.common_labels

  lifecycle {
    precondition {
      condition     = local.server_type != null
      error_message = <<-EOT
        Nenhum tipo de servidor disponível em '${var.hcloud_location}' atende
        min_vcpu=${var.min_vcpu}, min_memory_gb=${var.min_memory_gb} e
        architecture='${var.server_architecture}'.

        Rode `terraform console` e inspecione `local.server_type_candidates` para ver o
        que a API está devolvendo, ou baixe os pisos / troque a location.
      EOT
    }
  }
}
