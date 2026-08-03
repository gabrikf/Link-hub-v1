import type { ApiToken, CreateApiTokenOutput } from "@repo/schemas";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FiKey, FiPlus, FiTrash2 } from "react-icons/fi";
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
  SURFACE_EMPTY,
  SURFACE_GLASS,
} from "../../../shared-components/surface";
import { ConnectPanel } from "../components/connect-panel";
import { DisclosurePanel } from "../components/disclosure-panel";
import { CONNECT_PANEL_ID } from "../lib/mcp-config";
import { CreateTokenDialog } from "../components/create-token-dialog";
import {
  formatDate,
  formatLastUsed,
  getTokenStatus,
  maskTokenPrefix,
} from "../lib/token-format";

/**
 * Survives a route change within the tab, but never a reload — matching the
 * one-time nature of the plaintext token itself.
 */
const STASHED_TOKEN_KEY = "linkhub:last-created-token";

function readStashedToken(): CreateApiTokenOutput | null {
  try {
    const raw = window.sessionStorage.getItem(STASHED_TOKEN_KEY);
    return raw ? (JSON.parse(raw) as CreateApiTokenOutput) : null;
  } catch {
    return null;
  }
}

function stashToken(token: CreateApiTokenOutput): void {
  try {
    window.sessionStorage.setItem(STASHED_TOKEN_KEY, JSON.stringify(token));
  } catch {
    // Private mode / quota. The in-memory copy still drives this session.
  }
}

function StatusBadge({ token }: { token: ApiToken }) {
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
    active: "Active",
    revoked: "Revoked",
    expired: "Expired",
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
              <dt>Created</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {formatDate(token.createdAt)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>Last used</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {formatLastUsed(token.lastUsedAt)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>Expires</dt>
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
            loadingLabel="Revoking..."
            shouldHaveConfirmation
            confirmationTitle="Revoke this token?"
            confirmationDescription="Any tool using this token will immediately lose access. This cannot be undone."
            onClick={() => onRevoke(token.id)}
          >
            <FiTrash2 className="h-4 w-4" aria-hidden="true" />
            Revoke
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
  return (
    <>
      <LoadingLabel>Loading tokens</LoadingLabel>
      <ul className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <TokenRowSkeleton key={index} />
        ))}
      </ul>
    </>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [dialogOpen, setDialogOpen] = useState(false);
  // Seeded from sessionStorage so navigating to another page and back does not
  // strand the user with a token they can no longer read. It was plain
  // component state, so every snippet silently reverted to the `lh_pat_xxxx`
  // placeholder and the only recovery was creating a second token — orphaning
  // the first. Session-scoped deliberately: it must still die with the tab.
  const [lastCreated, setLastCreated] = useState<CreateApiTokenOutput | null>(
    readStashedToken,
  );

  const handleTokenCreated = (token: CreateApiTokenOutput) => {
    setLastCreated(token);
    stashToken(token);

    // The Create button is in the header; the panel that consumes the token is
    // at the very bottom, under a potentially long token list. Nothing
    // connected the two, so the pre-filled snippets were easy to never see.
    window.requestAnimationFrame(() => {
      document
        .getElementById(CONNECT_PANEL_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (!hasSession) {
      navigate({ to: "/" });
    }
  }, [hasSession, navigate]);

  const tokensQuery = useMyTokens(hasSession);
  const revokeToken = useRevokeToken();

  const tokens = tokensQuery.data ?? [];

  const handleRevoke = (id: string) => {
    revokeToken.mutate(id);
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

      <header className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            Settings
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage personal access tokens and connect your AI coding tools to
            LinkHub.
          </p>
        </div>
        <Button
          type="button"
          fullWidth={false}
          className="rounded-full"
          onClick={() => setDialogOpen(true)}
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          Create token
        </Button>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FiKey
            className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Personal access tokens
          </h2>
        </div>

        {tokensQuery.isLoading ? (
          <TokenListSkeleton />
        ) : tokensQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Could not load your tokens. Please try again.
          </p>
        ) : tokens.length === 0 ? (
          <div className={`anim-fade-up p-10 text-center ${SURFACE_EMPTY}`}>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You don&apos;t have any tokens yet. Create one to let your AI
              tools post to LinkHub.
            </p>
            <Button
              type="button"
              variant="soft"
              fullWidth={false}
              className="mt-4 rounded-full"
              onClick={() => setDialogOpen(true)}
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
              Create your first token
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onRevoke={handleRevoke}
                // Scoped to the row actually being revoked. `isPending` alone
                // is mutation-wide, so it used to freeze (and would now spin)
                // every Revoke button on the page at once.
                isRevoking={
                  revokeToken.isPending && revokeToken.variables === token.id
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Above the connect panel on purpose: the privacy contract is what the
          user should decide BEFORE they hand a token to an agent, not after. */}
      <DisclosurePanel enabled={hasSession} />

      <ConnectPanel token={lastCreated?.token ?? null} />

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
    </main>
  );
}
