import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const initial = getInitial(name);
  const ariaLabel = name?.trim()
    ? t("image.avatarOf", { name })
    : t("image.userAvatar");
  // Track the url that failed to load so a new src automatically gets a fresh
  // try without needing an effect to reset state.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showImage = Boolean(imageUrl) && imageUrl !== failedUrl;

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
      {showImage ? (
        <img
          src={imageUrl ?? undefined}
          alt={ariaLabel}
          // Google/LinkedIn avatar CDNs reject requests that leak a referer.
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(imageUrl ?? null)}
        />
      ) : (
        <span className="font-semibold leading-none">{initial}</span>
      )}
    </div>
  );
}
