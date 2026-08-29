# Inventário de produção

O que existe, onde, e quanto custa. Escrito em 2026-08-29, no primeiro provisionamento.

> **Isto NÃO é a fonte da verdade.** A fonte é o state do Terraform, no bucket R2
> `crafthub-tfstate`. Para os valores atuais, sempre:
>
> ```bash
> cd infra/terraform/envs/prod && terraform output
> ```
>
> Este arquivo existe para responder "o que eu tenho no ar?" sem precisar de credencial,
> e para registrar as decisões que um `terraform output` não explica.

---

## Endereços

| Hostname | Serve | Onde |
|---|---|---|
| `crafthub.dev` | front (SPA Vite/React) | Cloudflare Pages, projeto `crafthub-web` |
| `www.crafthub.dev` | 301 para o apex | Cloudflare Single Redirect |
| `api.crafthub.dev` | API Fastify | VPS Hetzner, atrás do Caddy |
| `crafthub-web.pages.dev` | mesmo front | subdomínio do Pages (alvo do CNAME do apex) |

O front está no **apex**, não em `app.`. Ver `infra/terraform/README.md`, seção "O front
pode servir no apex", para o porquê e para o que isso torna difícil de reverter.

## Servidor

| | |
|---|---|
| Tipo | `cx23` — 2 vCPU / 4 GB / 40 GB |
| Location | `nbg1` (Nuremberg) |
| IPv4 | `2.28.64.43` |
| Custo | **EUR 6,49/mês** (bruto) |
| Proteção contra destruição | ligada |
| Backup de máquina (snapshot Hetzner) | **desligado** |
| Acesso | `ssh deploy@2.28.64.43` com `~/.ssh/linkhub_deploy` |
| Diretório da aplicação | `/srv/crafthub` |

**O tipo está FIXADO** em `terraform.tfvars`. Não é preferência: em 2026-08-29 o seletor
automático criou um `cpx22` de EUR 22,99 porque o `cx23` esgotou entre o `plan` e o
`apply`. História completa em `infra/terraform/README.md`.

**O banco vive no disco raiz desta máquina.** Não há volume dedicado e o snapshot da
Hetzner está desligado. Perder o servidor é perder o banco, a menos que
`scripts/backup.sh` esteja rodando. Ver `docs/deployment-readiness.md`, P2-c.

## Armazenamento

| Bucket R2 | Uso | Gerenciado por |
|---|---|---|
| `crafthub-uploads` | avatares, capas, currículos | Terraform |
| `crafthub-tfstate` | state do Terraform — **contém segredos em texto claro** | criado à mão, adotado por `import` |
| `crafthub-backups` | destino de `scripts/backup.sh` | **NÃO EXISTE AINDA** |

`crafthub-backups` é referenciado por `scripts/backup.sh` mas nenhum recurso o cria.
Enquanto não existir, o backup noturno falha. Ver `docs/deployment-readiness.md`, P2-d.

## E-mail

Duas metades independentes, em rótulos DNS diferentes — é isso que as faz coexistir:

| Direção | Provedor | Registros |
|---|---|---|
| **Enviar** (verificação de conta, reset de senha) | Resend, região `eu-west-1` | SPF e MX de bounce em `send.crafthub.dev`; DKIM em `resend._domainkey.crafthub.dev` |
| **Receber** (encaminha para o Gmail) | Cloudflare Email Routing | MX e SPF no APEX; DKIM em `cf2024-1._domainkey` |

Endereços que recebem: `dmarc@`, `hello@`, `no-reply@` — todos encaminhados. **Não dá para
ENVIAR desses endereços**: Email Routing é só encaminhamento.

DMARC está em `p=none` de propósito: liga os relatórios sem rejeitar nada. Subir para
`quarantine` e depois `reject` só depois que os relatórios mostrarem que todo remetente
legítimo passa.

Limite do plano grátis do Resend: **3.000 e-mails/mês e 100/dia**. O teto diário é o que
morde primeiro.

## Custo mensal

| Item | US$ |
|---|---|
| VPS Hetzner `cx23` | ~7,05 |
| Domínio `.dev` (rateado) | ~1,00 |
| Cloudflare (Pages, DNS, R2, WAF, Email Routing) | 0,00 |
| Resend (3k/mês) | 0,00 |
| GitHub Actions | 0,00 |
| OpenAI | variável — teto de gasto configurado |
| **Total fixo** | **~US$ 8/mês** |

## Onde cada segredo mora

| Segredo | Onde |
|---|---|
| Tokens Hetzner/Cloudflare/OpenAI/Resend | `.env` na raiz (gitignored), máquina do dev |
| Credencial S3 do R2 da aplicação | state do Terraform → copiada para `.env.production` na VPS |
| Chave privada do Origin Certificate | state do Terraform → secrets do GitHub → `secrets/caddy/` na VPS |
| `JWT_SECRET`, senha do Postgres | só em `.env.production` na VPS |
| Chave SSH de deploy | `~/.ssh/linkhub_deploy` + secret do GitHub |

`.env.production` **não** é gerenciado por Terraform nem pelo CI. Existe só na VPS.
