import OpenAI from "openai";
import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
  RecruiterQueryConversionOutput,
} from "../../core/providers/query-conversion/recruiter-query-conversion-provider.js";

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
    this.client = new OpenAI({ apiKey });
  }

  async buildSemanticQuery(
    input: BuildRecruiterSemanticQueryInput,
  ): Promise<RecruiterQueryConversionOutput> {
    const completion = await this.client.chat.completions.create({
      model: process.env.QUERY_CONVERSION_MODEL ?? "gpt-4o-mini",
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

    const content = completion.choices[0]?.message?.content ?? "";
    const semanticQuery = parseSemanticQuery(content);

    if (!semanticQuery) {
      throw new Error("LLM returned an invalid semantic query response");
    }
    console.log("Generated semantic query:", semanticQuery);
    return {
      semanticQuery,
    };
  }
}
