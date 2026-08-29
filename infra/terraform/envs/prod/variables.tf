# Todas as variáveis do ambiente de produção.
# Valores reais vão em terraform.tfvars (gitignored). Ver terraform.tfvars.example.

# ---------------------------------------------------------------------------------
# Identidade / nomes
# ---------------------------------------------------------------------------------

variable "project_name" {
  description = "Prefixo usado para nomear todos os recursos (servidor, firewall, chave SSH, buckets, projeto Pages). Use só minúsculas, números e hífen."
  type        = string
  default     = "crafthub"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$", var.project_name))
    error_message = "project_name deve ter entre 3 e 32 caracteres, só minúsculas, números e hífen, sem começar ou terminar com hífen."
  }
}

variable "domain" {
  description = "Domínio raiz, já existente como zona na Cloudflare (ex.: crafthub.dev). O Terraform NÃO cria a zona — ela é lida como data source."
  type        = string
}

variable "app_subdomain" {
  description = <<-EOT
    Subdomínio do front (Cloudflare Pages). Resulta em <app_subdomain>.<domain>.

    STRING VAZIA ("") = APEX: o front serve direto em https://<domain>. Isso funciona
    porque a zona está na Cloudflare (obrigatório para apex no Pages) e a Cloudflare faz
    CNAME flattening na raiz. Os registros de e-mail do apex (SPF, DMARC, MX) continuam
    válidos — flattening não conflita com TXT nem com MX.

    O default continua "app" porque é a escolha reversível: mover o app do apex para um
    subdomínio depois quebra todo link já compartilhado, enquanto o caminho contrário não.
  EOT
  type        = string
  default     = "app"

  # Um subdomínio com ponto, espaço ou o domínio repetido no fim gera um hostname que a
  # Cloudflare cria sem reclamar e que nunca resolve. Melhor falhar no plan.
  validation {
    condition     = var.app_subdomain == "" || can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.app_subdomain))
    error_message = "app_subdomain deve ser um único rótulo DNS (só minúsculas, números e hífen) ou \"\" para servir no apex."
  }
}

variable "redirect_www_to_apex" {
  description = <<-EOT
    Cria www.<domain> e uma Redirect Rule 301 dele para o apex.

    Só faz sentido quando o front está no apex (app_subdomain = ""). Com o app em um
    subdomínio, o destino natural de www seria esse subdomínio e a regra abaixo mandaria
    o visitante para um hostname que não serve o app.

    Custa duas entradas do orçamento do plano free da zona: um registro DNS (ilimitado) e
    uma das 10 Single Redirect rules.
  EOT
  type        = bool
  default     = false
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
  description = <<-EOT
    CIDRs autorizados a abrir conexão SSH (porta 22) no firewall da Hetzner.

    NÃO TEM DEFAULT, de propósito. Até 2026-08 esta variável tinha
    `["0.0.0.0/0", "::/0"]` como default, o que abria a porta 22 de produção para a
    internet inteira em quem simplesmente não mexesse nela — exatamente o operador que
    menos vai perceber. Um valor que só é seguro se você lembrar de trocá-lo não é um
    default, é uma armadilha. Agora o plan falha até você declarar quem entra.

    Inclua o IP fixo da sua casa/escritório e, se o deploy usar SSH (usa: ver
    .github/workflows/deploy.yml), os ranges do runner do GitHub Actions.

    Se você se trancar para fora: o Console da Hetzner (VNC pelo painel) continua
    funcionando, não depende deste firewall. Não há como perder a máquina por aqui.
  EOT
  type        = list(string)

  validation {
    condition     = length(var.ssh_allowed_ips) > 0
    error_message = "ssh_allowed_ips não pode ser vazio — a Hetzner rejeita uma regra de firewall sem origem. Use [\"0.0.0.0/0\"] se realmente quiser abrir para o mundo."
  }

  validation {
    condition = alltrue([
      for cidr in var.ssh_allowed_ips :
      can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr)) || can(regex("^[0-9A-Fa-f:]+/[0-9]{1,3}$", cidr))
    ])
    error_message = "Cada entrada de ssh_allowed_ips precisa ser um CIDR (ex.: '203.0.113.10/32'). Um IP solto sem /32 é rejeitado pela API da Hetzner."
  }
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
  description = "Hostnames adicionais no Origin Certificate, além de api.<domain>. Aceita curinga de um nível (ex.: '*.crafthub.dev'). Deixe vazio se só a API fala com a origem."
  type        = list(string)
  default     = []
}

# ---------------------------------------------------------------------------------
# R2
# ---------------------------------------------------------------------------------

variable "uploads_bucket_name" {
  description = "Nome do bucket R2 de uploads da aplicação (currículos, avatares). Nome de bucket é global dentro da conta."
  type        = string
  default     = "crafthub-uploads"
}

variable "media_subdomain" {
  description = <<-EOT
    Subdomínio que serve publicamente os objetos do bucket de uploads. Resulta em
    <media_subdomain>.<domain> e é o valor que vai em S3_PUBLIC_BASE_URL na API.

    Não é opcional na prática: o provider de storage da API se recusa a construir sem
    S3_PUBLIC_BASE_URL, e o endpoint S3 do R2 não serve para <img src> porque exige
    assinatura SigV4 em cada GET.
  EOT
  type        = string
  default     = "media"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.media_subdomain))
    error_message = "media_subdomain deve ser um único rótulo DNS (minúsculas, números e hífen)."
  }
}

variable "backups_bucket_name" {
  description = "Nome do bucket R2 onde o cron da VPS deposita os dumps do Postgres. Precisa bater com RCLONE_BUCKET em scripts/backup.sh, que usa 'crafthub-backups' por padrão."
  type        = string
  default     = "crafthub-backups"
}

variable "r2_backups_location_hint" {
  description = <<-EOT
    Dica de localização do bucket de BACKUPS: apac, eeur, enam, weur, wnam, oc.

    'weur' e não 'enam' (o default do bucket de uploads) porque o servidor está em
    Nuremberg: o dump sobe da Europa, e os dados são de usuários que a Cloudflare
    passa a guardar na Europa. É best-effort e só vale na criação do bucket — depois
    de criado, mudar aqui não move nada.
  EOT
  type        = string
  default     = "weur"

  validation {
    condition     = contains(["apac", "eeur", "enam", "weur", "wnam", "oc"], var.r2_backups_location_hint)
    error_message = "r2_backups_location_hint deve ser um de: apac, eeur, enam, weur, wnam, oc."
  }
}

variable "backups_max_age_days" {
  description = <<-EOT
    Idade máxima, em dias, de um objeto no bucket de backups, aplicada pelo próprio R2.

    NÃO é a retenção do backup — quem manda nisso é RETENTION_DAYS em scripts/backup.sh
    (30 dias), que só apaga depois de confirmar que o upload do dia foi bem-sucedido.
    Este valor é maior de propósito, para ser rede de segurança contra crescimento sem
    limite e não a poda principal.

    O valor vira segundos no resource; não escreva segundos aqui.
  EOT
  type        = number
  default     = 45

  validation {
    condition     = var.backups_max_age_days > 30
    error_message = "backups_max_age_days deve ser MAIOR que os 30 dias de RETENTION_DAYS em scripts/backup.sh. Igual ou menor faz a regra do bucket — que não sabe se o backup do dia subiu — ganhar a corrida da poda do script, que sabe."
  }
}

# ---------------------------------------------------------------------------------
# Vigia do backup (Cloudflare Worker)
# ---------------------------------------------------------------------------------

variable "backup_alert_email" {
  description = "Para onde vai o alerta quando o backup falhar ou parar de acontecer. NÃO tem default de propósito: um vigia que não sabe para quem gritar é pior que nenhum, porque parece configurado."
  type        = string

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.backup_alert_email))
    error_message = "backup_alert_email precisa ser um endereço de e-mail."
  }
}

variable "backup_alert_from" {
  description = "Remetente do alerta. Deixe null para usar 'CraftHub <no-reply@<domain>>'. O domínio precisa estar verificado no Resend — o de produção já está, porque a API manda e-mail de verificação por ele."
  type        = string
  default     = null
}

variable "resend_api_key" {
  description = <<-EOT
    Chave da API do Resend que o Worker usa para mandar o alerta.

    NÃO coloque em terraform.tfvars. Passe por ambiente, como os tokens dos providers:

        export TF_VAR_resend_api_key="$RESEND_API_KEY"

    Basta uma chave restrita a envio ("sending access"). O Worker só chama POST /emails.
  EOT
  type        = string
  sensitive   = true
}

variable "backup_watchdog_cron" {
  description = "Quando o vigia roda, em cron UTC. O default é 05:30, cerca de uma hora depois do backup das 04:17 — margem suficiente para um dump lento sem esperar o dia inteiro para saber."
  type        = string
  default     = "30 5 * * *"
}

variable "backup_watchdog_max_age_hours" {
  description = <<-EOT
    Idade máxima aceitável do backup mais recente, em horas.

    A ARITMÉTICA IMPORTA, e é onde este alerta seria inútil sem parecer:
    com o backup às 04:17 e o vigia às 05:30, um backup saudável tem ~1,2h quando é
    olhado. Se o backup de hoje falhar, o mais recente passa a ser o de ontem: ~25,2h.
    Um limite de 26h (que parece o "óbvio" de um ciclo diário) NÃO dispararia — só
    depois de DOIS dias perdidos, com ~49h. O limite tem que ficar acima de 1,2 e
    abaixo de 25,2. 24 fica confortavelmente no meio.
  EOT
  type        = number
  default     = 24

  validation {
    condition     = var.backup_watchdog_max_age_hours > 2 && var.backup_watchdog_max_age_hours < 25
    error_message = "backup_watchdog_max_age_hours deve ficar entre 2 e 25 (exclusive). Acima de 25 o alerta deixa de pegar um único dia perdido, que é justamente o caso que ele existe para pegar."
  }
}

variable "backup_watchdog_min_bytes" {
  description = "Tamanho mínimo aceitável do backup mais recente. Em 2026-08-29 o dump comprimido tinha ~40.760 bytes; 20.000 é metade disso, folgado para o banco crescer e apertado o bastante para pegar um dump truncado. É independente do MIN_DUMP_BYTES do script, que só protege quando o script roda."
  type        = number
  default     = 20000
}

variable "backup_watchdog_heartbeat_weekday" {
  description = <<-EOT
    Dia da semana (UTC, 0=domingo) em que o vigia manda um e-mail dizendo que está vivo,
    mesmo com tudo bem. String vazia desliga.

    Existe porque um vigia morto é tão silencioso quanto um backup saudável. Sem o
    batimento, você não teria como distinguir "nada de errado" de "ninguém olhando" —
    que é exatamente o problema que este Worker veio resolver, um nível acima.
  EOT
  type        = string
  default     = "1"
}

variable "tfstate_bucket_name" {
  description = "Nome do bucket R2 que guarda o state deste Terraform. Precisa bater exatamente com o `bucket` do backend em versions.tf. Este bucket é criado À MÃO no bootstrap e depois adotado por um bloco import — ver README."
  type        = string
  default     = "crafthub-tfstate"
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
  default     = "crafthub-web"
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
        repo  = "crafthub-v.1"
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

# NÃO EXISTEM MAIS: vite_linkedin_client_id e vite_linkedin_redirect_uri.
#
# Eram obrigatórias (sem default), então todo operador tinha de inventar um valor para
# elas — e o front NUNCA as leu. O login com LinkedIn é inteiramente server-side: o botão
# em apps/web/src/features/auth/pages/auth-page.tsx aponta para `${VITE_API_URL}/auth/linkedin`
# e quem guarda client id, secret e redirect URI é a API (LINKEDIN_* no .env.production).
# Confirmado com `grep -rn "import.meta.env.VITE_" apps/web/src`, que devolve exatamente
# seis nomes: API_URL, GOOGLE_CLIENT_ID, MODEL_CDN_BASE_URL, SENTRY_DSN, SENTRY_ENVIRONMENT
# e SENTRY_RELEASE.

variable "vite_model_cdn_base_url" {
  description = "VITE_MODEL_CDN_BASE_URL — base do CDN de onde o worker de re-rank baixa os pesos do modelo TF.js (apps/web/src/workers/reranker.worker.ts). null = não define a variável no Pages e o front usa o default embutido."
  type        = string
  default     = null
}

variable "vite_sentry_dsn" {
  description = "VITE_SENTRY_DSN — DSN do Sentry do front (apps/web/src/lib/report-error.ts). DSN de browser é público por construção. null = não define a variável e o relato de erro do front fica desligado."
  type        = string
  default     = null
}

variable "vite_sentry_environment" {
  description = "VITE_SENTRY_ENVIRONMENT — nome do ambiente no Sentry. Só é usado se vite_sentry_dsn estiver preenchida."
  type        = string
  default     = "production"
}

# NÃO existe uma variável para VITE_SENTRY_RELEASE de propósito: o valor certo é o SHA do
# commit, que muda a cada build. Um valor estático nas env vars do Pages marcaria todo
# erro com o mesmo release e tornaria o Sentry inútil para saber o que quebrou. Quem
# injeta o SHA é o build do GitHub Actions (.github/workflows/deploy.yml), que é o caminho
# que de fato publica o bundle.

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

  # Mesma lista de valores aceitos que rate_limit_period_seconds — é a mesma API. Sem esta
  # validação, um valor como 45 só era rejeitado no apply, depois de o Terraform já ter
  # criado ou alterado outros recursos.
  validation {
    condition     = contains([10, 60, 120, 300, 600, 3600], var.rate_limit_mitigation_timeout_seconds)
    error_message = "rate_limit_mitigation_timeout_seconds deve ser um de: 10, 60, 120, 300, 600, 3600."
  }
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

# ---------------------------------------------------------------------------------
# E-mail transacional — SPF, DKIM, DMARC e (opcional) MX
#
# POR QUE ISTO EXISTE AGORA: a verificação de e-mail entrou no produto, então a API passa
# a MANDAR e-mail. Até esta versão a zona não tinha nenhum registro TXT nem MX — ou seja,
# qualquer pessoa no mundo podia mandar e-mail dizendo ser @<domínio> e nenhum receptor
# tinha como saber que era mentira. Um domínio que manda e-mail sem SPF/DKIM/DMARC também
# cai em spam com frequência, e uma verificação de e-mail que cai em spam é um cadastro
# que não se completa.
#
# TUDO EM UM ÚNICO OBJETO, e não em oito variáveis soltas, seguindo
# .github/terraform-dvn-style.instructions.md (seção 6, "Group related config into a
# single object variable"). Os oito valores só fazem sentido juntos: metade preenchida
# não é uma configuração parcial, é uma configuração quebrada.
#
# DEFAULT null = NADA É CRIADO. Quem ainda não escolheu provedor de e-mail aplica este
# diretório e não vê diferença nenhuma — nenhum registro novo, nenhum erro. A API cai no
# MAIL_TRANSPORT=log e imprime o link de verificação no log em vez de mandar e-mail.
# ---------------------------------------------------------------------------------

variable "email_provider" {
  description = <<-EOT
    Registros DNS do provedor de e-mail transacional (Resend, Postmark, SendGrid, SES...).

    Deixe null (default) enquanto não houver provedor: nenhum registro é criado e o apply
    é no-op nesta parte.

    Os valores NÃO são inventáveis — cada provedor mostra os seus na tela de "verify your
    domain". Copie de lá.

      spf_include        host que o provedor manda incluir no SPF. Só o host, sem o
                         "include:". Ex.: "amazonses.com", "sendgrid.net",
                         "_spf.resend.com".

      dkim_record_name   nome do registro DKIM, RELATIVO ao domínio (o Terraform
                         concatena o domínio). Ex.: "resend._domainkey".
      dkim_record_type   "TXT" ou "CNAME" — depende do provedor. Resend e SES usam CNAME,
                         Postmark e SendGrid costumam usar TXT.
      dkim_record_value  o valor exato mostrado pelo provedor. Se for TXT, é a chave
                         pública inteira ("v=DKIM1; k=rsa; p=MIGf...").

      dmarc_policy       "none" | "quarantine" | "reject".
                         COMECE EM "none". Ele não rejeita nada — só liga os relatórios,
                         para você descobrir o que já manda e-mail em nome do domínio
                         antes de bloquear. Subir para "reject" com um remetente legítimo
                         esquecido faz e-mail de verdade sumir sem aviso.
      dmarc_report_email endereço que recebe os relatórios agregados (rua=).
                         Se for de OUTRO domínio, esse outro domínio precisa autorizar
                         com um registro `<seu-domínio>._report._dmarc` — é o próprio
                         DMARC que exige isso. Use um endereço do próprio domínio para
                         não cair nessa.

      mx                 só se você quiser RECEBER e-mail neste domínio. Mandar e-mail não
                         precisa de MX. Default [] = nenhum MX é criado, e o e-mail do
                         domínio (se existir em outro lugar) fica intocado.

    Exemplo (Resend):

      email_provider = {
        spf_include        = "_spf.resend.com"
        dkim_record_name   = "resend._domainkey"
        dkim_record_type   = "CNAME"
        dkim_record_value  = "resend._domainkey.resend.com"
        dmarc_policy       = "none"
        dmarc_report_email = "dmarc@example.com"
      }
  EOT

  type = object({
    spf_include        = string
    dkim_record_name   = string
    dkim_record_type   = string
    dkim_record_value  = string
    dmarc_policy       = string
    dmarc_report_email = string

    # SUBDOMINIO DE ENVIO (return-path / bounce domain).
    #
    # Provedores modernos — Resend e SES entre eles — nao pedem mais SPF no apex. Eles
    # usam um MAIL FROM proprio, tipo `send.<dominio>`, e e NESSE nome que SPF e MX
    # precisam existir. O cabecalho From continua `@<dominio>` e quem o autentica e o
    # DKIM; o DMARC passa por ALINHAMENTO DE DKIM, nao de SPF.
    #
    # Preencha com o rotulo que o provedor mostrar (ex.: "send"). null (default) mantem o
    # comportamento antigo: SPF e MX no apex.
    #
    # Consequencia que vale saber: com o subdominio, o APEX fica SEM registro SPF. Isso
    # nao e um furo — o SPF e verificado contra o dominio do MAIL FROM, que passa a ser o
    # subdominio. O que protege o `From: @<dominio>` e o DKIM mais o DMARC.
    sending_subdomain = optional(string)

    # Qualificador final do SPF: "-all" (hard fail), "~all" (soft fail) ou "?all".
    #
    # O default e "-all" porque, com um unico remetente declarado, recusar o resto e a
    # resposta certa. MAS SIGA O PROVEDOR: o Resend publica "~all" e a infra dele passa
    # pela Amazon SES, cujos ranges mudam. Um "-all" mais rigoroso do que o provedor
    # recomenda transforma uma mudanca de infraestrutura DELE em e-mail seu recusado.
    spf_qualifier = optional(string, "-all")

    mx = optional(list(object({
      host     = string
      priority = number
    })), [])
  })

  default = null

  validation {
    condition     = var.email_provider == null ? true : contains(["none", "quarantine", "reject"], var.email_provider.dmarc_policy)
    error_message = "email_provider.dmarc_policy deve ser 'none', 'quarantine' ou 'reject'. Comece em 'none'."
  }

  validation {
    condition     = var.email_provider == null ? true : contains(["TXT", "CNAME"], var.email_provider.dkim_record_type)
    error_message = "email_provider.dkim_record_type deve ser 'TXT' ou 'CNAME' — é o que o provedor manda criar."
  }

  # O erro mais comum: colar "include:sendgrid.net" em vez de "sendgrid.net". O SPF sairia
  # como "v=spf1 include:include:sendgrid.net -all", que é sintaticamente inválido e
  # derruba a autenticação do domínio inteiro em silêncio.
  validation {
    condition     = var.email_provider == null ? true : !can(regex("^include:", var.email_provider.spf_include))
    error_message = "email_provider.spf_include é só o host ('sendgrid.net'), sem o prefixo 'include:' — o Terraform o adiciona."
  }

  validation {
    condition     = var.email_provider == null ? true : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.email_provider.dmarc_report_email))
    error_message = "email_provider.dmarc_report_email precisa ser um endereço de e-mail."
  }

  validation {
    condition     = var.email_provider == null ? true : contains(["-all", "~all", "?all"], var.email_provider.spf_qualifier)
    error_message = "email_provider.spf_qualifier deve ser '-all', '~all' ou '?all'."
  }

  # Mesmo motivo do dkim_record_name: o rótulo é RELATIVO ao domínio. "send.crafthub.dev"
  # aqui viraria send.crafthub.dev.crafthub.dev e o provedor nunca verificaria.
  validation {
    condition     = var.email_provider == null || try(var.email_provider.sending_subdomain, null) == null ? true : can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", var.email_provider.sending_subdomain))
    error_message = "email_provider.sending_subdomain é um único rótulo relativo ao domínio (ex.: \"send\"), sem pontos e sem o domínio no fim."
  }

  # O nome DKIM é relativo ao domínio. Se vier com o domínio no fim, o registro criado
  # seria dkim._domainkey.exemplo.com.exemplo.com — e o provedor nunca valida.
  validation {
    condition     = var.email_provider == null ? true : !endswith(var.email_provider.dkim_record_name, ".")
    error_message = "email_provider.dkim_record_name é relativo ao domínio e não termina em ponto (ex.: 'resend._domainkey')."
  }

  validation {
    condition = var.email_provider == null ? true : alltrue([
      for record in var.email_provider.mx : record.priority >= 0 && record.priority <= 65535
    ])
    error_message = "A prioridade de cada MX deve ficar entre 0 e 65535."
  }
}
