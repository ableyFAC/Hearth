import { startBackgroundCheckAction } from "../actions";
import type { Contractor } from "@/lib/database.types";

// Opt-in Checkr background check (0057). Only ever rendered by
// ProfileTabs/page.tsx when isCheckrConfigured() is true - fully dormant
// (this component never mounts) without CHECKR_API_KEY set. Matches the
// license verification block's style and honesty rules (PublicProfileForm.tsx):
// never claim a check happened beyond what a real Checkr webhook confirmed,
// and 'consider' stays private-only, same as license_verify_detail on a
// 'failed' CSLB check.
function formatCheckedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BackgroundCheckCard({
  contractor,
}: {
  contractor: Contractor;
}) {
  const status = contractor.background_check_status ?? "none";
  const checkedAt = contractor.background_checked_at ?? null;
  const hasEmail = Boolean(contractor.contact_email);

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold text-stone-900">Background check</h2>
        <p className="mt-1 text-sm text-stone-500">
          Run by Checkr, a background check provider. Hearth covers the cost:
          it&apos;s free for you. Consent and the check itself happen on
          Checkr&apos;s site, after they email you an invitation. Hearth only
          ever sees a pass / no-pass result, never the report itself.
        </p>
      </div>

      {status === "clear" ? (
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Background checked
          </span>
          <p className="mt-1 text-xs text-emerald-600">
            Cleared{checkedAt ? ` on ${formatCheckedDate(checkedAt)}` : ""}.
            This appears on your public page.
          </p>
        </div>
      ) : status === "consider" ? (
        <div>
          <p className="text-xs text-red-500">
            The check did not clear. This is never shown publicly - only you
            can see this. Questions?{" "}
            <a href="/pro/help" className="underline hover:text-red-600">
              Contact support
            </a>
            .
          </p>
        </div>
      ) : status === "pending" ? (
        <p className="text-xs text-stone-400">
          Your background check is in progress. We&apos;ll update this as
          soon as Checkr reports back.
        </p>
      ) : status === "invited" ? (
        <p className="text-xs text-stone-400">
          Check your email for Checkr&apos;s invitation to complete your
          background check.
        </p>
      ) : hasEmail ? (
        <form action={startBackgroundCheckAction} className="space-y-2">
          {/* Legal name, not the business name: the check runs against a
              person. Sent to Checkr only, never stored by Hearth. */}
          <div className="flex flex-wrap gap-2">
            <input
              name="legal_first_name"
              required
              maxLength={80}
              placeholder="Legal first name"
              className="input max-w-[180px] text-xs"
            />
            <input
              name="legal_last_name"
              required
              maxLength={80}
              placeholder="Legal last name"
              className="input max-w-[180px] text-xs"
            />
          </div>
          <p className="text-xs text-stone-400">
            Your legal name goes to Checkr to run the check. Hearth doesn&apos;t
            store it.
          </p>
          <button
            type="submit"
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            Start my background check
          </button>
        </form>
      ) : (
        <p className="text-xs text-stone-400">
          Add an email address above first, then come back to start your
          background check.
        </p>
      )}
    </section>
  );
}
