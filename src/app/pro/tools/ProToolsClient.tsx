"use client";

import { useState, useTransition } from "react";
import { JOB_CATEGORIES } from "@/lib/constants";
import type { ProPastJob } from "@/lib/database.types";
import { deletePastJobAction } from "./actions";

// The member-side AI back office: five tabs (estimate, invoice, follow-up,
// review response, overdue invoice reminder), each a small form that posts
// to /api/pro-tools and shows the generated document in a copyable block.
// Each tab keeps its own draft and result so switching tools mid-thought
// doesn't lose work.

type Tool = "estimate" | "invoice" | "followup" | "review_response" | "overdue";

const TABS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: "estimate", icon: "📋", label: "Estimate" },
  { id: "invoice", icon: "🧾", label: "Invoice" },
  { id: "followup", icon: "✉️", label: "Follow-up" },
  { id: "review_response", icon: "⭐", label: "Review response" },
  { id: "overdue", icon: "💸", label: "Invoice reminder" },
];

const SITUATIONS: Array<{ value: string; label: string }> = [
  { value: "no_reply", label: "Sent a quote, no reply yet" },
  { value: "review", label: "Job's done, ask for a review" },
  { value: "checkin", label: "Check in with a past customer" },
];

const OVERDUE_STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "friendly", label: "Friendly reminder (about 2 weeks overdue)" },
  { value: "firm", label: "Firm notice (about a month overdue)" },
  { value: "final", label: "Final notice" },
];

// Read a File into base64 (no data: prefix) for the vision endpoints. Same
// helper as src/components/DocumentUpload.tsx.
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.includes(",") ? res.split(",")[1] : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_PAST_JOB_BYTES = 15 * 1024 * 1024; // 15MB, same cap as DocumentUpload

export default function ProToolsClient({
  initialPastJobs,
}: {
  initialPastJobs: ProPastJob[];
}) {
  const [tool, setTool] = useState<Tool>("estimate");

  // Estimate fields
  const [estDescription, setEstDescription] = useState("");
  const [estCategory, setEstCategory] = useState("");
  const [estPrice, setEstPrice] = useState("");
  const [estMaterials, setEstMaterials] = useState("");

  // Invoice fields
  const [invDescription, setInvDescription] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invWorkDone, setInvWorkDone] = useState("");

  // Follow-up fields
  const [fuSituation, setFuSituation] = useState("no_reply");
  const [fuContext, setFuContext] = useState("");

  // Review response fields
  const [rrReviewText, setRrReviewText] = useState("");
  const [rrRating, setRrRating] = useState("");
  const [rrStory, setRrStory] = useState("");

  // Overdue invoice ladder fields
  const [odStage, setOdStage] = useState("friendly");
  const [odAmount, setOdAmount] = useState("");
  const [odOverdue, setOdOverdue] = useState("");
  const [odJob, setOdJob] = useState("");
  const [odContext, setOdContext] = useState("");

  // Per-tool results, so switching tabs doesn't wipe a draft you just made.
  const [results, setResults] = useState<Record<Tool, string | null>>({
    estimate: null,
    invoice: null,
    followup: null,
    review_response: null,
    overdue: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Your past jobs: upload state, saved rows, and the pending remove.
  const [pastJobs, setPastJobs] = useState<ProPastJob[]>(initialPastJobs);
  const [pjBusy, setPjBusy] = useState(false);
  const [pjError, setPjError] = useState<string | null>(null);
  const [pjRemovingId, setPjRemovingId] = useState<string | null>(null);
  const [, startRemoveTransition] = useTransition();

  async function onPickPastJob(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!file) return;

    if (file.size > MAX_PAST_JOB_BYTES) {
      setPjError("That file is too large (max 15MB). Try a smaller photo or PDF.");
      return;
    }

    setPjBusy(true);
    setPjError(null);

    try {
      const b64 = await toBase64(file);
      const resp = await fetch("/api/pro-past-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: b64, mime: file.type || "image/jpeg" }),
      });

      if (resp.status === 401) {
        setPjError("Please sign in and try again.");
        return;
      }
      if (resp.status === 403) {
        setPjError("This tool is part of the Hearth Pro membership.");
        return;
      }

      const data = await resp.json().catch(() => ({}));
      if (data?.job) {
        setPastJobs((jobs) => [data.job, ...jobs]);
      } else if (data?.reason === "rate_limited") {
        setPjError(
          "You've hit today's AI limit. It resets at midnight, so try again then."
        );
      } else if (data?.reason === "no_key") {
        setPjError("The AI back office isn't set up yet.");
      } else {
        setPjError(
          "Couldn't read that document. Try a clearer photo, a PDF, or a different file."
        );
      }
    } catch {
      setPjError("Something went wrong. Please try again.");
    } finally {
      setPjBusy(false);
    }
  }

  function removePastJob(id: string) {
    setPjRemovingId(id);
    const formData = new FormData();
    formData.set("id", id);
    startRemoveTransition(async () => {
      await deletePastJobAction(formData);
      setPastJobs((jobs) => jobs.filter((j) => j.id !== id));
      setPjRemovingId(null);
    });
  }

  function switchTool(next: Tool) {
    setTool(next);
    setError(null);
    setCopied(false);
  }

  async function generate() {
    let payload: Record<string, string>;
    if (tool === "estimate") {
      if (!estDescription.trim()) {
        setError("Describe the job first.");
        return;
      }
      payload = {
        tool,
        description: estDescription,
        category: estCategory,
        price: estPrice,
        materials: estMaterials,
      };
    } else if (tool === "invoice") {
      if (!invDescription.trim()) {
        setError("Describe the job first.");
        return;
      }
      if (!invAmount.trim()) {
        setError("Enter the amount due.");
        return;
      }
      payload = {
        tool,
        description: invDescription,
        amount: invAmount,
        workDone: invWorkDone,
      };
    } else if (tool === "followup") {
      payload = { tool, situation: fuSituation, context: fuContext };
    } else if (tool === "review_response") {
      if (!rrReviewText.trim()) {
        setError("Paste the review first.");
        return;
      }
      payload = {
        tool,
        reviewText: rrReviewText,
        rating: rrRating,
        story: rrStory,
      };
    } else {
      if (!odAmount.trim()) {
        setError("Enter the amount owed.");
        return;
      }
      if (!odOverdue.trim()) {
        setError("Say how long it's been overdue.");
        return;
      }
      if (!odJob.trim()) {
        setError("Describe the job first.");
        return;
      }
      payload = {
        tool,
        stage: odStage,
        amount: odAmount,
        overdue: odOverdue,
        job: odJob,
        context: odContext,
      };
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    setResults((r) => ({ ...r, [tool]: null }));

    try {
      const resp = await fetch("/api/pro-tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.status === 401) {
        setError("Please sign in and try again.");
        return;
      }
      if (resp.status === 403) {
        setError("This tool is part of the Hearth Pro membership.");
        return;
      }

      const data = await resp.json().catch(() => ({}));
      if (typeof data?.result === "string" && data.result) {
        setResults((r) => ({ ...r, [tool]: data.result }));
      } else if (data?.reason === "rate_limited") {
        setError(
          "You've hit today's AI limit. It resets at midnight, so try again then."
        );
      } else if (data?.reason === "no_key") {
        setError("The AI back office isn't set up yet.");
      } else {
        setError(data?.error || "Couldn't write that draft. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const result = results[tool];

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTool(t.id)}
            className={`shrink-0 whitespace-nowrap ${
              tool === t.id ? "btn-primary" : "btn-secondary"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="card-hero space-y-4">
        {tool === "estimate" && (
          <>
            <p className="text-sm text-stone-600">
              Describe the job the way you&apos;d explain it over the phone. You
              get back a written estimate with a scope, line items, and terms.
            </p>
            <div>
              <label className="label">The job, in your words</label>
              <textarea
                value={estDescription}
                onChange={(e) => setEstDescription(e.target.value)}
                rows={4}
                placeholder="Tear out the old 40-gallon water heater in the garage, haul it away, install a new 50-gallon gas unit, new supply lines and expansion tank, bring the venting up to code"
                className="input"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Job category (optional)</label>
                <select
                  value={estCategory}
                  onChange={(e) => setEstCategory(e.target.value)}
                  className="input"
                >
                  <option value="">- pick one -</option>
                  {JOB_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Your price (optional)</label>
                <input
                  type="text"
                  value={estPrice}
                  onChange={(e) => setEstPrice(e.target.value)}
                  placeholder="$1,850 all-in"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">Materials notes (optional)</label>
              <textarea
                value={estMaterials}
                onChange={(e) => setEstMaterials(e.target.value)}
                rows={2}
                placeholder="Rheem 50-gal, about $650 in materials"
                className="input"
              />
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <h3 className="text-sm font-medium text-stone-900">
                Your past jobs
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                We read the line items off your old invoices and quotes to
                help ballpark future jobs like them. Customer names and
                contact details are never saved. Nothing is sent to anyone
                until you review it.
              </p>

              {pastJobs.length < 3 && (
                <p className="mt-2 text-xs text-stone-400">
                  {pastJobs.length === 0
                    ? "With none on file yet, this tool prices only from what you type above."
                    : "Upload more jobs of a given type and its suggestions get better for that type."}
                </p>
              )}

              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-200 px-4 py-3 text-center hover:border-hearth-300 hover:bg-hearth-100">
                <span className="text-sm font-medium text-stone-700">
                  {pjBusy
                    ? "Reading your document…"
                    : "Upload a past invoice or quote"}
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onPickPastJob}
                  disabled={pjBusy}
                  className="hidden"
                />
              </label>

              {pjError && (
                <p className="mt-2 text-xs text-red-600">{pjError}</p>
              )}

              {pastJobs.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {pastJobs.map((job) => {
                    const known = JOB_CATEGORIES.find(
                      (c) => c.value === job.job_type
                    );
                    const typeLabel = known
                      ? known.label
                      : job.job_type || "Past job";
                    const parts = [
                      typeLabel,
                      job.document_date,
                      job.total,
                    ].filter(Boolean) as string[];
                    return (
                      <li
                        key={job.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-stone-800">
                            {parts.join(" · ")}
                          </p>
                          {job.job_summary && (
                            <p className="mt-0.5 text-xs text-stone-500">
                              {job.job_summary}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePastJob(job.id)}
                          disabled={pjRemovingId === job.id}
                          className="shrink-0 text-xs font-medium text-stone-400 hover:text-red-600"
                        >
                          {pjRemovingId === job.id ? "Removing…" : "Remove"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {tool === "invoice" && (
          <>
            <p className="text-sm text-stone-600">
              A couple of lines about the finished job and the amount due. You
              get back clean invoice text with a work summary and payment note.
            </p>
            <div>
              <label className="label">The job, in your words</label>
              <textarea
                value={invDescription}
                onChange={(e) => setInvDescription(e.target.value)}
                rows={3}
                placeholder="Replaced the water heater at the Hendersons' place on Maple St, finished Tuesday"
                className="input"
              />
            </div>
            <div>
              <label className="label">Amount due</label>
              <input
                type="text"
                value={invAmount}
                onChange={(e) => setInvAmount(e.target.value)}
                placeholder="$1,450"
                className="input"
              />
            </div>
            <div>
              <label className="label">What was done (optional)</label>
              <textarea
                value={invWorkDone}
                onChange={(e) => setInvWorkDone(e.target.value)}
                rows={2}
                placeholder="New 50-gal unit, new supply lines, hauled away the old one, tested everything"
                className="input"
              />
            </div>
          </>
        )}

        {tool === "followup" && (
          <>
            <p className="text-sm text-stone-600">
              Pick the situation and add any details worth mentioning. You get
              back a short message ready to send as a text or email.
            </p>
            <div>
              <label className="label">Situation</label>
              <select
                value={fuSituation}
                onChange={(e) => setFuSituation(e.target.value)}
                className="input"
              >
                {SITUATIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Details (optional)</label>
              <textarea
                value={fuContext}
                onChange={(e) => setFuContext(e.target.value)}
                rows={3}
                placeholder="Quoted them $1,850 for a water heater swap last Thursday, seemed interested but haven't heard back"
                className="input"
              />
            </div>
          </>
        )}

        {tool === "review_response" && (
          <>
            <p className="text-sm text-stone-600">
              Paste the review and add a rating or context if you have them.
              You get back a professional response you can copy and post.
            </p>
            <div>
              <label className="label">The review</label>
              <textarea
                value={rrReviewText}
                onChange={(e) => setRrReviewText(e.target.value)}
                rows={4}
                placeholder="Paste the customer's review here"
                className="input"
              />
            </div>
            <div>
              <label className="label">Star rating (optional)</label>
              <select
                value={rrRating}
                onChange={(e) => setRrRating(e.target.value)}
                className="input"
              >
                <option value="">Not given</option>
                <option value="1">1 star</option>
                <option value="2">2 stars</option>
                <option value="3">3 stars</option>
                <option value="4">4 stars</option>
                <option value="5">5 stars</option>
              </select>
            </div>
            <div>
              <label className="label">Your side of the story (optional)</label>
              <textarea
                value={rrStory}
                onChange={(e) => setRrStory(e.target.value)}
                rows={2}
                placeholder="What actually happened, for your own context"
                className="input"
              />
            </div>
          </>
        )}

        {tool === "overdue" && (
          <>
            <p className="text-sm text-stone-600">
              Pick the stage and fill in the details. You get back a short
              reminder message ready to send.
            </p>
            <div>
              <label className="label">Stage</label>
              <select
                value={odStage}
                onChange={(e) => setOdStage(e.target.value)}
                className="input"
              >
                {OVERDUE_STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Amount owed</label>
                <input
                  type="text"
                  value={odAmount}
                  onChange={(e) => setOdAmount(e.target.value)}
                  placeholder="$1,450"
                  className="input"
                />
              </div>
              <div>
                <label className="label">How overdue</label>
                <input
                  type="text"
                  value={odOverdue}
                  onChange={(e) => setOdOverdue(e.target.value)}
                  placeholder="About 2 weeks"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">What the job was</label>
              <input
                type="text"
                value={odJob}
                onChange={(e) => setOdJob(e.target.value)}
                placeholder="Water heater replacement at the Hendersons' place"
                className="input"
              />
            </div>
            <div>
              <label className="label">Context (optional)</label>
              <textarea
                value={odContext}
                onChange={(e) => setOdContext(e.target.value)}
                rows={2}
                placeholder="Already sent one reminder last week, no reply yet"
                className="input"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "Writing your draft…" : "Write it for me"}
        </button>
      </div>

      {result && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-stone-900">Your draft</h2>
            <button
              type="button"
              onClick={copyResult}
              className="text-xs font-medium text-hearth-700 hover:text-hearth-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700">
            {result}
          </p>
          <p className="text-xs text-stone-400">
            This is a starting point: give it a quick read and tweak
            anything before you send or post it.
          </p>
        </div>
      )}
    </div>
  );
}
