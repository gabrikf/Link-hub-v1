import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
  RecruiterQueryConversionOutput,
} from "../../core/providers/query-conversion/recruiter-query-conversion-provider.js";

function normalizeList(values: string[] | undefined): string[] {
  if (!values?.length) {
    return [];
  }

  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

export class DeterministicRecruiterQueryConversionProvider
  implements IRecruiterQueryConversionProvider
{
  async buildSemanticQuery(
    input: BuildRecruiterSemanticQueryInput,
  ): Promise<RecruiterQueryConversionOutput> {
    const prompt = input.chatPrompt?.trim();
    const legacy = input.legacyQuery?.trim();
    const attachment = input.attachmentText?.trim();
    const semanticSkills = normalizeList(input.semanticSkills);
    const semanticTitles = normalizeList(input.semanticTitles);

    const parts: string[] = [];

    if (legacy) {
      parts.push(`Legacy query: ${legacy}`);
    }

    if (prompt) {
      parts.push(`User request: ${prompt}`);
    }

    if (attachment) {
      parts.push(`Job description context:\n${attachment}`);
    }

    if (semanticSkills.length > 0) {
      parts.push(`Preferred skills: ${semanticSkills.join(", ")}`);
    }

    if (semanticTitles.length > 0) {
      parts.push(`Preferred titles: ${semanticTitles.join(", ")}`);
    }

    const semanticQuery = parts.join("\n\n").trim();

    return {
      semanticQuery,
    };
  }
}
