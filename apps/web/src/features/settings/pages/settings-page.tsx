import type { ApiToken, CreateApiTokenOutput, GitConnection } from "@repo/schemas";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FiChevronDown,
  FiHelpCircle,
  FiKey,
  FiPlus,
  FiSliders,
  FiTrash2,
  FiZap,
} from "react-icons/fi";
import { getAuthTokens } from "../../../lib/auth-tokens";
import { useMyTokens, useRevokeToken } from "../../../lib/token-queries";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import {
  LoadingLabel,
  Skeleton,
} from "../../../shared-components/skeleton";
import {
  BADGE,
  FOCUS_RING,
  SURFACE_EMPTY,
  SURFACE_GLASS,
} from "../../../shared-components/surface";
import { AutoPostWizard } from "../components/auto-post-wizard/auto-post-wizard";
import { ConnectPanel } from "../components/connect-panel";
import { ConnectionsPanel } from "../components/connections-panel";
import { DisclosurePanel } from "../components/disclosure-panel";
import { HowItWorksDialog } from "../components/how-it-works-dialog";
import { CONNECT_PANEL_ID } from "../lib/mcp-config";
import { CreateTokenDialog } from "../components/create-token-dialog";
import { listenForAnchorClicks, revealAndScrollTo } from "../lib/reveal-anchor";
import {
  formatDate,
  formatLastUsed,
  getTokenStatus,
  maskTokenPrefix,
} from "../lib/token-format";
// Shared with the wizard's inline token block, so a PAT minted mid-wizard is
// recoverable here after the dialog closes. See `lib/token-stash.ts` for why
// sessionStorage is the right lifetime.
import { readStashedToken, stashToken } from "../lib/token-stash";

function StatusBadge({ token }: { token: ApiToken }) {
  const { t } = useTranslation();
  const status = getTokenStatus(token);
  // Shared `BADGE` tones — these were a third private definition of
  // success/warning/neutral, so "Active" here and "Current" on a work-history
  // row rendered as different greens in dark mode.
  const styles: Record<typeof status, string> = {
    active: BADGE.success,
    revoked: BADGE.neutral,
    expired: BADGE.warning,
  };
  const label: Record<typeof status, string> = {
    active: t("settings.token.active"),
    revoked: t("settings.token.revoked"),
    expired: t("settings.token.expired"),
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {label[status]}
    </span>
  );
}

function TokenRow({
  token,
  onRevoke,
  isRevoking,
}: {
  token: ApiToken;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}) {
  const { t } = useTranslation();
  const isInactive = Boolean(token.revokedAt);
  return (
    <li
      className={[
        `anim-fade-up p-4 ${SURFACE_GLASS}`,
        isInactive ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {token.name}
            </span>
            <StatusBadge token={token} />
          </div>
          <code className="block font-mono text-xs break-all text-zinc-500 dark:text-zinc-400">
            {maskTokenPrefix(token.tokenPrefix)}
          </code>
          <div className="flex flex-wrap gap-1.5">
            {token.scopes.map((scope) => (
              <span
                key={scope}
                className="rounded-md bg-violet-100 px-1.5 py-0.5 font-mono text-xs text-violet-800 dark:bg-violet-500/15 dark:text-violet-200"
              >
                {scope}
              </span>
            ))}
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex gap-1">
              <dt>{t("settings.token.created")}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {formatDate(token.createdAt)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("settings.token.lastUsed")}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {formatLastUsed(token.lastUsedAt, t)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("settings.token.expires")}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {formatDate(token.expiresAt)}
              </dd>
            </div>
          </dl>
        </div>

        {!isInactive ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            fullWidth={false}
            className="shrink-0"
            isLoading={isRevoking}
            loadingLabel={t("settings.token.revoking")}
            shouldHaveConfirmation
            confirmationTitle={t("settings.token.revokeTitle")}
            confirmationDescription={t("settings.token.revokeBody")}
            onClick={() => onRevoke(token.id)}
          >
            <FiTrash2 className="h-4 w-4" aria-hidden="true" />
            {t("settings.token.revoke")}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Stand-in for a single `<TokenRow>`.
 *
 * Same `<li>` chrome and `p-4`, same `space-y-1.5` left column (name + status
 * badge → masked prefix → scope chips → the created/last-used/expires `<dl>`)
 * and the same `h-9` Revoke button on the right, so the list keeps its height
 * when the query resolves.
 */
function TokenRowSkeleton() {
  return (
    <li className={`p-4 ${SURFACE_GLASS}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {/* token name + status badge */}
          <div className="flex h-6 flex-wrap items-center gap-2">
            <Skeleton shape="text" height={14} width={132} />
            <Skeleton shape="circle" height={20} width={56} />
          </div>

          {/* masked `lh_pat_…` prefix */}
          <div className="flex h-4 items-center">
            <Skeleton shape="text" height={12} width={168} />
          </div>

          {/* scope chips */}
          <div className="flex flex-wrap gap-1.5">
            <Skeleton height={20} width={86} className="rounded-md" />
            <Skeleton height={20} width={78} className="rounded-md" />
          </div>

          {/* Created / Last used / Expires */}
          <div className="pt-0.5">
            <div className="flex h-4 flex-wrap items-center gap-x-5">
              <Skeleton shape="text" height={11} width={112} />
              <Skeleton shape="text" height={11} width={126} />
              <Skeleton shape="text" height={11} width={104} />
            </div>
          </div>
        </div>

        <Skeleton height={36} width={104} className="shrink-0 rounded-md" />
      </div>
    </li>
  );
}

function TokenListSkeleton() {
  const { t } = useTranslation();
  return (
    <>
      <LoadingLabel>{t("settings.token.loading")}</LoadingLabel>
      <ul className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <TokenRowSkeleton key={index} />
        ))}
      </ul>
    </>
  );
}

/** Scroll/anchor target for the collapsed advanced area. */
export const ADVANCED_SETTINGS_ID = "advanced-settings";

export function SettingsPage() {
  const { t } = useTranslation();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  // The connection a "Finish setup" click resumes into — the wizard opens at
  // its Verify step. Null means a fresh run starting at Source.
  const [wizardResume, setWizardResume] = useState<GitConnection | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  // Seeded from sessionStorage so navigating to another page and back does not
  // strand the user with a token they can no longer read. It was plain
  // component state, so every snippet silently reverted to the `lh_pat_xxxx`
  // placeholder and the only recovery was creating a second token — orphaning
  // the first. Session-scoped deliberately: it must still die with the tab.
  const [lastCreated, setLastCreated] = useState<CreateApiTokenOutput | null>(
    readStashedToken,
  );
  /** Revoked tokens are history, not inventory — opt in to seeing them. */
  const [showRevoked, setShowRevoked] = useState(false);

  const handleTokenCreated = (token: CreateApiTokenOutput) => {
    setLastCreated(token);
    stashToken(token);

    // The panel that consumes the token lives inside a collapsed disclosure,
    // and scrolling to a closed `<details>` moves nothing — so open it on the
    // way. Without this the pre-filled snippets were easy to never see.
    window.requestAnimationFrame(() => {
      revealAndScrollTo(CONNECT_PANEL_ID);
    });
  };

  // Same reason, for the links the panels point at each other with: the
  // disclosure panel now sits inside the collapsed advanced area.
  useEffect(() => listenForAnchorClicks(), []);

  const tokensQuery = useMyTokens(hasSession);
  const revokeToken = useRevokeToken();

  const tokens = tokensQuery.data ?? [];
  const activeTokens = tokens.filter((token) => !token.revokedAt);
  const revokedTokens = tokens.filter((token) => Boolean(token.revokedAt));
  const visibleTokens = showRevoked
    ? [...activeTokens, ...revokedTokens]
    : activeTokens;

  const handleRevoke = (id: string) => {
    revokeToken.mutate(id);
  };

  const openWizard = () => {
    setWizardResume(null);
    setWizardOpen(true);
  };

  const openWizardAtVerify = (connection: GitConnection) => {
    setWizardResume(connection);
    setWizardOpen(true);
  };

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 lg:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_65%)]" />
        <div className="anim-float absolute -top-20 right-10 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <header className="anim-fade-up space-y-1">
        <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
          {t("nav.settings")}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("settings.connectSubtitle")}
        </p>
      </header>

      {/* One unified section instead of the old stacked trio with competing
          headlines. The wizard is the primary path; the connection rows sit
          under the same header; the full MCP manual lives in a collapsed
          disclosure for power users. */}
      <section className={`anim-fade-up p-5 sm:p-6 ${SURFACE_GLASS}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              <FiZap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {t("settings.automaticPosts")}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {t("settings.automaticPostsSubtitle")}
              </p>
            </div>
          </div>
          {/* `w-full` under sm: two buttons cannot shrink, and `shrink-0` on a
              flex item inside a 375px row pushed the whole page wider than the
              viewport (see connections-panel.tsx for the same fix). Full width
              lets them wrap inside the viewport; desktop keeps the old
              right-aligned row. */}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
            <Button
              type="button"
              variant="ghost"
              fullWidth={false}
              className="rounded-full"
              onClick={() => setHowItWorksOpen(true)}
            >
              <FiHelpCircle className="h-4 w-4" aria-hidden="true" />
              {t("settings.howThisWorks")}
            </Button>
            <Button
              type="button"
              fullWidth={false}
              className="rounded-full"
              onClick={openWizard}
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
              {t("settings.addSource")}
            </Button>
          </div>
        </div>

        <ConnectionsPanel
          enabled={hasSession}
          embedded
          onAddSource={openWizard}
          onFinishSetup={openWizardAtVerify}
          // Lets the panel re-read the stashed one-time secret when the wizard
          // closes — the wizard promises the panel resurfaces it.
          wizardOpen={wizardOpen}
        />

        {/* The complete MCP manual, demoted but intact: the wizard is the
            guided path, this is everything for people who read config files
            for fun. */}
        <details className="group mt-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <summary
            className={`flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
          >
            {t("settings.manualSetup")}
            <FiChevronDown
              className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-3">
            <ConnectPanel token={lastCreated?.token ?? null} />
          </div>
        </details>
      </section>

      {/* Everything most people never open, in one place instead of two
          full-height sections above the thing they came for. Collapsed, not
          removed, and not a separate route: the links between these panels and
          the connect snippets are same-page anchors, which `revealAnchorTarget`
          keeps working by opening this element before scrolling. */}
      <details
        id={ADVANCED_SETTINGS_ID}
        className={`anim-fade-up group p-5 sm:p-6 ${SURFACE_GLASS}`}
      >
        <summary
          className={`flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
        >
          <FiSliders className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("settings.advanced")}
          {/* Named contents, or a collapsed disclosure is just a mystery box. */}
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {t("settings.advancedSubtitle")}
          </span>
          <FiChevronDown
            className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="mt-4 space-y-6">
          {/*
           * Why these controls exist, said once, where they now live.
           *
           * The disclosure level is not decoration: the server rejects a post
           * that violates it. Demoting it behind a disclosure without saying
           * that would read as "we hid the useless stuff".
           */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("settings.advancedHelp")}
          </p>

          <DisclosurePanel enabled={hasSession} />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FiKey
                  className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t("settings.token.sectionTitle")}
                </h2>
              </div>
              {/* Moved off the page header: the wizard mints the token each
                  flow needs inline, so creating one by hand is the exception,
                  and it belongs next to the list it lands in. */}
              <Button
                type="button"
                variant="soft"
                size="sm"
                fullWidth={false}
                className="rounded-full"
                onClick={() => setDialogOpen(true)}
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" />
                {t("settings.token.create")}
              </Button>
            </div>

            {tokensQuery.isLoading ? (
              <TokenListSkeleton />
            ) : tokensQuery.isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {t("settings.token.loadFailed")}
              </p>
            ) : (
              <>
                {activeTokens.length === 0 ? (
                  <div
                    className={`anim-fade-up p-10 text-center ${SURFACE_EMPTY}`}
                  >
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {revokedTokens.length > 0
                        ? // Saying "no tokens yet" here would be a lie the
                          // user can disprove — they created every one of
                          // these and revoked them.
                          t("settings.token.allRevoked")
                        : t("settings.token.empty")}
                    </p>
                    <Button
                      type="button"
                      variant="soft"
                      fullWidth={false}
                      className="mt-4 rounded-full"
                      onClick={() => setDialogOpen(true)}
                    >
                      <FiPlus className="h-4 w-4" aria-hidden="true" />
                      {revokedTokens.length > 0
                        ? t("settings.token.createArticle")
                        : t("settings.token.createFirst")}
                    </Button>
                  </div>
                ) : null}

                {visibleTokens.length > 0 ? (
                  <ul className="space-y-3">
                    {visibleTokens.map((token) => (
                      <TokenRow
                        key={token.id}
                        token={token}
                        onRevoke={handleRevoke}
                        // Scoped to the row actually being revoked.
                        // `isPending` alone is mutation-wide, so it used to
                        // freeze (and would now spin) every Revoke button on
                        // the page at once.
                        isRevoking={
                          revokeToken.isPending &&
                          revokeToken.variables === token.id
                        }
                      />
                    ))}
                  </ul>
                ) : null}

                {revokedTokens.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    onClick={() => setShowRevoked((value) => !value)}
                  >
                    {showRevoked
                      ? t("settings.token.hideRevoked")
                      : t("settings.token.showRevoked", {
                          count: revokedTokens.length,
                        })}
                  </Button>
                ) : null}
              </>
            )}
          </section>
        </div>
      </details>

      <CreateTokenDialog
        open={dialogOpen}
        // Deliberately does NOT clear `lastCreated` on close: the plaintext
        // token is shown exactly once, and the whole point of the connect
        // snippets is to paste it into a config. Wiping it the moment the
        // dialog is dismissed silently reverted every snippet to the
        // `lh_pat_xxxx` placeholder, stranding the user with a token they can
        // no longer read. It lives in component state only — it is never
        // persisted, and a reload drops it.
        onOpenChange={setDialogOpen}
        onCreated={handleTokenCreated}
      />

      <AutoPostWizard
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) {
            setWizardResume(null);
            // A PAT minted inside the wizard is stashed, not lifted — pick it
            // up here so the manual-setup snippets below carry it after close.
            const stashed = readStashedToken();
            if (stashed) {
              setLastCreated(stashed);
            }
          }
        }}
        resumeConnection={wizardResume}
      />

      <HowItWorksDialog
        open={howItWorksOpen}
        onOpenChange={setHowItWorksOpen}
      />
    </main>
  );
}
