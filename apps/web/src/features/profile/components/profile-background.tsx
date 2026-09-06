import {
  DEFAULT_PROFILE_APPEARANCE,
  type ProfileAppearance,
} from "@repo/schemas";
import { PlacedImage } from "../../../shared-components/placed-image";
import { safeImageUrl } from "./profile-theme";

type ProfileBackgroundProps = Readonly<{
  imageUrl: string | null | undefined;
  appearance: ProfileAppearance | null | undefined;
  /**
   * Positioning for the layer as a whole.
   *
   * The default is `fixed`, i.e. the VIEWPORT — which is the only thing that
   * makes this read as a page background. `absolute inset-0` fills the nearest
   * positioned ancestor, and on the public profile that ancestor is a
   * `max-w-6xl` column whose card fills it to within 8px: the photograph was
   * technically painted and visible as two hairlines down the sides.
   *
   * The preview passes its own `absolute …` because there the "page" IS the
   * preview card, and a fixed layer would escape it and cover the editor.
   */
  className?: string;
}>;

/**
 * The optional full-bleed photograph behind a profile.
 *
 * WHY THIS IS A COMPONENT: it used to be eight lines inlined in
 * `public-profile-page.tsx` and NOWHERE else, which is exactly why someone who
 * set a background saw nothing in the dashboard's live preview — the preview
 * had no code that drew it. There is one implementation now, and every surface
 * mounts it.
 *
 * The veil is what the owner actually tunes. It was a hardcoded
 * `bg-zinc-100/82` / `dark:bg-zinc-950/85`, i.e. a photograph shown at 15-18%
 * strength, which is indistinguishable from "my background never appeared". It
 * is now `backgroundOverlay` (0-100, default 55) and the blur is
 * `backgroundBlur` px rather than a fixed `backdrop-blur-sm`.
 *
 * `backgroundColor` comes from a CSS custom property rather than a Tailwind
 * opacity utility because the opacity is a RUNTIME number: `bg-zinc-950/[.55]`
 * cannot be composed from a variable, and Tailwind only emits utilities it can
 * see at build time. `--profile-page-veil` is defined in `index.css` for both
 * themes, so the one inline style still follows light and dark.
 */
export function ProfileBackground({
  imageUrl,
  appearance,
  className = "fixed inset-0 -z-20 overflow-hidden",
}: ProfileBackgroundProps) {
  const image = safeImageUrl(imageUrl);
  if (!image) {
    return null;
  }

  const resolved = appearance ?? DEFAULT_PROFILE_APPEARANCE;

  return (
    <div
      aria-hidden="true"
      data-testid="profile-background"
      className={`pointer-events-none ${className}`}
    >
      {/*
        The blur lives on this wrapper, not on the image and not as a
        `backdrop-filter` on the veil. A backdrop filter samples everything
        painted behind it — on the public page that is the animated grid and
        both accent blobs — and blurring those washed the whole page out at
        every setting. `scale-110` hides the transparent border a CSS blur
        leaves around its subject; it composes with the placement's own
        transform instead of fighting it, because they are on different
        elements.
      */}
      <div
        className="absolute inset-0 scale-110"
        style={
          resolved.backgroundBlur > 0
            ? { filter: `blur(${resolved.backgroundBlur}px)` }
            : undefined
        }
      >
        <PlacedImage
          src={image}
          placement={resolved.backgroundPlacement}
          data-testid="profile-background-image"
        />
      </div>

      <div
        data-testid="profile-background-veil"
        className="absolute inset-0"
        style={{
          backgroundColor: "var(--profile-page-veil)",
          opacity: resolved.backgroundOverlay / 100,
        }}
      />
    </div>
  );
}
