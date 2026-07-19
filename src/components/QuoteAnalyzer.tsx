"use client";

import { useState } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { JOB_CATEGORIES } from "@/lib/constants";
import AiNotice from "@/components/AiNotice";

type Verdict = "fair" | "high" | "low" | "unclear";

type LineItem = {
  label: string;
  amount: string | null;
  note: string | null;
};

type Analysis = {
  verdict: Verdict;
  total: string | null;
  summary: string;
  line_items: LineItem[];
  red_flags: string[];
  missing: string[];
  negotiation: string;
};

type Mode = "photo" | "text";

const VERDICT_STYLE: Record<Verdict, { label: string; classes: string }> = {
  fair: { label: "Looks fair", classes: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200" },
  low: { label: "Looks low", classes: "border-hearth-200 bg-hearth-50 text-hearth-700 dark:border-hearth-900 dark:bg-hearth-900/40 dark:text-hearth-300" },
  high: { label: "Looks high", classes: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300" },
  unclear: { label: "Not enough info", classes: "border-stone-200 bg-stone-100 text-stone-600 dark:border-white/10 dark:bg-stone-700 dark:text-stone-300" },
};

// Read a File into base64 (no data: prefix) for the vision endpoint.
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

// The homeowner's advocate: hand over a photo of a contractor's quote (or its
// text), and Hearth reads every line, checks it against typical costs, calls
// out padding or vague charges, and writes a negotiation message for them.
// `freeTaste` means a non-Plus user is spending their one free check, so a
// successful result gets a compact Plus upsell under it.
export default function QuoteAnalyzer({
  freeTaste = false,
}: {
  freeTaste?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("photo");
  const [preview, setPreview] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("image/jpeg");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);

  // Homeowner corrections to the "what's missing" list. The AI's read isn't
  // final: sometimes the pro just forgot to write something down, or the
  // homeowner knows it's covered. `coveredMissing` holds indexes into
  // result.missing the homeowner confirmed are covered, and `addedCovered`
  // holds things the quote includes that the analyzer didn't catch. Analyses
  // live only in this component's state (nothing is persisted server-side),
  // so these edits are client state too and last exactly as long as the
  // analysis itself.
  const [coveredMissing, setCoveredMissing] = useState<Set<number>>(new Set());
  const [addedCovered, setAddedCovered] = useState<string[]>([]);
  const [addDraft, setAddDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  function clearEdits() {
    setCoveredMissing(new Set());
    setAddedCovered([]);
    setAddDraft("");
    setShowAdd(false);
  }

  function markCovered(i: number) {
    setCoveredMissing((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }

  function unmarkCovered(i: number) {
    setCoveredMissing((prev) => {
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function addCoveredItem() {
    const value = addDraft.trim();
    if (!value) return;
    setAddedCovered((prev) => [...prev, value]);
    setAddDraft("");
  }

  function removeAdded(i: number) {
    setAddedCovered((prev) => prev.filter((_, j) => j !== i));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!file) return;

    // Guard the size before we read it into memory and POST it to the vision
    // endpoint (cost/DoS + browser OOM).
    const MAX_BYTES = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_BYTES) {
      setError("That photo is too large (max 15MB). Try a smaller photo.");
      return;
    }

    setError(null);
    setResult(null);
    setMime(file.type || "image/jpeg");
    const b64 = await toBase64(file);
    setImage(b64);
    setPreview(URL.createObjectURL(file));
  }

  function reset() {
    setResult(null);
    setError(null);
    clearEdits();
  }

  async function analyze() {
    if (mode === "photo" && !image) {
      setError("Add a photo of the quote first.");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setError("Paste the quote text first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    clearEdits();

    try {
      const resp = await fetch("/api/analyze-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: mode === "photo" ? image : undefined,
          mime: mode === "photo" ? mime : undefined,
          text: mode === "text" ? text : undefined,
          category: category || undefined,
        }),
      });

      if (resp.status === 401) {
        setError("Please sign in and try again.");
        return;
      }
      if (resp.status === 403) {
        setError("This feature is part of Hearth Plus.");
        return;
      }

      const data = await resp.json().catch(() => ({}));
      if (data?.analysis) {
        setResult(data.analysis as Analysis);
      } else if (data?.reason === "rate_limited") {
        setError("Hearth has hit today's free usage limit. Please try again later.");
      } else if (data?.reason === "no_key") {
        setError("The quote analyzer isn't set up yet.");
      } else {
        setError(data?.error || "Couldn't read that quote. Try a clearer photo or paste the text instead.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyNegotiation() {
    if (!result?.negotiation) return;
    try {
      await navigator.clipboard.writeText(result.negotiation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  const verdictStyle = result ? VERDICT_STYLE[result.verdict] : null;
  const editCount = coveredMissing.size + addedCovered.length;

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("photo");
              reset();
            }}
            disabled={loading}
            aria-disabled={loading}
            className={mode === "photo" ? "btn-primary" : "btn-secondary"}
          >
            Upload a photo
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("text");
              reset();
            }}
            disabled={loading}
            aria-disabled={loading}
            className={mode === "text" ? "btn-primary" : "btn-secondary"}
          >
            Paste the text
          </button>
        </div>

        {mode === "photo" ? (
          <div>
            <label
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 px-4 py-8 text-center dark:border-white/10 ${
                loading
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:border-hearth-300 hover:bg-hearth-50"
              }`}
              aria-disabled={loading}
            >
              <ReceiptText className="h-8 w-8 text-stone-400 dark:text-stone-500" aria-hidden="true" />
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                {preview ? "Use a different photo" : "Take or upload a photo of the quote"}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                A clear photo of every line item and the total works best
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={onPick}
                disabled={loading}
                className="hidden"
              />
            </label>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Quote preview"
                className="mt-3 max-h-48 rounded-lg border border-stone-200 object-contain dark:border-white/10"
              />
            )}
          </div>
        ) : (
          <div>
            <label className="label">Quote text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste the line items and total from the quote here"
              disabled={loading}
              aria-disabled={loading}
              aria-busy={loading}
              className="input"
            />
          </div>
        )}

        <div>
          <label className="label">Job category (optional)</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input"
          >
            <option value="">- not sure -</option>
            {JOB_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          aria-disabled={loading}
          aria-busy={loading}
          className="btn-primary w-full"
        >
          {loading ? "Reading the quote…" : "Analyze this quote"}
        </button>
      </div>

      {result && (
        <div className="card space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            {verdictStyle && (
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium ${verdictStyle.classes}`}
              >
                {verdictStyle.label}
              </span>
            )}
            {result.total && (
              <span className="text-sm text-stone-500 dark:text-stone-400">
                Total on quote: <span className="font-medium text-stone-800 dark:text-stone-200">{result.total}</span>
              </span>
            )}
          </div>

          <p className="text-sm text-stone-700 dark:text-stone-300">{result.summary}</p>

          {/* Same honest caveat Ask Hearth carries under its answers: this is an
              AI read, not a professional appraisal. Shared component so the
              wording can't drift from the other AI surfaces. */}
          <AiNotice detail="This whole read, including the verdict and the total, came from the model. Confirm with a licensed pro before you decide." />

          {/* Honesty about homeowner edits: we don't re-run the model, so we
              annotate instead of pretending the verdict recomputed itself. */}
          {editCount > 0 && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
              After your edits:{" "}
              {[
                coveredMissing.size > 0
                  ? `you marked ${coveredMissing.size} of ${result.missing.length} missing ${
                      result.missing.length === 1 ? "item" : "items"
                    } as covered`
                  : null,
                addedCovered.length > 0
                  ? `you added ${addedCovered.length} ${
                      addedCovered.length === 1 ? "item" : "items"
                    } the quote includes`
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}
              . The verdict above is Hearth&apos;s original read of the quote,
              before your edits.
            </p>
          )}

          {result.line_items.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-900 dark:text-stone-100">Line items</h2>
              <ul className="space-y-2">
                {result.line_items.map((li, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-stone-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-stone-800 dark:text-stone-200">{li.label}</span>
                      {li.amount && (
                        <span className="font-medium text-stone-800 dark:text-stone-200">{li.amount}</span>
                      )}
                    </div>
                    {li.note && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{li.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.red_flags.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-900 dark:text-stone-100">Red flags</h2>
              <ul className="space-y-1.5">
                {result.red_flags.map((flag, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                  >
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* "What's missing", but correctable: the AI's read isn't final.
              Each item carries a small "It's covered" action that moves it to
              a homeowner-confirmed covered list (with undo), and a small
              input lets the homeowner add something the analyzer missed. */}
          <div>
            {result.missing.length > 0 && (
              <>
                <h2 className="mb-2 text-sm font-medium text-stone-900 dark:text-stone-100">What's missing</h2>
                {result.missing.some((_, i) => !coveredMissing.has(i)) ? (
                  <ul className="space-y-1.5">
                    {result.missing.map((item, i) =>
                      coveredMissing.has(i) ? null : (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:border-white/10 dark:bg-stone-800 dark:text-stone-300"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            onClick={() => markCovered(i)}
                            className="shrink-0 text-xs font-medium text-hearth-700 hover:text-hearth-800 dark:text-hearth-300 dark:hover:text-hearth-200"
                          >
                            It&apos;s covered
                          </button>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    Nothing left here, you&apos;ve marked everything as covered.
                  </p>
                )}
              </>
            )}

            {(coveredMissing.size > 0 || addedCovered.length > 0) && (
              <div className="mt-3">
                <h3 className="mb-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                  Covered, per you
                </h3>
                <ul className="space-y-1.5">
                  {result.missing.map((item, i) =>
                    coveredMissing.has(i) ? (
                      <li
                        key={`covered-${i}`}
                        className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
                      >
                        <span>
                          {item}{" "}
                          <span className="text-xs text-green-700 dark:text-green-300">
                            (you confirmed)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => unmarkCovered(i)}
                          className="shrink-0 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
                        >
                          Undo
                        </button>
                      </li>
                    ) : null
                  )}
                  {addedCovered.map((item, i) => (
                    <li
                      key={`added-${i}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
                    >
                      <span>
                        {item}{" "}
                        <span className="text-xs text-green-700 dark:text-green-300">(you added)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAdded(i)}
                        className="shrink-0 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200"
                      >
                        Undo
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3">
              {showAdd ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCoveredItem();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={addDraft}
                    onChange={(e) => setAddDraft(e.target.value)}
                    placeholder="e.g. warranty was agreed over the phone"
                    className="input flex-1"
                    autoFocus
                  />
                  <button type="submit" className="btn-secondary shrink-0">
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdd(false);
                      setAddDraft("");
                    }}
                    className="shrink-0 text-xs font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="text-xs font-medium text-hearth-700 hover:text-hearth-800 dark:text-hearth-300 dark:hover:text-hearth-200"
                >
                  + Add something the quote includes
                </button>
              )}
            </div>
          </div>

          {result.negotiation && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-stone-900 dark:text-stone-100">Negotiation script</h2>
                <button
                  type="button"
                  onClick={copyNegotiation}
                  className="text-xs font-medium text-hearth-700 hover:text-hearth-800 dark:text-hearth-300 dark:hover:text-hearth-200"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700 dark:border-white/10 dark:bg-stone-800 dark:text-stone-300">
                {result.negotiation}
              </p>
            </div>
          )}

          <Link href="/contractors" className="btn-primary block text-center">
            Get more quotes to compare
          </Link>
        </div>
      )}

      {result && freeTaste && (
        <div className="card space-y-3 border-hearth-200 bg-hearth-50 text-center dark:border-hearth-900 dark:bg-hearth-900/40">
          <p className="text-sm text-hearth-800 dark:text-hearth-200">
            That was your free check. Get every quote checked with Hearth Plus,
            $4.99/mo (first month free for new members).
          </p>
          <Link href="/plus?reason=quote" className="btn-primary inline-block">
            Get Hearth Plus
          </Link>
        </div>
      )}
    </div>
  );
}
