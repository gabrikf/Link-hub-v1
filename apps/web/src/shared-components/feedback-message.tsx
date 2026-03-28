type FeedbackTone = "error" | "success";

type FeedbackMessageProps = {
  message: string;
  tone: FeedbackTone;
};

const toneClasses: Record<FeedbackTone, string> = {
  error: "border-red-300 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function FeedbackMessage({ message, tone }: FeedbackMessageProps) {
  return (
    <p className={`rounded-md border p-2 text-sm ${toneClasses[tone]}`}>
      {message}
    </p>
  );
}
