import { describe, expect, it } from "vitest";

import { detectLanguage } from "./detect-language.js";

/**
 * Realistic prose, not word salad. A detector tuned against single words looks
 * excellent and then meets a resume; these samples are the shape of the text
 * that actually reaches it — several sentences, mixed punctuation, technology
 * names left in English.
 */
const PORTUGUESE_RESUME = `
Sou desenvolvedor back-end há oito anos e atuo principalmente com sistemas
distribuídos. Na última empresa fui responsável pela migração de um monólito
para serviços menores, o que reduziu o tempo de deploy de trinta minutos para
menos de cinco. Também liderei um time de quatro pessoas e ajudei a definir o
processo de revisão de código que a equipe usa até hoje.
`;

const PORTUGUESE_RESUME_WITHOUT_ACCENTS = `
Trabalho como desenvolvedor ha oito anos e ja participei de varios projetos
grandes. Na empresa anterior fui responsavel pela arquitetura de um sistema de
pagamentos que processava mais de dez mil transacoes por dia. Gosto de
trabalhar junto com o time de produto e tambem de escrever documentacao para
os novos desenvolvedores.
`;

const SPANISH_RESUME = `
Soy desarrollador de software con más de siete años de experiencia en empresas
de tecnología. En mi último trabajo fui responsable del diseño de una
plataforma de pagos que procesaba miles de operaciones cada día. También lideré
un equipo pequeño y ayudé a definir el proceso de revisión de código que el
equipo sigue utilizando hoy.
`;

const SPANISH_RESUME_WITHOUT_ACCENTS = `
Soy desarrollador con siete anios de experiencia en empresas de tecnologia. En
mi ultimo trabajo fui responsable del diseno de una plataforma de pagos que
procesaba miles de operaciones cada dia. Tambien lidere un equipo pequeno y
ayude a definir el proceso de revision de codigo que el equipo sigue usando.
`;

const ENGLISH_RESUME = `
I am a senior backend engineer with eight years of experience building payment
systems at scale. In my last role I was responsible for the migration of a
monolith into a set of smaller services, which reduced deploy time from thirty
minutes to under five. I also led a team of four engineers and helped define
the code review process the team still uses today.
`;

describe("detectLanguage — prose in each shipped locale", () => {
  it("reads Brazilian Portuguese prose as pt-BR", () => {
    expect(detectLanguage(PORTUGUESE_RESUME)).toBe("pt-BR");
  });

  it("reads European Spanish prose as es-ES", () => {
    expect(detectLanguage(SPANISH_RESUME)).toBe("es-ES");
  });

  it("reads English prose as en-US", () => {
    expect(detectLanguage(ENGLISH_RESUME)).toBe("en-US");
  });
});

describe("detectLanguage — Portuguese versus Spanish", () => {
  /**
   * The highest-risk confusion in the whole module. These two share most of
   * their function words, so a scorer that counts `de`, `que`, `para` and
   * `experiencia` cannot tell them apart at all.
   */
  it("does not read Portuguese as Spanish", () => {
    expect(detectLanguage(PORTUGUESE_RESUME)).not.toBe("es-ES");
  });

  it("does not read Spanish as Portuguese", () => {
    expect(detectLanguage(SPANISH_RESUME)).not.toBe("pt-BR");
  });

  it("separates them with every accent removed, which is how much of it arrives", () => {
    expect(detectLanguage(PORTUGUESE_RESUME_WITHOUT_ACCENTS)).toBe("pt-BR");
    expect(detectLanguage(SPANISH_RESUME_WITHOUT_ACCENTS)).toBe("es-ES");
  });

  it("keeps Portuguese when the only accented characters are gone", () => {
    const stripped = `
      Nao tenho experiencia com esse framework, mas trabalhei em projetos
      parecidos e aprendo rapido. Voce pode ver os detalhes no meu perfil, onde
      descrevo cada uma das entregas que fiz para a empresa nos ultimos anos.
    `;

    expect(detectLanguage(stripped)).toBe("pt-BR");
  });

  it("keeps Spanish when the text leans on its own function words", () => {
    const spanish = `
      Durante los ultimos tres años he trabajado en el equipo de plataforma,
      donde soy responsable del despliegue continuo. Mi trabajo consiste en
      revisar el codigo de mis compañeros y en mejorar las herramientas
      internas que usamos cada semana.
    `;

    expect(detectLanguage(spanish)).toBe("es-ES");
  });
});

describe("detectLanguage — Portuguese prose full of English technology nouns", () => {
  it("stays pt-BR when the nouns are English but the sentences are not", () => {
    const mixed = `
      Atuo como desenvolvedor back-end há seis anos, trabalhando principalmente
      com Node.js, TypeScript e PostgreSQL no dia a dia. Na empresa atual sou
      responsável pela arquitetura dos serviços de pagamento, que rodam em
      Docker e Kubernetes na AWS. Também escrevo testes com Vitest e mantenho a
      documentação técnica do time atualizada, além de revisar os pull requests
      dos desenvolvedores mais novos.
    `;

    expect(detectLanguage(mixed)).toBe("pt-BR");
  });

  it("is not swayed by a long capitalised stack list appended to Portuguese prose", () => {
    const withStack = `
      Trabalho com sistemas distribuídos e gosto de escrever documentação para
      o time. Nos últimos anos participei de projetos grandes e fui responsável
      por várias entregas importantes para a empresa.

      Stack: React, Next.js, Node.js, TypeScript, PostgreSQL, Redis, Docker,
      Kubernetes, Terraform, GraphQL, RabbitMQ, Kafka, Elasticsearch, Grafana.
    `;

    expect(detectLanguage(withStack)).toBe("pt-BR");
  });
});

describe("detectLanguage — abstains instead of guessing", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   \n\t  "],
    ["a two-letter greeting", "ok"],
    ["a one-word greeting", "hi"],
    ["a bare number", "42"],
    ["a phone number", "+55 11 98765-4321"],
    ["a URL", "https://github.com/gabrielk/linkhub/pull/42"],
    ["an email address", "gabriel@example.com"],
    [
      "a list of framework names",
      "React, Node.js, PostgreSQL, Docker, Kubernetes, TypeScript, Redis",
    ],
    ["a one-line job title", "Senior Backend Engineer"],
    ["a date range", "2019 - 2024"],
  ])("returns null for %s", (_label, input) => {
    expect(detectLanguage(input)).toBeNull();
  });

  it("returns null for a near-tie between two languages", () => {
    const bilingual = `
      I work with the team on new tools and the data systems here.
      Trabalho com a equipe nos novos projetos e nas ferramentas de dados.
    `;

    expect(detectLanguage(bilingual)).toBeNull();
  });

  it("returns null for a single short sentence, however clear it looks", () => {
    expect(detectLanguage("Eu gosto de café.")).toBeNull();
  });

  it("returns null for prose in a language it does not ship", () => {
    const german = `
      Ich arbeite seit acht Jahren als Softwareentwickler und interessiere mich
      besonders für verteilte Systeme. In meiner letzten Stelle war ich für die
      Architektur einer Zahlungsplattform verantwortlich.
    `;

    expect(detectLanguage(german)).toBeNull();
  });
});

describe("detectLanguage — never throws, whatever arrives", () => {
  it.each([
    ["emoji only", "🎉🎉🎉 ✨ 🚀"],
    ["control characters", "\u0000\u0007\u001b[31m\u007f"],
    ["unusual punctuation", "«»‹›…—–‡†"],
    ["mixed scripts", "こんにちは мир שלום"],
    ["regex metacharacters", "(.*)+[]{}\\^$|?"],
    ["a very long single word", "a".repeat(50_000)],
  ])("survives %s", (_label, input) => {
    expect(() => detectLanguage(input)).not.toThrow();
  });

  it("handles a 100k-character document quickly and still gets it right", () => {
    const document = PORTUGUESE_RESUME.repeat(
      Math.ceil(100_000 / PORTUGUESE_RESUME.length),
    );
    expect(document.length).toBeGreaterThanOrEqual(100_000);

    const startedAt = performance.now();
    const detected = detectLanguage(document);
    const elapsedMs = performance.now() - startedAt;

    expect(detected).toBe("pt-BR");
    // Scanning is capped, so this is bounded work regardless of input size.
    // The budget is loose on purpose — it exists to catch an accidental
    // whole-document scan, not to measure the machine.
    expect(elapsedMs).toBeLessThan(250);
  });

  it("gives the same answer every time for the same input", () => {
    const answers = new Set(
      Array.from({ length: 20 }, () => detectLanguage(SPANISH_RESUME)),
    );

    expect(answers).toEqual(new Set(["es-ES"]));
  });

  it("does not leak regex state between calls", () => {
    // The word and noise patterns are module-level and global. A missing
    // lastIndex reset makes the second call read from halfway through.
    expect(detectLanguage(ENGLISH_RESUME)).toBe("en-US");
    expect(detectLanguage(ENGLISH_RESUME)).toBe("en-US");
    expect(detectLanguage(PORTUGUESE_RESUME)).toBe("pt-BR");
    expect(detectLanguage(ENGLISH_RESUME)).toBe("en-US");
  });
});

describe("detectLanguage — formatting it has to tolerate", () => {
  it("reads markdown bullets and headings", () => {
    const markdown = `
      ## Experiência

      - Trabalhei com sistemas de pagamento por mais de cinco anos.
      - Fui responsável pela migração de um monólito para serviços menores.
      - Também escrevo documentação e faço revisão de código para o time.
    `;

    expect(detectLanguage(markdown)).toBe("pt-BR");
  });

  it("reads text with no punctuation at all", () => {
    const runOn =
      "trabalho com sistemas distribuidos ha muitos anos e tambem escrevo " +
      "documentacao para os desenvolvedores mais novos da empresa onde atuo";

    expect(detectLanguage(runOn)).toBe("pt-BR");
  });
});
