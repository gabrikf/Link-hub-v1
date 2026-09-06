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
 * A REGRA QUE GOVERNA TODO O ARQUIVO: **falhar em conferir nunca pode parecer saúde.**
 * Um vigia que se cala quando não consegue olhar é pior que nenhum, porque fabrica
 * confiança. Por isso, aqui:
 *   - binding de thresholds ausente ou não-numérico vira PROBLEMA, não `NaN` comparado
 *     contra tudo (`x > NaN` é `false`, e `false` aqui significaria "está tudo bem");
 *   - falha ao listar vira PROBLEMA, e suprime as conclusões que dependeriam da listagem;
 *   - `HEARTBEAT_WEEKDAY` inválido vira PROBLEMA, porque desligar o batimento em silêncio
 *     é desligar o único sinal de que o vigia continua vivo;
 *   - sem canal de e-mail configurado a invocação TERMINA COM EXCEÇÃO, que é o único
 *     lugar que ainda sobra para gritar.
 *
 * O QUE ELE NÃO COBRE, e é honesto dizer: ele não sabe se o dump RESTAURA. Isso só o
 * simulado trimestral responde — ver docs/backup-restore.md.
 *
 * TESTES: infra/cloudflare/backup-watchdog/worker.test.mjs. Rode da raiz do repositório:
 *     npx vitest run --root infra/cloudflare/backup-watchdog
 * Este diretório NÃO é um workspace npm, então nem `npm run guardrails` nem o job de
 * teste do CI o alcançam hoje — os dois iteram workspaces via turbo. O cabeçalho do
 * arquivo de teste diz exatamente o que falta para fechar essa lacuna.
 */

const BACKUP_PREFIX = "postgres/";
const MARKER_KEY = "watchdog/last-run.json";

/**
 * Quanto o objeto mais recente pode estar "no futuro" antes de virar problema.
 *
 * O relógio do Worker é NTP e o do R2 também, mas o carimbo `uploaded` vem do lado da
 * Cloudflare e o `now` daqui — quinze minutos de folga absorvem qualquer desencontro
 * real. Além disso, uma idade negativa grande não é skew: é relógio da VPS errado
 * gerando nomes e carimbos fora de ordem, e nesse estado a comparação "mais recente"
 * deixa de significar o que a gente acha que significa. Sem esta checagem, um objeto
 * datado de 2027 esconderia PARA SEMPRE o fato de o backup ter parado.
 */
const FUTURE_TOLERANCE_HOURS = 0.25;

/** Bindings sem os quais não existe para quem gritar. */
const REQUIRED_MAIL_BINDINGS = ["RESEND_API_KEY", "ALERT_TO", "ALERT_FROM"];

export default {
  async scheduled(event, env) {
    // `await`, não `ctx.waitUntil`: num handler `scheduled` o runtime já espera a
    // promise retornada, e só o `await` faz uma exceção marcar a invocação como
    // FALHA no painel e nos logs. Com `waitUntil` o handler retorna limpo na hora e
    // um vigia que estourou fica parecendo um vigia que rodou.
    await check(env);
  },
};

/**
 * O corpo do vigia. Exportado para os testes; o runtime chama só pelo default acima.
 *
 * @param {Record<string, unknown> & { BACKUPS: R2Bucket }} env
 * @param {Date} now injetável para os testes; em produção é sempre o relógio real.
 */
export async function check(env, now = new Date()) {
  const problems = [];

  // ── Configuração ────────────────────────────────────────────────────────────────
  // Lida ANTES de qualquer comparação. Um threshold `NaN` não dispara nada: `10 > NaN`
  // e `10 < NaN` são ambos `false`, então um binding faltando transformaria o vigia
  // num carimbo de saúde permanente — e o batimento semanal continuaria chegando,
  // afirmando ativamente que está tudo bem.
  const maxAgeHours = readPositiveNumber(
    env.MAX_AGE_HOURS,
    "MAX_AGE_HOURS",
    problems,
  );
  const minBytes = readPositiveNumber(env.MIN_BYTES, "MIN_BYTES", problems);
  const heartbeatWeekday = readWeekday(env.HEARTBEAT_WEEKDAY, problems);

  const missingMail = REQUIRED_MAIL_BINDINGS.filter((name) => !env[name]);
  if (missingMail.length) {
    problems.push(
      `O vigia não tem canal de alerta: faltam os bindings ${missingMail.join(", ")}. ` +
        "Nada do que ele descobrir chega a ninguém.",
    );
  }

  // ── Listagem ────────────────────────────────────────────────────────────────────
  let listFailed = false;
  let newest = null;
  let count = 0;

  try {
    if (!env.BACKUPS || typeof env.BACKUPS.list !== "function") {
      throw new Error("o binding R2 `BACKUPS` não existe neste Worker");
    }

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
    // E é `listFailed`, não só um item em `problems`, porque tudo abaixo depende de a
    // listagem ter sido COMPLETA: uma página perdida deixa `count` e `newest` falando
    // do pedaço que chegou, e concluir "vazio" ou "está velho" a partir disso é
    // inventar. O único fato honesto aqui é "não consegui olhar".
    listFailed = true;
    problems.push(
      `Não consegui listar o bucket de backups: ${errorMessage(err)}`,
    );
  }

  // Calculado assim que `newest` existe, e NÃO dentro do bloco abaixo: uma listagem que
  // falha na segunda página deixa `newest` preenchido, e a montagem do status logo
  // adiante desreferencia esta variável.
  const ageHours = newest
    ? (now.getTime() - newest.uploaded.getTime()) / 3_600_000
    : null;

  if (!listFailed) {
    if (count === 0) {
      problems.push(
        "O bucket de backups está VAZIO. Não existe nenhum backup do banco.",
      );
    } else {
      if (ageHours < -FUTURE_TOLERANCE_HOURS) {
        problems.push(
          `O backup mais recente está datado ${Math.abs(ageHours).toFixed(1)}h NO FUTURO. ` +
            "Relógio errado em algum lado — enquanto isso durar, a idade dos backups " +
            "não quer dizer nada e este vigia não consegue afirmar que o backup está em dia.",
        );
      } else if (maxAgeHours !== null && ageHours > maxAgeHours) {
        problems.push(
          `O backup mais recente tem ${ageHours.toFixed(1)}h de idade ` +
            `(limite: ${maxAgeHours}h). O cron da VPS provavelmente parou de rodar.`,
        );
      }

      // Um dump que encolheu de repente é sinal de dump parcial. O backup.sh já barra
      // dumps minúsculos, mas ele só protege quando roda — este limite é independente.
      if (minBytes !== null && newest.size < minBytes) {
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
    // `null`, não `0`, quando a listagem falhou: "não sei quantos" e "nenhum" são
    // estados diferentes, e o marcador é lido por humanos sob pressão.
    backupCount: listFailed ? null : count,
    newest: newest
      ? {
          key: newest.key,
          size: newest.size,
          uploaded: newest.uploaded.toISOString(),
          ageHours: Number(ageHours.toFixed(2)),
        }
      : null,
    thresholds: { maxAgeHours, minBytes, heartbeatWeekday },
  };

  // Antes de qualquer e-mail: se o envio estourar, o log ainda existe. Este é o único
  // registro que sobra quando o Resend está fora do ar.
  console.log(JSON.stringify(status));

  // Marcador de "eu rodei". Serve para conferir de qualquer máquina com o remote r2,
  // sem painel e sem depender da VPS:
  //     rclone cat r2:crafthub-backups/watchdog/last-run.json
  // Se a data aí dentro estiver velha, quem parou foi o VIGIA, não o backup.
  await writeMarker(env, status);

  if (missingMail.length) {
    // Fim da linha: não há e-mail para mandar o alerta e não há alerta sem e-mail.
    // Estourar é o que faz a invocação aparecer como falha no painel do Worker.
    throw new Error(
      `Vigia sem canal de alerta (faltam ${missingMail.join(", ")}). ` +
        `Status apurado: ${JSON.stringify(status)}`,
    );
  }

  if (problems.length) {
    await sendEmail(
      env,
      "[CraftHub] BACKUP COM PROBLEMA",
      alertBody(status, env),
    );
  } else if (
    heartbeatWeekday !== null &&
    now.getUTCDay() === heartbeatWeekday
  ) {
    // Batimento semanal. Sem ele, um vigia morto é silencioso do mesmo jeito que um
    // backup saudável — e o silêncio voltaria a não significar nada.
    await sendEmail(
      env,
      "[CraftHub] backup ok (batimento semanal)",
      heartbeatBody(status),
    );
  }

  return status;
}

/* ─────────────────────────────── configuração ──────────────────────────────────── */

/**
 * Lê um binding numérico. Ausente, vazio, não-numérico ou <= 0 vira PROBLEMA e devolve
 * `null` — e quem chama pula a comparação em vez de fazê-la contra `NaN`.
 */
function readPositiveNumber(raw, name, problems) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    problems.push(
      `Configuração inválida: o binding ${name} não está definido. ` +
        "Sem ele esta checagem não acontece — e a ausência dela pareceria saúde.",
    );
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    problems.push(
      `Configuração inválida: ${name}="${raw}" não é um número positivo. ` +
        "Sem ele esta checagem não acontece — e a ausência dela pareceria saúde.",
    );
    return null;
  }

  return value;
}

/**
 * Dia da semana do batimento. String vazia = desligado DE PROPÓSITO (devolve `null` sem
 * reclamar). Qualquer outra coisa que não seja um inteiro 0..6 é problema: `Number("seg")`
 * é `NaN`, nunca igual a `getUTCDay()`, e o batimento sumiria sem ninguém saber — o que
 * apaga justamente o sinal de "o vigia ainda está de pé".
 */
function readWeekday(raw, problems) {
  if (raw === undefined || raw === null || String(raw).trim() === "")
    return null;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    problems.push(
      `Configuração inválida: HEARTBEAT_WEEKDAY="${raw}" não é 0..6 nem vazio. ` +
        "O batimento semanal ficaria desligado em silêncio, e ele é o único sinal " +
        "de que este vigia continua vivo.",
    );
    return null;
  }

  return value;
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/* ────────────────────────────────── marcador ───────────────────────────────────── */

async function writeMarker(env, status) {
  try {
    await env.BACKUPS.put(MARKER_KEY, JSON.stringify(status, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (err) {
    // Não deixa a falha do marcador engolir o alerta, que é o que importa. O marcador é
    // diagnóstico: quando ele para de ser escrito, quem lê vê data velha e investiga —
    // erro para o lado seguro.
    console.error("Falha ao gravar o marcador:", errorMessage(err));
  }
}

/* ──────────────────────────────────── e-mail ───────────────────────────────────── */

function alertBody(status, env) {
  const lines = [
    "O vigia do backup encontrou problema.",
    "",
    ...status.problems.map((p) => `  - ${p}`),
    "",
    `Backups no bucket: ${status.backupCount ?? "não sei — a listagem falhou"}`,
  ];

  if (status.newest) {
    lines.push(
      `Mais recente:      ${status.newest.key}`,
      `                   ${status.newest.size} bytes, ${status.newest.ageHours}h atrás`,
    );
  }

  // O endereço da VPS vem por binding, não hardcoded: este arquivo é publicado na borda
  // e o IP muda quando o servidor é recriado. Sem o binding, o e-mail ainda serve — ele
  // aponta para o inventário em vez de mentir um endereço.
  const ssh = typeof env.RUNBOOK_SSH === "string" ? env.RUNBOOK_SSH.trim() : "";

  lines.push("", "Primeiro passo, da sua máquina:", "");
  lines.push(
    ssh
      ? `  ${ssh} 'tail -30 /var/log/crafthub-backup.log; crontab -l'`
      : "  (endereço da VPS em docs/production-inventory.md) " +
          "'tail -30 /var/log/crafthub-backup.log; crontab -l'",
  );

  lines.push(
    "",
    "Se precisar restaurar, o procedimento é docs/backup-restore.md.",
    "",
    `Verificado em ${status.checkedAt}.`,
  );

  return lines.join("\n");
}

function heartbeatBody(status) {
  const lines = [
    "Nada de errado — este e-mail existe só para provar que o vigia está vivo.",
    "",
    `Backups no bucket: ${status.backupCount ?? "não sei — a listagem falhou"}`,
  ];

  if (status.newest) {
    lines.push(
      `Mais recente:      ${status.newest.key}`,
      `                   ${status.newest.size} bytes, ${status.newest.ageHours}h atrás`,
    );
  }

  lines.push(
    "",
    "Se você parar de receber ISTO toda semana, o vigia caiu — e o silêncio dele",
    "não quer dizer que o backup está bem.",
    "",
    `Verificado em ${status.checkedAt}.`,
  );

  return lines.join("\n");
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
    // Lançar aqui deixa o erro visível no log do Worker E marca a invocação do cron
    // como falha. Não há para quem avisar que o aviso falhou — é o fim da corrente, e
    // por isso o batimento semanal existe: ele usa este mesmo caminho, então um Resend
    // quebrado também derruba o batimento, e a segunda-feira sem e-mail denuncia.
    const body = await res.text();
    throw new Error(`Resend respondeu ${res.status}: ${body}`);
  }
}
