import type { Metadata } from "next";
import { isHomeownerPreview } from "@/lib/previewMode";
import ProsComingSoon from "@/components/pro/ProsComingSoon";

// The sign-up page is a client component ("use client" files can't export
// metadata), so the title/description live on this pass-through layout.
// `absolute` opts out of the root layout's "%s | OakTend" template, which
// would otherwise double-brand this to "... | OakTend for Pros | OakTend".
//
// PREVIEW MODE swaps both strings for ones that make no product claim, for the
// same reason /pros does: this is what a search result and a link preview show
// while the contractor side is closed.
export const metadata: Metadata = isHomeownerPreview()
  ? {
      title: { absolute: "Pros are coming soon | OakTend for Pros" },
      description:
        "OakTend for Pros opens after our homeowner preview. Leave your email and we'll tell you first.",
    }
  : {
      title: { absolute: "Create your pro account | OakTend for Pros" },
      description:
        "Pay per lead you choose, not per month. Ghost protection, capped competition, and the price on every job card.",
    };

export default function ContractorSignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // PREVIEW MODE: the contractor side is closed, so nobody may create a pro
  // account. The gate lives HERE rather than in page.tsx because that page is
  // a client component and ProsComingSoon is a server component - a "use
  // client" module cannot import one. Swapping the children out in this
  // server layout also means the signup page's module (Supabase client,
  // Turnstile, the OAuth buttons) is never rendered at all, rather than
  // rendered and hidden.
  if (isHomeownerPreview()) {
    return <ProsComingSoon source="contractor-signup" />;
  }
  return children;
}
