"use client";

import { useState } from "react";
import { complianceStatus, type ComplianceStatus } from "@/lib/proCompliance";

type DocState = {
  expires: string | null;
  docPath: string | null;
};

const MAX_BYTES = 10 * 1024 * 1024; // 10MB, matches the API route's cap

function fmt(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function StatusPill({ status }: { status: ComplianceStatus }) {
  if (status === "expired") {
    return (
      <span className="chip border border-red-200 bg-red-50 text-red-700">
        Expired
      </span>
    );
  }
  if (status === "expiring") {
    return (
      <span className="chip border border-amber-200 bg-amber-50 text-amber-700">
        Expiring soon
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">
        On file
      </span>
    );
  }
  return <span className="chip bg-stone-100 text-stone-500">Nothing on file</span>;
}

// "License and insurance" compliance calendar: upload a document once, and
// Hearth reads the expiration date off it so it can remind the pro before
// anything lapses. Honest by construction: the copy only ever claims a date
// is "on file", never that the license or the policy was verified.
export default function ComplianceCard({
  license,
  insurance,
}: {
  license: DocState;
  insurance: DocState;
}) {
  const [licenseState, setLicenseState] = useState<DocState>(license);
  const [insuranceState, setInsuranceState] = useState<DocState>(insurance);

  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-stone-900">
          License and insurance
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Hearth stores your document and reminds you before it expires. It
          does not verify the license or the insurance policy.
        </p>
      </div>

      <ComplianceRow
        kind="license"
        label="Contractor license"
        state={licenseState}
        onChange={setLicenseState}
      />

      <div className="border-t border-stone-100 pt-5">
        <ComplianceRow
          kind="insurance"
          label="Insurance"
          state={insuranceState}
          onChange={setInsuranceState}
        />
      </div>
    </section>
  );
}

function ComplianceRow({
  kind,
  label,
  state,
  onChange,
}: {
  kind: "license" | "insurance";
  label: string;
  state: DocState;
  onChange: (next: DocState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState(state.expires ?? "");
  const [needsManual, setNeedsManual] = useState(false);

  const { status } = complianceStatus(state.expires);

  async function submit(fd: FormData) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/pro-compliance", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setErr(data.error || "That didn't go through. Please try again.");
        return;
      }
      const nextExpires: string | null = data.expires_on ?? state.expires;
      onChange({
        expires: nextExpires,
        docPath: data.doc_path ?? state.docPath,
      });
      setManualDate(nextExpires ?? "");
      setNeedsManual(Boolean(data.needs_manual_date));
    } catch {
      setErr("That didn't go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setErr("Please pick a file under 10MB.");
      input.value = "";
      return;
    }
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    await submit(fd);
    input.value = "";
  }

  async function saveManualDate() {
    if (!manualDate) return;
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("manual_expires_on", manualDate);
    await submit(fd);
  }

  const showDateField = needsManual || status !== "none";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-stone-900">{label}</p>
          <p className="text-xs text-stone-500">
            {state.expires
              ? `On file, expires ${fmt(state.expires)}`
              : "Nothing on file yet"}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={onPick}
          disabled={busy}
          className="block text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-hearth-100 file:px-3 file:py-1.5 file:text-hearth-800"
        />
        {state.docPath && (
          <a
            href={`/api/pro-compliance?path=${encodeURIComponent(state.docPath)}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-hearth-700 hover:underline"
          >
            View document
          </a>
        )}
      </div>

      {showDateField && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-stone-500">
            {needsManual
              ? "Hearth couldn't read a date off that document. Enter it:"
              : "Expiration date"}
          </label>
          <input
            type="date"
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
            className="input h-9 w-auto text-sm"
          />
          <button
            type="button"
            onClick={saveManualDate}
            disabled={busy || !manualDate}
            className="btn-secondary text-xs"
          >
            Save date
          </button>
        </div>
      )}

      {busy && <p className="text-xs text-stone-500">Uploading, one moment.</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
