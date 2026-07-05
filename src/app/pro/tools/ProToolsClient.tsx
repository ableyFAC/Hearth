"use client";

import { useState } from "react";
import { JOB_CATEGORIES } from "@/lib/constants";

// The member-side AI back office: three tabs (estimate, invoice, follow-up),
// each a small form that posts to /api/pro-tools and shows the generated
// document in a copyable block. Each tab keeps its own draft and result so
// switching tools mid-thought doesn't lose work.

type Tool = "estimate" | "invoice" | "followup";

const TABS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: "estimate", icon: "📋", label: "Estimate" },
  { id: "invoice", icon: "🧾", label: "Invoice" },
  { id: "followup", icon: "✉️", label: "Follow-up" },
];

const SITUATIONS: Array<{ value: string; label: string }> = [
  { value: "no_reply", label: "Sent a quote, no reply yet" },
  { value: "review", label: "Job's done, ask for a review" },
  { value: "checkin", label: "Check in with a past customer" },
];

export default function ProToolsClient() {
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

  // Per-tool results, so switching tabs doesn't wipe a draft you just made.
  const [results, setResults] = useState<Record<Tool, string | null>>({
    estimate: null,
    invoice: null,
    followup: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    } else {
      payload = { tool, situation: fuSituation, context: fuContext };
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
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTool(t.id)}
            className={tool === t.id ? "btn-primary" : "btn-secondary"}
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
            Give it a quick read and tweak anything before you send it.
          </p>
        </div>
      )}
    </div>
  );
}
