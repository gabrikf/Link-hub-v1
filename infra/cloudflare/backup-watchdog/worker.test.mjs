/**
 * Testes do vigia do backup.
 *
 * COMO RODAR (da raiz do repositório):
 *     npx vitest run --root infra/cloudflare/backup-watchdog
 *
 * ONDE ISTO MORA, E POR QUE NÃO EM UM WORKSPACE. `npm run test` é
 * `turbo run test`, e o gate (`scripts/guardrails/pre-push.mjs`) e o job `test` do CI
 * chamam `turbo run test --filter=...`. Turbo só enxerga workspaces, e `workspaces` no
 * package.json da raiz é `["apps/*", "packages/*"]`. Logo:
 *
 *   - nenhum workspace existente é dono deste código. Enfiar um teste de infraestrutura
 *     em `apps/api` para "ficar coberto" mentiria sobre a propriedade E mexeria no
 *     ratchet de cobertura daquele workspace;
 *   - transformar `infra/cloudflare/backup-watchdog` em workspace exige mudar
 *     `workspaces` na raiz e rodar `npm install`, o que reescreve o package-lock — caro
 *     demais para um arquivo de 300 linhas sem dependências.
 *
 * CONSEQUÊNCIA, DITA EM VOZ ALTA: **este arquivo não roda no gate nem no CI hoje.**
 * Ele passa quando você o chama, e só. O menor jeito honesto de fechar isso são duas
 * linhas, que estão propostas e NÃO foram aplicadas aqui (mexem em arquivos de outra
 * pessoa):
 *
 *   1. `package.json` da raiz, em scripts:
 *        "test:infra": "vitest run --root infra/cloudflare/backup-watchdog"
 *   2. `.github/workflows/ci.yml`, no job `test`, depois de "Test — every other
 *      workspace":
 *        - name: Test — infra workers
 *          run: npm run test:infra
 *
 * (E, se quiser no gate local, um `step("test — infra", ...)` em pre-push.mjs.)
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
 */
function fakeBucket({ pages = [[]], listError = null, putError = null } = {}) {
  const puts = [];
  let call = 0;

  return {
    puts,
    listCalls: () => call,
    async list() {
      if (listError) throw listError;
      const index = call;
      call += 1;
      const objects = pages[index] ?? [];
      const truncated = index < pages.length - 1;
      return {
        objects,
        truncated,
        cursor: truncated ? `cursor-${index}` : undefined,
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
    expect(status.newest.ageHours).toBe(2.2);
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
