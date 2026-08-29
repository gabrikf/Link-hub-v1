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

| | |
|---|---|
| VPS | `ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy` |
| App | `/srv/crafthub` |
| Container do banco | `crafthub-postgres` |
| Usuário / banco | `crafthub_user` / `crafthub` |
| Bucket dos backups | `crafthub-backups`, prefixo `postgres/` |
| Remote rclone | `r2` (config em `~/.config/rclone/rclone.conf` do usuário `deploy`) |
| Nome dos objetos | `crafthub-<AAAA-MM-DD>T<HH-MM-SS>Z.sql.gz` |
| Quando o cron roda | 04:17 UTC, diariamente |
| Retenção | 30 dias (script) / 45 dias (regra do bucket) |

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

### Recebi "[CraftHub] BACKUP COM PROBLEMA"

O e-mail traz o motivo e a idade do backup mais recente. O primeiro comando é sempre:

```bash
ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy 'tail -30 /var/log/crafthub-backup.log; echo ---; crontab -l'
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

Para conferir a qualquer momento, sem painel:

```bash
ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy 'rclone cat r2:crafthub-backups/watchdog/last-run.json'
```

Ele grava esse marcador em toda execução. `checkedAt` velho = vigia parado.

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
