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
# CUSTO: zero, e as contas estão aqui para poderem ser conferidas em vez de acreditadas.
#
#   - Workers Free: 100.000 requisições/DIA e 10 ms de CPU por invocação. Este Worker é
#     invocado 1x/dia (~31/mês) e o trabalho é um list, um put e um POST — milissegundos.
#   - Cron Triggers: o plano Free permite 5 por conta. Este usa 1.
#   - R2: `list()` e `put()` são operações de CLASSE A (não B — LIST não é leitura barata
#     no tabelamento do R2). São 2 por execução = ~62/mês, contra 1.000.000/mês de free
#     tier. Storage: o marcador tem ~600 bytes.
#   - Workers Logs: Free dá 200.000 eventos/dia com retenção de 3 DIAS. Este Worker
#     escreve 1 linha por execução, então o teto não é problema — mas a retenção é o
#     motivo de o status também ir para o R2 como `watchdog/last-run.json`, que não
#     expira em 3 dias.
#   - Resend: 100 e-mails/dia no free tier. Este manda no MÁXIMO um por dia (alerta ou
#     batimento, nunca os dois).
#
# Nada disso encosta em nenhum limite. O custo mensal é R$ 0,00 e continua zero mesmo se
# o alerta disparar todo dia.
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
    {
      # O primeiro comando do runbook, montado com o IP REAL do servidor no state em vez
      # de um literal dentro do worker.js. O IP muda quando o servidor é recriado, e um
      # e-mail de emergência que manda você para o endereço errado custa os minutos em
      # que ele mais importa. O worker sabe funcionar sem este binding: nesse caso o
      # e-mail aponta para docs/production-inventory.md em vez de inventar um endereço.
      type = "plain_text"
      name = "RUNBOOK_SSH"
      text = "ssh deploy@${hcloud_server.main.ipv4_address} -i ~/.ssh/linkhub_deploy"
    },
  ]

  # O worker registra o status apurado com console.log em TODA execução, e essa linha é
  # a única prova do que ele viu quando o e-mail não chega. Sem observability ligada ela
  # só existe enquanto alguém estiver com um `wrangler tail` aberto — ou seja, nunca,
  # justamente na madrugada em que interessa.
  observability = {
    enabled = true
  }
}

resource "cloudflare_workers_cron_trigger" "backup_watchdog" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.backup_watchdog.script_name

  schedules = [{
    cron = var.backup_watchdog_cron
  }]
}
