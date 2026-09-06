# Restaurar o banco do CraftHub

Você provavelmente está lendo isto porque algo deu muito errado. Este documento é para
ser seguido de cima para baixo, copiando e colando. Não precisa entender nada antes de
começar.

**Última vez que este procedimento foi executado de verdade: 2026-08-29.** Restauração
validada contra produção, 23 de 23 tabelas idênticas em contagem e em conteúdo. Se essa
data estiver com mais de três meses, o procedimento voltou a ser hipótese — veja
"Simulado", no fim.

---

## A regra que não se quebra

> **Nunca restaure por cima de produção antes de ter um dump do estado atual, por pior
> que ele esteja.**

O dump é gerado com `--clean --if-exists`: ele **apaga** cada tabela antes de recriar. Se
o backup estiver ruim e você já tiver sobrescrito produção, acabaram as duas cópias. Um
banco corrompido ainda tem dados dentro; um banco apagado não tem nada.

O passo 1 do Cenário A existe só por causa disso. Ele custa 10 segundos.

---

## Antes de tudo: os fatos que você vai precisar

|                    |                                                                     |
| ------------------ | ------------------------------------------------------------------- |
| VPS                | `ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy`                    |
| App                | `/srv/crafthub`                                                     |
| Container do banco | `crafthub-postgres`                                                 |
| Usuário / banco    | `crafthub_user` / `crafthub`                                        |
| Bucket dos backups | `crafthub-backups`, prefixo `postgres/`                             |
| Remote rclone      | `r2` (config em `~/.config/rclone/rclone.conf` do usuário `deploy`) |
| Nome dos objetos   | `crafthub-<AAAA-MM-DD>T<HH-MM-SS>Z.sql.gz`                          |
| Quando o cron roda | 04:17 UTC, diariamente (⚠️ backup.sh documenta 03:17 — ver abaixo)  |
| Retenção           | 30 dias (script) / 45 dias (regra do bucket)                        |

---

# Cenário A — o servidor está de pé, os dados é que se perderam

Alguém apagou uma tabela, uma migration comeu dados, o banco corrompeu. A máquina responde.

### 1. Congele o estado atual antes de qualquer coisa

```bash
ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy
docker exec crafthub-postgres pg_dump -U crafthub_user -d crafthub --clean --if-exists --no-owner | gzip > ~/ANTES-DA-RESTAURACAO.sql.gz
ls -lh ~/ANTES-DA-RESTAURACAO.sql.gz
```

Se este comando falhar porque o banco está destruído demais, tudo bem — siga em frente.
Mas **tente**.

### 2. Veja o que existe no bucket

```bash
rclone ls r2:crafthub-backups/postgres
```

Os nomes têm data e hora UTC. **Escolha o mais recente ANTERIOR ao estrago.** O backup de
hoje de manhã pode já conter o problema — se a tabela foi apagada ontem à noite, o backup
das 04:17 de hoje veio com ela apagada.

Guarde o nome escolhido:

```bash
BACKUP=crafthub-2026-08-29T04-17-00Z.sql.gz   # troque pelo seu
```

### 3. Baixe e confira que o arquivo presta

```bash
rclone copyto "r2:crafthub-backups/postgres/$BACKUP" "/tmp/$BACKUP"
gzip --test "/tmp/$BACKUP" && echo "gzip OK"
gzip -cd "/tmp/$BACKUP" | tail -n 5 | grep -q "PostgreSQL database dump complete" && echo "dump COMPLETO"
```

Se qualquer uma das duas falhar, **pare** e volte ao passo 2 com o backup anterior.

### 4. Ensaie num banco descartável — sim, mesmo com pressa

São dois minutos e é o que separa "restaurei" de "achei que tinha restaurado".

```bash
docker rm -fv crafthub-restore-test 2>/dev/null; docker run -d --rm --name crafthub-restore-test -e POSTGRES_USER=crafthub_user -e POSTGRES_DB=crafthub -e POSTGRES_PASSWORD=descartavel pgvector/pgvector:pg15
```

Espere ficar pronto e restaure nele:

```bash
until docker exec crafthub-restore-test pg_isready -U crafthub_user -d crafthub >/dev/null 2>&1; do sleep 1; done; gzip -cd "/tmp/$BACKUP" | docker exec -i crafthub-restore-test psql -U crafthub_user -d crafthub -q && echo "RESTAUROU NO DESCARTAVEL"
```

Confira se os dados que você perdeu estão lá:

```bash
docker exec crafthub-restore-test psql -U crafthub_user -d crafthub -c "select 'users', count(*) from users union all select 'resumes', count(*) from resumes union all select 'profile_blocks', count(*) from profile_blocks union all select 'work_experiences', count(*) from work_experiences"
```

**Se os números não fizerem sentido, este não é o backup certo.** Destrua o descartável e
volte ao passo 2 com um backup mais antigo:

```bash
docker rm -fv crafthub-restore-test
```

### 5. Pare a aplicação

Se a API continuar escrevendo durante a restauração, você termina com um banco meio
restaurado e meio novo. O Caddy fica de pé e serve erro, o que é melhor que servir dado errado.

```bash
docker stop crafthub-api crafthub-worker-embedding crafthub-worker-digest
```

### 6. Restaure em produção

```bash
gzip -cd "/tmp/$BACKUP" | docker exec -i crafthub-postgres psql -U crafthub_user -d crafthub
```

Erros do tipo `does not exist` são normais e esperados aqui: o dump tenta apagar coisas
antes de recriá-las. Qualquer outro tipo de erro merece atenção.

### 7. Suba a aplicação

```bash
docker start crafthub-postgres crafthub-api crafthub-worker-embedding crafthub-worker-digest && sleep 15 && docker ps --format '{{.Names}}\t{{.Status}}'
```

### 8. Confirme

```bash
curl -sf http://127.0.0.1:3333/health && echo " API OK"
```

E vá até a interface: abra um perfil público e confira que o currículo e os blocos estão lá.
Contagem de linhas não prova que a aplicação funciona.

### 9. Só depois de tudo certo, limpe

```bash
docker rm -fv crafthub-restore-test; rm -f "/tmp/$BACKUP"
```

O **`-v` é obrigatório**. A imagem do Postgres declara `VOLUME`, então o Docker cria um
volume anônimo para o descartável. Com `docker rm -f` sem `-v`, esse volume sobrevive ao
container — carregando uma cópia completa do banco restaurado, dados de usuário inclusos —
e não aparece em `docker ps -a`. Você acumularia um por simulado.

Confira que não sobrou nada. A resposta certa são os quatro volumes do compose e mais nenhum:

```bash
docker volume ls
```

Guarde `~/ANTES-DA-RESTAURACAO.sql.gz` por alguns dias. É a sua única cópia do que existia
antes, e ele **não** está no R2.

---

# Cenário B — o servidor sumiu

A máquina foi destruída, perdida ou está inacessível. Os backups estão no R2, que é outro
provedor e continua de pé.

### 1. Recrie a infraestrutura

```bash
cd infra/terraform/envs/prod && terraform init -backend-config=backend.hcl && terraform apply
```

O state do Terraform mora no R2 (bucket `crafthub-tfstate`), não na máquina que morreu.

### 2. Recupere as credenciais do rclone

Elas não existem em lugar nenhum além da máquina perdida e do state do Terraform:

```bash
terraform output -raw r2_backups_access_key_id
```

```bash
terraform output -raw r2_backups_secret_access_key
```

### 3. Reconstrua o `rclone.conf` na máquina nova

Como usuário `deploy`, com `<ACCOUNT_ID>` = `cloudflare_account_id` do `terraform.tfvars`:

```bash
umask 077; mkdir -p ~/.config/rclone; cat > ~/.config/rclone/rclone.conf <<'EOF'
[r2]
type = s3
provider = Cloudflare
region = auto
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
access_key_id = <do passo 2>
secret_access_key = <do passo 2>
no_head = true
no_check_bucket = true
EOF
chmod 600 ~/.config/rclone/rclone.conf
```

**`no_head = true` não é opcional.** Sem ele todo upload falha com 501 — veja
"Armadilhas", abaixo.

### 4. Suba o stack e restaure

Faça o deploy normal, depois siga o **Cenário A a partir do passo 2**. Pule o passo 1: não
há estado anterior para congelar.

### 5. Reinstale o cron

Ele mora no crontab do usuário `deploy` e não vem do git:

```bash
crontab -e
```

```
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""
17 4 * * * /srv/crafthub/scripts/backup.sh >> /var/log/crafthub-backup.log 2>&1
```

E crie o arquivo de log com o dono certo, senão o cron falha em silêncio:

```bash
sudo touch /var/log/crafthub-backup.log && sudo chown deploy:deploy /var/log/crafthub-backup.log && sudo chmod 640 /var/log/crafthub-backup.log
```

---

# Armadilhas que já custaram tempo

Todas foram encontradas na prática em 2026-08-29, não são teoria.

**`rclone lsd r2:` devolve 403, e isso é o esperado.**
O token é escopado ao bucket de backups; listar buckets é permissão de conta. Use
`rclone ls r2:crafthub-backups`. Se der 403 no `lsd`, **não** conclua que a credencial está
quebrada.

**Sem `no_head = true`, todo upload falha com `501 Not Implemented`.**
Depois do PUT o rclone relê o objeto com `HEAD ...?versionId=<id>`, usando o version-id que
o R2 devolve. O R2 manda o header mas não implementa o `?versionId`. Pior: com `--retries 3`
o job ainda "passa", porque a retentativa encontra o objeto já lá e pula o upload — dá
sucesso sem ter feito nada, gravando um ERROR por noite.

**`docker exec -T` não existe.**
`-T` é do `docker compose exec`. No `docker exec` dá `unknown shorthand flag: 'T'`. Para não
alocar TTY, não passe flag nenhuma.

**Não dê `source` no `.env.production`.**
Ele é lido pelo Docker Compose, cujo parser não é o shell. `MAIL_FROM=CraftHub <no-reply@…>`
é válido para o Compose e é redirecionamento para o bash. Leia as chaves que você precisa,
não avalie o arquivo.

**Existem 23 tabelas, não 22.**
A vigésima terceira é `drizzle.__drizzle_migrations`, num schema próprio. Ela está no dump e
precisa estar: sem ela o Drizzle acha que nenhuma migration rodou e tenta aplicar as 24 de
novo por cima de um banco que já tem tudo. Se você contar tabelas só em `public`, vai contar
errado.

**`docker rm -f` deixa volume anônimo para trás.**
Sem `-v`, o volume anônimo do container descartável sobrevive com uma cópia inteira do
banco restaurado dentro, invisível em `docker ps -a`. Aconteceu na primeira execução deste
procedimento: 51 MB de dados de usuário órfãos. Sempre `docker rm -fv`.

**Cron não é garantia.**
Se o cron parar, nada avisa — e a regra de lifecycle do bucket continua apagando por idade,
do lado da Cloudflare, sem saber que parou de entrar coisa nova. Cron morto hoje = bucket
vazio em 45 dias, em silêncio. **Enquanto não existir alerta de falha, confira o log de vez
em quando:**

```bash
tail -20 /var/log/crafthub-backup.log
```

---

# O vigia

Um Cloudflare Worker (`crafthub-backup-watchdog`) roda **05:30 UTC** todo dia, olha o
bucket e manda e-mail quando o backup mais recente tem mais de 24h, é menor que 20 KB, ou
não existe. Código em `infra/cloudflare/backup-watchdog/worker.js`.

Ele olha o **arquivo no bucket**, não o código de saída do script — porque em 2026-08-29 o
script saiu com 0 sem ter subido nada, e um alerta baseado em "terminou bem" teria dito
que estava tudo certo.

A regra que ele segue: **não conseguir conferir nunca vira "está tudo bem"**. Listagem que
falha, binding de limite ausente ou não-numérico, e carimbo de data no futuro são todos
ALERTA — não silêncio. Um vigia que se cala quando não consegue olhar é pior que nenhum,
porque fabrica confiança. Isso está coberto por testes:

```bash
npm run test:infra
```

> **Onde eles rodam:** **no CI, sim** — `.github/workflows/ci.yml` tem o passo
> "Test — infra workers", que chama `npm run test:infra` no job `test`. **No gate local
> (`npm run guardrails`), não** — o gate roda testes por workspace via turbo, e este
> diretório não é um workspace npm. Ao mexer no worker, rode `npm run test:infra` à mão
> antes de empurrar: o CI pega, mas só depois do push. O lint, esse sim, alcança o
> diretório pelo ratchet (`scripts/guardrails/lint-changed.mjs`), que roda dentro do gate.

> ⚠️ **O horário do backup está contraditório no repositório.** A tabela acima diz
> 04:17 UTC; o cabeçalho de `scripts/backup.sh` documenta `17 3 * * *` (03:17 UTC).
> Só o crontab da VPS decide. Resolva com um `crontab -l` na VPS (o endereço de ssh está
> na tabela "os fatos que você vai precisar", lá em cima, e em
> `docs/production-inventory.md` — não repita o IP aqui: ele muda quando o servidor é
> recriado) e corrija o perdedor. O limite de 24h do vigia funciona nos dois casos
> (backup saudável tem 1,3h ou 2,3h; um dia perdido tem 25,3h ou 26,3h), mas se você
> mexer no horário do backup ou no do vigia, refaça a conta em `variables.tf`.

### Como implantar (ainda NÃO está no ar)

O Terraform não é aplicado por CI — `.github/workflows/deploy.yml` só imprime instruções
de `terraform output`. Este vigia sobe por `terraform apply` à mão, e enquanto isso não
acontecer **nada quebra**: ele é monitoramento aditivo, não está no caminho de nenhuma
requisição, e o backup noturno continua rodando exatamente como hoje. O que você não tem,
enquanto ele não subir, é o aviso de que o backup parou.

Duas variáveis NOVAS são obrigatórias e não têm default. Sem elas, **qualquer**
`terraform plan` neste diretório passa a falhar, inclusive para mudanças que não têm nada
a ver com backup:

| Variável             | De onde vem                                              | Onde colocar                    |
| -------------------- | -------------------------------------------------------- | ------------------------------- |
| `backup_alert_email` | você decide — o e-mail que recebe o alerta               | `terraform.tfvars` (gitignored) |
| `resend_api_key`     | painel do Resend → API Keys → chave com "Sending access" | ambiente, **nunca** no tfvars   |

O `CLOUDFLARE_API_TOKEN` também precisa da permissão **"Workers Scripts: Edit"**, que em
2026-08-29 ele não tinha (a API devolvia 403). Painel da Cloudflare → My Profile → API
Tokens → editar o token → Permissions → Account · Workers Scripts · Edit.

```bash
cd infra/terraform/envs/prod

# 1. os segredos, por ambiente (o resend_api_key NÃO vai para o tfvars)
export TF_VAR_resend_api_key="$RESEND_API_KEY"
export CLOUDFLARE_API_TOKEN=...   # com Workers Scripts: Edit
export HCLOUD_TOKEN=...

# 2. o destinatário: ACRESCENTE esta linha ao terraform.tfvars, editando o arquivo.
#    Não faça `>> terraform.tfvars` às cegas — rodar duas vezes deixa o atributo
#    definido duas vezes e o terraform passa a morrer com "Attribute redefined" em
#    QUALQUER comando neste diretório até alguém abrir o arquivo e apagar a duplicata.
#
#        backup_alert_email = "voce@example.com"
#
#    Se a linha já existir, troque o valor em vez de acrescentar outra.

# 3. init (backend R2), plan, e só então apply
terraform init -backend-config=backend.hcl
terraform plan  -target=cloudflare_workers_script.backup_watchdog \
                -target=cloudflare_workers_cron_trigger.backup_watchdog
terraform apply -target=cloudflare_workers_script.backup_watchdog \
                -target=cloudflare_workers_cron_trigger.backup_watchdog
```

O `-target` é para a primeira subida: ele isola o vigia do resto do plan, que hoje pode
carregar diffs de outras coisas. Depois de aplicado, rode um `terraform apply` normal para
reconciliar o state inteiro.

**Prova de que subiu**, sem esperar até amanhã: force a execução do cron no painel
(Workers → `crafthub-backup-watchdog` → Settings → Trigger Events → Cron → _Run_), ou
simplesmente confira o marcador depois do primeiro 05:30 UTC:

```bash
rclone cat r2:crafthub-backups/watchdog/last-run.json
```

Se `checkedAt` for de hoje, ele está vivo. Se o e-mail de segunda-feira chegar, o canal de
alerta também está.

### Recebi "[CraftHub] BACKUP COM PROBLEMA"

O e-mail traz o motivo e a idade do backup mais recente. O primeiro comando é sempre
o log do backup na VPS (endereço de ssh: a tabela "os fatos que você vai precisar" no topo
deste arquivo, ou `docs/production-inventory.md` — o IP muda quando o servidor é recriado,
e é por isso que ele não está escrito aqui):

```bash
ssh deploy@<VPS> -i ~/.ssh/linkhub_deploy 'tail -30 /var/log/crafthub-backup.log; echo ---; crontab -l'
```

- **Log com `ERROR`** → a mensagem diz o que falhou. Rode `/srv/crafthub/scripts/backup.sh`
  à mão para ver de novo.
- **Log parado numa data antiga** → o cron não está disparando. Confira `crontab -l` e
  `systemctl is-active cron`. Um deploy pode ter revertido o script (`git checkout --force`).
- **Log vazio ou sem permissão** → o `/var/log/crafthub-backup.log` perdeu o dono `deploy`,
  provavelmente numa rotação. Veja "Armadilhas".

Se você não conseguir consertar rápido, **rode um backup à mão** antes de investigar. A
janela de retenção continua correndo.

### Como saber se o VIGIA está vivo

Toda segunda-feira ele manda "[CraftHub] backup ok (batimento semanal)". **Se essa mensagem
parar de chegar, quem caiu foi o vigia** — e o silêncio dele não quer dizer que o backup
está bem.

Para conferir a qualquer momento, sem painel. **Rode da SUA máquina, não da VPS** — o
cenário inteiro que justifica o vigia é a VPS estar fora do ar, e um comando de auditoria
que depende dela não serve exatamente no dia em que você precisa dele:

```bash
rclone cat r2:crafthub-backups/watchdog/last-run.json
```

Isso exige um remote `r2` no seu rclone local (mesmas credenciais do `rclone.conf` da VPS
— `terraform output r2_backups_access_key_id` e `r2_backups_secret_access_key`). Se você
ainda não configurou, o caminho pela VPS continua valendo enquanto ela estiver de pé
(endereço de ssh: a tabela no topo deste arquivo, ou `docs/production-inventory.md`):

```bash
ssh deploy@<VPS> -i ~/.ssh/linkhub_deploy 'rclone cat r2:crafthub-backups/watchdog/last-run.json'
```

Ele grava esse marcador em toda execução. `checkedAt` velho = vigia parado. `healthy:
false` com `backupCount: null` = ele rodou mas **não conseguiu listar** o bucket — o que
não é a mesma coisa que "não há backups".

Os logs do Worker (`console.log` do status a cada execução) ficam no painel da Cloudflare
com observability ligada, mas **só por 3 dias** no plano free. O marcador no R2 é a
memória longa; o log é para a última madrugada.

### O que o vigia NÃO faz

Ele não sabe se o dump **restaura**. Ele confere que existe um arquivo recente e de
tamanho plausível — nada mais. A única coisa que responde "isso volta a ser um banco?" é o
simulado abaixo.

---

# Simulado

Backup que nunca foi restaurado não é backup, é esperança. **Uma vez por trimestre**, rode o
**passo 4 do Cenário A** — só ele, isolado. Não encosta em produção, leva dois minutos, e é
a única coisa que transforma esperança em fato.

Quando fizer, atualize a data no topo deste arquivo.
