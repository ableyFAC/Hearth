"use client";

import { useState, useTransition } from "react";
import { confirmSystemAction } from "./actions";
import { labelFor, iconFor, SYSTEM_TYPES } from "@/lib/constants";
import type { HomeSystem } from "@/lib/database.types";

type Suggestion = {
  brand: string | null;
  model: string | null;
  serial: string | null;
  install_year: number | null;
};

const BLANK_SUGGESTION: Suggestion = {
  brand: null,
  model: null,
  serial: null,
  install_year: null,
};

// Read a File into base64 (no data: prefix) for the vision endpoint. Same
// helper as DocumentUpload.
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

// Plain-language, honest readout of the score change - never assumes it went
// up. A data plate can reveal a system is older or worse than the onboarding
// estimate guessed, so a scan can legitimately lower the score too.
function scoreMessage(before: number, after: number): string {
  if (after > before)
    return `Nice. Your Home Health Score moved from ${before} to ${after}.`;
  if (after < before)
    return `Your Home Health Score moved from ${before} to ${after}, now that we know more.`;
  return `Your Home Health Score stayed at ${after} - this one was already accounted for.`;
}

// One card in the "walk your home" flow: snap the data plate, Hearth reads a
// SUGGESTION off it (never auto-written), the owner confirms or edits it, and
// the card shows the real Home Health Score payoff for that one scan.
//
// The photo itself is never uploaded to storage: confirmSystemAction only
// ever writes the extracted fields (brand/model/serial/year), never a photo
// URL, so a stored object would just be an orphan whether the owner confirms
// or abandons the scan. The preview thumbnail is a local blob URL instead.
export default function SystemCaptureCard({
  system,
  propertyId,
}: {
  system: HomeSystem;
  propertyId: string;
}) {
  const [phase, setPhase] = useState<"idle" | "working" | "review" | "confirmed">(
    "idle"
  );
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [delta, setDelta] = useState<{ before: number; after: number } | null>(
    null
  );
  const [saving, startSave] = useTransition();

  const name = labelFor(SYSTEM_TYPES, system.system_type);
  const icon = iconFor(SYSTEM_TYPES, system.system_type);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!file) return;

    // Guard the size before reading it into memory and POSTing to the vision
    // endpoint (cost/DoS + browser OOM). 10MB binary stays safely under the
    // route's 14M-char base64 cap (base64 inflates bytes by ~4/3), so a photo
    // that passes here can't get a 413 after the upload already happened.
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_BYTES) {
      setNote("That photo is too large (max 10MB). Try a smaller one.");
      return;
    }

    setPhase("working");
    setNote("Reading the data plate…");
    setSuggestion(null);
    // Local preview only; nothing is written to storage (see the note above
    // the component).
    setPreview(URL.createObjectURL(file));

    let read: Suggestion | null = null;
    let failNote =
      "Couldn't read it automatically. Fill in what you can and confirm.";
    try {
      const b64 = await toBase64(file);
      const resp = await fetch("/api/confirm-system", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: b64,
          mime: file.type || "image/jpeg",
          system_id: system.id,
        }),
      });
      const data = await resp.json().catch(() => null);
      read = data?.suggestion ?? null;
      // Tell the truth about WHY nothing was read: a used-up daily AI limit
      // or unconfigured key is not a bad photo.
      if (!read && data?.reason === "rate_limited") {
        failNote =
          "You've hit today's AI limit, so Hearth can't read the photo right now. Fill in what you can and confirm.";
      } else if (!read && data?.reason === "no_key") {
        failNote =
          "Automatic reading isn't set up yet. Fill in what you can and confirm.";
      }
    } catch {
      read = null;
    }

    setSuggestion(read ?? BLANK_SUGGESTION);
    setNote(
      read
        ? "Here's what Hearth read off the label. Check it and confirm."
        : failNote
    );
    setPhase("review");
  }

  function skipToManual() {
    setSuggestion(BLANK_SUGGESTION);
    setNote(null);
    setPhase("review");
  }

  function confirm(formData: FormData) {
    startSave(async () => {
      const result = await confirmSystemAction(formData);
      if (preview) URL.revokeObjectURL(preview);
      setDelta(result);
      setPhase("confirmed");
    });
  }

  if (phase === "confirmed" && delta) {
    return (
      <li className="card space-y-1 border-green-200 bg-green-50/60">
        <p className="flex items-center gap-2 font-medium text-stone-900">
          <span>{icon}</span> {name}
          <span className="chip bg-green-100 text-green-700">✓ Confirmed</span>
        </p>
        <p className="text-sm text-green-800">
          {scoreMessage(delta.before, delta.after)}
        </p>
      </li>
    );
  }

  return (
    <li className="card space-y-3">
      <p className="flex items-center gap-2 font-medium text-stone-900">
        <span>{icon}</span> {name}
        <span className="chip bg-stone-100 text-stone-500">Estimated</span>
      </p>

      {phase !== "review" && (
        <>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 px-4 py-6 text-center hover:border-hearth-300 hover:bg-hearth-50">
            <span className="text-2xl">📷</span>
            <span className="text-sm font-medium text-stone-700">
              Snap the data plate
            </span>
            <span className="text-xs text-stone-400">
              Hearth reads the brand, model, and age off it
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={onPick}
              disabled={phase === "working"}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={skipToManual}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            No photo handy? Enter details by hand
          </button>
        </>
      )}

      {note && (
        <p className="text-xs text-stone-500">
          {phase === "working" ? "⏳ " : ""}
          {note}
        </p>
      )}

      {phase === "review" && suggestion && (
        <form action={confirm} className="space-y-3">
          <input type="hidden" name="system_id" value={system.id} />

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${name} data plate`}
              className="max-h-32 rounded-lg border border-stone-200 object-contain"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Brand</label>
              <input
                name="brand"
                className="input"
                placeholder="e.g. Rheem"
                defaultValue={suggestion.brand ?? ""}
              />
            </div>
            <div>
              <label className="label">Model</label>
              <input
                name="model"
                className="input"
                placeholder="e.g. XE50T10H45U0"
                defaultValue={suggestion.model ?? ""}
              />
            </div>
            <div>
              <label className="label">Serial (optional)</label>
              <input
                name="serial"
                className="input"
                defaultValue={suggestion.serial ?? ""}
              />
            </div>
            <div>
              <label className="label">Install year</label>
              <input
                name="install_year"
                type="number"
                className="input"
                placeholder="2015"
                defaultValue={suggestion.install_year ?? system.install_year ?? ""}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Condition (optional)</label>
              <select
                name="condition_rating"
                className="select"
                defaultValue={system.condition_rating ?? ""}
              >
                <option value="">Not sure</option>
                <option value="5">5 (like new)</option>
                <option value="4">4 (good)</option>
                <option value="3">3 (fair)</option>
                <option value="2">2 (worn)</option>
                <option value="1">1 (failing)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (preview) URL.revokeObjectURL(preview);
                setPhase("idle");
                setSuggestion(null);
                setPreview(null);
                setNote(null);
              }}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Confirming…" : "Confirm"}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
