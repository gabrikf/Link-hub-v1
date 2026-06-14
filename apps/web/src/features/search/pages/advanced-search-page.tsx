import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FiActivity } from "react-icons/fi";
import {
  searchRecruiterResumes,
  trackInteraction,
  type RecruiterSearchResponse,
} from "../../../lib/auth-api";
import { getAuthTokens } from "../../../lib/auth-tokens";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { SearchChatComposer } from "../components/search-chat-composer";
import { SearchMandatoryFilters } from "../components/search-mandatory-filters";
import { SearchResults } from "../components/search-results";
import { useAiRerank } from "../hooks/use-ai-rerank";
import {
  advancedSearchFormSchema,
  type AdvancedSearchFormValues,
  DEFAULT_TOP_K,
  OPEN_TO_RELOCATION_OPTIONS,
  type RankedCandidate,
} from "../types/advanced-search";
import { buildRecruiterSearchPayload } from "../utils/advanced-search";

export function AdvancedSearchPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [rankedResults, setRankedResults] = useState<RankedCandidate[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [lastSearchInput, setLastSearchInput] = useState<
    RecruiterSearchResponse["input"] | null
  >(null);

  const form = useForm<AdvancedSearchFormValues>({
    resolver: zodResolver(advancedSearchFormSchema),
    defaultValues: {
      chatPrompt: "",
      semanticSkills: [],
      semanticTitles: [],
      contractTypes: [],
      seniorityLevels: [],
      workModels: [],
      openToRelocation: OPEN_TO_RELOCATION_OPTIONS[0],
      minYearsExperience: "",
      maxYearsExperience: "",
      locations: [],
      spokenLanguages: [],
      noticePeriods: [],
      mandatorySkills: [],
      mandatoryTitles: [],
      minSalary: "",
      maxSalary: "",
      nameContains: "",
      usernameContains: "",
      profileTextContains: "",
    },
  });

  const { rerank, isModelLoading } = useAiRerank();

  useEffect(() => {
    if (!getAuthTokens()) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  const searchMutation = useMutation({
    mutationFn: async (
      input: ReturnType<typeof buildRecruiterSearchPayload>["payload"],
    ) => {
      const semanticResults = await searchRecruiterResumes(input);
      const results = await rerank({
        candidates: semanticResults.candidates,
        semanticQuery: semanticResults.input.semanticQuery,
        filters: semanticResults.input.filters,
        semanticSkills: semanticResults.input.semanticSkills,
        semanticTitles: semanticResults.input.semanticTitles,
      });
      return { results, searchInput: semanticResults.input };
    },
    onSuccess: ({ results, searchInput }) => {
      setRankedResults(results);
      setLastSearchInput(searchInput);
    },
  });

  const isBusy = searchMutation.isPending || isModelLoading;

  const onSearch = form.handleSubmit(async (values) => {
    const { payload, hasSemanticInput } = buildRecruiterSearchPayload({
      values,
      attachmentFile,
      topK: DEFAULT_TOP_K,
    });

    if (!hasSemanticInput) {
      setFeedbackMessage(
        "Add text, attach a file, or select at least one filter before searching.",
      );
      return;
    }

    setFeedbackMessage(null);

    try {
      await searchMutation.mutateAsync(payload);
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : "Search failed. Try again.",
      );
    }
  });

  const handleCopyEmail = useCallback(
    async (candidate: RankedCandidate, index: number) => {
      await navigator.clipboard.writeText(candidate.email);
      setFeedbackMessage(`Email copied: ${candidate.email}`);

      void trackInteraction({
        resumeId: candidate.resumeId,
        interactionType: "EMAIL_COPY",
        queryText: lastSearchInput?.semanticQuery ?? null,
        semanticSimilarity: candidate.similarity,
        rankPosition: index + 1,
        metadata: {
          aiScore: candidate.aiScore,
        },
        candidateSnapshot: {
          headlineTitle: candidate.headlineTitle,
          summary: candidate.summary,
          totalYearsExperience: candidate.totalYearsExperience,
          seniorityLevel: candidate.seniorityLevel,
          workModel: candidate.workModel,
          contractType: candidate.contractType,
          location: candidate.location,
          spokenLanguages: candidate.spokenLanguages,
          noticePeriod: candidate.noticePeriod,
          openToRelocation: candidate.openToRelocation,
          salaryExpectationMin: candidate.salaryExpectationMin,
          salaryExpectationMax: candidate.salaryExpectationMax,
          skills: candidate.skills,
          titles: candidate.titles,
        },
        querySnapshot: lastSearchInput ?? undefined,
      }).catch(() => {
        // Tracking should never block recruiter workflow.
      });
    },
    [lastSearchInput],
  );

  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 overflow-hidden px-4 py-8">
      {/* Ambient futuristic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="anim-float absolute -top-24 right-1/3 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div
          className="anim-float absolute top-20 left-0 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <section className="anim-fade-up anim-sheen rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <span className="anim-glow-pulse inline-flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-cyan-500 text-white">
            <FiActivity className="anim-float h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-xl font-semibold text-transparent">
              Advanced Search (AI)
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Describe your ideal candidate and we will generate the perfect
              search query for semantic retrieval.
            </p>
          </div>
        </div>

        <form onSubmit={onSearch} className="mt-5">
          <SearchChatComposer
            control={control}
            register={register}
            errors={errors}
            isBusy={isBusy}
            attachmentFile={attachmentFile}
            onPickFile={() => fileInputRef.current?.click()}
            onRemoveFile={() => setAttachmentFile(null)}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setAttachmentFile(file);
            }}
          />

          <SearchMandatoryFilters
            control={control}
            register={register}
            errors={errors}
            isOpen={isFiltersOpen}
            onToggle={() => setIsFiltersOpen((current) => !current)}
          />
        </form>

        {feedbackMessage ? (
          <div className="mt-3">
            <FeedbackMessage
              tone={
                feedbackMessage.startsWith("Email copied") ? "success" : "error"
              }
              message={feedbackMessage}
            />
          </div>
        ) : null}
      </section>

      <SearchResults
        results={rankedResults}
        isBusy={isBusy}
        onCopyEmail={handleCopyEmail}
      />
    </main>
  );
}
