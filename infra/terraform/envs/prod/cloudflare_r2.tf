# Buckets R2 e a credencial S3 que a aplicação usa.

# -------------------------------------------------------------------------------------
# Bucket de uploads (currículos, avatares) e destino dos backups.
# -------------------------------------------------------------------------------------
resource "cloudflare_r2_bucket" "uploads" {
  account_id = var.cloudflare_account_id
  name       = var.uploads_bucket_name
  location   = var.r2_location_hint

  # "default" = sem jurisdição especial. O valor importa porque entra no resource string
  # do token, mais abaixo.
  jurisdiction  = "default"
  storage_class = "Standard"
}

# -------------------------------------------------------------------------------------
# Bucket do state do próprio Terraform.
#
# OVO E GALINHA: este bucket precisa existir ANTES do primeiro `terraform init`, porque é
# nele que o state é gravado. Nenhuma ordem de execução dentro do Terraform resolve isso.
#
# Solução adotada: o bucket (e o token R2 que o backend usa) são criados À MÃO no
# bootstrap, e o bucket é adotado aqui pelo bloco `import` abaixo — assim ele fica
# gerenciado, versionado e protegido, sem nunca ter sido criado pelo Terraform.
#
# O `import` é idempotente: depois que o recurso está no state, ele vira no-op. Pode ficar
# no arquivo para sempre e documenta a história.
#
# Passo a passo do bootstrap: ver README, seção "1. Bootstrap".
# -------------------------------------------------------------------------------------
import {
  to = cloudflare_r2_bucket.tfstate
  id = "${var.cloudflare_account_id}/${var.tfstate_bucket_name}/default"
}

resource "cloudflare_r2_bucket" "tfstate" {
  account_id = var.cloudflare_account_id
  name       = var.tfstate_bucket_name

  jurisdiction  = "default"
  storage_class = "Standard"

  lifecycle {
    # Destruir este bucket apaga o state de toda a infraestrutura. `terraform destroy` vai
    # falhar aqui, e isso é o comportamento desejado.
    prevent_destroy = true

    # `location` só é honrado na criação do bucket. Como este foi criado à mão, o valor que
    # a API devolve pode não bater com nada declarado — ignorar evita um diff eterno.
    ignore_changes = [location]
  }
}

# -------------------------------------------------------------------------------------
# Credencial S3 do R2 para a aplicação
#
# A DERIVAÇÃO (documentada em https://developers.cloudflare.com/r2/api/tokens/):
#
#     S3_ACCESS_KEY_ID     = id do API token
#     S3_SECRET_ACCESS_KEY = SHA-256 (hex) do value do API token
#
# Não é óbvia e não dá para adivinhar: o secret NÃO é o valor do token, é o hash dele.
# Como o Terraform tem a função sha256() nativa e o resource expõe tanto `id` quanto
# `value`, o par inteiro pode ser produzido aqui — não precisa de passo manual no painel.
#
# ESCOPO: o token é limitado ao bucket de uploads, via o resource string
# `com.cloudflare.edge.r2.bucket.<ACCOUNT_ID>_<JURISDICTION>_<BUCKET>`. Um vazamento do
# S3_SECRET_ACCESS_KEY da aplicação não dá acesso ao bucket de state.
#
# CONSEQUÊNCIA QUE VOCÊ PRECISA ACEITAR: o `value` do token e o segredo derivado ficam
# gravados no state. O bucket de state passa a ser um cofre de segredos. Ver README.
# -------------------------------------------------------------------------------------

# Resolve o ID do grupo de permissão pelo nome, em vez de hardcodar um UUID que pode mudar.
# O `name` precisa vir URL-encoded, conforme o schema do data source.
data "cloudflare_account_api_token_permission_groups_list" "r2_bucket_item_write" {
  account_id = var.cloudflare_account_id
  name       = "Workers%20R2%20Storage%20Bucket%20Item%20Write"
}

locals {
  # O filtro por nome é um "contains" do lado da API, então confirmamos a correspondência
  # exata aqui. one() estoura se vier mais de um — melhor falhar no plan do que criar um
  # token com a permissão errada.
  r2_bucket_item_write_permission_id = one([
    for pg in data.cloudflare_account_api_token_permission_groups_list.r2_bucket_item_write.result :
    pg.id if pg.name == "Workers R2 Storage Bucket Item Write"
  ])

  # Formato exigido pela API para escopar um token a um bucket específico.
  uploads_bucket_resource = "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${cloudflare_r2_bucket.uploads.name}"
}

resource "cloudflare_account_token" "r2_uploads" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-r2-uploads"

  policies = [{
    effect = "allow"
    permission_groups = [{
      id = local.r2_bucket_item_write_permission_id
    }]
    resources = jsonencode({
      (local.uploads_bucket_resource) = "*"
    })
  }]

  lifecycle {
    precondition {
      condition     = local.r2_bucket_item_write_permission_id != null
      error_message = "Não encontrei o grupo de permissão 'Workers R2 Storage Bucket Item Write' na conta. Confirme que o CLOUDFLARE_API_TOKEN tem a permissão 'Account API Tokens: Read'."
    }
  }
}

locals {
  # É isto que vai para as env vars S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY da API.
  s3_access_key_id     = cloudflare_account_token.r2_uploads.id
  s3_secret_access_key = sha256(cloudflare_account_token.r2_uploads.value)
  s3_endpoint          = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
}

# -------------------------------------------------------------------------------------
# Domínio público do bucket de uploads
#
# POR QUE ISTO É OBRIGATÓRIO, e não um enfeite:
#
# `s3-file-storage-provider.ts` monta a URL de todo arquivo como
# `${S3_PUBLIC_BASE_URL}/${key}` e SE RECUSA A CONSTRUIR sem essa variável. O endpoint S3
# (`<account>.r2.cloudflarestorage.com`) não serve: ele exige assinatura SigV4 em cada
# GET, e o que vai para o `src` de um `<img>` é uma URL que o navegador busca sem
# credencial nenhuma.
#
# Sem isto o sistema falha de um jeito especialmente ruim: o upload funciona, o objeto
# existe no bucket, a linha no banco aponta para uma URL — e toda imagem dá 404. Um erro
# de leitura, não de escrita, que só aparece depois de o dado já estar gravado.
#
# POR QUE UM DOMÍNIO PRÓPRIO E NÃO O `r2.dev`:
# a Cloudflare oferece um subdomínio `pub-<hash>.r2.dev` num clique. Ele é explicitamente
# documentado como não sendo para produção — tem rate limit, não é cacheado pela CDN e
# não pode ficar atrás do WAF. Um domínio da própria zona passa pela borda como qualquer
# outro hostname: cache, WAF e analytics inclusos, e sem custo de egress porque é R2.
#
# O DNS é criado pela PRÓPRIA Cloudflare ao conectar o domínio (por isso o resource pede
# `zone_id`). Não declare um cloudflare_dns_record para `media.` — seriam dois donos do
# mesmo nome, e o apply passaria a alternar entre eles.
# -------------------------------------------------------------------------------------
resource "cloudflare_r2_custom_domain" "uploads" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.uploads.name
  zone_id     = data.cloudflare_zone.main.id

  domain  = local.media_hostname
  enabled = true

  # TLS 1.2 como piso. 1.0 e 1.1 estão depreciados desde 2021 e não há cliente relevante
  # que precise deles para carregar um avatar.
  min_tls = "1.2"
}

# -------------------------------------------------------------------------------------
# Bucket de backups do Postgres
#
# Destino do `scripts/backup.sh`, que roda por cron na VPS. Até agora este bucket não
# existia em lugar nenhum — nem no Terraform, nem à mão (conferido pela API da conta em
# 2026-08-29: só `crafthub-tfstate` e `crafthub-uploads`). Por isso é um `create` e não
# um `import` como o do tfstate: não há bucket pré-existente com que colidir.
#
# Isto fecha o P2-d de docs/deployment-readiness.md.
#
# POR QUE UM BUCKET SEPARADO DO DE UPLOADS, e não uma pasta dentro dele:
# o bucket é a unidade de escopo de um token R2. Backup no mesmo bucket dos uploads
# obrigaria o token do cron a ter escrita sobre os currículos e avatares dos usuários —
# e a VPS é justamente a máquina que a gente supõe comprometida no cenário que motiva
# ter backup.
# -------------------------------------------------------------------------------------
resource "cloudflare_r2_bucket" "backups" {
  account_id = var.cloudflare_account_id
  name       = var.backups_bucket_name
  location   = var.r2_backups_location_hint

  jurisdiction  = "default"
  storage_class = "Standard"

  lifecycle {
    # Destruir este bucket apaga todos os backups. `terraform destroy` vai falhar aqui, e
    # é isso que se quer: o bucket de backup é o único lugar onde o banco existe fora da
    # máquina que pode morrer.
    prevent_destroy = true
  }
}

# -------------------------------------------------------------------------------------
# Credencial S3 do R2 para o cron de backup
#
# Mesma derivação do token de uploads (id do token = access key; SHA-256 do value =
# secret), mesma permissão, OUTRO escopo: só o bucket de backups.
#
# São três tokens distintos e isso é de propósito:
#   - `crafthub-r2-uploads`  → grava currículo e avatar. Vive dentro do container da API.
#   - o token do backend     → grava o state do Terraform. Vive na sua máquina.
#   - `crafthub-r2-backups`  → grava o dump. Vive no rclone.conf da VPS.
#
# Se a VPS for comprometida, o atacante ganha o terceiro. Com ele dá para apagar backups
# (nada impede), mas NÃO dá para ler ou apagar os arquivos dos usuários, nem para tocar
# no state da infraestrutura.
# -------------------------------------------------------------------------------------
locals {
  backups_bucket_resource = "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_default_${cloudflare_r2_bucket.backups.name}"
}

resource "cloudflare_account_token" "r2_backups" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-r2-backups"

  policies = [{
    effect = "allow"
    permission_groups = [{
      id = local.r2_bucket_item_write_permission_id
    }]
    resources = jsonencode({
      (local.backups_bucket_resource) = "*"
    })
  }]
}

locals {
  # É isto que vai no rclone.conf da VPS. Nunca no repositório.
  r2_backups_access_key_id     = cloudflare_account_token.r2_backups.id
  r2_backups_secret_access_key = sha256(cloudflare_account_token.r2_backups.value)
}

# -------------------------------------------------------------------------------------
# Retenção server-side do bucket de backups
#
# Segunda rede, independente da VPS. A poda primária é o `rclone delete --min-age` no fim
# do scripts/backup.sh; esta regra existe para o caso de o script parar de podar (poda
# falha, permissão do token muda, alguém edita o script) e o bucket crescer sem limite.
#
# ATENÇÃO AO QUE ESTA REGRA **NÃO** FAZ, porque é fácil confundir:
# ela NÃO protege contra cron morto. Se o cron parar hoje, ela apaga o último backup bom
# daqui a `max_age` e você fica com ZERO — o silêncio continua sendo o inimigo. O que
# cobre esse cenário é alerta de falha, não retenção. Está registrado como pendência.
#
# POR ISSO O PRAZO AQUI É MAIOR QUE O DO SCRIPT (45 dias contra os 30 de RETENTION_DAYS):
# quem decide a retenção é o script, que sabe se o upload do dia deu certo antes de apagar
# qualquer coisa. Se os dois prazos fossem iguais, a regra do bucket — que não sabe nada
# sobre backup bom ou ruim — passaria a ganhar a corrida em parte dos dias.
#
# ESTE RECURSO NÃO PODE SER DESTRUÍDO PELO TERRAFORM — o próprio plan avisa. Apagar este
# bloco do arquivo tira o recurso do state, mas a regra CONTINUA VIVA no R2, apagando
# objetos aos 45 dias, sem nada no código que explique por quê. Para desligar de verdade:
# ponha `enabled = false` e aplique; só depois remova o bloco.
#
# `max_age` é em SEGUNDOS, não em dias. O schema do provider diz isso e é o tipo de coisa
# que passa despercebida: `max_age = 45` não é 45 dias, é 45 segundos, e apagaria o backup
# antes do fim do próprio cron.
# -------------------------------------------------------------------------------------
resource "cloudflare_r2_bucket_lifecycle" "backups" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.backups.name

  rules = [
    {
      id      = "expire-old-backups"
      enabled = true

      # Prefixo vazio = o bucket inteiro. Deliberado: o bucket é dedicado a backup, e
      # amarrar a regra ao prefixo "postgres/" faria ela deixar de valer em silêncio no
      # dia em que alguém mudasse RCLONE_PATH em scripts/backup.sh.
      conditions = {
        prefix = ""
      }

      delete_objects_transition = {
        condition = {
          type    = "Age"
          max_age = var.backups_max_age_days * 24 * 60 * 60
        }
      }

      # Um multipart interrompido deixa partes órfãs que ocupam espaço e NÃO aparecem na
      # listagem de objetos — dá para pagar por um bucket que parece vazio. Hoje o dump
      # tem alguns KB e o rclone nem usa multipart (o corte padrão é 200 MB), então isto
      # é inerte. Passa a valer sozinho no dia em que o banco crescer.
      abort_multipart_uploads_transition = {
        condition = {
          type    = "Age"
          max_age = 7 * 24 * 60 * 60
        }
      }
    },
  ]
}
