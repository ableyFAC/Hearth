"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { SYSTEM_TYPES } from "@/lib/constants";
import { saveDocumentAction } from "@/lib/document-actions";
import TakePhotoButton from "@/components/TakePhotoButton";

const DOC_TYPES = [
  { value: "warranty", label: "Warranty" },
  { value: "manual", label: "Manual" },
  { value: "receipt", label: "Receipt / invoice" },
  { value: "inspection_report", label: "Inspection report" },
  { value: "other", label: "Other" },
];

type Extracted = {
  doc_type: string;
  title: string;
  brand: string | null;
  model: string | null;
  install_year: number | null;
  warranty_expires: string | null;
  system_type: string | null;
  summary: string | null;
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

// Each status note carries a tone so the color matches the news: red for
// errors, green for success, calm stone for everything in between.
type Note = { text: string; tone: "error" | "ok" | "working" };

// The vault's "add" surface: pick a photo/PDF of a warranty, manual, receipt,
// or an appliance data plate; Hearth reads the facts off it; the owner confirms
// and saves. Then the saved card offers a one-tap "Add to my home".
//
// The file itself is only uploaded to storage once the owner actually saves
// (below). Extraction only needs the bytes, not a stored object, so picking a
// file and then canceling or navigating away leaves nothing orphaned in the
// private bucket.
export default function DocumentUpload({ propertyId }: { propertyId: string }) {
  const supabase = createClient();
  const [phase, setPhase] = useState<"idle" | "working" | "review">("idle");
  const [note, setNote] = useState<Note | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<Extracted | null>(null);
  const [saving, startSave] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const picked = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!picked) return;

    // Guard the size before we read it into memory and POST it to the vision
    // endpoint (cost/DoS + browser OOM). accept="" is only a hint.
    const MAX_BYTES = 15 * 1024 * 1024; // 15MB
    if (picked.size > MAX_BYTES) {
      setPhase("idle");
      setNote({
        text: "That file is too large (max 15MB). Try a smaller photo or PDF.",
        tone: "error",
      });
      return;
    }

    setPhase("working");
    setNote({ text: "Reading the document…", tone: "working" });
    setFields(null);
    setFile(picked);
    // Local preview only, no storage object: a blob URL renders directly, no
    // signing needed, and it never touches the (private) home-photos bucket.
    setPreview(picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null);

    // Ask Hearth to read the facts off it.
    let extracted: Extracted | null = null;
    try {
      const b64 = await toBase64(picked);
      const resp = await fetch("/api/extract-document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: b64, mime: picked.type || "image/jpeg" }),
      });
      const data = await resp.json();
      extracted = data?.doc ?? null;
    } catch {
      extracted = null;
    }

    // Fall back to a blank, editable form if extraction was unavailable.
    setFields(
      extracted ?? {
        doc_type: "other",
        title: "",
        brand: null,
        model: null,
        install_year: null,
        warranty_expires: null,
        system_type: null,
        summary: null,
      }
    );
    setNote({
      text: extracted
        ? "Here's what Hearth read. Check it and save."
        : "Couldn't read it automatically. Fill in what you like and save.",
      tone: "working",
    });
    setPhase("review");
  }

  function save(formData: FormData) {
    startSave(async () => {
      if (!file) return;
      setNote({ text: "Uploading…", tone: "working" });
      // Only now, on the owner's actual say-so, does the file land in
      // storage: the property-scoped path lets RLS gate it.
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${propertyId}/docs/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("home-photos")
        .upload(path, file, { upsert: false });
      if (upErr) {
        // The setup detail (a missing home-photos bucket, a policy problem)
        // belongs in the console, not in front of the homeowner.
        console.error("Document upload to home-photos failed:", upErr);
        setNote({
          text: "We couldn't upload that file. Please try again in a moment.",
          tone: "error",
        });
        return;
      }
      const { data: pub } = supabase.storage
        .from("home-photos")
        .getPublicUrl(path);
      formData.set("file_url", pub.publicUrl);

      const result = await saveDocumentAction(formData);
      if (!result.ok) {
        // The action already flashed the error and removed the orphan file.
        // Keep the review form intact so the owner can retry, and never claim
        // it saved. Surface the reason inline too.
        setNote({ text: result.error, tone: "error" });
        return;
      }
      // Reset for the next upload; the saved card appears in the list below.
      if (preview) URL.revokeObjectURL(preview);
      setPhase("idle");
      setFields(null);
      setFile(null);
      setPreview(null);
      setNote({ text: "Saved. It's in your documents below.", tone: "ok" });
    });
  }

  function cancel() {
    if (preview) URL.revokeObjectURL(preview);
    setPhase("idle");
    setFile(null);
    setFields(null);
    setPreview(null);
    setNote(null);
  }

  const val = (v: string | number | null) => (v == null ? "" : String(v));

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-800">
      {phase !== "review" && (
        <>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 px-4 py-8 text-center hover:border-hearth-300 hover:bg-hearth-50 dark:border-white/10">
            <span className="text-2xl">📄</span>
            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
              Add a warranty, manual, receipt, or a photo of a model label
            </span>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              Hearth reads it and fills in your home details for you
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={onPick}
              disabled={phase === "working"}
              className="hidden"
            />
          </label>
          {/* On phones, shooting the label/receipt right now beats hunting the
              gallery. Same onPick, so extraction works identically. */}
          <TakePhotoButton
            onPick={onPick}
            disabled={phase === "working"}
            className="mt-2"
          />
        </>
      )}

      {note && (
        <p
          className={`mt-2 text-xs ${
            note.tone === "error"
              ? "text-red-600 dark:text-red-400"
              : note.tone === "ok"
                ? "text-green-700 dark:text-green-300"
                : "text-stone-500 dark:text-stone-400"
          }`}
        >
          {phase === "working" ? "⏳ " : ""}
          {note.text}
        </p>
      )}

      {phase === "review" && fields && (
        <form action={save} className="mt-3 space-y-3">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Document preview"
              className="mb-1 max-h-40 rounded-lg border border-stone-200 object-contain dark:border-white/10"
            />
          )}

          <div>
            <label className="label">Title</label>
            <input
              name="title"
              defaultValue={val(fields.title)}
              placeholder="e.g. Rheem water heater warranty"
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select
                name="doc_type"
                defaultValue={fields.doc_type}
                className="input"
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Relates to</label>
              <select
                name="system_type"
                defaultValue={fields.system_type ?? ""}
                className="input"
              >
                <option value="">- none -</option>
                {SYSTEM_TYPES.map((sys) => (
                  <option key={sys.value} value={sys.value}>
                    {sys.icon} {sys.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Brand</label>
              <input
                name="brand"
                defaultValue={val(fields.brand)}
                placeholder="e.g. Rheem"
                className="input"
              />
            </div>
            <div>
              <label className="label">Model</label>
              <input
                name="model"
                defaultValue={val(fields.model)}
                placeholder="e.g. XE50T10H45U0"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Install / purchase year</label>
              <input
                name="install_year"
                type="number"
                defaultValue={val(fields.install_year)}
                placeholder="e.g. 2021"
                className="input"
              />
            </div>
            <div>
              <label className="label">Warranty expires</label>
              <input
                name="warranty_expires"
                type="date"
                defaultValue={val(fields.warranty_expires)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Summary</label>
            <textarea
              name="summary"
              defaultValue={val(fields.summary)}
              rows={2}
              placeholder="What this is and the one fact worth remembering"
              className="input"
            />
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save to documents"}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
