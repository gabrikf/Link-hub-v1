export interface BuildRecruiterSemanticQueryInput {
  legacyQuery?: string;
  chatPrompt?: string;
  attachmentText?: string;
  semanticSkills?: string[];
  semanticTitles?: string[];
}

export interface RecruiterQueryConversionOutput {
  semanticQuery: string;
}

export interface IRecruiterQueryConversionProvider {
  buildSemanticQuery(
    input: BuildRecruiterSemanticQueryInput,
  ): Promise<RecruiterQueryConversionOutput>;
}
