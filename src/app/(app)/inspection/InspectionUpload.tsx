"use client";

import { useState, useTransition } from "react";
import { SYSTEM_TYPES, ISSUE_CATEGORIES, labelFor, iconFor } from "@/lib/constants";
import { saveInspectionFindingsAction } from "./actions";

type Mode = "photo" | "text";

type ProposedSystem = {
  system_type: string;
  condition_rating: number | null;
  install_year: number | null;
  notes: string | null;
};

type ProposedIssue = {
  category: string;
  severity: string;
  description: string | null;
};

type IngestResult = {
  summary: string;
  systems: ProposedSystem[];
  issues: ProposedIssue[];
};

const CONDITION_LABEL: Record<number, string> = {
  5: "Excellent",
  4: "Good",
  3: "Fair",
  2: "Poor",
  1: "Needs immediate attention",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  urgent: "Urgent",
};

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
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

// Add an inspection report an owner already has: photos of its pages or
// pasted text go to Hearth, which proposes systems and issues. Nothing is
// saved until the owner reviews the checklist and confirms.
export default function InspectionUpload() {
  const [mode, setMode] = useState<Mode>("photo");
  const [images, setImages] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "review" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [systemsChecked, setSystemsChecked] = useState<boolean[]>([]);
  const [issuesChecked, setIssuesChecked] = useState<boolean[]>([]);
  const [saving, startSave] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = ""; // allow re-picking the same files
    if (!files.length) return;

    // Guard the size before reading into memory and POSTing to the vision
    // endpoint (cost/DoS + browser OOM). accept="" is only a hint.
    const MAX_BYTES = 15 * 1024 * 1024; // 15MB
    if (files.some((f) => f.size > MAX_BYTES)) {
      setError("One of those photos is too large (max 15MB each). Try smaller photos.");
      return;
    }

    setError(null);
    const newB64 = await Promise.all(files.map(toBase64));
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...newB64]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function ingest() {
    if (mode === "photo" && images.length === 0) {
      setError("Add at least one photo of the report first.");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setError("Paste the report text first.");
      return;
    }

    setPhase("working");
    setError(null);
    setResult(null);

    try {
      const resp = await fetch("/api/ingest-inspection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          images: mode === "photo" ? images : undefined,
          text: mode === "text" ? text : undefined,
        }),
      });

      if (resp.status === 401) {
        setPhase("idle");
        setError("Please sign in and try again.");
        return;
      }

      const data = await resp.json().catch(() => ({}));
      if (data?.result) {
        const found = data.result as IngestResult;
        setResult(found);
        setSystemsChecked(found.systems.map(() => true));
        setIssuesChecked(found.issues.map(() => true));
        setPhase("review");
      } else if (data?.reason === "rate_limited") {
        setPhase("idle");
        setError("Hearth has hit today's free usage limit. Please try again later.");
      } else if (data?.reason === "no_key") {
        setPhase("idle");
        setError("Report reading isn't set up yet.");
      } else {
        setPhase("idle");
        setError(
          data?.error ||
            "Couldn't read that report. Try clearer photos or paste the text instead."
        );
      }
    } catch {
      setPhase("idle");
      setError("Something went wrong. Please try again.");
    }
  }

  function confirmAndSave(formData: FormData) {
    startSave(async () => {
      await saveInspectionFindingsAction(formData);
      setPhase("done");
      setImages([]);
      setPreviews([]);
      setText("");
      setResult(null);
    });
  }

  function startOver() {
    setPhase("idle");
    setResult(null);
    setError(null);
  }

  if (phase === "done") {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Added to your home. Check your systems and issues to see what's new.
        </p>
        <button type="button" className="btn-secondary" onClick={startOver}>
          Add another report
        </button>
      </div>
    );
  }

  if (phase === "review" && result) {
    const confirmedSystems = JSON.stringify(
      result.systems.filter((_, i) => systemsChecked[i])
    );
    const confirmedIssues = JSON.stringify(
      result.issues.filter((_, i) => issuesChecked[i])
    );

    return (
      <form action={confirmAndSave} className="space-y-4">
        <input type="hidden" name="systems_json" value={confirmedSystems} />
        <input type="hidden" name="issues_json" value={confirmedIssues} />

        {result.summary && (
          <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            {result.summary}
          </p>
        )}

        {result.systems.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-stone-900">
              Systems found
            </h3>
            <ul className="space-y-2">
              {result.systems.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-stone-200 p-3"
                >
                  <input
                    type="checkbox"
                    checked={systemsChecked[i] ?? true}
                    onChange={(e) =>
                      setSystemsChecked((prev) => {
                        const next = [...prev];
                        next[i] = e.target.checked;
                        return next;
                      })
                    }
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800">
                      {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
                      {labelFor(SYSTEM_TYPES, s.system_type)}
                      {s.condition_rating ? (
                        <span className="ml-2 text-xs font-normal text-stone-500">
                          {CONDITION_LABEL[s.condition_rating] ?? ""} (
                          {s.condition_rating}/5)
                        </span>
                      ) : null}
                      {s.install_year ? (
                        <span className="ml-2 text-xs font-normal text-stone-500">
                          Installed {s.install_year}
                        </span>
                      ) : null}
                    </p>
                    {s.notes && (
                      <p className="text-xs text-stone-500">{s.notes}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.issues.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-stone-900">
              Issues found
            </h3>
            <ul className="space-y-2">
              {result.issues.map((iss, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-stone-200 p-3"
                >
                  <input
                    type="checkbox"
                    checked={issuesChecked[i] ?? true}
                    onChange={(e) =>
                      setIssuesChecked((prev) => {
                        const next = [...prev];
                        next[i] = e.target.checked;
                        return next;
                      })
                    }
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800">
                      {iconFor(ISSUE_CATEGORIES, iss.category)}{" "}
                      {labelFor(ISSUE_CATEGORIES, iss.category)}
                      <span
                        className={`ml-2 rounded-full border px-2 py-0.5 text-xs font-normal ${
                          SEVERITY_STYLE[iss.severity] ?? SEVERITY_STYLE.low
                        }`}
                      >
                        {SEVERITY_LABEL[iss.severity] ?? iss.severity}
                      </span>
                    </p>
                    {iss.description && (
                      <p className="text-xs text-stone-500">{iss.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.systems.length === 0 && result.issues.length === 0 && (
          <p className="text-sm text-stone-500">
            Hearth couldn't find any specific systems or issues in that
            report.
          </p>
        )}

        <div className="flex gap-3">
          <button type="button" className="btn-secondary" onClick={startOver}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving…" : "Add to my home"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("photo");
            setError(null);
          }}
          className={mode === "photo" ? "btn-primary" : "btn-secondary"}
        >
          Upload photos
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("text");
            setError(null);
          }}
          className={mode === "text" ? "btn-primary" : "btn-secondary"}
        >
          Paste the text
        </button>
      </div>

      {mode === "photo" ? (
        <div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 px-4 py-8 text-center hover:border-hearth-300 hover:bg-hearth-50">
            <span className="text-2xl">🔍</span>
            <span className="text-sm font-medium text-stone-700">
              {previews.length ? "Add more pages" : "Upload photos of the inspection report"}
            </span>
            <span className="text-xs text-stone-400">
              You can add every page as its own photo
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onPick}
              disabled={phase === "working"}
              className="hidden"
            />
          </label>
          {previews.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Report page ${i + 1}`}
                    className="h-20 w-20 rounded-lg border border-stone-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -right-1 -top-1 rounded-full bg-stone-800 px-1.5 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="label">Report text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste the findings from the inspection report here"
            className="input"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={ingest}
        disabled={phase === "working"}
        className="btn-primary w-full"
      >
        {phase === "working" ? "Reading the report…" : "Read this report"}
      </button>
    </div>
  );
}
