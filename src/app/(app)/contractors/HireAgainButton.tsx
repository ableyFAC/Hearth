"use client";

import { useState } from "react";
import { JOB_CATEGORIES } from "@/lib/constants";

// "Hire again" button on a My Pros row. Opens a small form (category
// preselected from the last job, free-text description) that submits through
// rehireProAction, which creates the repeat lead free (no apply fee) and
// routes to the new chat thread with that pro.
export default function HireAgainButton({
  contractorId,
  contractorName,
  lastCategory,
  action,
}: {
  contractorId: string;
  contractorName: string;
  lastCategory: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(lastCategory);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary shrink-0 text-sm"
      >
        Hire again
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-stone-900">
              Hire {contractorName} again
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              This is a free repeat lead: no apply fee, since you've already
              worked together. Tell them what you need and we'll open a chat.
            </p>

            <form
              action={action}
              onSubmit={() => setOpen(false)}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="contractor_id" value={contractorId} />
              <div>
                <label className="label">What do you need?</label>
                <select
                  name="category"
                  className="select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  {JOB_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Describe the job</label>
                <textarea
                  name="description"
                  className="textarea"
                  rows={3}
                  minLength={20}
                  required
                  placeholder="What needs doing this time? At least 20 characters so they know what to expect."
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
