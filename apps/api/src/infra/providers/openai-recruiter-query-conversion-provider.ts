import OpenAI from "openai";
import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
  RecruiterQueryConversionOutput,
} from "../../core/providers/query-conversion/recruiter-query-conversion-provider.js";
import {
  recordOpenAiRequest,
  recordOpenAiUsage,
} from "../observability/metrics.js";

/**
 * Telemetry must never be able to break the thing it is measuring: a failing
 * exporter turning every recruiter search into a 500 would be a far worse
 * outage than a gap in a spend dashboard.
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
      operation: "query_conversion",
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
    });
    recordOpenAiRequest({
      model: params.model,
      operation: "query_conversion",
      outcome: params.outcome,
    });
  } catch {
    // Intentionally swallowed — see above.
  }
}

const QUERY_CONVERSION_SYSTEM_PROMPT = `You are a query optimizer for semantic candidate search in a vector database.

Task:
- Convert recruiter intent + job description into ONE compact retrieval query.
- Keep only information that improves candidate matching.
- Remove filler, marketing language, and long prose.

Output contract:
- Return JSON ONLY with shape {"semanticQuery":"..."}.
- semanticQuery MUST be a short labeled block with 5 to 10 lines.
- Each line uses this format: "Label: value".
- Max 900 characters total.

Required labels when information exists:
- Role
- Seniority
- Core Skills
- Secondary Skills
- Titles
- Domain
- Responsibilities
- Constraints
- Work Model

Semantic quality rules:
- Prioritize concrete technologies, role names, years/seniority, and domain constraints.
- Merge synonyms and deduplicate terms.
- Keep skills as comma-separated keywords (no sentences).
- Responsibilities should be short noun/verb phrases, not paragraphs.
- Include compliance/regulatory terms only if relevant (e.g., HIPAA, GDPR, SOC2, PCI-DSS).
- Do not invent requirements not present in the input.
- If some fields are missing, omit that label instead of guessing.

Example output format:
{
  "semanticQuery": "Role: Full Stack Engineer\nSeniority: Mid, 6+ years\nCore Skills: TypeScript, JavaScript, Node.js, React, GraphQL\nSecondary Skills: .NET, Java\nTitles: Full Stack Engineer, Software Engineer\nDomain: Healthcare SaaS\nResponsibilities: maintain responsive apps, migrate legacy services, collaborate with UX/UI\nConstraints: HIPAA, GDPR, SOC2, PCI-DSS\nWork Model: Remote"
}`;

function buildUserPrompt(input: BuildRecruiterSemanticQueryInput): string {
  const parts: string[] = [];

  if (input.legacyQuery?.trim()) {
    parts.push(`Legacy query:\n${input.legacyQuery.trim()}`);
  }

  if (input.chatPrompt?.trim()) {
    parts.push(`Recruiter prompt:\n${input.chatPrompt.trim()}`);
  }

  if (input.attachmentText?.trim()) {
    parts.push(
      `Job description / file content:\n${input.attachmentText.trim()}`,
    );
  }

  if (input.semanticSkills?.length) {
    parts.push(
      `Semantic-only preferred skills: ${input.semanticSkills.join(", ")}`,
    );
  }

  if (input.semanticTitles?.length) {
    parts.push(
      `Semantic-only preferred titles: ${input.semanticTitles.join(", ")}`,
    );
  }

  return parts.join("\n\n");
}

function parseSemanticQuery(content: string): string | null {
  if (!content.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as { semanticQuery?: unknown };
    if (typeof parsed.semanticQuery === "string") {
      const semanticQuery = parsed.semanticQuery.trim();
      return semanticQuery.length > 0 ? semanticQuery : null;
    }

    return null;
  } catch {
    return null;
  }
}

export class OpenAiRecruiterQueryConversionProvider
  implements IRecruiterQueryConversionProvider
{
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      /**
       * Same reasoning as `OpenAiEmbeddingProvider`, and more urgent here: this
       * call runs inline in the recruiter's HTTP request. The SDK default is a
       * 10-minute timeout with 3 attempts — up to 30 minutes of one request
       * holding a connection and a database pool slot while the recruiter's
       * browser gave up long ago (defect F22). A conversion that has not
       * answered in 15s is not going to, and the caller already has a working
       * non-LLM fallback.
       */
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? "15000"),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? "2"),
    });
  }

  async buildSemanticQuery(
    input: BuildRecruiterSemanticQueryInput,
  ): Promise<RecruiterQueryConversionOutput> {
    // Read once and reuse so the metric is labelled with the model that was
    // actually asked for.
    const model = process.env.QUERY_CONVERSION_MODEL ?? "gpt-4o-mini";

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: QUERY_CONVERSION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: buildUserPrompt(input),
          },
        ],
        response_format: {
          type: "json_object",
        },
      });
    } catch (error) {
      recordCall({ model, outcome: "error" });
      // Re-thrown unchanged: the caller's non-LLM fallback and Sentry both need
      // the SDK's own error (status code, request id), not a wrapper.
      throw error;
    }

    const content = completion.choices[0]?.message?.content ?? "";
    const semanticQuery = parseSemanticQuery(content);

    if (!semanticQuery) {
      // Tokens are still recorded: OpenAI billed us for this call even though
      // the answer was unusable, and an unusable answer we paid for is exactly
      // what a spend dashboard should surface. The request itself counts as an
      // error because the caller has to fall back.
      recordCall({
        model,
        outcome: "error",
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      });
      throw new Error("LLM returned an invalid semantic query response");
    }

    recordCall({
      model,
      outcome: "success",
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    // NOTE: the generated query used to be `console.log`ged in full on every
    // request. It is derived from whatever the recruiter typed or uploaded —
    // job descriptions, internal role details — so it belongs in neither
    // stdout nor a log aggregator (defect F22).
    return {
      semanticQuery,
    };
  }
}
