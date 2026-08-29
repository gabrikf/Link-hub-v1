# -------------------------------------------------------------------------------------
# Vigia do backup
#
# Um Worker com cron trigger que olha o bucket de backups e manda e-mail quando o mais
# recente está velho demais, pequeno demais, ou não existe. Código em
# infra/cloudflare/backup-watchdog/worker.js.
#
# POR QUE ISTO EXISTE, e por que não é enfeite:
# `scripts/backup.sh` e a regra de lifecycle, juntos, ainda deixam um buraco. Se o cron
# da VPS parar, nada avisa — e a regra de lifecycle continua apagando por idade, do lado
# da Cloudflare, sem saber que parou de entrar coisa nova. Cron morto hoje = bucket vazio
# em 45 dias, em silêncio, descoberto no dia em que você precisar restaurar.
#
# POR QUE ELE OLHA O BUCKET, e não um "ping" do script:
# em 2026-08-29 o backup.sh saiu com código 0 sem ter subido nada — o rclone levava 501
# e a retentativa pulava o upload achando o objeto já lá. Qualquer vigia baseado em
# "o script terminou bem" teria dito que estava tudo certo. Só olhar o artefato pega isso.
#
# POR QUE ELE NÃO MORA NA VPS:
# o cenário que justifica ter backup é a VPS morrer. Vigia hospedado nela morre junto.
#
# CUSTO: zero. Cron trigger e R2 binding cabem no plano free de Workers, a leitura diária
# é uma operação de classe B, e o Resend dá 100 e-mails/dia — este manda no máximo um.
#
# PRÉ-REQUISITO: o CLOUDFLARE_API_TOKEN precisa de "Workers Scripts: Edit". Sem isso a
# API devolve 403 e o apply falha neste recurso. Confirmado em 2026-08-29: o token da
# conta ainda NÃO tinha essa permissão.
# -------------------------------------------------------------------------------------
resource "cloudflare_workers_script" "backup_watchdog" {
  account_id  = var.cloudflare_account_id
  script_name = "${var.project_name}-backup-watchdog"

  # `content_file` exige `content_sha256` — é ele que faz o Terraform enxergar mudança no
  # JS. Sem isso, editar o worker.js não produziria diff nenhum e o apply seria um no-op
  # silencioso: a pior forma de "funcionou".
  content_file   = "${path.module}/../../../cloudflare/backup-watchdog/worker.js"
  content_sha256 = filesha256("${path.module}/../../../cloudflare/backup-watchdog/worker.js")

  # O arquivo se chama worker.js de propósito: `main_module` é o NOME do arquivo enviado,
  # e assim ele bate tanto se o provider usar o basename quanto se usar o default.
  main_module        = "worker.js"
  compatibility_date = "2026-08-01"

  bindings = [
    {
      type        = "r2_bucket"
      name        = "BACKUPS"
      bucket_name = cloudflare_r2_bucket.backups.name
    },
    {
      type = "secret_text"
      name = "RESEND_API_KEY"
      text = var.resend_api_key
    },
    {
      type = "plain_text"
      name = "ALERT_TO"
      text = var.backup_alert_email
    },
    {
      type = "plain_text"
      name = "ALERT_FROM"
      text = coalesce(var.backup_alert_from, "CraftHub <no-reply@${var.domain}>")
    },
    {
      type = "plain_text"
      name = "MAX_AGE_HOURS"
      text = tostring(var.backup_watchdog_max_age_hours)
    },
    {
      type = "plain_text"
      name = "MIN_BYTES"
      text = tostring(var.backup_watchdog_min_bytes)
    },
    {
      type = "plain_text"
      name = "HEARTBEAT_WEEKDAY"
      text = var.backup_watchdog_heartbeat_weekday
    },
  ]
}

resource "cloudflare_workers_cron_trigger" "backup_watchdog" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.backup_watchdog.script_name

  schedules = [{
    cron = var.backup_watchdog_cron
  }]
}
