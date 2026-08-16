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
 *
 * The meta row is placed by CONTAINER width (`@container` on the strip), not by
 * viewport width: the avatar that overlaps the cover is centred in the card, so
 * whether it lands on top of the chips depends on how wide the card is, and the
 * same card is rendered inside phone frames and dashboard columns on a wide
 * screen. Below `@2xl` the centred avatar sweeps the middle of the lower edge,
 * so the row is lifted clear of the circle (see the offsets below); from `@2xl`
 * up the card is wide enough that the avatar never reaches the chips and the
 * row keeps sitting on the lower edge.
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
        "@container relative w-full overflow-hidden rounded-t-3xl",
        // Narrow cards get a taller strip so the lifted meta row still has the
        // share control above it and the avatar below it. Wide cards keep the
        // heights they always had.
        compact ? "h-32 @2xl:h-24" : "h-44",
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
        <div
          className={[
            "absolute inset-x-3 flex flex-wrap items-end justify-between gap-2",
            // The bottom offset must clear the avatar's pull-up (`-mt-14` = 56px
            // on the page, `-mt-10` = 40px in the compact previews) plus a gap,
            // otherwise the circle is drawn straight over the chips.
            compact ? "bottom-14 @2xl:bottom-3" : "bottom-20 @2xl:bottom-3",
          ].join(" ")}
        >
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
