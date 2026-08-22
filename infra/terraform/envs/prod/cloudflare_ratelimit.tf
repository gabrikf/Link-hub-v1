# Rate limit de borda (WAF), protegendo o endpoint mais caro do sistema.
#
# ISTO É A SEGUNDA LINHA DE DEFESA. O rate limit principal — por usuário autenticado, com
# quota e contabilidade — fica na aplicação. O que está aqui só existe para que uma
# enxurrada de requisições anônimas seja derrubada na borda da Cloudflare, antes de custar
# CPU do servidor e, principalmente, antes de virar chamada paga na OpenAI.
#
# O ENDPOINT: POST /api/v1/me/resume/ai-import/parse é o que aciona o parse de currículo
# via OpenAI. É o único caminho em que uma requisição HTTP barata do lado do atacante vira
# gasto real do lado da conta.
#
# O PLANO FREE PERMITE UMA ÚNICA REGRA DE RATE LIMITING na zona. Por isso este ruleset tem
# exatamente uma regra. Se um dia precisar proteger um segundo endpoint sem sair do free,
# a saída é ampliar a expressão desta mesma regra (com `or`), não adicionar outra.
#
# O plano free também trava `period` e `mitigation_timeout` em 10 segundos e só identifica
# o cliente por IP. Os defaults das variáveis já refletem isso.

resource "cloudflare_ruleset" "edge_rate_limit" {
  zone_id = data.cloudflare_zone.main.id
  kind    = "zone"
  phase   = "http_ratelimit"

  name        = "${var.project_name}-edge-rate-limit"
  description = "Rate limit de borda no endpoint de parse de currículo (chamada OpenAI)"

  rules = [{
    action      = var.rate_limit_action
    description = "Limita POST ${var.rate_limited_path} por IP"
    enabled     = true

    # O filtro por http.host é necessário porque o ruleset é da ZONA inteira: sem ele, a
    # regra também valeria para app.<domain>.
    expression = join(" and ", [
      "(http.host eq \"${local.api_hostname}\")",
      "(http.request.method eq \"POST\")",
      "(starts_with(http.request.uri.path, \"${var.rate_limited_path}\"))",
    ])

    ratelimit = {
      # ip.src identifica o cliente. cf.colo.id é exigido pela Cloudflare: o contador é
      # mantido por datacenter da borda, então o limite efetivo é por IP *por colo*.
      # Na prática isso torna o limite real um pouco mais frouxo que o número configurado —
      # conte com isso ao escolher o threshold.
      characteristics = ["ip.src", "cf.colo.id"]

      period              = var.rate_limit_period_seconds
      requests_per_period = var.rate_limit_requests_per_period
      mitigation_timeout  = var.rate_limit_mitigation_timeout_seconds

      # Só conta o que de fato chegaria à origem: resposta servida do cache não incrementa
      # o contador.
      requests_to_origin = true
    }
  }]
}
