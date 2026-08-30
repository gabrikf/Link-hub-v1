import { useTranslation } from "react-i18next";
import { FiBriefcase } from "react-icons/fi";
import { ProfileShareButton } from "./profile-share-button";
import {
  resolvePersonaLabel,
  safeImageUrl,
  type Persona,
} from "./profile-theme";

type ProfileCoverProps = {
  bannerImageUrl: string | null;
  /**
   * Accepted and deliberately NOT rendered — see the note on {@link openToWork}.
   *
   * Location used to be the right-hand half of the meta chip. It now renders in
   * the profile body, after the description and before the links, in a mid-grey
   * that reads as metadata (see the `header` block in `profile-blocks.tsx`).
   * Putting it back on the cover is what made the chip wide enough to reach the
   * avatar. The prop stays so the two other call sites
   * (`public-profile-preview.tsx`, `dashboard-profile-form.tsx`) keep
   * compiling; drop it once they stop passing it.
   */
  location?: string | null;
  persona: Persona | null;
  /** The owner's own words for their role, used when `persona` is "other". */
  personaOther?: string | null;
  /**
   * Accepted and deliberately NOT rendered.
   *
   * "Open to work" used to be a fourth thing floating over the cover photo,
   * with a pinging dot. It is now absent from the PUBLIC cover entirely — the
   * flag still exists on the account and still shows in the dashboard (and it
   * gates recruiter search), but it no longer competes with the person's role
   * and the share control for the same 176 pixels. The prop stays so the
   * remaining call sites keep compiling; drop it once they stop passing it.
   */
  openToWork?: boolean;
  /** When provided, a share control is rendered in the banner. */
  share?: { url: string; name: string };
  /** Tighter sizing for the in-dashboard preview. */
  compact?: boolean;
};

/**
 * Cover strip at the top of the profile card: the banner image (or an accent
 * gradient fallback) with at most two small controls floating over it.
 *
 * They are placed on OPPOSITE corners rather than on one shared baseline:
 *
 * - share, **top-right**, tucked just inside the `rounded-t-3xl` corner;
 * - role, **bottom-left**, sitting on the last couple of pixels of the image,
 *   level with the avatar that overlaps the cover's lower edge.
 *
 * `top-2` / `bottom-0.5` are as tight as the geometry allows, not round
 * numbers. The strip is `overflow-hidden` with a 24px top radius, so a control
 * inset only 2px from the top-right would have its corner outside the arc and
 * be clipped: 2px in from both edges is 31px from the arc's centre against a
 * 24px radius. At 8px it is 22.6px from that centre — inside, with its own
 * `rounded-full` corner pulling it further in still. The bottom edge has no
 * radius, so the role chip really can sit 2px above the image.
 *
 * WHY NOT ONE ROW: the previous version merged role and location into a single
 * chip and floated the pair on the lower edge, which at 375px was 245px wide —
 * 65% of the card — and had to be lifted 80px clear of the avatar to avoid
 * being drawn over. Lifting it put both controls in the middle of the
 * photograph. Splitting them to the corners lets the role chip stay on the edge
 * where it belongs, and `max-w-[calc(50%-4rem)]` keeps it clear of the CENTRED
 * avatar (half the card, minus the avatar's 46px half-width, minus a gap)
 * without knowing the avatar's size at this level.
 */
export function ProfileCover({
  bannerImageUrl,
  persona,
  personaOther = null,
  share,
  compact = false,
}: ProfileCoverProps) {
  const { t } = useTranslation();
  const banner = safeImageUrl(bannerImageUrl);
  const roleLabel = resolvePersonaLabel(t, persona, personaOther);

  return (
    <div
      data-testid="profile-cover-strip"
      className={[
        "@container relative w-full overflow-hidden rounded-t-3xl",
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
          {/*
            The scrim fades to fully transparent at the top instead of washing
            the whole photo in `black/5`. Only the band the role chip sits on is
            darkened, so a photograph reads as a photograph — and the chip still
            has something solid under it whether the cover is a bright beach or
            a night skyline. The share control carries its own `bg-black/60`,
            which is what holds it up in the un-scrimmed top corner.
          */}
          <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/15 to-transparent" />
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
          // Overrides the control's own `px-3 py-1.5 text-xs`. The `!` is
          // load-bearing: these set the same properties the component already
          // sets, and Tailwind orders same-property utilities by its own sort,
          // not by the order they appear in the attribute.
          className="anim-fade-in absolute right-2 top-2 gap-1! px-2! py-1! text-[11px]! leading-4!"
        />
      ) : null}

      {roleLabel ? (
        <span
          // The testid keeps the old `profile-meta-chip` name even though the
          // chip now carries the role alone: the dashboard form's own test
          // (`dashboard-profile-persona-other.test.tsx`) locates the live
          // banner preview through it, and renaming it would break a file this
          // change has no business touching.
          data-testid="profile-meta-chip"
          // `max-w` rather than a hard shrink: a 50-character custom role
          // ("Fisioterapeuta Esportivo e Ortopédico do Alto Vale") must clip
          // with an ellipsis instead of running under the avatar.
          className="anim-fade-in absolute bottom-0.5 left-2 flex max-w-[calc(50%-4rem)] items-center gap-1 overflow-hidden rounded-full border border-white/20 px-2 py-1 text-[11px] font-semibold leading-4 shadow-sm backdrop-blur-md"
          /*
            Contrast is the reason for the exact values. The chip sits on a
            cover the user chose, and the worst case is a near-white photograph:
            `--profile-accent-solid` is the accent already darkened 30%
            precisely so `--profile-accent-contrast` clears 4.5:1 on top of it,
            and 94% of it keeps a whisper of the cover showing through without
            dropping below that.

            There is no `dark:` variant here, and that is deliberate rather than
            an omission: the chip sits on the cover IMAGE, which is the same
            picture in both themes, so a palette that followed the app theme
            would be tuned against something that is not behind it.
          */
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--profile-accent-solid) 94%, transparent)",
            color: "var(--profile-accent-contrast)",
          }}
        >
          <FiBriefcase className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{roleLabel}</span>
        </span>
      ) : null}
    </div>
  );
}
