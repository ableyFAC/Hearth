import Link from "next/link";

// The single inline "this was written by a model" label that sits with every
// piece of AI-generated output in the app (Ask Hearth's composer, the quote
// analyzer verdict, the pro back-office drafts, inspection/document
// extraction, the tax appeal letter, the insurance packet).
//
// One component so the wording can't drift between surfaces, and so the link
// to /ai-disclosure is always attached to the label rather than being
// something a user has to go hunting for. Deliberately quiet: the same
// text-[11px]/text-xs muted stone treatment the surrounding footnotes already
// use, so it reads as honest fine print rather than a warning banner.
//
// `detail` appends the surface-specific caveat that used to live inline (e.g.
// "Confirm with a licensed pro before you decide."), keeping it in the same
// sentence flow as the disclosure instead of stacking two paragraphs.
export default function AiNotice({
  detail,
  size = "xs",
  className = "",
}: {
  detail?: string;
  size?: "xs" | "xxs";
  className?: string;
}) {
  const sizeClass = size === "xxs" ? "text-[11px]" : "text-xs";
  return (
    <p
      className={`${sizeClass} text-stone-500 dark:text-stone-400 ${className}`}
    >
      AI-generated, and it can be wrong. Check anything that matters.{" "}
      {detail ? `${detail} ` : ""}
      <Link
        href="/ai-disclosure"
        className="underline decoration-dotted hover:text-stone-600 dark:hover:text-stone-300"
      >
        How Hearth uses AI
      </Link>
    </p>
  );
}
