import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { isHomeownerPreview } from "@/lib/previewMode";

// Public top-level page, same pattern as src/app/terms/page.tsx: see
// src/lib/supabase/middleware.ts for the allowlist entry and
// src/app/sitemap.ts for the sitemap entry. Content lives in
// src/content/legal/billing.md, rendered by LegalDocument. Required before
// purchase by Cal. B&P 17538: legal name, address, and a link to this policy.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Billing & Refund Policy",
  description:
    "Prices, free trials, auto-renewal, one-click cancellation, and how pro lead credit-back and ghost protection work.",
  alternates: {
    canonical: `${SITE_URL}/billing`,
  },
};

export default function BillingPage() {
  // PREVIEW MODE (guardrail B3). The policy below is accurate and stays
  // exactly as written - the markdown is untouched - but it describes prices,
  // trials and renewals, and during the preview none of those are happening.
  // One sentence at the top says so, so a reader (or a lawyer) is not left to
  // work that out from a document that reads as if the product is selling.
  // This is the ONLY legal page that gets a notice; the rest are untouched.
  return (
    <LegalDocument
      slug="billing"
      notice={
        isHomeownerPreview()
          ? "During the preview period nothing is charged."
          : undefined
      }
    />
  );
}
