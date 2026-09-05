type FeedbackTone = "error" | "success";

type FeedbackMessageProps = Readonly<{
  message: string;
  tone: FeedbackTone;
}>;

const toneClasses: Record<FeedbackTone, string> = {
  error:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
};

export function FeedbackMessage({ message, tone }: FeedbackMessageProps) {
  // Errors interrupt (assertive); confirmations wait their turn (polite).
  // Without a live region a screen-reader user submitting a bad form hears
  // nothing at all.
  const isError = tone === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`rounded-md border p-2 text-sm ${toneClasses[tone]}`}
    >
      {message}
    </p>
  );
}
