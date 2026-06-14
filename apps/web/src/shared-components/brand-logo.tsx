type BrandLogoProps = {
  className?: string;
};

/**
 * Professional LinkHub mark: a connected "hub" of nodes inside a rounded
 * gradient tile. Sized via the wrapper `className` (defaults to h-9 w-9).
 */
export function BrandLogo({ className = "h-9 w-9" }: BrandLogoProps) {
  return (
    <span className={`inline-block ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          <linearGradient
            id="linkhub-brand-gradient"
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

        <rect width="32" height="32" rx="8.5" fill="url(#linkhub-brand-gradient)" />

        {/* connections */}
        <g
          stroke="#FFFFFF"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.92"
        >
          <line x1="16" y1="16" x2="16" y2="8" />
          <line x1="16" y1="16" x2="9" y2="23" />
          <line x1="16" y1="16" x2="23" y2="23" />
        </g>

        {/* nodes */}
        <g fill="#FFFFFF">
          <circle cx="16" cy="16" r="3.1" />
          <circle cx="16" cy="8" r="2.3" />
          <circle cx="9" cy="23" r="2.3" />
          <circle cx="23" cy="23" r="2.3" />
        </g>
      </svg>
    </span>
  );
}
