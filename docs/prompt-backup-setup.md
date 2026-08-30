Quero ligar o backup do banco de dados do CraftHub. Hoje NÃO existe backup nenhum, e esse é
o maior risco da minha infraestrutura: se o servidor morrer, perco todos os usuários,
perfis e currículos, sem volta.

Me guie passo a passo, esperando eu confirmar cada etapa, e faça você mesmo tudo que
conseguir. Verifique que cada passo funcionou de verdade em vez de assumir.

## Contexto

Repo: /home/gabriel/Documents/www/linkhub-v.1 (público, github.com/gabrikf/Link-hub-v1)
VPS: ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy — Hetzner cx23, 2 vCPU / 4 GB, Nuremberg
Diretório da app na VPS: /srv/crafthub
Config de produção: /srv/crafthub/.env.production (0600, gitignored, existe só na máquina)
Banco: container `crafthub-postgres`, Postgres 15 + pgvector, ~12 MB hoje
Credenciais da Cloudflare e da Hetzner estão no .env da raiz do repo (gitignored).

## O que JÁ existe — não reescreva

`scripts/backup.sh` já está pronto e é bom. Ele faz:
  - pg_dump do container, comprimido com gzip -9
  - 4 validações antes de enviar qualquer coisa: dump não vazio, tamanho mínimo,
    teste de integridade do gzip, e confere se o dump termina com o marcador
    "PostgreSQL database dump complete" (pega dump truncado)
  - envia por rclone para um bucket R2
  - apaga backups com mais de RETENTION_DAYS (padrão 30)

Se qualquer validação falhar, ele NÃO envia nada e sai com erro. Isso é de propósito:
um backup corrompido que sobrescreve um bom é pior do que backup nenhum.

Ele espera:
  - `rclone` instalado na VPS e no PATH do cron
  - um remote rclone chamado `r2`
  - um bucket chamado `crafthub-backups`

## O que FALTA (é só isso)

1. O bucket `crafthub-backups` NÃO EXISTE. Nada no Terraform o cria — isso está registrado
   em docs/deployment-readiness.md como P2-d. Decida comigo: criar pelo Terraform
   (em infra/terraform/envs/prod/cloudflare_r2.tf, junto dos outros) ou à mão.
   Prefiro por Terraform, para não virar um recurso órfão que ninguém sabe de onde veio.
2. `rclone` não está instalado na VPS.
3. Não existe remote `r2` configurado.
4. Não existe cron agendado.

## Custo — precisa continuar ZERO

O R2 dá 10 GB grátis. O banco tem 12 MB, então um dump comprimido dá alguns KB.
30 dias de retenção não chega perto do limite. Se em algum momento você achar que isso vai
gerar cobrança, PARE e me avise antes.

Crie um token R2 novo, escopado SÓ ao bucket crafthub-backups. NÃO reaproveite o token de
uploads nem o do state do Terraform — se o servidor for comprometido, o atacante não pode
ganhar acesso de escrita aos currículos dos usuários nem ao state da infra junto.

## O que eu quero, na ordem

1. Criar o bucket (Terraform de preferência; eu rodo o `terraform apply`, seu sandbox bloqueia).
2. Criar o token R2 escopado e configurar o remote `r2` na VPS. Não imprima segredo no chat.
3. Instalar o rclone na VPS pelo apt oficial.
4. Rodar `scripts/backup.sh` NA MÃO uma vez e me mostrar o arquivo aparecendo no bucket.
5. Agendar o cron (sugestão: 04:00 UTC). Atenção: cron roda com PATH mínimo e sem shell de
   login — o próprio script avisa disso. Garanta que o rclone é encontrado.
6. **O PASSO QUE MAIS IMPORTA — RESTAURAR.** Baixe o backup, suba um Postgres descartável
   (outro container, outra porta, outro nome — NÃO encoste no banco de produção), restaure
   o dump nele e me mostre a contagem de linhas das tabelas principais batendo com produção.
   Depois destrua o container descartável.

   Backup que nunca foi restaurado não é backup, é esperança. Se você pular esse passo,
   o trabalho todo não vale nada. Não me diga "está funcionando" sem ter restaurado.

7. Me diga como eu faço a restauração sozinho, no dia que der ruim, em passos que eu consiga
   seguir sob pressão. Coloque isso num arquivo do repo, não só no chat.

## Bônus, se sobrar tempo (me pergunte antes)

- Um alerta se o backup falhar. Hoje, se o cron quebrar, ninguém fica sabendo — e eu só
  descubro no dia em que precisar restaurar.
- `enable_backups = true` no terraform.tfvars liga o snapshot da máquina inteira na Hetzner
  por ~€1,30/mês. É diferente do pg_dump: o pg_dump cobre "apaguei uma tabela sem querer",
  o snapshot cobre "a máquina sumiu". Me explique o trade-off e me deixe decidir.

## Como trabalhar comigo

- Eu rodo `terraform apply` e `gh pr merge` — seu sandbox bloqueia os dois. Prepare tudo e
  me passe o comando exato.
- Não cole segredo no chat. Escreva em arquivo e me diga o que foi escrito onde.
- Leia o código de verdade antes de me dizer como ele se comporta. Na sessão passada a
  documentação e a realidade divergiram várias vezes, e o código sempre estava certo.
- Me diga claramente o que você NÃO verificou. Isso vale mais do que um resumo confiante.
- O guardrail do repo (`node scripts/guardrails/pre-push.mjs`) precisa passar antes de commitar.
