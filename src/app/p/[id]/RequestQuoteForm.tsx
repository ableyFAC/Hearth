"use client";

import { useState } from "react";
import { JOB_CATEGORIES, TIMING_OPTIONS, labelFor } from "@/lib/constants";
import type { ActionResult } from "@/lib/actionResult";

const MIN_DESCRIPTION = 20;

// "Request a quote" for a SIGNED-IN homeowner on a pro's public page. Opens a
// small form (category preset to the pro's primary service, description,
// timing) that submits through requestProAction, which creates a PENDING
// direct request aimed at this one pro and routes back to /contractors where
// it's now visible.
//
// Submitted programmatically (not a plain <form action>) so the modal only
// closes / navigates once the action actually returns ok() or redirects: a
// validation failure keeps it open with the typed text intact and the error
// inline, exactly like HireAgainButton.
export default function RequestQuoteForm({
  contractorId,
  contractorName,
  categories,
  action,
}: {
  contractorId: string;
  contractorName: string;
  // The pro's own service categories. When empty (a pro who "takes anything"),
  // the full JOB_CATEGORIES list is offered instead.
  categories: string[];
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  // Only offer categories the pro actually serves, so the request always
  // passes the server-side "serves this category" check.
  const options =
    categories.length > 0
      ? categories.map((value) => ({
          value,
          label: labelFor(JOB_CATEGORIES, value),
        }))
      : JOB_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(options[0]?.value ?? "other");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary inline-flex"
      >
        Request a quote
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="my-8 w-full max-w-sm rounded-2xl bg-white p-6 shadow-pop sm:my-0 dark:bg-stone-800">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Ask {contractorName} for a quote
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Only this pro can see your request. If they pass, you can post it
              to all local pros.
            </p>

            <form
              // noValidate: without it the browser's native constraint bubble
              // ("Please lengthen this text to 20 characters...") fires on the
              // minLength attribute below and live-updates its character count
              // while the homeowner types. The onSubmit check right here is
              // the only validation surface: one friendly message, shown only
              // when they actually try to send.
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const desc = String(fd.get("description") ?? "").trim();
                if (desc.length < MIN_DESCRIPTION) {
                  setError(
                    "Please describe the job in at least 20 characters so the pro knows what you need."
                  );
                  return;
                }
                setPending(true);
                setError(null);
                try {
                  const res = await action(fd);
                  if (res.ok) setOpen(false);
                  else setError(res.error);
                } catch (err: any) {
                  // requestProAction redirects to /contractors on success,
                  // which redirect() does by throwing a NEXT_REDIRECT-digest
                  // error. Rethrow so the navigation still happens; treat
                  // everything else as a real failure. Same trap as
                  // HireAgainButton.
                  if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err;
                  setError("Something went wrong. Please try again.");
                } finally {
                  setPending(false);
                }
              }}
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
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
              <div>
                <label className="label">Describe the job</label>
                <textarea
                  name="description"
                  className="textarea"
                  rows={3}
                  minLength={20}
                  required
                  placeholder="What needs doing? At least 20 characters so they can give a real quote."
                />
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Your name and contact stay private until this pro accepts.
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-secondary flex-1"
                  disabled={pending}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={pending}>
                  {pending ? "Sending…" : "Send request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
