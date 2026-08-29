import type { UiLanguage } from "@repo/schemas";

export interface BuildRecruiterSemanticQueryInput {
  legacyQuery?: string;
  chatPrompt?: string;
  attachmentText?: string;
  semanticSkills?: string[];
  semanticTitles?: string[];
  /**
   * The recruiter's resolved response language.
   *
   * Threaded here deliberately, and deliberately NOT used to translate the
   * output (see D6 in
   * `docs/specs/user-preferences-and-response-language/DEFINITION-OF-DONE.md`).
   * The semantic query is a retrieval DSL whose labels — `Role:`, `Seniority:`,
   * `Core Skills:` — are embedded and matched against a pgvector index built
   * from English-labelled text, so translating them would silently degrade
   * search for everyone. The provider states the language in the prompt and
   * pins the labels to English against it.
   *
   * It is on the interface rather than absent so that the exclusion is a
   * visible decision in the code, not an accident of nobody having plumbed it.
   */
  language: UiLanguage;
}

export interface RecruiterQueryConversionOutput {
  semanticQuery: string;
}

export interface IRecruiterQueryConversionProvider {
  buildSemanticQuery(
    input: BuildRecruiterSemanticQueryInput,
  ): Promise<RecruiterQueryConversionOutput>;
}
