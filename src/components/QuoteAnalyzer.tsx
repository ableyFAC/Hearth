"use client";

import { useState } from "react";
import Link from "next/link";
import { JOB_CATEGORIES } from "@/lib/constants";

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
  fair: { label: "Looks fair", classes: "border-green-200 bg-green-50 text-green-700" },
  low: { label: "Looks low", classes: "border-hearth-200 bg-hearth-50 text-hearth-700" },
  high: { label: "Looks high", classes: "border-amber-200 bg-amber-50 text-amber-700" },
  unclear: { label: "Not enough info", classes: "border-stone-200 bg-stone-100 text-stone-600" },
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
            className={mode === "text" ? "btn-primary" : "btn-secondary"}
          >
            Paste the text
          </button>
        </div>

        {mode === "photo" ? (
          <div>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 px-4 py-8 text-center hover:border-hearth-300 hover:bg-hearth-50">
              <span className="text-2xl">🧾</span>
              <span className="text-sm font-medium text-stone-700">
                {preview ? "Use a different photo" : "Take or upload a photo of the quote"}
              </span>
              <span className="text-xs text-stone-500">
                A clear photo of every line item and the total works best
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={onPick}
                className="hidden"
              />
            </label>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Quote preview"
                className="mt-3 max-h-48 rounded-lg border border-stone-200 object-contain"
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
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={analyze}
          disabled={loading}
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
              <span className="text-sm text-stone-500">
                Total on quote: <span className="font-medium text-stone-800">{result.total}</span>
              </span>
            )}
          </div>

          <p className="text-sm text-stone-700">{result.summary}</p>

          {/* Same honest caveat Ask Hearth carries under its answers: this is an
              AI read, not a professional appraisal. */}
          <p className="text-[11px] text-stone-400">
            Hearth&apos;s read is an AI estimate. Confirm with a licensed pro
            before you decide.
          </p>

          {result.line_items.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-900">Line items</h2>
              <ul className="space-y-2">
                {result.line_items.map((li, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-stone-800">{li.label}</span>
                      {li.amount && (
                        <span className="font-medium text-stone-800">{li.amount}</span>
                      )}
                    </div>
                    {li.note && <p className="mt-1 text-xs text-stone-500">{li.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.red_flags.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-900">Red flags</h2>
              <ul className="space-y-1.5">
                {result.red_flags.map((flag, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                  >
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.missing.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-900">What's missing</h2>
              <ul className="space-y-1.5">
                {result.missing.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.negotiation && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-stone-900">Negotiation script</h2>
                <button
                  type="button"
                  onClick={copyNegotiation}
                  className="text-xs font-medium text-hearth-700 hover:text-hearth-800"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm text-stone-700">
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
        <div className="card space-y-3 border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
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
