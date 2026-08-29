import type { UiLanguage } from "@repo/schemas";

/**
 * Deterministic language identification for the three locales CraftHub ships.
 *
 * WHY THIS IS NOT AN LLM CALL
 *
 * The only consumer is the language-resolution step that runs before every AI
 * request. Asking a model which language a resume is in, in order to decide how
 * to prompt the model, doubles the cost and the latency of every AI feature and
 * adds a network failure mode to a code path that must never throw. Function
 * word frequency answers the same question in microseconds, offline.
 *
 * WHY IT RETURNS `null` SO READILY
 *
 * A wrong-but-confident guess is strictly worse than no guess: the caller has a
 * stored user preference to fall back on, and that preference is by definition
 * what the user asked for. `null` costs nothing; a confident mistake answers a
 * Brazilian user in Spanish while their settings say `pt-BR`. Every threshold
 * below is therefore tuned to abstain rather than to maximise accuracy.
 *
 * Pure: no I/O, no dependencies, no state.
 */

/**
 * Only the first slice of the input is scanned. A resume can arrive as 200KB of
 * extracted PDF text, and the answer stops changing long before that — a few
 * hundred function words already saturate the score. This caps the worst case
 * at a fixed, small amount of work.
 */
const MAX_SCAN_CHARS = 20_000;

/**
 * Accent folding, so that Portuguese typed without accents — which is how a
 * large share of real input arrives — still matches the word tables.
 *
 * `ñ` is deliberately NOT folded. Folding it collapses Spanish `año` onto
 * Portuguese `ano` (both mean "year"), turning the single most useful Spanish
 * marker into a false Portuguese signal. `ç` folds to `c` because it never
 * distinguishes anything at the word level; it earns its keep as a character
 * marker further down instead.
 */
const ACCENT_FOLDING: Record<string, string> = {
  á: "a",
  à: "a",
  â: "a",
  ã: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
};

const fold = (value: string): string => {
  let folded = "";
  for (const character of value) {
    folded += ACCENT_FOLDING[character] ?? character;
  }
  return folded;
};

/**
 * URLs, email addresses and dotted package names are removed before
 * tokenisation. Without this, `https://github.com/user` contributes the token
 * `com` — a high-value Portuguese preposition — and a page of links reads as
 * fluent Portuguese. `Node.js` and `React.dev` go the same way, which is a
 * bonus: they are proper nouns and carry no evidence about the prose.
 */
const NOISE_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|\b[\w-]+\.(?:com|org|net|io|dev|app|ai|js|ts|co|br|es|mx|pt|uk|de)\b/gi;

/** Letters only. Digits, punctuation, emoji and control characters never match. */
const WORD_PATTERN = /\p{L}+/gu;

/**
 * Function-word tables, written in FOLDED form (no accents except `ñ`) because
 * that is the form the tokeniser produces.
 *
 * The lists are allowed to overlap on purpose. A word claimed by more than one
 * language is stripped of all discriminating power at build time below, so
 * `de`, `que`, `para`, `como`, `empresa` and `experiencia` — the words that
 * make Portuguese and Spanish look identical to a naive scorer — contribute
 * nothing to the verdict. Only the words that exactly one language claims do.
 *
 * That is why the pairs are listed in full: `trabalho`/`trabajo`,
 * `equipe`/`equipo`/`team`, `dados`/`datos`/`data`, `anos`/`años`/`years`.
 * Listing one side of a pair and forgetting the other is what produces a
 * detector that reads Spanish as Portuguese.
 */
const PORTUGUESE_WORDS = [
  "e", "o", "a", "os", "as", "do", "da", "dos", "das", "de", "que", "no", "na",
  "nos", "nas", "em", "um", "uma", "uns", "umas", "para", "por", "com", "se",
  "como", "mas", "mais", "muito", "muita", "muitos", "muitas", "nao", "sim",
  "tambem", "ja", "ate", "sobre", "entre", "quando", "onde", "porque", "pois",
  "ser", "sou", "foi", "fui", "era", "sao", "esta", "estou", "estava", "ter",
  "tem", "tinha", "fazer", "fiz", "feito", "seu", "sua", "seus", "suas", "meu",
  "minha", "ele", "ela", "eles", "elas", "voce", "voces", "nosso", "nossa",
  "este", "esse", "essa", "isso", "aquele", "ao", "aos", "pelo", "pela",
  "pelos", "pelas", "atraves", "alem", "todos", "todas", "cada", "depois",
  "antes", "durante", "desde", "atual", "atualmente", "responsavel",
  "experiencia", "empresa", "trabalho", "trabalhei", "trabalhando", "projeto",
  "projetos", "equipe", "equipes", "desenvolvimento", "desenvolvedor",
  "desenvolvi", "desenvolvendo", "tecnologias", "sistemas", "aplicacoes",
  "solucoes", "ferramentas", "dados", "anos", "meses", "area", "formacao",
  "atuei", "atuo", "liderei", "implementei", "criei", "melhorias", "entrega",
  "entregas", "negocio", "cliente", "clientes", "resultados", "aumentando",
  "reduzindo", "utilizando", "junto", "seguranca", "tempo", "novo", "nova",
  "novos", "dentro", "mediante", "eu", "isto", "nem", "sem", "ainda",
  "sempre", "entao", "assim", "tenho", "hoje", "ha", "pessoas",
  // `time` and `data` are Portuguese words (team, date) that happen to be
  // spelled like common English ones. Listed on both sides so they cancel;
  // without this, "o time" and "a data" in Portuguese prose vote for English.
  "time", "data",
];

const SPANISH_WORDS = [
  "y", "el", "la", "los", "las", "un", "una", "unos", "unas", "del", "al", "en",
  "de", "que", "no", "por", "para", "con", "se", "como", "pero", "mas", "muy",
  "si", "tambien", "ya", "hasta", "sobre", "entre", "cuando", "donde",
  "porque", "pues", "ser", "soy", "fue", "era", "son", "esta", "estoy",
  "estaba", "tener", "tiene", "tenia", "hacer", "hice", "hecho", "su", "sus",
  "mi", "mis", "ella", "ellos", "ellas", "usted", "ustedes", "nuestro",
  "nuestra", "este", "ese", "esa", "eso", "aquel", "a", "o", "dos", "ademas",
  "todos", "todas", "cada", "despues", "antes", "durante", "desde", "actual",
  "actualmente", "responsable", "experiencia", "empresa", "trabajo", "trabaje",
  "trabajando", "proyecto", "proyectos", "equipo", "equipos", "desarrollo",
  "desarrollador", "desarrolle", "desarrollando", "tecnologias", "sistemas",
  "aplicaciones", "soluciones", "herramientas", "datos", "años", "año",
  "meses", "area", "formacion", "lidere", "implemente", "mejoras", "entrega",
  "entregas", "negocio", "cliente", "clientes", "resultados", "aumentando",
  "reduciendo", "utilizando", "junto", "seguridad", "tiempo", "nuevo", "nueva",
  "nuevos", "dentro", "mediante", "es", "lo", "les", "esto", "yo", "mucho",
  "mucha", "muchos", "muchas", "sin", "aun", "todavia", "siempre", "entonces",
  "asi", "tengo", "hoy", "personas",
  // `he`/`han`/`ha` are the Spanish perfect auxiliary — "he trabajado" is
  // ordinary prose, and `he` would otherwise be counted as the English pronoun.
  // `ha` is listed for Portuguese too (`há oito anos`), so it cancels.
  "he", "han", "ha",
];

const ENGLISH_WORDS = [
  "the", "of", "and", "to", "in", "for", "with", "a", "is", "are", "was",
  "were", "be", "been", "being", "at", "on", "by", "from", "as", "that",
  "this", "these", "those", "it", "its", "his", "her", "their", "our", "we",
  "they", "you", "your", "he", "she", "have", "has", "had", "will", "would",
  "should", "could", "can", "an", "or", "but", "not", "all", "more", "most",
  "than", "then", "when", "where", "which", "who", "while", "my", "do", "does",
  "did", "work", "working", "worked", "company", "experience", "team", "teams",
  "developer", "development", "developing", "years", "months", "also", "about",
  "into", "over", "through", "between", "using", "used", "build", "built",
  "led", "managed", "responsible", "delivered", "improved", "increased",
  "reduced", "across", "within", "including", "such", "both", "each", "other",
  "new", "current", "currently", "project", "projects", "systems", "tools",
  "data", "area", "skills", "role", "roles", "during", "after", "before",
  "time", "security", "still", "without", "always", "since", "every", "people",
];

interface WordTables {
  /** Word → the single language that claims it. Shared words are absent. */
  readonly discriminating: ReadonlyMap<string, UiLanguage>;
  /** Every listed word, shared ones included. Used only to prove this is prose. */
  readonly known: ReadonlySet<string>;
}

const buildWordTables = (): WordTables => {
  const claims = new Map<string, UiLanguage[]>();

  const claim = (words: readonly string[], language: UiLanguage): void => {
    for (const word of words) {
      const claimants = claims.get(word) ?? [];
      if (!claimants.includes(language)) {
        claimants.push(language);
      }
      claims.set(word, claimants);
    }
  };

  claim(PORTUGUESE_WORDS, "pt-BR");
  claim(SPANISH_WORDS, "es-ES");
  claim(ENGLISH_WORDS, "en-US");

  const discriminating = new Map<string, UiLanguage>();
  const known = new Set<string>();

  for (const [word, claimants] of claims) {
    known.add(word);
    const soleClaimant = claimants.length === 1 ? claimants[0] : undefined;
    if (soleClaimant) {
      discriminating.set(word, soleClaimant);
    }
  }

  return { discriminating, known };
};

const { discriminating: DISCRIMINATING_WORDS, known: KNOWN_FUNCTION_WORDS } =
  buildWordTables();

/**
 * Orthographic markers, counted on the raw text before folding.
 *
 * These are the characters no other shipped language uses, so they are strong
 * evidence — but they are worth less than a word each, and their total is
 * capped, because a single stray `ñ` in a name must never outvote a paragraph
 * of prose. They contribute nothing at all to accent-less input, which is
 * exactly why the word tables above carry the real load.
 */
const MARKER_PATTERNS: readonly { language: UiLanguage; pattern: RegExp }[] = [
  { language: "pt-BR", pattern: /[ãõç]/g },
  { language: "es-ES", pattern: /[ñ¿¡]/g },
];

const MARKER_POINTS = 0.5;
const MAX_MARKER_POINTS = 3;

/**
 * A single-letter word (`e`, `y`) carries less information than a whole one and
 * is more easily manufactured by hyphenation — `e-commerce` in English prose
 * tokenises to `e` plus `commerce`. Half weight keeps the signal without
 * letting punctuation vote.
 */
const SHORT_WORD_POINTS = 0.5;
const WORD_POINTS = 1;

/**
 * THE THRESHOLDS. All three must be cleared, and each blocks a different way of
 * being wrong.
 *
 * `MIN_FUNCTION_WORD_HITS` — is this prose at all? A skills list
 * (`React, Node.js, PostgreSQL`), a phone number, a URL or `ok` produce almost
 * no function words in any language. Eight is roughly one short sentence, and
 * it is what makes short input return `null` instead of flipping a coin.
 *
 * `MIN_TOP_SCORE` — is there enough evidence FOR the winner? Set to four so
 * that neither the capped markers alone (three) nor a couple of stray
 * discriminating words can decide, while two ordinary sentences clear it
 * comfortably.
 *
 * `MIN_SCORE_MARGIN` / `MIN_SCORE_RATIO` — is the winner actually ahead? Both
 * an absolute gap and a proportional one, because either alone lies at a
 * different scale: a 3-vs-2 win passes the ratio test on a tiny sample, and a
 * 40-vs-36 win passes the absolute test on a large one. Mixed-language text —
 * the genuinely ambiguous case — fails one of them and returns `null`.
 */
const MIN_FUNCTION_WORD_HITS = 8;
const MIN_TOP_SCORE = 4;
const MIN_SCORE_MARGIN = 2;
const MIN_SCORE_RATIO = 1.5;

const countMatches = (text: string, pattern: RegExp): number => {
  // The patterns are module-level and global. The loop below runs to
  // exhaustion, which already leaves lastIndex at 0, so this reset is
  // belt-and-braces — it is what stops a future early `break` from making the
  // NEXT call read from halfway through the string.
  pattern.lastIndex = 0;
  let matches = 0;
  while (pattern.exec(text) !== null) {
    matches += 1;
  }
  return matches;
};

/**
 * The language `text` is written in, or `null` when the evidence is thin,
 * contradictory or simply not prose.
 *
 * Accepts `null`/`undefined` (and anything else, defensively) and never throws:
 * this runs on the request path, where a resume full of control characters must
 * degrade to "I don't know" rather than to a 500.
 */
export const detectLanguage = (
  text: string | null | undefined,
): UiLanguage | null => {
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }

  const scanned = text.slice(0, MAX_SCAN_CHARS).toLowerCase();
  const cleaned = scanned.replace(NOISE_PATTERN, " ");

  const scores: Record<UiLanguage, number> = {
    "en-US": 0,
    "pt-BR": 0,
    "es-ES": 0,
  };

  for (const { language, pattern } of MARKER_PATTERNS) {
    scores[language] += Math.min(
      countMatches(cleaned, pattern) * MARKER_POINTS,
      MAX_MARKER_POINTS,
    );
  }

  // Tokenise the ORIGINAL-case text, because capitalisation is the cheapest
  // available proper-noun filter. A Portuguese resume is dense with English
  // technology names — React, Node, PostgreSQL, Docker — and every one of them
  // arrives capitalised. Ignoring capitalised tokens keeps the verdict on the
  // prose that surrounds them, which is the thing actually written in a
  // language. The cost is the occasional sentence-initial function word; that
  // is a uniform loss across all three languages, so it does not bias the
  // margin.
  const original = text.slice(0, MAX_SCAN_CHARS).replace(NOISE_PATTERN, " ");
  WORD_PATTERN.lastIndex = 0;

  let functionWordHits = 0;
  let match: RegExpExecArray | null;

  while ((match = WORD_PATTERN.exec(original)) !== null) {
    const raw = match[0];
    const firstCharacter = raw[0] ?? "";
    if (firstCharacter !== firstCharacter.toLowerCase()) {
      continue;
    }

    const word = fold(raw.toLowerCase());
    if (!KNOWN_FUNCTION_WORDS.has(word)) {
      continue;
    }

    functionWordHits += 1;

    const language = DISCRIMINATING_WORDS.get(word);
    if (language) {
      scores[language] +=
        word.length === 1 ? SHORT_WORD_POINTS : WORD_POINTS;
    }
  }

  if (functionWordHits < MIN_FUNCTION_WORD_HITS) {
    return null;
  }

  const ranked = (Object.keys(scores) as UiLanguage[])
    .map((language) => ({ language, score: scores[language] }))
    // Ties keep the declaration order of `scores`; it does not matter, because
    // a tie can never clear the margin check below.
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  const runnerUp = ranked[1];
  if (!winner || !runnerUp) {
    return null;
  }

  if (winner.score < MIN_TOP_SCORE) {
    return null;
  }

  if (winner.score - runnerUp.score < MIN_SCORE_MARGIN) {
    return null;
  }

  // `runnerUp.score` of 0 makes the ratio infinite, which is the intended
  // reading: nothing at all argued for another language.
  if (runnerUp.score > 0 && winner.score / runnerUp.score < MIN_SCORE_RATIO) {
    return null;
  }

  return winner.language;
};
