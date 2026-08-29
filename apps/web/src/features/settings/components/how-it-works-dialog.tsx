import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import { FiArrowDown, FiArrowRight, FiChevronDown } from "react-icons/fi";
import { Dialog } from "../../../shared-components/dialog";
import { FOCUS_RING, SURFACE_INSET } from "../../../shared-components/surface";
import { EnforcementGrid, ExamplePostsGrid } from "./safety-explainers";
import { SnippetBlock } from "./snippet-block";

/**
 * The full trust story, hidden until asked for. Progressive disclosure on
 * purpose: the summary sentences are readable in one screen, and every deeper
 * layer sits behind a `<details>` the user opens because they wanted it.
 */

/**
 * A REAL payload, shaped exactly like `ingestActivityEventSchemaInput` in
 * `@repo/schemas` — this is the strongest claim on the page, so it must stay
 * true to the schema, not to marketing.
 */
const SAMPLE_PAYLOAD = JSON.stringify(
  {
    externalDeliveryId:
      "sha256:2f4d5e6a71c88b09d3a1e5f60718293a4b5c6d7e8f9012a3b4c5d6e7f8091a2b",
    kind: "commit",
    occurredOn: "2026-08-10",
    repoFingerprint:
      "9f2c31a8d4e5b6c7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f",
    technologies: ["typescript", "react"],
    actorIsOwner: true,
    counterpartyFingerprints: [],
    payload: { changedFiles: 7 },
  },
  null,
  2,
);

const getNeverLeaves = (t: TFunction): readonly string[] => [
  t("settings.how.repositoryNames"),
  t("settings.how.branchNames"),
  t("settings.how.commitMessages"),
  t("settings.how.filePaths"),
  t("settings.how.code"),
  t("settings.how.yourEmployer"),
  t("settings.how.timestamps"),
];

function FlowPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={`flex-1 p-3 ${SURFACE_INSET}`}>
      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{detail}</p>
    </div>
  );
}

/** Arrow between flow panels: right on desktop, down when stacked. */
function FlowArrow() {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center text-zinc-400"
    >
      <FiArrowDown className="h-4 w-4 sm:hidden" />
      <FiArrowRight className="hidden h-4 w-4 sm:block" />
    </span>
  );
}

function DetailsGroup({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
      >
        {summary}
        <FiChevronDown
          className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

type HowItWorksDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function HowItWorksDialog({
  open,
  onOpenChange,
}: HowItWorksDialogProps) {
  const { t } = useTranslation();
  const neverLeaves = getNeverLeaves(t);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.how.title")}
      description={t("settings.automaticPostsSubtitle")}
      contentClassName="max-w-2xl"
    >
      <div className="space-y-4">
        {/* The pipeline, in three panels. Stacks vertically on mobile. */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <FlowPanel
            title={t("settings.how.yourMachine")}
            detail={t("settings.how.yourMachineBody")}
          />
          <FlowArrow />
          <FlowPanel
            title={t("settings.how.sanitizer")}
            detail={t("settings.how.sanitizerBody")}
          />
          <FlowArrow />
          <FlowPanel
            title={t("common.brandName")}
            detail={t("settings.how.crafthubBody")}
          />
        </div>

        {/* Honest exception to the "read locally" story — webhook sources do
            hit the server, and saying so is cheaper than being caught not. */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("settings.how.webhookException")}
        </p>

        <DetailsGroup summary={t("settings.how.exactlyWhatLeaves")}>
          <div className="space-y-3">
            <SnippetBlock
              snippet={{
                target: t("settings.how.oneEventVerbatim"),
                language: "json",
                code: SAMPLE_PAYLOAD,
              }}
            />
            <div>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {t("settings.how.whatNeverLeaves")}
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                {neverLeaves.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </DetailsGroup>

        <DetailsGroup summary={t("settings.how.badCommitsTitle")}>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              <Trans
                i18nKey="settings.how.badCommitsBody"
                components={{ code: <code className="font-mono" /> }}
              />
            </p>
            <p>{t("settings.how.agentDiffs")}</p>
            <p>{t("settings.how.agentSummaryExtra")}</p>
          </div>
        </DetailsGroup>

        <DetailsGroup summary={t("settings.how.catchTitle")}>
          <ul className="list-disc space-y-1.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
            <li>{t("settings.how.catchNothingPublishes")}</li>
            <li>{t("settings.how.catchDeletable")}</li>
            <li>{t("settings.how.catchBlocked")}</li>
            <li>{t("settings.how.catchImmutable")}</li>
            <li>{t("settings.how.catchHonest")}</li>
          </ul>
        </DetailsGroup>

        <DetailsGroup summary={t("settings.how.enforcedVsGuidance")}>
          <EnforcementGrid />
        </DetailsGroup>

        <DetailsGroup summary={t("settings.connect.twoPosts")}>
          <ExamplePostsGrid />
        </DetailsGroup>

        <div className={`p-3 ${SURFACE_INSET}`}>
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {t("settings.how.employerSafe")}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {t("settings.how.employerSafeBody")}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
