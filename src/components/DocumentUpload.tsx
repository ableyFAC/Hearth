"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { SYSTEM_TYPES } from "@/lib/constants";
import { saveDocumentAction } from "@/lib/document-actions";
import { imgSrc } from "@/lib/storage";

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

// The vault's "add" surface: pick a photo/PDF of a warranty, manual, receipt,
// or an appliance data plate; Hearth reads the facts off it; the owner confirms
// and saves. Then the saved card offers a one-tap "Add to my home".
export default function DocumentUpload({ propertyId }: { propertyId: string }) {
  const supabase = createClient();
  const [phase, setPhase] = useState<"idle" | "working" | "review">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<Extracted | null>(null);
  const [saving, startSave] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!file) return;

    // Guard the size before we read it into memory and POST it to the vision
    // endpoint (cost/DoS + browser OOM). accept="" is only a hint.
    const MAX_BYTES = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_BYTES) {
      setPhase("idle");
      setNote("That file is too large (max 15MB). Try a smaller photo or PDF.");
      return;
    }

    setPhase("working");
    setNote("Uploading…");
    setFields(null);

    // 1. Store the file under the property folder so RLS can gate it.
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${propertyId}/docs/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("home-photos")
      .upload(path, file, { upsert: false });
    if (upErr) {
      setPhase("idle");
      setNote(
        "Couldn't upload the file (is the home-photos bucket set up?). Try again."
      );
      return;
    }
    const { data: pub } = supabase.storage
      .from("home-photos")
      .getPublicUrl(path);
    setFileUrl(pub.publicUrl);
    setPreview(file.type.startsWith("image/") ? pub.publicUrl : null);

    // 2. Ask Hearth to read the facts off it.
    setNote("Reading the document…");
    let extracted: Extracted | null = null;
    try {
      const b64 = await toBase64(file);
      const resp = await fetch("/api/extract-document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: b64, mime: file.type || "image/jpeg" }),
      });
      const data = await resp.json();
      extracted = data?.doc ?? null;
    } catch {
      extracted = null;
    }

    // 3. Fall back to a blank, editable form if extraction was unavailable.
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
    setNote(
      extracted
        ? "Here's what Hearth read. Check it and save."
        : "Couldn't read it automatically. Fill in what you like and save."
    );
    setPhase("review");
  }

  function save(formData: FormData) {
    startSave(async () => {
      await saveDocumentAction(formData);
      // Reset for the next upload; the saved card appears in the list below.
      setPhase("idle");
      setFields(null);
      setFileUrl(null);
      setPreview(null);
      setNote("Saved. It's in your documents below.");
    });
  }

  const val = (v: string | number | null) => (v == null ? "" : String(v));

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      {phase !== "review" && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 px-4 py-8 text-center hover:border-hearth-300 hover:bg-hearth-50">
          <span className="text-2xl">📄</span>
          <span className="text-sm font-medium text-stone-700">
            Add a warranty, manual, receipt, or a photo of a model label
          </span>
          <span className="text-xs text-stone-400">
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
      )}

      {note && (
        <p
          className={`mt-2 text-xs ${
            phase === "working" ? "text-stone-400" : "text-stone-500"
          }`}
        >
          {phase === "working" ? "⏳ " : ""}
          {note}
        </p>
      )}

      {phase === "review" && fields && (
        <form action={save} className="mt-3 space-y-3">
          <input type="hidden" name="file_url" value={fileUrl ?? ""} />

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc(preview) ?? preview}
              alt="Document preview"
              className="mb-1 max-h-40 rounded-lg border border-stone-200 object-contain"
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
              onClick={() => {
                setPhase("idle");
                setFields(null);
                setNote(null);
              }}
              className="text-sm text-stone-500 hover:text-stone-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
