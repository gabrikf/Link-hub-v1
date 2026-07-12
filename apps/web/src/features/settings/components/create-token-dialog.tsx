import type { ApiTokenScope, CreateApiTokenOutput } from "@repo/schemas";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheck, FiCopy } from "react-icons/fi";
import { useCreateToken } from "../../../lib/token-queries";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import { useClipboard } from "../lib/use-clipboard";

const AVAILABLE_SCOPES: Array<{ value: ApiTokenScope; description: string }> = [
  { value: "posts:write", description: "Create and update posts" },
  { value: "posts:read", description: "Read your posts" },
];

const DEFAULT_SCOPES: ApiTokenScope[] = ["posts:write", "posts:read"];

type CreateTokenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: CreateApiTokenOutput) => void;
};

export function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTokenDialogProps) {
  const createToken = useCreateToken();
  const { copied, copy } = useClipboard();

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(DEFAULT_SCOPES);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateApiTokenOutput | null>(null);

  // Reset all local state whenever the dialog is fully closed so the next open
  // starts clean (and never re-shows a previously created plaintext token).
  useEffect(() => {
    if (!open) {
      const timeout = window.setTimeout(() => {
        setName("");
        setScopes(DEFAULT_SCOPES);
        setExpiresAt("");
        setError(null);
        setCreated(null);
        createToken.reset();
      }, 150);
      return () => window.clearTimeout(timeout);
    }
  }, [open, createToken]);

  const toggleScope = (value: ApiTokenScope) => {
    setScopes((current) =>
      current.includes(value)
        ? current.filter((scope) => scope !== value)
        : [...current, value],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError("Give your token a name so you can recognize it later.");
      return;
    }

    try {
      const result = await createToken.mutateAsync({
        name: name.trim(),
        scopes: scopes.length > 0 ? scopes : DEFAULT_SCOPES,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });
      setCreated(result);
      onCreated(result);
    } catch {
      setError("Could not create the token. Please try again.");
    }
  };

  if (created) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Token created"
        contentClassName="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <FiAlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Copy it now — you won&apos;t see it again. This is the only time
              the full token is shown.
            </span>
          </div>

          <div>
            <p className="mb-1 text-sm text-zinc-700 dark:text-zinc-300">
              Your personal access token
            </p>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                {created.token}
              </code>
              <Button
                type="button"
                variant={copied ? "soft" : "primary"}
                fullWidth={false}
                className="shrink-0"
                onClick={() => copy(created.token)}
              >
                {copied ? (
                  <FiCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <FiCopy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Use it as <code className="font-mono">LINKHUB_API_TOKEN</code> in
            your AI tool config below. Once you close this dialog it can never be
            retrieved again — you&apos;ll have to create a new one.
          </p>

          <div className="flex justify-end">
            <Button
              type="button"
              fullWidth={false}
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create personal access token"
      description="Tokens let your AI coding tools post to LinkHub on your behalf."
      contentClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="token-name"
          label="Name"
          placeholder="e.g. Claude Desktop, work laptop"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />

        <div>
          <p className="mb-1.5 block text-sm text-zinc-700 dark:text-zinc-300">
            Scopes
          </p>
          <div className="space-y-2">
            {AVAILABLE_SCOPES.map((scope) => (
              <label
                key={scope.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-violet-600"
                  checked={scopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                />
                <span className="min-w-0">
                  <code className="font-mono text-sm text-zinc-900 dark:text-zinc-100">
                    {scope.value}
                  </code>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {scope.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <Input
          id="token-expires"
          label="Expiry (optional)"
          type="date"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <RadixDialog.Close asChild>
            <Button type="button" variant="outline" fullWidth={false}>
              Cancel
            </Button>
          </RadixDialog.Close>
          <Button
            type="submit"
            fullWidth={false}
            disabled={createToken.isPending}
          >
            {createToken.isPending ? "Creating..." : "Create token"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
