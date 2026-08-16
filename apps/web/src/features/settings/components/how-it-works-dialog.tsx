import { FiArrowDown, FiArrowRight, FiChevronDown } from "react-icons/fi";
import { Dialog } from "../../../shared-components/dialog";
import {
  FOCUS_RING,
  SURFACE_INSET,
} from "../../../shared-components/surface";
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

const NEVER_LEAVES: readonly string[] = [
  "Repository names",
  "Branch names",
  "Commit messages",
  "File paths",
  "Code",
  "Your employer",
  "Timestamps — dates only, so nothing publishes when you sleep",
];

function FlowPanel({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
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

export function HowItWorksDialog({ open, onOpenChange }: HowItWorksDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="How automatic posts work"
      description="Your work becomes a weekly post. Metadata only — never code, never names."
      contentClassName="max-w-2xl"
    >
      <div className="space-y-4">
        {/* The pipeline, in three panels. Stacks vertically on mobile. */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <FlowPanel
            title="Your machine"
            detail="Git metadata is read locally, by a tool you run. Code never leaves your machine."
          />
          <FlowArrow />
          <FlowPanel
            title="Sanitizer"
            detail="Names are hashed before upload; commit messages are never read at all."
          />
          <FlowArrow />
          <FlowPanel
            title="LinkHub"
            detail="Builds a weekly post from the counts. You approve it before anyone sees it."
          />
        </div>

        {/* Honest exception to the "read locally" story — webhook sources do
            hit the server, and saying so is cheaper than being caught not. */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          One exception: for GitHub/GitLab webhook sources, the forge POSTs
          event payloads to LinkHub&apos;s server, which extracts the counts
          and discards the payload — commit messages are never stored. Local
          sources never send them at all.
        </p>

        <DetailsGroup summary="Exactly what leaves your machine">
          <div className="space-y-3">
            <SnippetBlock
              snippet={{
                target: "One activity event — the entire upload, verbatim",
                language: "json",
                code: SAMPLE_PAYLOAD,
              }}
            />
            <div>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                What never leaves
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                {NEVER_LEAVES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </DetailsGroup>

        <DetailsGroup summary="Write bad commit messages? Doesn't matter.">
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              Digest posts never read your commit messages, branch names or
              file contents. The claims come from events — a change merged, a
              review submitted, a release shipped — and the technologies come
              from file types. A repository full of{" "}
              <code className="font-mono">fix stuff</code> produces exactly the
              same post as a repository full of conventional commits.
            </p>
            <p>
              Agent-written posts read your actual diffs at writing time, not
              your messages either. So there is nothing to fill in, no journal
              to keep and no habit to adopt: the pipeline is built to add zero
              work to your day.
            </p>
            <p>
              The one optional extra is the Claude Code hook&apos;s agent
              summary — the agent&apos;s own description of the task, capped at
              300 characters and off unless you turn it on.
            </p>
          </div>
        </DetailsGroup>

        <DetailsGroup summary="Can this hurt you? What's the catch?">
          <ul className="list-disc space-y-1.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
            <li>
              Nothing publishes without you. Posts arrive in your review queue
              and stay there until you approve them, unless you explicitly turn
              auto-posting on.
            </li>
            <li>
              Every machine-written post is deletable, and disconnecting a
              source stops it that second — no notice period, no export.
            </li>
            <li>
              Employer, client, repository and teammate names are blocked on
              our servers, not by a promise a model makes. A post naming a
              blocked term is rejected outright.
            </li>
            <li>
              Machine posts are immutable once created: you can attach a link,
              but nobody — not you, not us — can edit the text. That is what
              makes them worth trusting to a recruiter.
            </li>
            <li>
              The honest catch: work activity on an employer&apos;s machine is
              still their policy call, not ours — see &ldquo;Why your employer
              is safe&rdquo; below.
            </li>
          </ul>
        </DetailsGroup>

        <DetailsGroup summary="What is enforced vs. what is guidance">
          <EnforcementGrid />
        </DetailsGroup>

        <DetailsGroup summary="Same week of commits, two very different posts">
          <ExamplePostsGrid />
        </DetailsGroup>

        <div className={`p-3 ${SURFACE_INSET}`}>
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Why your employer is safe
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            For local sources, reading happens on your machine — there is no
            org OAuth, no app installed on company infrastructure, and nothing
            for an admin to approve or audit. Webhook sources are the
            exception: the forge sends event payloads to LinkHub&apos;s server,
            which keeps only the extracted counts. Work sources are held to
            your disclosure level server-side, and review-before-publish is
            the default, so nothing goes out unread. One thing we can&apos;t do
            for you: check your company&apos;s tooling policy — do that before
            pointing any of this at a work machine.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
