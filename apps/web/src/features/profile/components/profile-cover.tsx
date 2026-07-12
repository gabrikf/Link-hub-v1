import { FiBriefcase, FiMapPin } from "react-icons/fi";
import { ProfileShareButton } from "./profile-share-button";
import { PERSONA_LABELS, safeImageUrl, type Persona } from "./profile-theme";

type ProfileCoverProps = {
  bannerImageUrl: string | null;
  openToWork: boolean;
  location: string | null;
  persona: Persona | null;
  /** When provided, a share control is rendered in the banner. */
  share?: { url: string; name: string };
  /** Tighter sizing for the in-dashboard preview. */
  compact?: boolean;
};

/**
 * LinkedIn-style cover strip rendered at the top of the profile card. Shows the
 * banner image (or an accent gradient fallback) and floats the appearance meta
 * — open-to-work, persona and location — over its lower edge, right where the
 * overlapping avatar meets the cover. Rendered from the page/preview shell so
 * profile-blocks.tsx stays untouched.
 */
export function ProfileCover({
  bannerImageUrl,
  openToWork,
  location,
  persona,
  share,
  compact = false,
}: ProfileCoverProps) {
  const banner = safeImageUrl(bannerImageUrl);
  const hasMeta = openToWork || Boolean(persona) || Boolean(location);

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-t-3xl",
        compact ? "h-24" : "h-32 sm:h-44",
      ].join(" ")}
    >
      {banner ? (
        <>
          <img
            src={banner}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/5" />
        </>
      ) : (
        <div className="profile-cover-gradient absolute inset-0">
          <div className="anim-grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        </div>
      )}

      {share ? (
        <ProfileShareButton
          url={share.url}
          name={share.name}
          className="absolute right-3 top-3"
        />
      ) : null}

      {hasMeta ? (
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {openToWork ? <OpenToWorkBadge /> : null}
            {persona ? <PersonaChip persona={persona} /> : null}
          </div>
          {location ? <ProfileLocation location={location} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function OpenToWorkBadge() {
  return (
    <span className="anim-fade-in inline-flex items-center gap-1.5 rounded-full border border-emerald-400/60 bg-emerald-500/95 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
      </span>
      Open to work
    </span>
  );
}

export function PersonaChip({ persona }: { persona: Persona }) {
  return (
    <span
      className="anim-fade-in inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--profile-accent) 88%, transparent)",
      }}
    >
      <FiBriefcase className="h-3 w-3" aria-hidden="true" />
      {PERSONA_LABELS[persona]}
    </span>
  );
}

export function ProfileLocation({ location }: { location: string }) {
  return (
    <span className="anim-fade-in inline-flex max-w-[60%] items-center gap-1.5 rounded-full border border-white/40 bg-black/35 px-2.5 py-1 text-xs font-medium text-white shadow-sm backdrop-blur">
      <FiMapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{location}</span>
    </span>
  );
}
