import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { FiCopy, FiGlobe, FiMapPin, FiTarget, FiUser } from "react-icons/fi";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import type { RankedCandidate } from "../types/advanced-search";
import { formatAiMatchPercent } from "../utils/advanced-search";

type CandidateCardProps = {
  candidate: RankedCandidate;
  index: number;
  onCopyEmail: (candidate: RankedCandidate, index: number) => void;
};

const CandidateCard = memo(function CandidateCard({
  candidate,
  index,
  onCopyEmail,
}: CandidateCardProps) {
  const aiMatchPercent = formatAiMatchPercent(candidate.aiScore);

  return (
    <article className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Avatar
              name={candidate.name}
              imageUrl={candidate.userPhoto}
              size={40}
            />
            <div className="min-w-0">
              <Link
                to="/profile/$username"
                params={{ username: candidate.username }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
              >
                <FiUser className="h-4 w-4" aria-hidden="true" />
                {candidate.name}
              </Link>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                @{candidate.username}
              </p>
            </div>
          </div>

          <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {candidate.headlineTitle ?? "Candidate without headline"}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {candidate.summary ??
              candidate.profileDescription ??
              "No summary provided"}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          fullWidth={false}
          onClick={() => onCopyEmail(candidate, index)}
        >
          <FiCopy className="h-4 w-4" aria-hidden="true" />
          Copy Email
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          AI Match {aiMatchPercent}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          <FiTarget className="h-3.5 w-3.5" aria-hidden="true" />
          Similarity {candidate.similarity.toFixed(3)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          XP {candidate.totalYearsExperience ?? 0}y
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          <FiMapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {candidate.location ?? "Unknown location"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          {candidate.seniorityLevel ?? "seniority n/a"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          {candidate.workModel ?? "work model n/a"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          {candidate.contractType ?? "contract n/a"}
        </span>
        {candidate.noticePeriod ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
            Notice: {candidate.noticePeriod}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
          Relocation {candidate.openToRelocation ? "yes" : "no"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800/60">
          <p className="font-semibold">Skills</p>
          <p className="mt-1 line-clamp-2">
            {candidate.skills.length > 0
              ? candidate.skills.join(", ")
              : "No skills listed"}
          </p>
        </div>

        <div className="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800/60">
          <p className="font-semibold">Titles</p>
          <p className="mt-1 line-clamp-2">
            {candidate.titles.length > 0
              ? candidate.titles.join(", ")
              : "No titles listed"}
          </p>
        </div>

        <div className="rounded-lg bg-zinc-50 px-2 py-2 dark:bg-zinc-800/60 sm:col-span-2">
          <p className="inline-flex items-center gap-1 font-semibold">
            <FiGlobe className="h-3.5 w-3.5" aria-hidden="true" />
            Languages
          </p>
          <p className="mt-1 line-clamp-2">
            {candidate.spokenLanguages.length > 0
              ? candidate.spokenLanguages.join(", ")
              : "No languages listed"}
          </p>
        </div>
      </div>
    </article>
  );
});

type SearchResultsProps = {
  results: RankedCandidate[];
  isBusy: boolean;
  onCopyEmail: (candidate: RankedCandidate, index: number) => void;
};

export function SearchResults({
  results,
  isBusy,
  onCopyEmail,
}: SearchResultsProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Results</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {results.length} candidates re-ranked locally
        </p>
      </header>

      <div className="grid gap-3">
        {results.map((candidate, index) => (
          <CandidateCard
            key={candidate.resumeId}
            candidate={candidate}
            index={index}
            onCopyEmail={onCopyEmail}
          />
        ))}

        {!isBusy && results.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No results yet. Write in the chat box or upload a file to start.
          </p>
        ) : null}
      </div>
    </section>
  );
}
