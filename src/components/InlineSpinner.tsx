// A small inline loading spinner for buttons and compact refreshing sections.
// Strokes currentColor so it inherits the button's text color, and is meant to
// sit BEFORE a label that stays visible, giving an instant "working on it" cue
// on click. Flat, no gradients.
export default function InlineSpinner({
  size = 16,
  className = "",
}: {
  // Pixel width/height. Defaults to 16 (h-4 w-4).
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`motion-safe:animate-spin ${className}`}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  );
}
