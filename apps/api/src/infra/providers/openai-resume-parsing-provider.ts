import OpenAI from "openai";
import {
  IResumeParsingProvider,
  ParsedResume,
  ParsedWorkExperience,
  ResumeParsingInput,
} from "../../core/providers/resume-parsing/resume-parsing-provider.js";
import {
  recordOpenAiRequest,
  recordOpenAiUsage,
} from "../observability/metrics.js";

/**
 * Telemetry must never be able to break the thing it is measuring: a failing
 * exporter turning every resume import into a 500 would be a far worse outage
 * than a gap in a spend dashboard.
 */
function recordCall(params: {
  model: string;
  outcome: "success" | "error";
  promptTokens?: number | null;
  completionTokens?: number | null;
}): void {
  try {
    recordOpenAiUsage({
      model: params.model,
      operation: "resume_parse",
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
    });
    recordOpenAiRequest({
      model: params.model,
      operation: "resume_parse",
      outcome: params.outcome,
    });
  } catch {
    // Intentionally swallowed — see above.
  }
}

const SENIORITY_VALUES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
];
const WORK_MODEL_VALUES = ["remote", "hybrid", "on-site"];
const CONTRACT_TYPE_VALUES = [
  "clt",
  "pj",
  "freelance",
  "contract",
  "full-time",
  "part-time",
];
const EMPLOYMENT_TYPE_VALUES = [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
  "temporary",
];

const SYSTEM_PROMPT = `You are a resume parser. Read the raw text of a candidate's resume/CV and extract a structured professional profile.

Output contract:
- Return JSON ONLY, matching this exact shape:
{
  "headlineTitle": string | null,            // short professional headline, e.g. "Senior Full Stack Engineer"
  "summary": string | null,                  // 1-3 sentence professional summary
  "totalYearsExperience": number | null,     // integer years of professional experience
  "location": string | null,                 // current city/country
  "seniorityLevel": one of ["intern","junior","mid","senior","staff","principal"] | null,
  "workModel": one of ["remote","hybrid","on-site"] | null,
  "contractType": one of ["clt","pj","freelance","contract","full-time","part-time"] | null,
  "salaryExpectationMin": number | null,
  "salaryExpectationMax": number | null,
  "spokenLanguages": string[],               // e.g. ["English","Portuguese"]
  "noticePeriod": string | null,
  "openToRelocation": boolean | null,
  "skills": string[],                        // concrete technologies/tools, deduplicated
  "titles": string[],                        // job titles the candidate fits, e.g. ["Full Stack Engineer"]
  "workExperiences": [
    {
      "title": string,                       // role title
      "companyName": string,
      "employmentType": one of ["full-time","part-time","contract","freelance","internship","temporary"] | null,
      "workModel": one of ["remote","hybrid","on-site"] | null,
      "locationCity": string | null,
      "locationState": string | null,
      "locationCountry": string | null,
      "startDate": string | null,            // ISO date "YYYY-MM-DD"; use first day of the month if only month/year is known
      "endDate": string | null,              // ISO date "YYYY-MM-DD"; null if it is the current role
      "isCurrent": boolean,
      "description": string | null,          // achievements/responsibilities as Markdown; see the Markdown rule below
      "mainStack": string[]                  // main technologies used in this role
    }
  ],
  "profileName": string | null,              // candidate full name
  "profileDescription": string | null        // short public bio (can mirror summary)
}

Rules:
- Use null (or [] for arrays) when information is absent. NEVER invent data.
- Normalize dates to "YYYY-MM-DD". If only a year is given, use "YYYY-01-01".
- Order workExperiences from most recent to oldest.
- Prefer skill/title names from the provided known lists when they clearly match, otherwise keep the resume's wording.
- Keep skills concise (technology names, not sentences).
- Markdown for work-experience "description": PRESERVE the resume's bullet structure. When the resume lists responsibilities/achievements as bullets (•, -, *, or numbered), output them as a Markdown bulleted list with each item on its own line starting with "- " (use a real newline "\\n" between items, never merge bullets into one paragraph). You may use **bold** for emphasis. If the entry is genuinely a single prose paragraph, keep it as a paragraph. Keep each bullet concise; do not invent bullets that aren't in the resume.`;

/**
 * Bullet glyphs that start a line in a real CV. PDFs and DOCX files use every
 * one of these, and the model echoes back whatever it was given.
 */
const LEADING_BULLET_RE = /^[•‣▪●◦∙·–—]\s*/;

/**
 * The subset strong enough to split on mid-line. `·`, `–` and `—` are left out
 * on purpose: they show up inside ordinary prose ("2020 – 2022", "React · Node")
 * often enough that splitting on them would shred a normal sentence.
 */
const INLINE_BULLET_RE = /[•‣▪●◦∙]\s*/g;

/**
 * Rewrites a role description into the Markdown the profile renderer expects:
 * one bullet per line, each starting with "- ".
 *
 * Done here, once, server-side, rather than in the web renderer, so the stored
 * value is already canonical Markdown — the same text is also read by the MCP
 * work-context use case and shown in the resume-import review step, and none of
 * those should have to know what a `▪` means.
 *
 * The mid-line split is the repair for the older glued imports: when a whole
 * resume arrived as a single line (see the whitespace note in
 * `extract-search-attachment-text.ts`), the model faithfully echoed a run of
 * "• did this • did that" back on one line. Two or more glyphs is the signal;
 * a single glyph is just this line's own marker.
 */
export function normalizeDescriptionMarkdown(input: string): string {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/[^\S\n]+/g, " ").trim();

    if (line.length === 0) {
      normalized.push("");
      continue;
    }

    const glyphs = line.match(INLINE_BULLET_RE);
    if (glyphs && glyphs.length >= 2) {
      for (const item of line.split(INLINE_BULLET_RE)) {
        const text = item.trim();
        if (text.length > 0) {
          normalized.push(`- ${text}`);
        }
      }
      continue;
    }

    normalized.push(line.replace(LEADING_BULLET_RE, "- "));
  }

  return normalized
    .join("\n")
    .replace(/ +$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const normalized = asString(item);
    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      result.push(normalized);
    }
  }
  return result;
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function asEnum(value: unknown, allowed: string[]): string | null {
  const normalized = asString(value)?.toLowerCase();
  return normalized && allowed.includes(normalized) ? normalized : null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function asIsoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return `${raw}-01`;
  }
  if (/^\d{4}$/.test(raw)) {
    return `${raw}-01-01`;
  }
  return null;
}

function normalizeWorkExperience(raw: unknown): ParsedWorkExperience | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const title = asString(value.title);
  const companyName = asString(value.companyName);

  if (!title || !companyName) {
    return null;
  }

  const isCurrent = asBoolean(value.isCurrent) ?? false;
  const endDate = isCurrent ? null : asIsoDate(value.endDate);
  const rawDescription = asString(value.description);
  const description = rawDescription
    ? (normalizeDescriptionMarkdown(rawDescription) || null)
    : null;

  return {
    title,
    companyName,
    employmentType: asEnum(value.employmentType, EMPLOYMENT_TYPE_VALUES),
    workModel: asEnum(value.workModel, WORK_MODEL_VALUES),
    locationCity: asString(value.locationCity),
    locationState: asString(value.locationState),
    locationCountry: asString(value.locationCountry),
    startDate: asIsoDate(value.startDate),
    endDate,
    isCurrent,
    description,
    mainStack: asStringArray(value.mainStack),
  };
}

function normalizeParsedResume(raw: unknown): ParsedResume {
  const value = (raw ?? {}) as Record<string, unknown>;

  return {
    headlineTitle: asString(value.headlineTitle),
    summary: asString(value.summary),
    totalYearsExperience: asInteger(value.totalYearsExperience),
    location: asString(value.location),
    seniorityLevel: asEnum(value.seniorityLevel, SENIORITY_VALUES),
    workModel: asEnum(value.workModel, WORK_MODEL_VALUES),
    contractType: asEnum(value.contractType, CONTRACT_TYPE_VALUES),
    salaryExpectationMin: asInteger(value.salaryExpectationMin),
    salaryExpectationMax: asInteger(value.salaryExpectationMax),
    spokenLanguages: asStringArray(value.spokenLanguages),
    noticePeriod: asString(value.noticePeriod),
    openToRelocation: asBoolean(value.openToRelocation),
    skills: asStringArray(value.skills),
    titles: asStringArray(value.titles),
    workExperiences: Array.isArray(value.workExperiences)
      ? value.workExperiences
          .map(normalizeWorkExperience)
          .filter((item): item is ParsedWorkExperience => item !== null)
      : [],
    profileName: asString(value.profileName),
    profileDescription: asString(value.profileDescription),
  };
}

export class OpenAiResumeParsingProvider implements IResumeParsingProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      /**
       * This was the only OpenAI client in the codebase left on the SDK
       * defaults — 10 minutes per attempt, 3 attempts. It runs inline in the
       * HTTP request that uploads a CV, so a hung call could hold that request
       * (and its connection and pool slot) open for half an hour, long after
       * the browser gave up. Its two siblings already bound this.
       *
       * A dedicated variable rather than the shared `OPENAI_TIMEOUT_MS`: a
       * resume is a whole document going through a chat completion, so it
       * legitimately takes tens of seconds, where a query conversion answers in
       * one or two. Reusing the 15s sibling default would turn slow-but-fine
       * imports into failures; 60s is generous for the p99 and still two orders
       * of magnitude below the SDK default.
       */
      timeout: Number(process.env.OPENAI_PARSE_TIMEOUT_MS ?? "60000"),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? "2"),
    });
  }

  async parseResume(input: ResumeParsingInput): Promise<ParsedResume> {
    const userPrompt = [
      input.knownSkills.length
        ? `Known skills (prefer these when matching): ${input.knownSkills.join(", ")}`
        : "",
      input.knownTitles.length
        ? `Known titles (prefer these when matching): ${input.knownTitles.join(", ")}`
        : "",
      "Resume text:",
      input.resumeText,
    ]
      .filter(Boolean)
      .join("\n\n");

    // Read once and reuse so the metric is labelled with the model that was
    // actually asked for.
    const model = process.env.RESUME_PARSING_MODEL ?? "gpt-4o-mini";

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
    } catch (error) {
      recordCall({ model, outcome: "error" });
      // Re-thrown unchanged so the controller's error mapping and Sentry see
      // the SDK's own error (status code, request id) rather than a wrapper.
      throw error;
    }

    const content = completion.choices[0]?.message?.content ?? "";
    const promptTokens = completion.usage?.prompt_tokens;
    const completionTokens = completion.usage?.completion_tokens;

    let parsed: ParsedResume;
    try {
      parsed = normalizeParsedResume(JSON.parse(content));
    } catch {
      // Tokens are still recorded: a resume is the most expensive prompt we
      // send, and one that came back unparseable is spend with nothing to show
      // for it — exactly what the dashboard is for.
      recordCall({ model, outcome: "error", promptTokens, completionTokens });
      throw new Error("LLM returned an invalid resume parsing response");
    }

    // Outside the try above on purpose: nothing metric-related may end up in a
    // catch that would rewrite a successful parse into a parsing failure.
    recordCall({ model, outcome: "success", promptTokens, completionTokens });

    return parsed;
  }
}
