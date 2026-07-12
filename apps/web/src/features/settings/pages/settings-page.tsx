import type { ApiToken, CreateApiTokenOutput } from "@repo/schemas";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FiKey, FiPlus, FiTrash2 } from "react-icons/fi";
import { getAuthTokens } from "../../../lib/auth-tokens";
import { useMyTokens, useRevokeToken } from "../../../lib/token-queries";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { ConnectPanel } from "../components/connect-panel";
import { CreateTokenDialog } from "../components/create-token-dialog";
import {
  formatDate,
  formatLastUsed,
  getTokenStatus,
  maskTokenPrefix,
} from "../lib/token-format";

function StatusBadge({ token }: { token: ApiToken }) {
  const status = getTokenStatus(token);
  const styles: Record<typeof status, string> = {
    active:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    revoked: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
    expired:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
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
        "anim-fade-up rounded-2xl border border-zinc-200 bg-white/70 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50",
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
          <code className="block font-mono text-xs text-zinc-500 dark:text-zinc-400">
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
            disabled={isRevoking}
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

export function SettingsPage() {
  const navigate = useNavigate();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreateApiTokenOutput | null>(
    null,
  );

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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Loading tokens...
          </p>
        ) : tokensQuery.isError ? (
          <p className="text-sm text-red-600">
            Could not load your tokens. Please try again.
          </p>
        ) : tokens.length === 0 ? (
          <div className="anim-fade-up rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You don&apos;t have any tokens yet. Create one to let your AI tools
              post to LinkHub.
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
                isRevoking={revokeToken.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      <ConnectPanel token={lastCreated?.token ?? null} />

      <CreateTokenDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          // Don't persist the one-time plaintext token on the page after the
          // dialog closes — the ConnectPanel falls back to its placeholder.
          if (!open) {
            setLastCreated(null);
          }
        }}
        onCreated={setLastCreated}
      />
    </main>
  );
}
