import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { ISSUE_CATEGORIES, TIMING_OPTIONS, labelFor, iconFor } from "@/lib/constants";
import { setFlash } from "@/lib/flash";
import { requestProAction } from "./actions";
import CategoryFilter from "./CategoryFilter";
import LeadChat from "@/components/LeadChat";
import ReviewPopup from "./ReviewPopup";

// Must match the markers LeadChat posts when either side closes a thread.
const isCloseMarker = (b: string) =>
  b.startsWith("Conversation closed") || b === "Chat closed by the contractor.";

// Save a homeowner's star rating + comment for a finished job. RLS ensures only
// the property owner can review; a DB trigger updates the contractor's average.
async function saveReviewAction(formData: FormData) {
  "use server";
  const supabase = createClient();
  const lead_id = String(formData.get("lead_id"));
  const contractor_id = String(formData.get("contractor_id"));
  const property_id = String(formData.get("property_id") || "") || null;
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") || "").trim();
  if (!rating || rating < 1 || rating > 5) {
    setFlash("Please pick a star rating.", "error");
    return;
  }
  const { error } = await supabase.from("reviews").insert({
    lead_id,
    contractor_id,
    property_id,
    rating,
    comment: comment || null,
  });
  setFlash(
    error ? error.message : "Thanks for your review!",
    error ? "error" : "success"
  );
  revalidatePath("/contractors");
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: { issue?: string; category?: string; requested?: string };
}) {
  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const category = searchParams.category ?? "";
  const issueId = searchParams.issue ?? "";

  // Match vetted contractors whose categories include the requested one.
  const query = supabase
    .from("contractors")
    .select("*")
    .eq("vetted", true)
    .order("rating", { ascending: false });
  if (category) query.contains("categories", [category]);
  const { data: contractors } = await query;

  // Show the owner their existing requests too.
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*, contractors(name)")
    .eq("property_id", property.id)
    .order("created_at", { ascending: false });

  // Figure out which finished (chat-closed) jobs still need a review.
  const leadIds = (leads ?? []).map((l) => l.id);
  const reviewedIds = new Set<string>();
  const closedIds = new Set<string>();
  if (leadIds.length) {
    const { data: revs } = await supabase
      .from("reviews")
      .select("lead_id")
      .in("lead_id", leadIds);
    for (const r of revs ?? []) reviewedIds.add(r.lead_id);

    const { data: sys } = await supabase
      .from("messages")
      .select("lead_id, body, created_at")
      .eq("sender_role", "system")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });
    const lastSys = new Map<string, any>();
    for (const m of sys ?? []) if (!lastSys.has(m.lead_id)) lastSys.set(m.lead_id, m);
    for (const [lid, m] of lastSys)
      if (isCloseMarker(m.body)) closedIds.add(lid);
  }
  // The first closed-but-unreviewed job gets the rating popup.
  const pending = (leads ?? []).find(
    (l) => closedIds.has(l.id) && !reviewedIds.has(l.id)
  );

  return (
    <div className="space-y-8">
      {pending && (
        <ReviewPopup
          leadId={pending.id}
          contractorId={pending.contractor_id ?? ""}
          propertyId={property.id}
          /* @ts-expect-error joined relation */
          contractorName={pending.contractors?.name ?? "your pro"}
          action={saveReviewAction}
        />
      )}
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Find a Pro</h1>
        <p className="mt-1 text-sm text-stone-500">
          Vetted, licensed local contractors. Request a quote and they&apos;ll
          reach out — no obligation.
        </p>
      </div>

      {searchParams.requested && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          ✅ Request sent. A vetted pro will be in touch. You can track it below.
        </div>
      )}

      <form action={requestProAction} className="card space-y-4">
        <input type="hidden" name="issue_id" value={issueId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">What do you need?</label>
            <CategoryFilter category={category} issueId={issueId} />
          </div>
          <div>
            <label className="label">Preferred timing</label>
            <select name="timing" className="select" defaultValue="few_weeks">
              {TIMING_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Your name</label>
            <input name="homeowner_name" className="input" placeholder="Jane Doe" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              name="homeowner_email"
              type="email"
              className="input"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              name="homeowner_phone"
              type="tel"
              className="input"
              placeholder="+1 415 555 0123"
            />
          </div>
        </div>

        <div>
          <label className="label">
            {category
              ? `Matched pros for ${labelFor(ISSUE_CATEGORIES, category)} (${contractors?.length ?? 0})`
              : "Matched pros"}
          </label>
          {contractors && contractors.length > 0 ? (
            <div className="space-y-2">
              {contractors.map((c, idx) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 hover:border-hearth-400"
                >
                  <input
                    type="radio"
                    name="contractor_id"
                    value={c.id}
                    defaultChecked={idx === 0}
                    className="accent-hearth-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-stone-900">{c.name}</span>
                      {c.rating && (
                        <span className="text-xs text-amber-600">★ {c.rating}</span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">
                      {c.service_area} · Lic. {c.license_number ?? "—"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500">
              {category
                ? "No vetted pros in this category yet — submit anyway and we'll source one."
                : "Pick a category to see matched pros."}
            </p>
          )}
        </div>

        <button className="btn-primary w-full">Request quotes</button>
        <p className="text-xs text-stone-400">
          We share your name, address, and request details with the pro so they
          can quote the job. Nothing else.
        </p>
      </form>

      {leads && leads.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">Your requests</h2>
          <ul className="space-y-2">
            {leads.map((l) => (
              <li key={l.id} className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-stone-900">
                      {iconFor(ISSUE_CATEGORIES, l.category)}{" "}
                      {labelFor(ISSUE_CATEGORIES, l.category)}
                    </span>
                    <p className="text-sm text-stone-500">
                      {/* @ts-expect-error joined relation */}
                      {l.contractors?.name ?? "Sourcing a pro"}
                    </p>
                  </div>
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs uppercase tracking-wide text-stone-500">
                    {l.status}
                  </span>
                </div>
                <LeadChat leadId={l.id} role="homeowner" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-sm text-stone-400">
        <Link href="/issues" className="hover:underline">
          ← Back to issues
        </Link>
      </p>
    </div>
  );
}
