# Infraestrutura do LinkHub (Terraform)

Este diretório descreve, em código, a infraestrutura **imutável** do LinkHub. Foi escrito
para ser lido por alguém que nunca mexeu em Terraform: cada arquivo tem um propósito só, e
cada decisão não óbvia está comentada no próprio código.

**O Terraform aqui NÃO faz deploy da aplicação.** Ele cria a máquina, o firewall, o DNS,
os certificados, os buckets e as regras de borda — e para. Subir a aplicação é trabalho do
GitHub Actions.

---

## O que é criado

| Onde | O quê |
|---|---|
| Hetzner Cloud | chave SSH, firewall, uma VPS Ubuntu 24.04 em Ashburn |
| Cloudflare DNS | `app.<domínio>` (CNAME proxiado) e `api.<domínio>` (A proxiado) |
| Cloudflare SSL | modo da zona em `Full (strict)` + Origin Certificate para a origem |
| Cloudflare R2 | bucket de uploads + credencial S3 escopada nele; bucket de state adotado |
| Cloudflare Pages | projeto do front, com as env vars `VITE_*` de build |
| Cloudflare WAF | uma regra de rate limit de borda no endpoint que chama a OpenAI |

Arquitetura resultante:

```
                    ┌───────────── Cloudflare (proxy laranja) ─────────────┐
                    │                                                       │
  navegador ──────► │  app.dominio  ──►  Cloudflare Pages (Vite SPA)        │
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
                              └─────────────────────────────────┘
                                                │
                                                ▼
                                     Cloudflare R2 (uploads, backups)
```

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
    ├── cloudflare_dns.tf       # zona, modo TLS e os dois registros DNS
    ├── cloudflare_tls.tf       # chave + CSR + Origin Certificate
    ├── cloudflare_r2.tf        # buckets e a credencial S3 da aplicação
    ├── cloudflare_pages.tf     # projeto do front
    ├── cloudflare_ratelimit.tf # a regra de rate limit de borda
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

```bash
export CLOUDFLARE_API_TOKEN="..."
```

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
wrangler r2 bucket create linkhub-tfstate
```

**1.2 — Crie o token R2 do backend pelo painel:**

Painel Cloudflare > R2 > **API** > *Create API token*

- Permissão: **Object Read & Write**
- Escopo: **Apply to specific buckets only** → `linkhub-tfstate`
- Copie o **Access Key ID** e o **Secret Access Key** (o secret aparece **uma única vez**)

Este é o único par de credenciais do projeto que vive fora do Terraform, e é irredutível.

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
terraform output server_ipv4
terraform output pages_subdomain

# valores sensíveis:
terraform output -raw origin_certificate
terraform output -raw origin_private_key
terraform output -raw s3_access_key_id
terraform output -raw s3_secret_access_key
```

Guarde-os como secrets do repositório no GitHub. **Não** escreva em arquivo dentro do
repositório.

---

## Detalhes que valem entender

### O tipo do servidor não é hardcodado

Os tipos `cx22/cx32/cx42/cx52` saíram de linha para novos pedidos em **01/01/2026**. A
família que os substituiu (CX Gen3: `cx23`, `cx33`, …) **não é oferecida em todas as
regiões** — em Ashburn ela não existe.

Por isso o código lista os tipos pela API (`data.hcloud_server_types`), filtra pelos que
estão **realmente disponíveis na sua location** e atendem `min_vcpu`/`min_memory_gb`, e
escolhe o menor. Em `ash`, isso hoje resulta em **`cpx21`** (3 vCPU AMD, 4 GB, 80 GB NVMe).

> **Ressalva honesta:** o provider da Hetzner **não expõe preço** em nenhum data source.
> "Mais barato" aqui é uma aproximação — o menor `(memória, vCPU, disco)` entre os
> candidatos. Isso reproduz a ordem de preço da tabela da Hetzner, mas é uma proxy.
> Confira o output `server_type_candidates` antes do primeiro apply.

Para forçar um tipo específico, preencha `server_type` no tfvars.

**Trade-off de região:** o `cx23` (2 vCPU, 4 GB) é mais barato que o `cpx21`, mas só existe
em Nuremberg, Falkenstein e Helsinki. Como o front está no Pages (que serve da borda, perto
do usuário), só a API sofreria com a latência transatlântica. Se isso for aceitável, mudar
`hcloud_location` para `"nbg1"` reduz o custo — e o código já escolhe o tipo certo sozinho.

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

#### Trecho de Caddyfile

Escreva `terraform output -raw origin_certificate` em `/etc/caddy/origin.pem` e
`terraform output -raw origin_private_key` em `/etc/caddy/origin.key` (modo `0600`), pelo
pipeline de deploy. O Caddyfile:

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

> O módulo `trusted_proxies cloudflare` vem do plugin
> [`caddy-cloudflare-ip`](https://github.com/WeidiDeng/caddy-cloudflare-ip); ele precisa
> estar embutido na imagem do Caddy. Sem o plugin, troque por uma lista estática de CIDRs
> — o `terraform output http_allowed_source_ips` devolve exatamente essa lista.

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

- o bucket `linkhub-tfstate` é um **cofre de segredos** — nunca torne-o público, nunca dê
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

**Erro 522/525 ao acessar `api.<domínio>`**
522 = a Cloudflare não alcançou a origem (firewall, Caddy fora do ar, porta errada).
525 = handshake TLS falhou — quase sempre o Origin Certificate não está no lugar certo no
servidor ou a permissão do arquivo `.key` está errada.
