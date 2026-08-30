import type { ImagePlacement } from "@repo/schemas";
import { placementStyle } from "../lib/image-placement";

type PlacedImageProps = {
  src: string;
  /** `null` renders exactly as a browser's default centred `object-fit: cover`. */
  placement: ImagePlacement | null | undefined;
  /**
   * Decorative by default. Pass real alt text only where the image carries
   * meaning — a banner and a page background never do.
   */
  alt?: string;
  className?: string;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  "data-testid"?: string;
};

/**
 * An image painted at a stored focal point.
 *
 * The ONE renderer for banner and background photos: the public profile, the
 * dashboard live preview, the in-form preview, the dashboard thumbnail and the
 * reposition editor all mount this component with the same placement, so the
 * frame the owner drags in is the frame everybody else sees. That is the whole
 * reason it exists as a component rather than as three copies of the same
 * three style properties.
 *
 * The parent must clip (`overflow-hidden`) and must have a resolved height:
 * `scale > 1` paints outside the element box, and `h-full` against an
 * unresolved parent collapses to nothing.
 */
export function PlacedImage({
  src,
  placement,
  alt = "",
  className,
  onLoad,
  "data-testid": testId,
}: PlacedImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt === "" ? "true" : undefined}
      data-testid={testId}
      onLoad={onLoad}
      /*
       * NOT decoration. An `<img>` is natively draggable, and starting a
       * browser image-drag fires `pointercancel` — which killed the reposition
       * gesture two pointermoves in, so a drag moved the photo about seven
       * pixels and then silently stopped. Found by the visual run, which
       * logged `pointercancel` mid-drag.
       *
       * It belongs here rather than in the editor because every surface that
       * mounts this shows a decorative photo nobody needs to drag out of the
       * page, and the editor must not be the only place it is remembered.
       */
      draggable={false}
      className={["h-full w-full object-cover", className]
        .filter(Boolean)
        .join(" ")}
      style={placementStyle(placement)}
    />
  );
}
