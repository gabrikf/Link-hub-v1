type BrandLogoProps = Readonly<{
  className?: string;
}>;

/**
 * The CraftHub mark: a connected hub of nodes on a violet gradient disc.
 *
 * IT IS A CIRCLE, and that is a bug fix rather than a taste call.
 *
 * The tile used to be a `rx="8.5"` rounded SQUARE (a 26% radius on a 32-unit
 * box) drawn inside a bare `inline-block` span, and every call site added
 * `shadow-sm`. A CSS shadow is cast from the element's border box, so the span
 * painted a hard rectangular shadow around a mark whose own corners were
 * rounded — the square read straight through, which is exactly what "I don't
 * want to see the square" describes. The same border box also produced a
 * visible corner step wherever a caller put a background or a ring behind it.
 *
 * Two things stop that coming back:
 *
 * 1. The artwork is a full circle (`r="16"` on a 32-unit box), so there is no
 *    square silhouette left to reveal.
 * 2. The wrapper carries `rounded-full` itself, so any shadow, ring or
 *    background a CALLER adds follows the artwork instead of boxing it in.
 *
 * Sized entirely by the wrapper `className`.
 */
export function BrandLogo({ className = "h-8 w-8" }: BrandLogoProps) {
  return (
    <span
      className={`inline-block overflow-hidden rounded-full ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          <linearGradient
            id="crafthub-brand-gradient"
            x1="0"
            y1="0"
            x2="32"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#7C3AED" />
            <stop offset="1" stopColor="#5B21B6" />
          </linearGradient>
        </defs>

        <circle cx="16" cy="16" r="16" fill="url(#crafthub-brand-gradient)" />

        {/* connections */}
        <g
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.92"
        >
          <line x1="16" y1="16" x2="16" y2="8.5" />
          <line x1="16" y1="16" x2="9.5" y2="22.5" />
          <line x1="16" y1="16" x2="22.5" y2="22.5" />
        </g>

        {/* nodes */}
        <g fill="#FFFFFF">
          <circle cx="16" cy="16" r="3.1" />
          <circle cx="16" cy="8.5" r="2.3" />
          <circle cx="9.5" cy="22.5" r="2.3" />
          <circle cx="22.5" cy="22.5" r="2.3" />
        </g>
      </svg>
    </span>
  );
}
