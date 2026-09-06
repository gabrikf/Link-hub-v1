import type { ProfileViewport } from "@repo/schemas";
import type { ReactNode, Ref } from "react";
import { minCanvasWidth, PROFILE_CANVAS_WIDTH } from "../grid-utils";

type CanvasFrameProps = Readonly<{
  /** Which canvas width to size to — see `PROFILE_CANVAS_WIDTH`. */
  viewport: ProfileViewport;
  /** Attached to the SIZED element, so a measuring hook reads the real width. */
  innerRef?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
}>;

/**
 * The box a block canvas lives in — the editor grid and its loading skeleton
 * both mount inside one, so the two are the same width and the zone does not
 * jump when the real grid arrives.
 *
 * It does one thing the plain `max-width` clamp could not: it refuses to render
 * the canvas narrower than `minCanvasWidth(viewport)` and lets ITSELF scroll
 * sideways instead, so a column never collapses below a 44px touch target.
 *
 * That guard used to carry a second job — making the 12-column pc canvas
 * editable from a phone, panned with a finger. It no longer does: the studio
 * refuses to edit the pc layout below 1024px at all (see `canEditPcLayout` in
 * `profile-layout-page.tsx`). What is left is a floor for the shell being
 * narrower than the canvas it holds, which is the case this was always sound
 * for. The mobile canvas floor is 212px and never trips on a real phone.
 *
 * The scroll is deliberately on THIS element and not on the page: the studio
 * itself must never scroll sideways at 375px.
 */
export function CanvasFrame({
  viewport,
  innerRef,
  className,
  children,
}: CanvasFrameProps) {
  return (
    <div className="overflow-x-auto overscroll-x-contain pb-1">
      <div
        ref={innerRef}
        className={["mx-auto w-full", className].filter(Boolean).join(" ")}
        style={{
          maxWidth: PROFILE_CANVAS_WIDTH[viewport],
          minWidth: minCanvasWidth(viewport),
        }}
      >
        {children}
      </div>
    </div>
  );
}
