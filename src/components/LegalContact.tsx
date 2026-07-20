// Contact link rendered on the legal pages (/privacy, /terms, /ai-disclosure,
// /pro-terms). Used to render a mailto: to FOUNDER.email, with a visible
// [TODO(legal): contact email to be provided] placeholder while that field
// was blank - a legal page can't just silently drop a contact link the way
// the marketing pages did, since the arbitration notice-of-dispute and
// opt-out clauses carry hard deadlines that run against whatever address is
// published.
//
// A raw mailto: on a handful of the site's highest-traffic public pages got
// scraped for spam almost immediately, which is the whole reason /contact
// exists (see src/app/contact/page.tsx). This now points there instead:
// submissions land in the same support_messages table and inbox the team
// already reads (src/app/(app)/account/help), and - unlike the old mailto -
// it works even while FOUNDER.email is blank, so the old placeholder branch
// is gone too.
//
// `topic` is optional context carried as a query param (e.g. "Arbitration
// opt-out"), shown back to the visitor on the /contact page so they know
// what they're writing about. It is not a legal "designated address" any
// more than the old mailto's subject line was.
export function LegalContact({ topic }: { topic?: string }) {
  const href = topic ? `/contact?topic=${encodeURIComponent(topic)}` : "/contact";

  return (
    <a href={href} className="text-bark-700 hover:underline dark:text-stone-300">
      our contact form
    </a>
  );
}
