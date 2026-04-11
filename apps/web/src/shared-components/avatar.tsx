type AvatarProps = {
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
  className?: string;
};

const DEFAULT_SIZE = 40;

const getInitial = (name?: string | null): string => {
  const normalizedName = name?.trim();

  if (!normalizedName) {
    return "?";
  }

  return normalizedName.charAt(0).toUpperCase();
};

export function Avatar({
  name,
  imageUrl,
  size = DEFAULT_SIZE,
  className,
}: AvatarProps) {
  const initial = getInitial(name);
  const ariaLabel = name?.trim() ? `${name} avatar` : "User avatar";

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${className ?? ""}`.trim()}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(14, Math.round(size * 0.4)),
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={ariaLabel}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-semibold leading-none">{initial}</span>
      )}
    </div>
  );
}
