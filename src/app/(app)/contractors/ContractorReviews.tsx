"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Review = { rating: number; comment: string | null; created_at: string };

// Expander that lists a contractor's reviews (rating + comment + date), fetched
// on demand via the contractor_reviews RPC. Lets a homeowner read an applicant's
// track record before choosing.
export default function ContractorReviews({
  contractorId,
  count,
}: {
  contractorId: string;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!open && reviews === null) {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase.rpc("contractor_reviews", {
        p_contractor: contractorId,
      });
      setReviews((data as Review[]) ?? []);
      setLoading(false);
    }
    setOpen((v) => !v);
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={toggle}
        className="text-xs font-medium text-hearth-700 hover:underline"
      >
        {open ? "Hide reviews" : `Read ${count} review${count === 1 ? "" : "s"}`}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {loading && <p className="text-xs text-stone-400">Loading…</p>}
          {reviews?.map((r, i) => (
            <div key={i} className="rounded-lg border border-stone-200 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-500">
                  {"★".repeat(r.rating)}
                  <span className="text-stone-300">
                    {"★".repeat(5 - r.rating)}
                  </span>
                </span>
                <span className="text-[11px] text-stone-400">
                  {r.created_at.slice(0, 10)}
                </span>
              </div>
              {r.comment && (
                <p className="mt-1 text-xs text-stone-600">{r.comment}</p>
              )}
            </div>
          ))}
          {reviews && reviews.length === 0 && (
            <p className="text-xs text-stone-400">No written reviews yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
