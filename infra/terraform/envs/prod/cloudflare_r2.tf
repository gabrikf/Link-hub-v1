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
