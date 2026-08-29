# Infraestrutura do CraftHub (Terraform)

Este diretório descreve, em código, a infraestrutura **imutável** do CraftHub. Foi escrito
para ser lido por alguém que nunca mexeu em Terraform: cada arquivo tem um propósito só, e
cada decisão não óbvia está comentada no próprio código.

**O Terraform aqui NÃO faz deploy da aplicação.** Ele cria a máquina, o firewall, o DNS,
os certificados, os buckets e as regras de borda — e para. Subir a aplicação é trabalho do
GitHub Actions.

---

## O que é criado

| Onde | O quê |
|---|---|
| Hetzner Cloud | chave SSH, firewall, uma VPS Ubuntu 24.04 na location escolhida |
| Cloudflare DNS | o hostname do front (CNAME proxiado) e `api.<domínio>` (A proxiado) |
| Cloudflare DNS (e-mail) | SPF, DKIM, DMARC e (opcional) MX — **só quando `email_provider` está preenchida** |
| Cloudflare SSL | modo da zona em `Full (strict)` + Origin Certificate para a origem |
| Cloudflare R2 | bucket de uploads + credencial S3 escopada nele; bucket de state adotado |
| Cloudflare Pages | projeto do front, as env vars `VITE_*` de build **e o domínio customizado do front** |
| Cloudflare WAF | uma regra de rate limit de borda no endpoint que chama a OpenAI |
| Cloudflare Redirect | `www.<domínio>` → 301 → apex — **só quando `redirect_www_to_apex = true`** |

### O front pode servir no apex

`app_subdomain` aceita `""`, e isso significa **apex**: o front serve em
`https://<domínio>` em vez de `https://app.<domínio>`. A API continua em
`api.<domínio>` — os dois precisam de hostnames distintos, porque um é estático no Pages
e o outro é a VPS.

Por que isso exigiu código e não só um valor: `""` produziria `".<domínio>"`, um hostname
inválido que a Cloudflare **cria sem reclamar** e que nunca resolve. `locals.tf` trata o
caso explicitamente e `variables.tf` valida a entrada, então um subdomínio malformado
falha no `plan` em vez de virar um registro morto.

Um CNAME no apex normalmente é proibido — ele não pode coexistir com os registros SOA e NS
que a raiz de uma zona obriga. A Cloudflare resolve com **CNAME flattening**: segue o alvo
do lado dela e responde `A`/`AAAA`. Aqui o registro é proxiado de qualquer forma, então a
resposta já seria o IP anycast da Cloudflare. **Os registros de e-mail do apex (SPF e DMARC
em TXT, MX se houver) continuam valendo** — flattening não conflita com TXT nem com MX.

Requisito do Pages para apex: a zona precisa estar na Cloudflare com os nameservers dela.
Domínio comprado no Cloudflare Registrar já satisfaz isso.

**Escolha pouco reversível.** Mover o app do apex para um subdomínio depois quebra todo
link já compartilhado; o caminho contrário não. O default continua `"app"` por isso.

Com o front no apex, `redirect_www_to_apex = true` cria `www.<domínio>` (proxiado, só para
a requisição chegar à borda) e uma Single Redirect 301 preservando path e query string.
São dois recursos e não um: sem o registro DNS o navegador nunca alcança a borda e vê
NXDOMAIN; sem a regra, a borda serviria o projeto Pages em `www`, que responderia erro por
não ter `www` como custom domain.

Arquitetura resultante:

```
                    ┌───────────── Cloudflare (proxy laranja) ─────────────┐
                    │                                                       │
  navegador ──────► │  app.dominio  ──►  Cloudflare Pages (Vite SPA)        │
                    │                    + cloudflare_pages_domain          │
                    │                                                       │
                    │  api.dominio  ──►  WAF + rate limit de borda          │
                    └───────────────────────────┬───────────────────────────┘
                                                │ TLS com Origin Certificate
                                                ▼
                              ┌─────────────────────────────────┐
                              │  VPS Hetzner (Ashburn)          │
                              │  Caddy → API Fastify            │
                              │  postgres+pgvector, redis       │
                              │  2 workers BullMQ               │
                              └────────┬───────────────┬────────┘
                                       │               │ SMTP 587
                                       ▼               ▼
                    Cloudflare R2 (uploads, backups)   Provedor de e-mail
                                                       (verificação de conta)
                                                              ▲
                                       ┌──────────────────────┘
                                       │  autoriza o remetente
                    Cloudflare DNS: SPF + DKIM + DMARC no dominio
```

> A perna de e-mail é a novidade desta versão. A API **manda** e-mail (verificação
> de conta), então o domínio precisa de SPF, DKIM e DMARC — sem eles qualquer um
> pode falsificar remetente `@<domínio>` e o e-mail legítimo cai em spam. Os três
> registros são criados por este diretório a partir de `var.email_provider`, que
> tem default `null`: enquanto não houver provedor, nada é criado e o apply é
> no-op nessa parte.

---

## Mapa dos arquivos

```
infra/terraform/
├── .gitignore                  # impede que state, tfvars e chaves entrem no git
└── envs/prod/
    ├── versions.tf             # versões travadas + onde o state fica (backend R2)
    ├── providers.tf            # como os providers autenticam (tudo por env var)
    ├── variables.tf            # toda entrada configurável, com descrição
    ├── locals.tf               # cálculos: escolha do tipo de servidor, hostnames, IPs CF
    ├── hetzner.tf              # chave SSH, firewall e a VPS
    ├── cloud-init.yaml.tftpl   # o que roda na primeira inicialização da VPS
    ├── cloudflare_dns.tf       # zona, modo TLS, os 2 registros da app e os de e-mail
    ├── cloudflare_tls.tf       # chave + CSR + Origin Certificate
    ├── cloudflare_r2.tf        # buckets e a credencial S3 da aplicação
    ├── cloudflare_pages.tf     # projeto do front + dominio customizado do front
    ├── cloudflare_ratelimit.tf # a regra de rate limit de borda
    ├── cloudflare_www_redirect.tf # www.<dominio> -> 301 -> apex (opcional)
    ├── outputs.tf              # o que o Terraform devolve no final
    ├── terraform.tfvars.example
    └── backend.hcl.example
```

### Por que pasta por ambiente, e não workspace

Hoje só existe produção. Ainda assim a estrutura é `envs/prod/`, e quando existir staging
será `envs/staging/`. Motivos:

- **Workspace é estado invisível.** O ambiente selecionado não aparece no comando; você
  descobre que estava no workspace errado depois do apply. Com pasta, o `cd` é o ambiente.
- **`terraform.tfvars` não conhece workspace.** Você acabaria fazendo malabarismo com
  `-var-file` de qualquer jeito, que é justamente o que o workspace prometia evitar.
- **Ambientes divergem.** Backend, chave de state, versão de provider e até o conjunto de
  recursos podem ser diferentes entre prod e staging sem nenhuma gambiarra.

Criar staging depois: `cp -r envs/prod envs/staging`, ajustar o `key` do backend e o
`tfvars`. Não há módulos compartilhados por enquanto — módulo com um único consumidor é
indireção sem retorno.

---

## Pré-requisitos

- Terraform **>= 1.11** (`terraform version`)
- Uma zona já ativa na Cloudflare para o seu domínio (o Terraform **não** cria a zona)
- Conta na Hetzner Cloud com um projeto criado
- `wrangler` (`npm i -g wrangler`) para o bootstrap, ou acesso ao painel da Cloudflare

### Tokens necessários

**Hetzner** — Cloud Console > seu projeto > Security > API tokens > *Read & Write*:

```bash
export HCLOUD_TOKEN="..."
```

**Cloudflare** — My Profile > API Tokens > Create Token > Custom token, com estas
permissões:

| Escopo | Permissão | Acesso |
|---|---|---|
| Account | Workers R2 Storage | Edit |
| Account | Account API Tokens | Edit |
| Account | Cloudflare Pages | Edit |
| Zone | Zone | Read |
| Zone | DNS | Edit |
| Zone | Zone Settings | Edit |
| Zone | SSL and Certificates | Edit |
| Account | Account Rulesets | **Edit** |
| Zone | Zone WAF | **Edit** |
| Zone | Single Redirect | **Edit** |

```bash
export CLOUDFLARE_API_TOKEN="..."
```

> **As três últimas foram descobertas no primeiro apply real (2026-08-29), não antes.**
> Sem elas o apply cria 14 dos 16 recursos e falha nos dois `cloudflare_ruleset` com
> `403 Authentication error (code 10000)` — uma mensagem que não diz qual permissão falta.
> A API de Rulesets é gateada por permissão de **conta** (`Account Rulesets`) E de **zona**,
> e a de zona depende da FASE do ruleset: `http_ratelimit` exige `Zone WAF`,
> `http_request_dynamic_redirect` exige **`Single Redirect`**. Ter `DNS: Edit` e as outras
> seis não ajuda em nada aqui. É uma pegadinha recorrente no fórum da Cloudflare e no
> tracker do provider.
>
> **Atenção ao nome no painel.** A permissão chama-se **`Single Redirect`**. `Dynamic
> Redirect` é o nome do lado da API e **não aparece no dropdown** — procurar por "Dynamic"
> não acha nada. A Cloudflare renomeou o produto para "Single Redirects" e manteve a fase
> `http_request_dynamic_redirect`, então os dois nomes convivem na documentação dela.
>
> `SSL and Certificates: Edit` é o que permite emitir o Origin Certificate. A chave legada
> `X-Auth-User-Service-Key` não é mais necessária desde a v3.32.0 do provider.

---

## Ordem dos comandos

### 1. Bootstrap (uma vez só, à mão)

Existe um problema de ovo e galinha: **o bucket que guarda o state é criado pelo mesmo
Terraform que precisa dele para rodar.** Nenhuma ordem de execução dentro do Terraform
resolve isso — o backend precisa de credencial válida *antes* de o Terraform existir.

A abordagem escolhida é: **criar o bucket e o token à mão, e adotar o bucket depois.** Não
usamos "bootstrap com state local e migrar depois" porque isso deixa um
`terraform.tfstate` local contendo o token — um arquivo que não pode ser commitado nem
perdido.

**1.1 — Crie o bucket de state:**

```bash
wrangler r2 bucket create crafthub-tfstate
```

**1.2 — Crie o token R2 do backend pelo painel:**

Painel Cloudflare > R2 > **API** > *Create API token*

- Permissão: **Object Read & Write**
- Escopo: **Apply to specific buckets only** → `crafthub-tfstate`
- Copie o **Access Key ID** e o **Secret Access Key** (o secret aparece **uma única vez**)

Este é o único par de credenciais do projeto que vive fora do Terraform, e é irredutível.

**Alternativa sem painel (foi assim que esta instalação fez).** O bucket e o token podem
ser criados pela API, o que evita clicar e evita o token de escopo largo que o painel
oferece por padrão. A credencial S3 do R2 é *derivada*, não sorteada:
`Access Key ID = id do token`, `Secret = SHA-256 hex do value do token` — a mesma
derivação que `cloudflare_r2.tf` usa.

```bash
# 1. bucket
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/r2/buckets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"crafthub-tfstate","locationHint":"weur","storageClass":"Standard"}'

# 2. id do permission group de escrita em bucket R2
PG=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/tokens/permission_groups" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[]|select(.name=="Workers R2 Storage Bucket Item Write")|.id')

# 3. token escopado SÓ a esse bucket -> id e value
RES="com.cloudflare.edge.r2.bucket.${CF_ACCOUNT}_default_crafthub-tfstate"
OUT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/tokens" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data "{\"name\":\"crafthub-tfstate-backend\",\"policies\":[{\"effect\":\"allow\",\"permission_groups\":[{\"id\":\"$PG\"}],\"resources\":{\"$RES\":\"*\"}}]}")

echo "access_key = $(echo "$OUT" | jq -r .result.id)"
echo "secret_key = $(echo "$OUT" | jq -r .result.value | tr -d '\n' | sha256sum | cut -d' ' -f1)"
```

**Teste o par antes de confiar nele** — a derivação é documentada, mas custa 20 segundos:

```bash
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
aws s3 ls s3://crafthub-tfstate/ --endpoint-url "https://$CF_ACCOUNT.r2.cloudflarestorage.com" --region auto
```

Se o painel já criou um token de escopo "All buckets", **apague-o depois**. Um token do
backend que alcança o bucket de uploads anula o isolamento que `cloudflare_r2.tf`
constrói de propósito.

> ⚠️ **Nunca use `terraform plan -out=arquivo` dentro do repositório.** Um plano salvo
> **não é criptografado**: `terraform show` imprime os valores resolvidos, incluindo
> credenciais. Este repositório é **público**. `.gitignore` cobre `tfplan` e `*.tfplan`,
> mas a regra só protege quem usa esses nomes.

**1.3 — Preencha os arquivos de configuração:**

```bash
cd envs/prod
cp backend.hcl.example      backend.hcl
cp terraform.tfvars.example terraform.tfvars
```

Edite os dois. Nenhum dos dois entra no git.

### 2. Inicializar

```bash
cd envs/prod
terraform init -backend-config=backend.hcl
```

Isso baixa os providers, trava as versões em `.terraform.lock.hcl` (**commite esse
arquivo**) e conecta ao bucket de state.

### 3. Conferir o plano

```bash
terraform plan
```

Leia a saída inteira antes de aplicar. Preste atenção especial em:

- `server_type_chosen` — qual tipo de servidor foi escolhido
- `cloudflare_r2_bucket.tfstate` — deve aparecer como **import**, nunca como *create*
- qualquer coisa marcada `must be replaced`

### 4. Aplicar

```bash
terraform apply
```

### 5. Pegar as saídas para o deploy

```bash
terraform output server_ipv4              # -> secret VPS_HOST
terraform output pages_subdomain
terraform output app_pages_domain_status  # 'active' = app.<dominio> ja serve o site
terraform output email_dns_managed        # false = SPF/DKIM/DMARC nao existem

# valores sensíveis, para os secrets do repositório:
terraform output -raw origin_certificate | base64 -w0   # -> CADDY_ORIGIN_CERT_B64
terraform output -raw origin_private_key | base64 -w0   # -> CADDY_ORIGIN_KEY_B64
terraform output -raw s3_access_key_id                  # -> .env.production
terraform output -raw s3_secret_access_key              # -> .env.production
```

Guarde-os como secrets do repositório no GitHub. **Não** escreva em arquivo dentro do
repositório.

O par do Origin Certificate vai em base64 e em uma linha só porque o `envs:` do
`appleboy/ssh-action` não atravessa valor multi-linha — ver "Entrega do certificado".
No macOS use `base64` sem `-w0`.

As credenciais S3 vão para o `.env.production` **na VPS** (`S3_ACCESS_KEY_ID` e
`S3_SECRET_ACCESS_KEY`), não para o GitHub: o CI não fala com o R2.

> **Atenção ao nome do bucket.** `uploads_bucket_name` tem default `crafthub-uploads`,
> enquanto `apps/api/.env.example` traz `S3_BUCKET=crafthub-media`. Os dois precisam ser o
> mesmo nome. Escolha um e faça os dois lados baterem antes do primeiro upload — depois,
> corrigir significa migrar objetos.

---

## Detalhes que valem entender

### O tipo do servidor não é hardcodado

Os tipos `cx22/cx32/cx42/cx52` saíram de linha para novos pedidos em **01/01/2026**. A
família que os substituiu (CX Gen3: `cx23`, `cx33`, …) **não é oferecida em todas as
regiões** — em Ashburn ela não existe.

Por isso o código lista os tipos pela API (`data.hcloud_server_types`), filtra pelos que
estão **realmente disponíveis na sua location** e atendem `min_vcpu`/`min_memory_gb`, e
escolhe o menor. Em `ash`, isso hoje resulta em **`cpx21`** (3 vCPU AMD, 4 GB, 80 GB NVMe).

> **A ressalva era mais grave do que este parágrafo dizia.** Texto anterior: "'mais barato'
> aqui é uma aproximação (…) reproduz a ordem de preço da tabela da Hetzner, mas é uma
> proxy". Reproduz **dentro** de uma família; **entre** famílias ela se inverte, e o erro
> não é de centavos.

#### O que aconteceu de verdade no primeiro apply (2026-08-29)

O `plan`, lido e aprovado, dizia `server_type_chosen = "cx23"`. O `apply`, minutos depois,
criou um **`cpx22`**. Ninguém mudou nada entre os dois.

Causa: o `cx23` **esgotou em `fsn1`** nesse intervalo. A API da Hetzner passou a devolver
`available: false, supported: true` para o tipo 114 em `fsn1-dc14` — o tipo existe na
location, mas não há capacidade. O filtro de `locals.tf` (`l.available`) o excluiu, e o
ranking caiu no candidato seguinte.

O candidato seguinte foi o pior possível:

| Tipo | vCPU | RAM | Disco | €/mês (bruto, nbg1) |
|---|---|---|---|---|
| `cx23` | 2 | 4 GB | 40 GB | **6,49** |
| `cx33` | 4 | 8 GB | 80 GB | **9,99** |
| `cpx22` | 2 | 4 GB | 80 GB | **22,99** |

O ranking ordena por `(memória, vCPU, disco)`. Com o `cx23` fora, o `cpx22` é o único
candidato de 4 GB, então ele ordena **antes** do `cx33` — que tem o **dobro de CPU e RAM
por menos da metade do preço**. A heurística não errou por pouco: ela escolheu uma máquina
**3,5× mais cara** do que a pretendida e **2,3× mais cara** do que uma estritamente melhor.

Duas lições, ambas embutidas no código agora:

1. **`(memória, vCPU, disco)` não é proxy de preço entre a linha `cx` (Intel) e a `cpx`
   (AMD).** A `cpx` é desproporcionalmente cara na faixa de baixo.
2. **Disponibilidade muda entre o `plan` e o `apply`.** Para o Terraform isso não é um erro
   — é só um valor calculado que mudou. Não há aviso, não há diff para revisar. Um `plan`
   aprovado não é garantia do tipo que será criado enquanto `server_type` for `null`.

#### A recomendação, portanto: FIXE `server_type`

`terraform.tfvars` agora traz `server_type = "cx23"` e `hcloud_location = "nbg1"` (onde há
capacidade; `fsn1` estava esgotado). Isso troca uma substituição silenciosa e cara por uma
**falha barulhenta**: sem capacidade, o apply para e você decide.

O seletor automático continua no código e serve para **descobrir** o que existe numa
location nova — rode `terraform console` e inspecione `local.server_type_candidates`. Ele
não deve decidir sozinho o que vai para produção.

#### Preço real, que o provider não te dá

O provider não expõe preço, mas **a API da Hetzner expõe**. Consulte antes de fixar um tipo:

```bash
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" \
  "https://api.hetzner.cloud/v1/server_types?per_page=100" \
| jq -r '.server_types[] | . as $t | ($t.prices[]|select(.location=="nbg1")) as $p
         | "\($t.name)\t\($t.cores)vCPU\t\($t.memory)GB\t\($t.disk)GB\tEUR \($p.price_monthly.gross)"' \
| sort -t$'\t' -k5 -n
```

E confirme a capacidade **antes** do apply — este é o passo que teria evitado o incidente:

```bash
# troque 114 pelo id do tipo desejado (vem da chamada acima)
curl -s -H "Authorization: Bearer $HCLOUD_TOKEN" "https://api.hetzner.cloud/v1/datacenters" \
| jq -r '.datacenters[] | select(.server_types.available|index(114)) | "disponivel em \(.name)"'
```

**Trade-off de região:** o `cx23` (2 vCPU, 4 GB, € 6,49) só existe em Nuremberg,
Falkenstein e Helsinki. Em Ashburn o mínimo com 4 GB é o `cpx21`, por volta de US$ 11.
Como o front está no Pages (que serve da borda, perto do usuário), só a API paga a
latência transatlântica — cerca de 200 ms do Brasil para a Alemanha contra 120 ms para
Ashburn. **Esta instalação escolheu `nbg1`**, priorizando custo.

E note que "só existe em nbg1/fsn1/hel1" é sobre o CATÁLOGO. Existir na location não é o
mesmo que ter capacidade nela — ver o incidente acima.

### Os dois registros DNS estão proxiados, e isso é obrigatório

Com a nuvem cinza (proxy desligado), o tráfego **não passa pela Cloudflare**. WAF, mitigação
de DDoS e a regra de rate limit deste diretório deixam de existir — eles rodam na borda, e
sem proxy não há borda. Pior: o IP do servidor fica publicado no DNS, e qualquer um pode
bater direto nele para furar o rate limit.

Por isso o firewall também restringe 80/443 aos ranges oficiais da Cloudflare
(`restrict_http_to_cloudflare = true`), baixados de `cloudflare.com/ips-v4` e `ips-v6` a
cada plan. O custo disso é que healthcheck direto no IP para de funcionar — se precisar
depurar, use SSH e `curl` de dentro da máquina.

### Por que existe um Origin Certificate (e o Caddy não emite Let's Encrypt)

Com `api.<domínio>` proxiado, a origem **nunca recebe** os desafios HTTP-01/TLS-ALPN-01 do
Let's Encrypt — eles chegam na borda da Cloudflare, não no servidor. A emissão automática
do Caddy simplesmente não consegue validar.

A solução é o **Cloudflare Origin Certificate**: emitido pela CA privada da Cloudflare,
aceito só por ela, válido por 15 anos. Ele nunca é visto pelo navegador — o certificado
público é o Universal SSL da Cloudflare.

Ele só protege alguma coisa se o modo TLS da zona estiver em **`Full (strict)`**, que é o
valor `"strict"` da API. Em `full` (sem strict) a Cloudflare aceita qualquer certificado na
origem, inclusive um autoassinado por um atacante no meio do caminho; em `flexible` o
trecho Cloudflare → origem vai em texto claro. Por isso o Terraform **gerencia** esse
setting (`cloudflare_zone_setting.ssl_mode`) em vez de só assumir que está certo — mexer
pelo painel é revertido no próximo apply.

#### Entrega do certificado — ISTO AGORA EXISTE DE VERDADE

Até 2026-08 esta seção descrevia o que o pipeline "deveria" fazer, e `outputs.tf` afirmava
que o GitHub Actions entregava os arquivos. **Não entregava** — não havia passo nenhum em
`.github/workflows/deploy.yml`. O resultado de um deploy do zero era um Caddy em loop de
emissão ACME que nunca podia validar (o registro é proxiado) e um **525** na borda para
todo visitante. Agora o passo existe.

Como ligar, uma vez:

```bash
cd infra/terraform/envs/prod
terraform output -raw origin_certificate | base64 -w0   # -> secret CADDY_ORIGIN_CERT_B64
terraform output -raw origin_private_key | base64 -w0   # -> secret CADDY_ORIGIN_KEY_B64
```

Guarde os dois como **secrets do repositório** no GitHub. Em base64 e em uma linha só
porque o `envs:` do `appleboy/ssh-action` não atravessa valor multi-linha, e PEM é
multi-linha por definição. Base64 é transporte, não proteção — o sigilo continua sendo o
do GitHub Secrets.

A partir daí, a cada deploy: o job falha no runner se algum dos dois secrets estiver
vazio; o passo de SSH decodifica, confere que o conteúdo é PEM de verdade e escreve
`secrets/caddy/origin.pem` (0644) e `secrets/caddy/origin.key` (0600) no diretório do
repositório na VPS; `docker-compose.prod.yml` faz bind-mount dos dois em
`/etc/caddy/origin.pem` e `/etc/caddy/origin.key` DENTRO do container; e
`scripts/deploy.sh` se recusa a migrar ou reiniciar qualquer coisa se algum dos arquivos
faltar, estiver vazio ou não parecer PEM.

Rotacionar o certificado é, então, "atualizar os dois secrets e rodar o workflow".

O Caddyfile em uso (`Caddyfile`, na raiz do repositório) já contém este trecho:

```caddyfile
{
    # Sem isso, o Fastify enxerga o IP da Cloudflare como IP do cliente em TODA
    # requisição — e o rate limit por usuário da aplicação vira inútil.
    servers {
        trusted_proxies cloudflare {
            interval 12h
            timeout  15s
        }
        client_ip_headers CF-Connecting-IP X-Forwarded-For
    }
}

api.example.com {
    # Origin Certificate da Cloudflare. Desliga a emissão automática do Caddy, que não
    # funcionaria com o registro proxiado.
    tls /etc/caddy/origin.pem /etc/caddy/origin.key

    encode zstd gzip

    reverse_proxy api:3333 {
        health_uri      /health
        health_interval 10s
    }
}
```

> **O que foi realmente implementado, e por quê.** O módulo `trusted_proxies cloudflare`
> do trecho acima vem do plugin
> [`caddy-cloudflare-ip`](https://github.com/WeidiDeng/caddy-cloudflare-ip), que **não está**
> na imagem `caddy:2-alpine` que a stack usa. Usá-lo exigiria construir um Caddy próprio
> com xcaddy a cada deploy — um passo de build a mais, e um modo de falha a mais, em uma
> máquina de 4 GB. O `Caddyfile` do repositório usa a alternativa que o próprio parágrafo
> sugeria: `trusted_proxies static` com a lista de CIDRs fixa. É o mesmo dado, congelado.
>
> A lista de referência é a que o Terraform já baixa para o firewall:
>
> ```bash
> terraform output http_allowed_source_ips
> ```
>
> Se a Cloudflare publicar um range novo e ele não estiver no `Caddyfile`, o que acontece é
> uma degradação, não uma queda: as requisições vindas por aquele colo voltam a usar
> `{remote_host}` e o rate limit por usuário volta a ser por colo para elas. Vale conferir
> as duas listas quando mexer no firewall.

### Credencial S3 do R2: derivação, não invenção

A credencial S3 do R2 **não** é o valor do API token. A
[documentação da Cloudflare](https://developers.cloudflare.com/r2/api/tokens/) define:

```
Access Key ID     = id do API token
Secret Access Key = SHA-256 (hex) do value do API token
```

Como o Terraform tem `sha256()` nativo e o resource `cloudflare_account_token` expõe tanto
`id` quanto `value`, **o par inteiro é produzido por Terraform** — não há passo manual aqui.
O token é escopado apenas ao bucket de uploads, via o resource string
`com.cloudflare.edge.r2.bucket.<ACCOUNT_ID>_default_<BUCKET>`. Um vazamento da credencial da
aplicação não dá acesso ao bucket de state.

**Teste o par antes de confiar nele** (a derivação é documentada, mas custa 20 segundos
confirmar):

```bash
AWS_ACCESS_KEY_ID=$(terraform output -raw s3_access_key_id) \
AWS_SECRET_ACCESS_KEY=$(terraform output -raw s3_secret_access_key) \
aws s3 ls "s3://$(terraform output -raw r2_uploads_bucket)" \
  --endpoint-url "$(terraform output -raw s3_endpoint)" \
  --region auto
```

### ⚠️ O state contém segredos

O `value` do API token do R2, o segredo S3 derivado dele e a chave privada do Origin
Certificate ficam **gravados em texto claro no state**. Consequências práticas:

- o bucket `crafthub-tfstate` é um **cofre de segredos** — nunca torne-o público, nunca dê
  acesso de leitura a ele para quem não deveria ver essas credenciais
- por isso ele é declarado com `prevent_destroy` e o token do backend é escopado só a ele
- nunca rode `terraform show -json > arquivo.json` dentro do repositório

### Lock de state

O backend usa `use_lockfile = true` — lock nativo do S3, sem DynamoDB. Ele funciona
gravando um objeto `.tflock` ao lado do state com um `PUT` condicional (`If-None-Match`), e
o R2 suporta `If-Match`/`If-None-Match`.

**Isso não foi verificado com um apply real nesta conta.** Confirme em 30 segundos: abra
dois terminais e rode `terraform plan` nos dois ao mesmo tempo. O segundo deve falhar com
erro de lock.

Se **não** falhar, o lock não está funcionando e a regra passa a ser: **apply de operador
único**. Combine com quem mais tiver acesso que só uma pessoa roda `apply` por vez —
explicitamente, não por acidente.

### O cloud-init para no "host pronto"

`cloud-init.yaml.tftpl` cria o usuário `deploy`, desliga login por senha e por root,
instala Docker CE + plugin compose (repositório apt oficial, não `curl | sh`), liga
`fail2ban`, `unattended-upgrades` e `ufw`. E para.

Nada de clonar repositório, subir compose ou baixar imagem — isso é do GitHub Actions.

> **Mudar o `user_data` recria o servidor.** O Terraform vai destruir a VPS e criar outra.
> É por isso que o bootstrap é deliberadamente mínimo: tudo que muda com frequência mora no
> pipeline de deploy, não aqui.

### Rate limit: duas camadas diferentes

| Camada | Onde | O que faz |
|---|---|---|
| **Borda** (esta pasta) | Cloudflare WAF | derruba enxurrada anônima por IP antes de chegar no servidor e virar gasto na OpenAI |
| **Principal** | aplicação Fastify | quota por usuário autenticado, com contabilidade |

O plano free da Cloudflare permite **uma única regra** de rate limiting na zona, então ela
está no endpoint mais caro: `POST /api/v1/me/resume/ai-import/parse` (parse de currículo
via OpenAI). Se precisar proteger um segundo endpoint sem sair do free, amplie a expressão
desta regra com `or` — não adicione outra.

O plano free também trava `period` e `mitigation_timeout` em 10 segundos e só identifica o
cliente por IP. Os defaults já refletem isso.

> A Cloudflare exige `cf.colo.id` entre as características, o que significa que o contador
> é mantido **por datacenter da borda**. O limite efetivo é por IP *por colo*, e portanto um
> pouco mais frouxo que o número configurado. Conte com isso ao escolher o threshold.

---

## O que NÃO está no Terraform (é manual)

Tudo abaixo precisa ser feito à mão. Nada disso está automatizado, e nada disso deveria
surpreender você depois.

| # | O quê | Onde | Quando |
|---|---|---|---|
| 1 | **Bucket de state R2 + token do backend** | `wrangler` / painel R2 | antes do primeiro `init` |
| 2 | **Origens e redirect URIs do OAuth Google** | Google Cloud Console > APIs & Services > Credentials | antes do primeiro login |
| 3 | **Redirect URIs do OAuth LinkedIn** | LinkedIn Developers > seu app > Auth | antes do primeiro login |
| 4 | **Hard limit de gasto da OpenAI** | platform.openai.com > Settings > Limits | **antes de qualquer tráfego real** |
| 5 | **Publicação dos pacotes no npm** | `npm publish` / workflow de release | no lançamento |
| 6 | **Criação da stack na Grafana Cloud** | grafana.com | quando ligar observabilidade |
| 7 | **Conexão do repositório no Pages** | painel Cloudflare > Workers & Pages | se `pages_git_source` = null |
| 8 | **Deploy da aplicação** | GitHub Actions | a cada release |
| 9 | **Conta no provedor de e-mail + verificação do domínio** | Resend / Postmark / SendGrid / SES | antes de abrir cadastro ao público |
| 10 | **Secrets do Origin Certificate no GitHub** | GitHub > Settings > Secrets | antes do primeiro deploy |
| 11 | **Preparar a VPS para o primeiro deploy** | SSH na máquina | uma vez, depois do primeiro apply |
| 12 | **Cloudflare Email Routing** (receber e-mail no domínio) | painel > Email > Email Routing | antes de confiar nos relatórios DMARC |

Detalhes dos que costumam morder:

**(2) Google OAuth** — cadastre em *Authorized JavaScript origins*: `https://app.<domínio>`.
Em *Authorized redirect URIs*: a URL de callback da API. Erro aqui não aparece no apply,
aparece como login quebrado em produção.

**(3) LinkedIn OAuth** — o redirect URI precisa bater **caractere a caractere** com
`vite_linkedin_redirect_uri`. Barra final conta.

**(4) Hard limit da OpenAI** — é o único freio real de custo. O rate limit de borda desta
pasta reduz a superfície, mas não substitui um teto de gasto na conta. Configure antes de
abrir para o público.

**(7) Repositório no Pages** — `var.pages_git_source` tem default `null`, então o projeto
sobe sem conexão de repo e você liga pelo painel (*Settings > Builds > Git repository*).

**(9) Provedor de e-mail** — o Terraform cria os REGISTROS DNS (SPF, DKIM, DMARC), não a
conta. A ordem é: abre a conta no provedor → ele mostra a tela "verify your domain" →
você copia os valores dela para `email_provider` no `terraform.tfvars` → `apply` → volta
no painel do provedor e clica em "verify". A propagação leva de segundos a alguns minutos.

Enquanto `email_provider` for `null`, nada disso existe e a API precisa rodar com
`MAIL_TRANSPORT=log`, que **imprime o link de verificação no log em vez de mandar
e-mail**. Em produção isso significa que ninguém consegue confirmar a conta. Não é um
estado em que se abre cadastro ao público.

Comece a política DMARC em `"none"`. Ela não rejeita nada — só liga os relatórios, para
você descobrir o que já manda e-mail em nome do domínio antes de bloquear. Subir direto
para `"reject"` com um remetente legítimo esquecido faz e-mail de verdade sumir sem aviso
nenhum.

**(12) Email Routing** — o Terraform **não** gerencia isto, e de propósito: a habilitação
exige clicar num link de verificação enviado ao endereço de destino, o que nenhum apply
pode fazer. A Cloudflare cria sozinha os registros no APEX (MX `route1/2/3.mx.cloudflare.net`
e um TXT SPF com `include:_spf.mx.cloudflare.net`) e os deixa travados.

**Não há conflito com o provedor de envio, e o motivo é o `sending_subdomain`.** Um domínio
só tem um conjunto de MX e um SPF por rótulo. Com o Resend publicando SPF e MX de bounce em
`send.<domínio>`, o apex fica livre para o Email Routing. Se algum dia você trocar para um
provedor que exija SPF no APEX, os dois passam a disputar o mesmo registro e será preciso
fundir os `include:` num único TXT — não criar um segundo.

Serve também para fechar o buraco do `rua` do DMARC: um endereço `dmarc@<domínio>` é do
mesmo domínio do registro `_dmarc`, então não precisa do `<domínio>._report._dmarc` que o
DMARC exigiria de um endereço externo (e que você não consegue publicar no `gmail.com`).
Email Routing é **só recebimento** — o envio continua sendo do provedor transacional.

**(10) Secrets do Origin Certificate** — `CADDY_ORIGIN_CERT_B64` e `CADDY_ORIGIN_KEY_B64`.
Ver a seção "Entrega do certificado" acima. Sem eles o job de deploy falha no runner, de
propósito: é melhor do que descobrir depois, com um 525 na borda.

**(11) Preparar a VPS** — o `cloud-init` para no "host pronto para receber deploy" e o
workflow de deploy assume um diretório de repositório já existente com um
`.env.production` dentro. Nada cria isso. Depois do primeiro `apply`:

```bash
ssh deploy@$(terraform output -raw server_ipv4)

sudo install -d -o deploy -g deploy /srv/crafthub
git clone <url-do-repo> /srv/crafthub
cd /srv/crafthub
cp apps/api/.env.example .env.production
$EDITOR .env.production   # DATABASE_URL, JWT_SECRET, WEB_APP_URL, APP_PUBLIC_URL,
                          # POSTGRES_*, SMTP_*, MAIL_FROM, S3_*, DOMAIN
```

`.env.production` é gitignored e **nunca** é criado nem atualizado por Terraform ou pelo
CI. Ele existe só na máquina. Se o caminho não for `/srv/crafthub`, ajuste a variável de
repositório `VPS_APP_DIR` no GitHub.

> Contexto: no início do provider v5 o bloco `source` era read-only, o que tornava
> impossível criar um projeto ligado ao GitHub por Terraform (issues
> [#5093](https://github.com/cloudflare/terraform-provider-cloudflare/issues/5093) e
> [#5176](https://github.com/cloudflare/terraform-provider-cloudflare/issues/5176)). Ambas
> estão **fechadas**, e na 5.23 o `source` aparece como *Optional* no schema — o bug foi
> corrigido. Mesmo assim o default é `null`, porque só um `apply` real prova isso e o apply
> não foi executado aqui. Se quiser tentar, preencha a variável; se o apply falhar nesse
> ponto, volte para `null` e conecte pelo painel — o resto do projeto continua gerenciado
> por Terraform normalmente.

---

## Verificação sem tocar em nuvem nenhuma

```bash
terraform fmt -recursive -check
```

```bash
cd envs/prod && terraform init -backend=false && terraform validate
```

`validate` confere os nomes dos resources **e os atributos contra o schema real do
provider** — é o que pega qualquer resquício de sintaxe v4 no provider v5.

`plan` e `apply` exigem tokens reais e não foram executados na escrita deste diretório.

---

## Problemas comuns

**`Error: Invalid provider configuration` no init**
Faltou exportar `HCLOUD_TOKEN` ou `CLOUDFLARE_API_TOKEN`.

**`NoSuchBucket` no init**
O bucket de state não foi criado (passo 1.1), ou o `bucket` em `versions.tf` não bate com o
nome real.

**`terraform plan` quer *criar* `cloudflare_r2_bucket.tfstate`**
O bloco `import` não casou. Confira que `tfstate_bucket_name` e `cloudflare_account_id`
estão corretos — o id do import é `<account_id>/<bucket>/default`.

**Nenhum tipo de servidor atende os critérios**
A precondição em `hcloud_server.main` explica. Rode `terraform console` e inspecione
`local.server_type_candidates` para ver o que a API devolveu, ou baixe os pisos, ou troque
a location.

**`terraform destroy` falha**
Esperado. `enable_delete_protection` protege o servidor e `prevent_destroy` protege o bucket
de state. Para destruir de verdade, desligue as proteções conscientemente e aplique antes.

**`ssh_allowed_ips` não foi declarada**
É obrigatória agora, e não tem default. O default antigo (`0.0.0.0/0`, `::/0`) abria a
porta 22 de produção para a internet em quem nunca mexesse na variável. Declare no
`terraform.tfvars`. Se você se trancar para fora, o Console (VNC) da Hetzner no painel não
depende deste firewall.

**`terraform.tfvars` antigo: "Value for undeclared variable"**
`vite_linkedin_client_id` e `vite_linkedin_redirect_uri` foram removidas — o front nunca
as leu (o login do LinkedIn é server-side). Apague as duas linhas do seu `terraform.tfvars`.

**O plan falha dizendo que a lista de IPs da Cloudflare veio errada**
É a validação nova em `locals.tf` fazendo o trabalho dela. A lista alimenta `source_ips`
do firewall de produção direto de uma resposta HTTP; um corpo vazio ou em HTML (proxy
corporativo, captive portal, página de erro da borda) reescreveria o firewall em silêncio.
Rode de uma rede limpa, ou aplique com `restrict_http_to_cloudflare = false` sabendo que
isso expõe o IP da origem. **Nada foi alterado** quando esse erro aparece.

**`app.<domínio>` resolve mas devolve erro do Pages**
Faltava o `cloudflare_pages_domain` — o CNAME sozinho não faz o projeto Pages aceitar o
hostname. Ele agora existe (`cloudflare_pages.tf`). Confira
`terraform output app_pages_domain_status`: `pending` significa que a Cloudflare ainda
está validando a posse pelo DNS; `active` é o que serve o site.

**E-mail de verificação não chega**
Nesta ordem: (1) `terraform output email_dns_managed` — se for `false`, `email_provider`
está `null` e não há SPF/DKIM/DMARC nenhum; (2) o `.env.production` tem `SMTP_HOST`? sem
ele o `MAIL_TRANSPORT` cai em `log` e o link só aparece em `docker compose logs api`;
(3) o domínio está marcado como verificado no painel do provedor?

**Erro 522/525 ao acessar `api.<domínio>`**
522 = a Cloudflare não alcançou a origem (firewall, Caddy fora do ar, porta errada).
525 = handshake TLS falhou. Antes isto era o estado NORMAL de um deploy do zero, porque
ninguém entregava o Origin Certificate. Hoje o certificado é entregue pelo job de deploy e
o `scripts/deploy.sh` se recusa a subir sem ele — então um 525 agora aponta para um
certificado que não corresponde ao hostname, ou para a zona fora de `Full (strict)`
(alguém desligou `manage_zone_ssl_mode` e mexeu no painel).
