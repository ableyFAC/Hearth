"use client";

import { useState } from "react";
import { updateJobAction } from "./actions";
import { TIMING_OPTIONS } from "@/lib/constants";
import CategoryFilter from "./CategoryFilter";
import PhoneInput from "@/components/PhoneInput";

// Inline editor for a posted job. Shows an "Edit" link that opens a prefilled
// form (same fields as posting). Closes itself once the update saves.
export default function EditJobForm({ job }: { job: any }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-hearth-700 hover:underline dark:text-hearth-300"
        >
          Edit job
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        await updateJobAction(fd);
        setEditing(false);
      }}
      className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-stone-700"
    >
      <input type="hidden" name="lead_id" value={job.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">What do you need?</label>
          <CategoryFilter category={job.category ?? ""} />
        </div>
        <div>
          <label className="label">Preferred timing</label>
          <select
            name="timing"
            className="select"
            defaultValue={job.timing ?? "few_weeks"}
          >
            {TIMING_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Details about your project (optional)</label>
        <textarea
          name="message"
          className="textarea"
          rows={3}
          defaultValue={job.issue_description ?? ""}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">First and last name</label>
          <input
            name="homeowner_name"
            className="input"
            defaultValue={job.homeowner_name ?? ""}
            required
          />
        </div>
        <div>
          <label className="label">Email (optional)</label>
          <input
            name="homeowner_email"
            type="email"
            className="input"
            defaultValue={job.homeowner_email ?? ""}
          />
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <PhoneInput
            name="homeowner_phone"
            defaultValue={job.homeowner_phone ?? ""}
          />
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            So pros can reach you faster (optional).
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn-secondary text-sm"
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1 text-sm">
          Save changes
        </button>
      </div>
    </form>
  );
}
