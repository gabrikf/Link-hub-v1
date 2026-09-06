/**
 * Testes do vigia do backup.
 *
 * COMO RODAR (da raiz do repositório):
 *     npm run test:infra          (= vitest run --root infra/cloudflare/backup-watchdog)
 *
 * ONDE ISTO MORA, E POR QUE NÃO EM UM WORKSPACE. `npm run test` é
 * `turbo run test`, e o gate (`scripts/guardrails/pre-push.mjs`) chama
 * `turbo run test --filter=...`. Turbo só enxerga workspaces, e `workspaces` no
 * package.json da raiz é `["apps/*", "packages/*"]`. Logo:
 *
 *   - nenhum workspace existente é dono deste código. Enfiar um teste de infraestrutura
 *     em `apps/api` para "ficar coberto" mentiria sobre a propriedade E mexeria no
 *     ratchet de cobertura daquele workspace;
 *   - transformar `infra/cloudflare/backup-watchdog` em workspace exige mudar
 *     `workspaces` na raiz e rodar `npm install`, o que reescreve o package-lock — caro
 *     demais para um arquivo de 400 linhas sem dependências.
 *
 * ONDE ELES RODAM HOJE, com precisão:
 *
 *   - **NO CI, SIM.** `.github/workflows/ci.yml` tem, no job `test`, o passo
 *     "Test — infra workers", que roda `npm run test:infra`. Esse script existe no
 *     package.json da raiz e chama o vitest direto neste diretório, sem passar por turbo
 *     — que é justamente o que faz ele alcançar um diretório que não é workspace.
 *   - **NO GATE LOCAL (`npm run guardrails`), NÃO.** O pre-push.mjs roda testes por
 *     workspace afetado; não existe passo de teste de infra nele. Rode
 *     `npm run test:infra` à mão ao mexer no worker: o CI pega, mas depois do push.
 *   - **LINT: sim, pelo ratchet.** Este diretório tem `eslint.config.js` e
 *     `eslint.typed.config.js` próprios e está em `LINTABLE_WORKSPACES` de
 *     `scripts/guardrails/lint-changed.mjs`. `npm run lint` (turbo) continua sem
 *     alcançá-lo, pelo mesmo motivo dos testes.
 *
 * O QUE ESTES TESTES PROVAM, em uma frase: que **falhar em conferir nunca sai daqui
 * parecendo saúde**. Os quatro cenários pedidos — backup fresco, backup velho, erro do
 * R2 e bucket vazio — mais os modos de falha silenciosa que o código original tinha.
 *
 * O R2 e o Resend são dublês locais. Nada aqui toca a rede: `globalThis.fetch` é
 * substituído em cada teste e a lista de objetos é um array.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker, { check } from "./worker.js";

const HOUR = 3_600_000;

/** 2026-09-07 é uma SEGUNDA-FEIRA (getUTCDay() === 1), o dia do batimento. */
const MONDAY = new Date("2026-09-07T05:30:00.000Z");
/** 2026-09-08, terça. Mesmo horário, dia sem batimento. */
const TUESDAY = new Date("2026-09-08T05:30:00.000Z");

/**
 * Um dublê do binding R2. `list` devolve as páginas na ordem em que foram passadas, e
 * cada página pode ser um erro — é assim que "a segunda página falhou" fica testável.
 *
 * `listOptions` GUARDA OS ARGUMENTOS, e isso não é conveniência: um dublê que ignora o
 * que recebeu não consegue reprovar nada sobre o que foi pedido. Enquanto ele era
 * `async list()` sem parâmetros, apagar `{ prefix: BACKUP_PREFIX }` do worker deixava
 * a suíte inteira VERDE — e em produção a listagem passaria a incluir o próprio
 * `watchdog/last-run.json` (~600 bytes, escrito segundos antes, portanto sempre o mais
 * novo), gerando alerta de "dump truncado" dia após dia. Ver o teste
 * "pede ao R2 só o prefixo dos backups".
 *
 * `truncatedWithoutCursor` simula a outra falha de listagem que não é uma exceção: o R2
 * dizendo "tem mais" sem dizer por onde continuar.
 */
function fakeBucket({
  pages = [[]],
  listError = null,
  putError = null,
  truncatedWithoutCursor = false,
} = {}) {
  const puts = [];
  const listOptions = [];
  let call = 0;

  return {
    puts,
    listOptions,
    listCalls: () => call,
    async list(options) {
      listOptions.push(options);
      if (listError) throw listError;
      const index = call;
      call += 1;
      const objects = pages[index] ?? [];
      const truncated = truncatedWithoutCursor || index < pages.length - 1;
      return {
        objects,
        truncated,
        cursor:
          truncated && !truncatedWithoutCursor ? `cursor-${index}` : undefined,
      };
    },
    async put(key, body, options) {
      if (putError) throw putError;
      puts.push({ key, body, options });
    },
  };
}

/** Um objeto R2 como o runtime entrega: `uploaded` é um Date, `size` um number. */
function backupObject({ hoursAgo, size = 40_760, now = MONDAY, key } = {}) {
  const uploaded = new Date(now.getTime() - hoursAgo * HOUR);
  return {
    key: key ?? `postgres/crafthub-${uploaded.toISOString()}.sql.gz`,
    size,
    uploaded,
  };
}

/** O ambiente configurado exatamente como o Terraform o entrega em produção. */
function env(overrides = {}, bucketOptions = {}) {
  return {
    BACKUPS: fakeBucket(bucketOptions),
    RESEND_API_KEY: "re_test_key",
    ALERT_TO: "ops@example.com",
    ALERT_FROM: "CraftHub <no-reply@example.com>",
    MAX_AGE_HOURS: "24",
    MIN_BYTES: "20000",
    HEARTBEAT_WEEKDAY: "1",
    RUNBOOK_SSH: "ssh deploy@203.0.113.10 -i ~/.ssh/linkhub_deploy",
    ...overrides,
  };
}

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  // O worker loga o status em toda execução. Silenciar mantém a saída do teste legível
  // sem esconder nada: o conteúdo do log é reafirmado pelo objeto devolvido por check().
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Os e-mails que o Resend teria recebido nesta execução. */
function emailsSent() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url,
    ...JSON.parse(init.body),
  }));
}

/* ──────────────────────── o que ele PEDE ao R2, não só o que recebe ─────────────── */

describe("a consulta feita ao bucket", () => {
  it("pede ao R2 só o prefixo dos backups", async () => {
    // ESTE TESTE EXISTE POR CAUSA DE UMA MUTAÇÃO QUE SOBREVIVIA. Com o dublê antigo
    // (`async list()`, sem parâmetros), tanto apagar o argumento `{ prefix }` quanto
    // trocar `BACKUP_PREFIX` por `""` deixavam os 30 testes verdes. Em produção
    // qualquer uma das duas faz a listagem incluir `watchdog/last-run.json` — o
    // marcador de ~600 bytes que o próprio Worker escreveu segundos antes, logo sempre
    // o mais novo do bucket — e o vigia passa a alertar "dump truncado" dia após dia,
    // para sempre, sobre o seu próprio arquivo.
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 2.2, now: TUESDAY })]] },
    );

    await check(e, TUESDAY);

    expect(e.BACKUPS.listOptions).toHaveLength(1);
    expect(e.BACKUPS.listOptions[0].prefix).toBe("postgres/");
  });

  it("mantém o prefixo em TODAS as páginas, junto do cursor", async () => {
    // Perder o prefixo só a partir da segunda página seria o mesmo bug, escondido
    // atrás da paginação.
    const e = env(
      {},
      {
        pages: [
          [backupObject({ hoursAgo: 30, now: TUESDAY, key: "postgres/a.gz" })],
          [backupObject({ hoursAgo: 2.2, now: TUESDAY, key: "postgres/b.gz" })],
        ],
      },
    );

    await check(e, TUESDAY);

    expect(e.BACKUPS.listOptions).toHaveLength(2);
    for (const options of e.BACKUPS.listOptions) {
      expect(options.prefix).toBe("postgres/");
    }
    expect(e.BACKUPS.listOptions[0].cursor).toBeUndefined();
    expect(e.BACKUPS.listOptions[1].cursor).toBe("cursor-0");
  });

  it("uma página `truncated` SEM cursor é falha de listagem, não fim da listagem", async () => {
    // O `do/while` terminava em silêncio nesse estado: `cursor` virava `undefined`,
    // o laço parava, `listFailed` continuava `false` — e um pedaço do bucket era
    // relatado como o bucket inteiro. Com um único objeto velho na página, a diferença
    // entre os dois comportamentos é "backup com 400h" (um veredito inventado sobre
    // uma amostra) e "não consegui listar" (o único fato disponível).
    const e = env(
      {},
      {
        pages: [[backupObject({ hoursAgo: 400, now: TUESDAY })]],
        truncatedWithoutCursor: true,
      },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.backupCount).toBeNull();
    expect(status.problems).toHaveLength(1);
    expect(status.problems[0]).toContain("Não consegui listar o bucket");
    expect(status.problems[0]).toContain("truncada mas não devolveu cursor");
    // E nenhuma conclusão sobre idade saiu da amostra.
    expect(status.problems.some((p) => p.includes("de idade"))).toBe(false);
  });
});

/* ─────────────────────────── os quatro cenários pedidos ─────────────────────────── */

describe("backup fresco", () => {
  it("reporta saúde e não manda e-mail num dia que não é o do batimento", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 2.2, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(true);
    expect(status.problems).toEqual([]);
    expect(status.backupCount).toBe(1);
    // `toBeCloseTo`, não `toBe`: o worker arredonda com `toFixed(2)`, e comparar dois
    // doubles por igualdade exata é uma armadilha mesmo quando hoje ela não dispara.
    expect(status.newest.ageHours).toBeCloseTo(2.2, 10);
    expect(emailsSent()).toEqual([]);
  });

  it("grava o marcador watchdog/last-run.json com o status apurado", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 2.2, now: TUESDAY })]] },
    );

    await check(e, TUESDAY);

    expect(e.BACKUPS.puts).toHaveLength(1);
    const [marker] = e.BACKUPS.puts;
    expect(marker.key).toBe("watchdog/last-run.json");
    expect(marker.options.httpMetadata.contentType).toBe("application/json");
    expect(JSON.parse(marker.body)).toMatchObject({
      healthy: true,
      backupCount: 1,
      checkedAt: TUESDAY.toISOString(),
    });
  });

  it("manda o batimento semanal na segunda, e só na segunda", async () => {
    const monday = env({}, { pages: [[backupObject({ hoursAgo: 2.2 })]] });
    await check(monday, MONDAY);

    const [heartbeat] = emailsSent();
    expect(heartbeat.subject).toBe("[CraftHub] backup ok (batimento semanal)");
    expect(heartbeat.to).toEqual(["ops@example.com"]);
    expect(heartbeat.text).toContain("o vigia está vivo");
  });

  it('não manda batimento nenhum quando HEARTBEAT_WEEKDAY é "" (desligado de propósito)', async () => {
    const e = env(
      { HEARTBEAT_WEEKDAY: "" },
      { pages: [[backupObject({ hoursAgo: 2.2 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.healthy).toBe(true);
    expect(emailsSent()).toEqual([]);
  });

  it("com HEARTBEAT_WEEKDAY vazio, o marcador DIZ que o batimento está desligado", async () => {
    // A válvula de escape continua existindo — desligar o batimento é uma escolha
    // legítima. O que não pode é ela ser INVISÍVEL: `""` passa na validação do
    // Terraform, não gera problema no worker, e desliga o único sinal de que este
    // vigia está vivo. Quem for investigar "por que parei de receber o e-mail de
    // segunda?" abre o marcador com `rclone cat`, e a resposta tem que estar lá.
    const e = env(
      { HEARTBEAT_WEEKDAY: "" },
      { pages: [[backupObject({ hoursAgo: 2.2 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.thresholds.heartbeatDisabled).toBe(true);
    expect(status.thresholds.heartbeatWeekday).toBeNull();

    const [marker] = e.BACKUPS.puts;
    expect(JSON.parse(marker.body).thresholds.heartbeatDisabled).toBe(true);

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain("DESLIGADO");
  });

  it("com o batimento ligado, nada é avisado e o marcador diz `false`", async () => {
    const e = env({}, { pages: [[backupObject({ hoursAgo: 2.2 })]] });

    const status = await check(e, MONDAY);

    expect(status.thresholds.heartbeatDisabled).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("HEARTBEAT_WEEKDAY inválido NÃO é lido como desligado de propósito", async () => {
    // "segunda" já era problema; o que faltava é a diferença entre os dois `null`.
    // Marcar isso como `heartbeatDisabled: true` transformaria um erro de digitação
    // numa decisão deliberada aos olhos de quem lê o marcador.
    const e = env(
      { HEARTBEAT_WEEKDAY: "segunda" },
      { pages: [[backupObject({ hoursAgo: 2.2 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.thresholds.heartbeatDisabled).toBe(false);
    expect(status.thresholds.heartbeatWeekday).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("backup velho", () => {
  it("alerta quando o mais recente passa de MAX_AGE_HOURS", async () => {
    // Um único dia perdido, com backup às 03:17 e vigia às 05:30: 26,2h.
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 26.2, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems).toHaveLength(1);
    expect(status.problems[0]).toContain("26.2h de idade");

    const [alert] = emailsSent();
    expect(alert.subject).toBe("[CraftHub] BACKUP COM PROBLEMA");
    expect(alert.text).toContain("ssh deploy@203.0.113.10");
  });

  it("NÃO alerta na fronteira de baixo: 23,9h ainda está dentro do limite de 24h", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 23.9, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(true);
    expect(emailsSent()).toEqual([]);
  });

  it("NÃO alerta EXATAMENTE no limite: 24,0h ainda está dentro", async () => {
    // A comparação é `>` e não `>=`, e essa escolha é o que separa "um dia perdido"
    // (25,3h a 26,3h) de um backup que chegou no fio. Sem este teste, trocar um pelo
    // outro não quebra nada.
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 24, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(true);
    expect(emailsSent()).toEqual([]);
  });

  it("alerta assim que passa da fronteira: 24,1h", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 24.1, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("limite: 24h");
  });

  it("escolhe o objeto mais recente, inclusive atravessando páginas da listagem", async () => {
    const e = env(
      {},
      {
        pages: [
          [
            backupObject({
              hoursAgo: 200,
              now: TUESDAY,
              key: "postgres/velho.sql.gz",
            }),
            backupObject({
              hoursAgo: 100,
              now: TUESDAY,
              key: "postgres/meio.sql.gz",
            }),
          ],
          [
            backupObject({
              hoursAgo: 2.2,
              now: TUESDAY,
              key: "postgres/novo.sql.gz",
            }),
          ],
        ],
      },
    );

    const status = await check(e, TUESDAY);

    expect(status.backupCount).toBe(3);
    expect(status.newest.key).toBe("postgres/novo.sql.gz");
    expect(status.healthy).toBe(true);
  });

  it("acumula os dois problemas quando o backup é velho E truncado", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 30, size: 900, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.problems).toHaveLength(2);
    expect(status.problems[0]).toContain("de idade");
    expect(status.problems[1]).toContain("dump truncado");
  });
});

describe("dump truncado", () => {
  it("alerta quando o mais recente está abaixo de MIN_BYTES, mesmo estando fresco", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 2.2, size: 1024, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("só 1024 bytes");

    const [alert] = emailsSent();
    expect(alert.subject).toBe("[CraftHub] BACKUP COM PROBLEMA");
  });

  it("NÃO alerta com folga larga: o dobro do mínimo passa", async () => {
    const e = env(
      {},
      {
        pages: [[backupObject({ hoursAgo: 2.2, size: 40_000, now: TUESDAY })]],
      },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(true);
    expect(emailsSent()).toEqual([]);
  });

  it("um `size` AUSENTE é problema, não checagem que não aconteceu", async () => {
    // A mesma classe de NaN que o resto do arquivo mata, um campo adiante: com
    // `size: undefined`, `undefined < 20000` é `false` — e `false` aqui significa
    // "está tudo bem". O vigia saía com healthy: true sem ter conferido tamanho nenhum,
    // e na segunda-feira o batimento confirmaria ativamente que estava tudo certo.
    // `delete`, e não `size: undefined`: o default do parâmetro de `backupObject`
    // repõe 40.760 quando o valor chega `undefined`, e o teste passaria pelo caminho
    // saudável provando outra coisa.
    const semTamanho = backupObject({ hoursAgo: 2.2, now: TUESDAY });
    delete semTamanho.size;
    const e = env({}, { pages: [[semTamanho]] });

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems).toHaveLength(1);
    expect(status.problems[0]).toContain("sem um tamanho utilizável");
    expect(emailsSent()).toHaveLength(1);
  });

  it("um `size` não-numérico é problema", async () => {
    const e = env(
      {},
      {
        pages: [[backupObject({ hoursAgo: 2.2, size: "40760", now: TUESDAY })]],
      },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("sem um tamanho utilizável");
  });

  it("`size` ausente não engole o veredito sobre a IDADE", async () => {
    // O problema de tamanho não pode substituir o de idade: os dois são fatos
    // independentes e o e-mail precisa dos dois.
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 30, size: null, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.problems).toHaveLength(2);
    expect(status.problems[0]).toContain("de idade");
    expect(status.problems[1]).toContain("sem um tamanho utilizável");
  });
});

describe("erro do R2 — o caso que não pode parecer saúde", () => {
  it("não reporta saúde quando a listagem falha, e alerta", async () => {
    const e = env({}, { listError: new Error("R2 indisponível (500)") });

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("Não consegui listar o bucket");
    expect(status.problems[0]).toContain("R2 indisponível (500)");
    // `null`, não `0`: "não sei quantos" não é "nenhum".
    expect(status.backupCount).toBeNull();
    expect(emailsSent()).toHaveLength(1);
  });

  it("não manda batimento de saúde na segunda quando a listagem falhou", async () => {
    const e = env({}, { listError: new Error("R2 indisponível (500)") });

    await check(e, MONDAY);

    const [only] = emailsSent();
    expect(only.subject).toBe("[CraftHub] BACKUP COM PROBLEMA");
    expect(emailsSent()).toHaveLength(1);
  });

  it("uma falha NA SEGUNDA PÁGINA não vira conclusão sobre idade nem sobre vazio", async () => {
    // O bug que o autor encontrou à mão: `newest` já preenchido pela primeira página.
    // Uma listagem parcial não autoriza dizer "está velho" nem "está vazio" — só
    // "não consegui olhar".
    const bucket = fakeBucket({
      pages: [[backupObject({ hoursAgo: 400, now: TUESDAY })], []],
    });
    const originalList = bucket.list.bind(bucket);
    let calls = 0;
    bucket.list = async (options) => {
      calls += 1;
      if (calls === 2) throw new Error("timeout na página 2");
      return originalList(options);
    };

    const status = await check(env({ BACKUPS: bucket }), TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems).toHaveLength(1);
    expect(status.problems[0]).toContain("timeout na página 2");
    expect(status.backupCount).toBeNull();
    // O objeto visto na primeira página continua no relatório como pista, sem virar
    // veredicto — e serializá-lo não pode estourar.
    expect(status.newest.ageHours).toBe(400);
  });

  it("o binding BACKUPS ausente é erro, não silêncio", async () => {
    const status = await check(env({ BACKUPS: undefined }), TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("`BACKUPS` não existe");
    expect(emailsSent()).toHaveLength(1);
  });

  it("falha ao gravar o marcador não engole o alerta", async () => {
    const e = env(
      {},
      {
        pages: [[backupObject({ hoursAgo: 30, now: TUESDAY })]],
        putError: new Error("sem permissão de escrita"),
      },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(emailsSent()).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("bucket vazio", () => {
  it("alerta quando não existe nenhum backup", async () => {
    const e = env({}, { pages: [[]] });

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.backupCount).toBe(0);
    expect(status.newest).toBeNull();
    expect(status.problems[0]).toContain("VAZIO");

    const [alert] = emailsSent();
    expect(alert.subject).toBe("[CraftHub] BACKUP COM PROBLEMA");
    // O corpo do alerta não pode estourar por não haver `newest`.
    expect(alert.text).toContain("Backups no bucket: 0");
  });

  it("não manda batimento de saúde na segunda com o bucket vazio", async () => {
    const e = env({}, { pages: [[]] });

    await check(e, MONDAY);

    expect(emailsSent()).toHaveLength(1);
    expect(emailsSent()[0].subject).toBe("[CraftHub] BACKUP COM PROBLEMA");
  });
});

/* ───────────────── configuração quebrada: o modo de falha que fabricava confiança ── */

describe("thresholds mal configurados", () => {
  it("MAX_AGE_HOURS ausente NÃO passa como saudável", async () => {
    // Antes da correção: `Number(undefined)` é `NaN`, `ageHours > NaN` é `false`, e um
    // backup de duas semanas atrás saía daqui como healthy: true — com batimento
    // semanal confirmando ativamente que estava tudo bem.
    const e = env(
      { MAX_AGE_HOURS: undefined },
      { pages: [[backupObject({ hoursAgo: 336 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems.some((p) => p.includes("MAX_AGE_HOURS"))).toBe(true);
    expect(emailsSent()[0].subject).toBe("[CraftHub] BACKUP COM PROBLEMA");
  });

  it("MAX_AGE_HOURS não-numérico NÃO passa como saudável", async () => {
    const e = env(
      { MAX_AGE_HOURS: "vinte e quatro" },
      { pages: [[backupObject({ hoursAgo: 336 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems.some((p) => p.includes("MAX_AGE_HOURS"))).toBe(true);
  });

  it("MIN_BYTES ausente NÃO passa como saudável", async () => {
    const e = env(
      { MIN_BYTES: "" },
      { pages: [[backupObject({ hoursAgo: 2.2 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems.some((p) => p.includes("MIN_BYTES"))).toBe(true);
  });

  it("HEARTBEAT_WEEKDAY inválido é problema, não batimento desligado em silêncio", async () => {
    const e = env(
      { HEARTBEAT_WEEKDAY: "segunda" },
      { pages: [[backupObject({ hoursAgo: 2.2 })]] },
    );

    const status = await check(e, MONDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems.some((p) => p.includes("HEARTBEAT_WEEKDAY"))).toBe(
      true,
    );
    expect(status.thresholds.heartbeatWeekday).toBeNull();
  });

  it("um erro de configuração não pode ENGOLIR o veredito sobre o bucket", async () => {
    // O código original decidia sobre o bucket com `if (!problems.length)`. Basta um
    // problema de configuração já registrado para que o bucket VAZIO deixasse de ser
    // relatado — o alerta chegaria falando de HEARTBEAT_WEEKDAY e calaria sobre o fato
    // de não existir backup nenhum. Só a listagem ter falhado justifica esse silêncio.
    const e = env({ HEARTBEAT_WEEKDAY: "segunda" }, { pages: [[]] });

    const status = await check(e, TUESDAY);

    expect(status.problems.some((p) => p.includes("HEARTBEAT_WEEKDAY"))).toBe(
      true,
    );
    expect(status.problems.some((p) => p.includes("VAZIO"))).toBe(true);
  });

  it("sem canal de e-mail a invocação estoura, em vez de conferir para ninguém", async () => {
    const e = env(
      { RESEND_API_KEY: undefined, ALERT_TO: undefined },
      { pages: [[backupObject({ hoursAgo: 2.2 })]] },
    );

    await expect(check(e, MONDAY)).rejects.toThrow(/sem canal de alerta/);
    expect(emailsSent()).toEqual([]);
    // O marcador ainda é gravado: é a única pista que sobra nesse estado.
    expect(e.BACKUPS.puts).toHaveLength(1);
  });
});

/* ───────────────────────────── relógio fora de lugar ────────────────────────────── */

describe("carimbo no futuro", () => {
  it("um objeto datado no futuro não é lido como backup em dia", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: -48, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("NO FUTURO");
    expect(emailsSent()).toHaveLength(1);
  });

  it("tolera desencontro pequeno de relógio sem virar alarme diário", async () => {
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: -0.1, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(true);
    expect(emailsSent()).toEqual([]);
  });

  it("passa da tolerância de 15 min e vira problema: -0,3h", async () => {
    // A fronteira de cima da tolerância. Sem este teste, alargar
    // FUTURE_TOLERANCE_HOURS de 0,25 para, digamos, 1 não quebra nada — e um carimbo
    // no futuro é o defeito que esconde PARA SEMPRE o backup ter parado.
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: -0.3, now: TUESDAY })]] },
    );

    const status = await check(e, TUESDAY);

    expect(status.healthy).toBe(false);
    expect(status.problems[0]).toContain("NO FUTURO");
  });

  it("um `uploaded` inválido derruba a invocação em vez de virar idade NaN", async () => {
    // `Invalid Date` faz `ageHours` virar NaN, e NaN não dispara nenhuma das duas
    // comparações de idade. O que impede isso de sair daqui como saúde é o
    // `toISOString()` na montagem do status, que estoura — ANTES do console.log, do
    // marcador e de qualquer e-mail. A invocação aparece como FALHA no painel do
    // Worker, que é o comportamento certo: não dá para dizer nada sobre esse backup.
    const invalido = backupObject({ hoursAgo: 2.2, now: TUESDAY });
    invalido.uploaded = new Date("isto-não-é-uma-data");
    const e = env({}, { pages: [[invalido]] });

    await expect(check(e, TUESDAY)).rejects.toThrow(RangeError);
    expect(console.log).not.toHaveBeenCalled();
    expect(e.BACKUPS.puts).toEqual([]);
    expect(emailsSent()).toEqual([]);
  });
});

/* ──────────────────────────── o canal de alerta em si ───────────────────────────── */

describe("envio", () => {
  it("fala com o Resend com a chave, o remetente e o destinatário configurados", async () => {
    const e = env({}, { pages: [[]] });

    await check(e, TUESDAY);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body).from).toBe("CraftHub <no-reply@example.com>");
  });

  it("uma resposta não-2xx do Resend estoura, marcando a invocação como falha", async () => {
    fetchMock.mockResolvedValue(
      new Response("domain not verified", { status: 403 }),
    );
    const e = env({}, { pages: [[]] });

    await expect(check(e, TUESDAY)).rejects.toThrow(/Resend respondeu 403/);
  });

  it("loga o status ANTES de falar com o Resend, e grava o marcador antes também", async () => {
    // A ordem é o ponto: se o Resend estiver fora do ar, o `sendEmail` estoura e o
    // único registro que sobra do que o vigia apurou é o console.log e o marcador no
    // R2. Inverter a ordem apagaria os dois exatamente no dia em que eles importam.
    const e = env({}, { pages: [[]] });

    await check(e, TUESDAY);

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(e.BACKUPS.puts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.log).mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it("sem RUNBOOK_SSH o alerta aponta para o inventário em vez de inventar um endereço", async () => {
    const e = env({ RUNBOOK_SSH: undefined }, { pages: [[]] });

    await check(e, TUESDAY);

    expect(emailsSent()[0].text).toContain("docs/production-inventory.md");
  });
});

/* ─────────────────────────────── o handler do cron ─────────────────────────────── */

describe("handler scheduled", () => {
  it("espera a checagem terminar, para que um erro marque a invocação como falha", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const e = env({}, { pages: [[]] });

    await expect(worker.scheduled({}, e)).rejects.toThrow(
      /Resend respondeu 500/,
    );
  });

  it("um dia saudável passa pelo handler sem estourar", async () => {
    // O handler usa o relógio real (não injeta `now`), então o objeto tem que ser
    // datado em relação a ele — caso contrário este teste passaria pelo caminho do
    // alerta, provando outra coisa.
    const e = env(
      {},
      { pages: [[backupObject({ hoursAgo: 2.2, now: new Date() })]] },
    );

    await expect(worker.scheduled({}, e)).resolves.toBeUndefined();
  });
});
