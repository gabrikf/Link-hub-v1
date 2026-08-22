# Todas as variáveis do ambiente de produção.
# Valores reais vão em terraform.tfvars (gitignored). Ver terraform.tfvars.example.

# ---------------------------------------------------------------------------------
# Identidade / nomes
# ---------------------------------------------------------------------------------

variable "project_name" {
  description = "Prefixo usado para nomear todos os recursos (servidor, firewall, chave SSH, buckets, projeto Pages). Use só minúsculas, números e hífen."
  type        = string
  default     = "linkhub"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$", var.project_name))
    error_message = "project_name deve ter entre 3 e 32 caracteres, só minúsculas, números e hífen, sem começar ou terminar com hífen."
  }
}

variable "domain" {
  description = "Domínio raiz, já existente como zona na Cloudflare (ex.: linkhub.dev). O Terraform NÃO cria a zona — ela é lida como data source."
  type        = string
}

variable "app_subdomain" {
  description = "Subdomínio do front (Cloudflare Pages). Resulta em <app_subdomain>.<domain>."
  type        = string
  default     = "app"
}

variable "api_subdomain" {
  description = "Subdomínio da API (VPS Hetzner). Resulta em <api_subdomain>.<domain>."
  type        = string
  default     = "api"
}

# ---------------------------------------------------------------------------------
# Cloudflare — conta
# ---------------------------------------------------------------------------------

variable "cloudflare_account_id" {
  description = "ID da conta Cloudflare (painel > qualquer domínio > barra lateral direita > Account ID). Não é segredo, mas identifica a conta."
  type        = string
}

# ---------------------------------------------------------------------------------
# Hetzner — servidor
# ---------------------------------------------------------------------------------

variable "hcloud_location" {
  description = "Location da Hetzner Cloud onde o servidor roda. 'ash' = Ashburn (Virgínia, EUA). ATENÇÃO: os tipos disponíveis mudam por location — a família CX Gen3 (cx23 etc.) só existe em nbg1/fsn1/hel1. Em 'ash' o mais barato com 2 vCPU e 4 GB é o cpx21."
  type        = string
  default     = "ash"
}

variable "server_type" {
  description = "Tipo do servidor Hetzner. Deixe null para o Terraform listar os tipos realmente disponíveis em var.hcloud_location e escolher o menor que atende min_vcpu/min_memory_gb. Preencha só para forçar um tipo específico (ex.: 'cpx31' para subir de porte)."
  type        = string
  default     = null
}

variable "min_vcpu" {
  description = "Piso de vCPUs usado na escolha automática do tipo de servidor."
  type        = number
  default     = 2
}

variable "min_memory_gb" {
  description = "Piso de memória em GB usado na escolha automática do tipo de servidor. 4 GB é o mínimo para postgres+pgvector, redis, API e 2 workers no mesmo host."
  type        = number
  default     = 4
}

variable "server_architecture" {
  description = "Arquitetura de CPU exigida na escolha automática: 'x86' ou 'arm'. Mantenha x86 enquanto as imagens Docker do projeto não forem multi-arch."
  type        = string
  default     = "x86"

  validation {
    condition     = contains(["x86", "arm"], var.server_architecture)
    error_message = "server_architecture deve ser 'x86' ou 'arm'."
  }
}

variable "server_image" {
  description = "Imagem base do servidor. O cloud-init deste diretório assume Ubuntu 24.04 (apt, ufw, sshd_config.d)."
  type        = string
  default     = "ubuntu-24.04"
}

variable "enable_backups" {
  description = "Liga o backup automático da Hetzner (snapshots diários). Custa +20% do preço do servidor. O backup do banco vai para o R2 e é responsabilidade da aplicação — isto aqui é o backup da máquina inteira."
  type        = bool
  default     = false
}

variable "enable_delete_protection" {
  description = "Impede que o servidor seja destruído pela API da Hetzner. Com true, um `terraform destroy` falha até você desligar isto e aplicar de novo — que é o comportamento desejado em produção."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------------
# Acesso SSH
# ---------------------------------------------------------------------------------

variable "ssh_public_key" {
  description = "Conteúdo da chave SSH PÚBLICA (linha inteira, começando com 'ssh-ed25519' ou 'ssh-rsa') que terá acesso ao usuário 'deploy'. Nunca coloque a chave privada aqui."
  type        = string

  validation {
    condition     = can(regex("^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) ", trimspace(var.ssh_public_key)))
    error_message = "ssh_public_key deve ser uma chave pública OpenSSH (conteúdo do arquivo .pub), não um caminho e não a chave privada."
  }
}

variable "ssh_allowed_ips" {
  description = "CIDRs autorizados a abrir conexão SSH (porta 22) no firewall da Hetzner. O default deixa aberto para o mundo; restrinja para o IP fixo da sua casa/escritório e para os ranges do GitHub Actions se o deploy usar SSH."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "restrict_http_to_cloudflare" {
  description = "Se true, as portas 80/443 só aceitam conexão dos ranges oficiais da Cloudflare (baixados de cloudflare.com/ips-v4 e ips-v6 no plan). Isso fecha o furo de bater direto no IP do servidor e pular o rate limit de borda. Custo: healthcheck direto no IP para de funcionar, e o plan passa a depender de uma chamada HTTP externa."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------------
# Origin Certificate (TLS entre Cloudflare e o servidor)
# ---------------------------------------------------------------------------------

variable "origin_cert_validity_days" {
  description = "Validade do Cloudflare Origin Certificate em dias. Valores aceitos pela API: 7, 30, 90, 365, 730, 1095, 5475. 5475 = 15 anos, que é o padrão para certificado de origem (ele nunca é visto pelo navegador)."
  type        = number
  default     = 5475

  validation {
    condition     = contains([7, 30, 90, 365, 730, 1095, 5475], var.origin_cert_validity_days)
    error_message = "origin_cert_validity_days deve ser um de: 7, 30, 90, 365, 730, 1095, 5475."
  }
}

variable "origin_cert_extra_hostnames" {
  description = "Hostnames adicionais no Origin Certificate, além de api.<domain>. Aceita curinga de um nível (ex.: '*.linkhub.dev'). Deixe vazio se só a API fala com a origem."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------------
# R2
# ---------------------------------------------------------------------------------

variable "uploads_bucket_name" {
  description = "Nome do bucket R2 de uploads da aplicação (currículos, avatares). Nome de bucket é global dentro da conta."
  type        = string
  default     = "linkhub-uploads"
}

variable "tfstate_bucket_name" {
  description = "Nome do bucket R2 que guarda o state deste Terraform. Precisa bater exatamente com o `bucket` do backend em versions.tf. Este bucket é criado À MÃO no bootstrap e depois adotado por um bloco import — ver README."
  type        = string
  default     = "linkhub-tfstate"
}

variable "r2_location_hint" {
  description = "Dica de localização do bucket R2 de uploads: apac, eeur, enam, weur, wnam, oc. 'enam' = leste da América do Norte, mais perto de Ashburn. É best-effort e só vale na criação do bucket."
  type        = string
  default     = "enam"

  validation {
    condition     = contains(["apac", "eeur", "enam", "weur", "wnam", "oc"], var.r2_location_hint)
    error_message = "r2_location_hint deve ser um de: apac, eeur, enam, weur, wnam, oc."
  }
}

# ---------------------------------------------------------------------------------
# Cloudflare Pages (front Vite)
# ---------------------------------------------------------------------------------

variable "pages_project_name" {
  description = "Nome do projeto no Cloudflare Pages. Vira também o subdomínio <nome>.pages.dev, que é o alvo do CNAME de app.<domain>."
  type        = string
  default     = "linkhub-web"
}

variable "pages_production_branch" {
  description = "Branch que o Pages considera produção."
  type        = string
  default     = "main"
}

variable "pages_git_source" {
  description = <<-EOT
    Conexão do repositório Git no Pages. Deixe null (default) para conectar o repositório
    pelo PAINEL da Cloudflare — o resto do projeto continua gerenciado por Terraform.

    Contexto: o bloco `source` era read-only na v5 inicial do provider (issues #5093 e
    #5176), o que impedia criar o projeto com origem GitHub via Terraform. As issues estão
    fechadas e o `source` aparece como Optional no schema da 5.23, mas isso só se confirma
    de fato em um `apply` real. Se o apply falhar aqui, volte esta variável para null e
    conecte o repo pelo painel.

    Exemplo:
      pages_git_source = {
        owner = "gabrikf"
        repo  = "linkhub-v.1"
      }
  EOT
  type = object({
    owner = string
    repo  = string
  })
  default = null
}

variable "pages_build_command" {
  description = "Comando de build do front, executado na raiz do monorepo."
  type        = string
  default     = "npm run build:web"
}

variable "pages_output_dir" {
  description = "Diretório com os arquivos estáticos gerados, relativo à raiz do monorepo."
  type        = string
  default     = "apps/web/dist"
}

variable "vite_google_client_id" {
  description = "VITE_GOOGLE_CLIENT_ID — client ID OAuth do Google usado pelo front. É público por natureza (vai no bundle), mas as origens autorizadas precisam ser cadastradas À MÃO no Google Cloud Console. Ver README."
  type        = string
}

variable "vite_linkedin_client_id" {
  description = "VITE_LINKEDIN_CLIENT_ID — client ID OAuth do LinkedIn usado pelo front. Também público, e o redirect URI precisa ser cadastrado À MÃO no LinkedIn Developers."
  type        = string
}

variable "vite_linkedin_redirect_uri" {
  description = "VITE_LINKEDIN_REDIRECT_URI — URL exata de callback do OAuth do LinkedIn. Precisa bater caractere a caractere com o que estiver cadastrado no LinkedIn Developers."
  type        = string
}

# ---------------------------------------------------------------------------------
# Rate limit de borda (WAF)
# ---------------------------------------------------------------------------------

variable "rate_limited_path" {
  description = "Prefixo de path protegido pela regra de rate limit de borda. Default: o endpoint que dispara a chamada à OpenAI (parse de currículo), que é o mais caro do sistema."
  type        = string
  default     = "/api/v1/me/resume/ai-import/parse"
}

variable "rate_limit_requests_per_period" {
  description = "Quantas requisições no período antes de a regra disparar, contadas por IP."
  type        = number
  default     = 5
}

variable "rate_limit_period_seconds" {
  description = "Janela de contagem em segundos. Valores aceitos pela API: 10, 60, 120, 300, 600, 3600 — mas o PLANO FREE trava em 10. Só aumente se a zona estiver em plano pago."
  type        = number
  default     = 10

  validation {
    condition     = contains([10, 60, 120, 300, 600, 3600], var.rate_limit_period_seconds)
    error_message = "rate_limit_period_seconds deve ser um de: 10, 60, 120, 300, 600, 3600."
  }
}

variable "rate_limit_mitigation_timeout_seconds" {
  description = "Por quantos segundos a ação continua aplicada depois de disparar. No plano free isso também é travado em 10."
  type        = number
  default     = 10
}

variable "rate_limit_action" {
  description = "Ação da regra: 'block', 'managed_challenge', 'js_challenge', 'challenge' ou 'log'. Use 'log' para observar o volume antes de bloquear de verdade."
  type        = string
  default     = "block"

  validation {
    condition     = contains(["block", "managed_challenge", "js_challenge", "challenge", "log"], var.rate_limit_action)
    error_message = "rate_limit_action deve ser um de: block, managed_challenge, js_challenge, challenge, log."
  }
}

# ---------------------------------------------------------------------------------
# TLS da zona
# ---------------------------------------------------------------------------------

variable "manage_zone_ssl_mode" {
  description = "Se true, o Terraform força o modo SSL/TLS da zona para 'strict' (= 'Full (strict)' no painel). Isso é obrigatório para o Origin Certificate deste diretório fazer sentido: em qualquer modo abaixo disso a Cloudflare não valida o certificado da origem. Só desligue se outro processo já gerencia esse setting."
  type        = bool
  default     = true
}
