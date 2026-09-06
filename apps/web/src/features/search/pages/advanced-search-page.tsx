import { zodResolver } from "@hookform/resolvers/zod";
import { SURFACE } from "../../../shared-components/surface";
import { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { FiActivity } from "react-icons/fi";
import {
  revealCandidateContact,
  searchRecruiterResumes,
  trackInteraction,
  type RecruiterSearchResponse,
} from "../../../lib/auth-api";
import { reportError, reportHandled } from "../../../lib/report-error";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { AiMatchToggle } from "../components/ai-match-toggle";
import { SearchChatComposer } from "../components/search-chat-composer";
import { SearchMandatoryFilters } from "../components/search-mandatory-filters";
import { SearchResults } from "../components/search-results";
import { useAiMatchPreference } from "../hooks/use-ai-match-preference";
import { unrankedOutcome, useAiRerank } from "../hooks/use-ai-rerank";
import {
  advancedSearchFormSchema,
  type AdvancedSearchFormValues,
  DEFAULT_TOP_K,
  type RankedCandidate,
} from "../types/advanced-search";
import { buildRecruiterSearchPayload } from "../utils/advanced-search";
import type { CreateInteractionInput } from "@repo/schemas";

/**
 * Exponent of the rank→exposure power law logged alongside each interaction.
 * Kept in step with `POSITION_BIAS_ETA` in apps/training: the client records
 * what it believes the exposure was, and training is free to trust it or
 * recompute.
 */
const POSITION_BIAS_ETA = 0.8;

function rankExposureProbability(rank: number): number {
  return Math.min(1, Math.pow(1 / Math.max(rank, 1), POSITION_BIAS_ETA));
}

function createSearchSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AdvancedSearchPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  /*
   * The tone travels with the message. It used to be derived with
   * `feedbackMessage.startsWith("Email copied")`, which reads the English text
   * to decide whether a toast is a success — so the success case would have
   * rendered as an error the moment the string was translated.
   */
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [rankedResults, setRankedResults] = useState<RankedCandidate[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [lastSearchInput, setLastSearchInput] = useState<
    RecruiterSearchResponse["input"] | null
  >(null);
  // Identifies one page of results. Every interaction produced while looking at
  // it carries the same id, which is what lets training group a session together
  // and derive "examined but skipped" negatives from the ranks inside it.
  const [searchSessionId, setSearchSessionId] = useState<string | null>(null);
  const [rerankNotice, setRerankNotice] = useState<string | null>(null);

  const form = useForm<AdvancedSearchFormValues>({
    resolver: zodResolver(advancedSearchFormSchema),
    defaultValues: {
      chatPrompt: "",
      semanticSkills: [],
      semanticTitles: [],
      contractTypes: [],
      seniorityLevels: [],
      workModels: [],
      openToRelocation: { value: "any", label: t("common.any") },
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

  const { rerank, warmUp, isModelLoading } = useAiRerank();
  const { isAiMatchOn, isDeviceDecision, isTouchFirst, setIsAiMatchOn } =
    useAiMatchPreference();

  /*
   * Start fetching the reranker bundle as soon as the page mounts, so it is
   * already in memory by the time the first query is submitted — but ONLY when
   * AI Match is on.
   *
   * `warmUp()` is what instantiates the worker, and the worker is what pulls
   * ~1.39 MB of TensorFlow plus the model weights. On a phone that download and
   * the inference pass behind it heat the handset and can lock the page up, so
   * "load it and then skip the scoring" would still cost the user everything
   * the switch is meant to save. The guard has to sit here, before the worker
   * exists.
   */
  useEffect(() => {
    if (!isAiMatchOn) {
      return;
    }

    warmUp();
  }, [warmUp, isAiMatchOn]);

  const searchMutation = useMutation({
    mutationFn: async (
      input: ReturnType<typeof buildRecruiterSearchPayload>["payload"],
    ) => {
      const semanticResults = await searchRecruiterResumes(input);

      // Same guard as the warm-up: with AI Match off the worker is never
      // reached, so the model is never fetched. Results keep the API's own
      // similarity order.
      if (!isAiMatchOn) {
        return {
          outcome: unrankedOutcome(semanticResults.candidates),
          searchInput: semanticResults.input,
        };
      }

      // `rerank` no longer throws: a model or CDN failure comes back as
      // `degraded` with the API's own ordering intact, so one flaky asset load
      // can no longer wipe out 50 good candidates.
      const outcome = await rerank({
        candidates: semanticResults.candidates,
        semanticQuery: semanticResults.input.semanticQuery,
        filters: semanticResults.input.filters,
        semanticSkills: semanticResults.input.semanticSkills,
        semanticTitles: semanticResults.input.semanticTitles,
      });
      return { outcome, searchInput: semanticResults.input };
    },
    onSuccess: ({ outcome, searchInput }) => {
      setRankedResults(outcome.candidates);
      setLastSearchInput(searchInput);
      setSearchSessionId(createSearchSessionId());
      setRerankNotice(outcome.degraded ? t("search.rerankUnavailable") : null);
      // Distinguishes "no search has run" from "this search found nobody" —
      // one empty state used to serve both.
      setHasSearched(true);
    },
  });

  /**
   * Take the recruiter to the results once a search lands.
   *
   * The composer, two semantic selects and the mandatory-filters block together
   * overflow a phone viewport, so the results begin roughly 1000px below the
   * fold. Without this the page is pixel-identical before and after a
   * successful search and the only way to tell them apart is to scroll — which
   * is why a recruiter re-taps and pays for the same embedding, pgvector query
   * and on-device re-rank two or three times over.
   *
   * Keyed on the session id rather than on the results array, so two searches
   * that happen to return the same people still move the viewport, and so it
   * runs after the results have been committed rather than inside `onSuccess`.
   */
  useEffect(() => {
    if (!searchSessionId) {
      return;
    }

    const region = resultsRef.current;
    if (!region) {
      return;
    }

    // Focus first, scroll second: `focus()` would jump the page, and a smooth
    // scroll reads as movement rather than as a teleport.
    region.focus({ preventScroll: true });
    // Optional call — jsdom does not implement it and the test environment
    // must not turn a missing layout engine into a thrown error.
    region.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [searchSessionId]);

  const isBusy = searchMutation.isPending || isModelLoading;

  const onSearch = form.handleSubmit(async (values) => {
    const { payload, hasSemanticInput } = buildRecruiterSearchPayload({
      values,
      attachmentFile,
      topK: DEFAULT_TOP_K,
    });

    if (!hasSemanticInput) {
      setFeedback({ tone: "error", message: t("search.needsInput") });
      return;
    }

    setFeedback(null);

    try {
      await searchMutation.mutateAsync(payload);
    } catch (error) {
      reportError(error, {
        action: "search.run",
        // The query text itself is a recruiter's hiring intent — never sent.
        extra: { hasAttachment: Boolean(attachmentFile) },
      });
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : t("errors.searchFailed"),
      });
    }
  });

  /**
   * One place that writes a training signal.
   *
   * Only `EMAIL_COPY` was ever emitted before, so `CONTACT_CLICK`,
   * `PROFILE_VIEW` and `NOT_RELEVANT` existed end to end — schema, DB column,
   * training weight — with nothing on the producing side. The 0.35-weighted
   * PROFILE_VIEW branch in training was literally dead code.
   *
   * Exposure travels with every signal: the session, the candidate's 1-based
   * rank, the size of the result set, and the propensity that rank implies. That
   * is what the offline position-bias correction consumes.
   */
  const track = useCallback(
    (
      candidate: RankedCandidate,
      index: number,
      interactionType: CreateInteractionInput["interactionType"],
    ) => {
      const rank = index + 1;

      void trackInteraction({
        resumeId: candidate.resumeId,
        interactionType,
        queryText: lastSearchInput?.semanticQuery ?? null,
        semanticSimilarity: candidate.similarity,
        rankPosition: rank,
        displayedRank: rank,
        resultCount: rankedResults.length,
        searchSessionId,
        propensity: rankExposureProbability(rank),
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
          workExperiences: candidate.workExperiences,
        },
        querySnapshot: lastSearchInput ?? undefined,
      }).catch((error: unknown) => {
        // Tracking must never block, or degrade, the recruiter's workflow —
        // breadcrumb only, deliberately not an event.
        reportHandled(error, {
          action: "search.track-interaction",
          extra: { interactionType },
        });
      });
    },
    [lastSearchInput, rankedResults.length, searchSessionId],
  );

  /**
   * Copying an email is now a deliberate reveal, not a field read.
   *
   * Search listings return `email: null` for every candidate — the address left
   * the listing payload so a signed-up account can no longer page the whole
   * candidate base out of the product. `POST /resumes/:resumeId/contact` returns
   * one address, refuses candidates who are not open to work, and writes the
   * `CONTACT_CLICK` interaction itself. Because the server writes that row, this
   * handler deliberately does NOT `track()` anything: two rows for one click
   * would count as two preferences and saturate the candidate's training label.
   */
  const handleCopyEmail = useCallback(
    async (candidate: RankedCandidate, index: number) => {
      try {
        const contact = await revealCandidateContact(candidate.resumeId, {
          queryText: lastSearchInput?.semanticQuery,
          semanticSimilarity: candidate.similarity,
          rankPosition: index + 1,
          searchSessionId: searchSessionId ?? undefined,
        });

        await navigator.clipboard.writeText(contact.email);
        setFeedback({
          tone: "success",
          message: t("search.emailCopied", { email: contact.email }),
        });
      } catch (error) {
        reportError(error, {
          action: "search.reveal-contact",
          extra: { rankPosition: index + 1 },
        });
        setFeedback({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : t("search.contactUnavailable"),
        });
      }
    },
    [lastSearchInput, searchSessionId, t],
  );

  const handleViewProfile = useCallback(
    (candidate: RankedCandidate, index: number) => {
      track(candidate, index, "PROFILE_VIEW");
    },
    [track],
  );

  const handleNotRelevant = useCallback(
    (candidate: RankedCandidate, index: number) => {
      // The only explicit negative the product collects. Everything else is
      // inferred from absence, which is far too noisy to train on.
      track(candidate, index, "NOT_RELEVANT");
      setFeedback({
        tone: "success",
        message: t("search.markedNotRelevantToast", { name: candidate.name }),
      });
    },
    [track, t],
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

      <section className={`anim-fade-up p-4 sm:p-6 ${SURFACE}`}>
        <div className="flex items-center gap-3">
          <span className="anim-glow-pulse inline-flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-cyan-500 text-white">
            <FiActivity className="anim-float h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            {/* Matches the posts / settings / profile-layout page heroes —
                this is a top-level destination, not a section header. */}
            <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              {t("search.pageTitle")}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t("search.pageSubtitle")}
            </p>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            void onSearch(event);
          }}
          className="mt-5"
        >
          <SearchChatComposer
            control={control}
            register={register}
            errors={errors}
            isBusy={isBusy}
            attachmentFile={attachmentFile}
            onPickFile={() => fileInputRef.current?.click()}
            onRemoveFile={() => setAttachmentFile(null)}
          />

          {/* Sits with the search controls rather than in account settings: it
              is a decision about THIS device, taken at the moment the cost is
              about to be paid. */}
          <AiMatchToggle
            isOn={isAiMatchOn}
            isDeviceDecision={isDeviceDecision}
            isTouchFirst={isTouchFirst}
            onChange={setIsAiMatchOn}
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

        {feedback ? (
          <div className="mt-3">
            <FeedbackMessage tone={feedback.tone} message={feedback.message} />
          </div>
        ) : null}
      </section>

      <SearchResults
        ref={resultsRef}
        results={rankedResults}
        isBusy={isBusy}
        hasSearched={hasSearched}
        degradedNotice={rerankNotice}
        isAiMatchOn={isAiMatchOn}
        onCopyEmail={(candidate, index) => {
          void handleCopyEmail(candidate, index);
        }}
        onViewProfile={handleViewProfile}
        onNotRelevant={handleNotRelevant}
      />
    </main>
  );
}
