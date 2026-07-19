import { FOUNDER } from "@/lib/constants";

// Contact address rendered on the legal pages (/privacy, /terms,
// /ai-disclosure). Deliberately NOT the same treatment as the marketing
// surfaces: the landing page and /pros guard on `FOUNDER.email` and simply drop
// the contact link when it is blank, which is fine for a "questions?" prompt.
//
// A legal page cannot do that. A privacy contact is expected, and the
// arbitration notice-of-dispute and opt-out addresses carry hard deadlines that
// run against whatever address is published. Silently rendering nothing there
// would leave a clause pointing at no one. So while `FOUNDER.email` is blank
// this renders a VISIBLE placeholder, matching how /dmca surfaces its
// designated-agent TODOs, so the page cannot ship looking finished when it
// isn't.
export function LegalContact({ subject }: { subject?: string }) {
  if (!FOUNDER.email) {
    return (
      <span className="text-stone-500 dark:text-stone-400">
        [TODO(legal): contact email to be provided]
      </span>
    );
  }

  const href = subject
    ? `mailto:${FOUNDER.email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${FOUNDER.email}`;

  return (
    <a
      href={href}
      className="text-hearth-700 hover:underline dark:text-hearth-300"
    >
      {FOUNDER.email}
    </a>
  );
}
