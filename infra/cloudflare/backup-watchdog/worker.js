/**
 * Vigia do backup do CraftHub.
 *
 * Roda por cron trigger na borda da Cloudflare, olha o bucket `crafthub-backups` e
 * avisa por e-mail quando o backup mais recente é velho demais, pequeno demais, ou
 * simplesmente não existe.
 *
 * POR QUE ELE OLHA O BUCKET E NÃO O EXIT CODE DO SCRIPT:
 * em 2026-08-29 o `scripts/backup.sh` saiu com código 0 sem ter subido nada. O rclone
 * levava 501 na primeira tentativa (a HEAD com `?versionId`, que o R2 não implementa) e
 * a retentativa encontrava o objeto "já lá" e pulava o upload. Qualquer alerta baseado
 * em "o script disse que deu certo" teria reportado saúde. Só olhar o artefato pega isso.
 *
 * POR QUE ELE VIVE FORA DA VPS:
 * o cenário que motiva ter backup é a VPS morrer. Um vigia hospedado nela morre junto e
 * o silêncio dele é indistinguível de silêncio saudável.
 *
 * O QUE ELE NÃO COBRE, e é honesto dizer: ele não sabe se o dump RESTAURA. Isso só o
 * simulado trimestral responde — ver docs/backup-restore.md.
 */

const BACKUP_PREFIX = "postgres/";
const MARKER_KEY = "watchdog/last-run.json";

export default {
  async scheduled(event, env, ctx) {
    // waitUntil para o runtime não matar o worker antes do fetch do e-mail terminar.
    ctx.waitUntil(check(env));
  },
};

async function check(env) {
  const maxAgeHours = Number(env.MAX_AGE_HOURS);
  const minBytes = Number(env.MIN_BYTES);
  const now = new Date();

  const problems = [];
  let newest = null;
  let count = 0;

  try {
    // A listagem do R2 é paginada em 1000. Com 30 dias de retenção nunca chega perto,
    // mas paginar é barato e evita um bug silencioso caso a retenção cresça.
    let cursor;
    do {
      const page = await env.BACKUPS.list({ prefix: BACKUP_PREFIX, cursor });
      for (const obj of page.objects) {
        count += 1;
        if (!newest || obj.uploaded > newest.uploaded) newest = obj;
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch (err) {
    // Falha ao listar é problema por si só: ou o binding quebrou, ou o bucket sumiu.
    problems.push(`Não consegui listar o bucket de backups: ${err.message}`);
  }

  // Calculado assim que `newest` existe, e NÃO dentro do bloco abaixo: uma listagem que
  // falha na segunda página deixa `newest` preenchido e `problems` não-vazio, e a
  // montagem do status logo adiante desreferencia esta variável.
  const ageHours = newest
    ? (now.getTime() - newest.uploaded.getTime()) / 3_600_000
    : null;

  if (!problems.length) {
    if (count === 0) {
      problems.push(
        "O bucket de backups está VAZIO. Não existe nenhum backup do banco.",
      );
    } else {
      if (ageHours > maxAgeHours) {
        problems.push(
          `O backup mais recente tem ${ageHours.toFixed(1)}h de idade ` +
            `(limite: ${maxAgeHours}h). O cron da VPS provavelmente parou de rodar.`,
        );
      }

      // Um dump que encolheu de repente é sinal de dump parcial. O backup.sh já barra
      // dumps minúsculos, mas ele só protege quando roda — este limite é independente.
      if (newest.size < minBytes) {
        problems.push(
          `O backup mais recente tem só ${newest.size} bytes ` +
            `(mínimo esperado: ${minBytes}). Suspeita de dump truncado.`,
        );
      }
    }
  }

  const status = {
    checkedAt: now.toISOString(),
    healthy: problems.length === 0,
    problems,
    backupCount: count,
    newest: newest
      ? {
          key: newest.key,
          size: newest.size,
          uploaded: newest.uploaded.toISOString(),
          ageHours: Number(ageHours.toFixed(2)),
        }
      : null,
    thresholds: { maxAgeHours, minBytes },
  };

  // Marcador de "eu rodei". Serve para você conferir do seu terminal, sem painel:
  //     rclone cat r2:crafthub-backups/watchdog/last-run.json
  // Se a data aí dentro estiver velha, quem parou foi o VIGIA, não o backup.
  try {
    await env.BACKUPS.put(MARKER_KEY, JSON.stringify(status, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (err) {
    // Não deixa a falha do marcador engolir o alerta, que é o que importa.
    console.error("Falha ao gravar o marcador:", err.message);
  }

  if (problems.length) {
    await sendEmail(
      env,
      "[CraftHub] BACKUP COM PROBLEMA",
      alertBody(status),
    );
  } else if (isHeartbeatDay(env, now)) {
    // Batimento semanal. Sem ele, um vigia morto é silencioso do mesmo jeito que um
    // backup saudável — e o silêncio voltaria a não significar nada.
    await sendEmail(
      env,
      "[CraftHub] backup ok (batimento semanal)",
      heartbeatBody(status),
    );
  }

  console.log(JSON.stringify(status));
  return status;
}

function isHeartbeatDay(env, now) {
  const day = env.HEARTBEAT_WEEKDAY;
  if (day === "" || day === undefined || day === null) return false;
  return now.getUTCDay() === Number(day);
}

function alertBody(status) {
  const lines = [
    "O vigia do backup encontrou problema.",
    "",
    ...status.problems.map((p) => `  - ${p}`),
    "",
    `Backups no bucket: ${status.backupCount}`,
  ];

  if (status.newest) {
    lines.push(
      `Mais recente:      ${status.newest.key}`,
      `                   ${status.newest.size} bytes, ${status.newest.ageHours}h atrás`,
    );
  }

  lines.push(
    "",
    "Primeiro passo, da sua máquina:",
    "",
    "  ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy 'tail -30 /var/log/crafthub-backup.log; crontab -l'",
    "",
    "Se precisar restaurar, o procedimento é docs/backup-restore.md.",
    "",
    `Verificado em ${status.checkedAt}.`,
  );

  return lines.join("\n");
}

function heartbeatBody(status) {
  return [
    "Nada de errado — este e-mail existe só para provar que o vigia está vivo.",
    "",
    `Backups no bucket: ${status.backupCount}`,
    `Mais recente:      ${status.newest.key}`,
    `                   ${status.newest.size} bytes, ${status.newest.ageHours}h atrás`,
    "",
    "Se você parar de receber ISTO toda semana, o vigia caiu — e o silêncio dele",
    "não quer dizer que o backup está bem.",
    "",
    `Verificado em ${status.checkedAt}.`,
  ].join("\n");
}

async function sendEmail(env, subject, text) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM,
      to: [env.ALERT_TO],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    // Lançar aqui deixa o erro visível no log do Worker. Não há para quem avisar que o
    // aviso falhou — é o fim da corrente, e por isso o batimento semanal existe.
    const body = await res.text();
    throw new Error(`Resend respondeu ${res.status}: ${body}`);
  }
}
