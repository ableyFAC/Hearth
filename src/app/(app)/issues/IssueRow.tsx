"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ISSUE_CATEGORIES,
  SEVERITIES,
  labelFor,
  iconFor,
} from "@/lib/constants";
import {
  updateIssueAction,
  checkResolveIssueAction,
  reopenIssueAction,
} from "./actions";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

export default function IssueRow({
  issue,
  initialResolved = false,
}: {
  issue: any;
  initialResolved?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [resolved, setResolved] = useState(initialResolved);
  const [busy, setBusy] = useState(false);

  async function toggleResolved() {
    setBusy(true);
    try {
      if (resolved) {
        await reopenIssueAction(issue.id);
        setResolved(false);
      } else {
        await checkResolveIssueAction(issue.id);
        setResolved(true);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="card">
        <form
          action={async (fd) => {
            await updateIssueAction(fd);
            setEditing(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={issue.id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select
                name="category"
                className="select"
                defaultValue={issue.category}
              >
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Severity</label>
              <select
                name="severity"
                className="select"
                defaultValue={issue.severity}
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">What&apos;s going on?</label>
            <textarea
              name="description"
              className="textarea"
              rows={3}
              defaultValue={issue.description ?? ""}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button className="btn-primary flex-1">Save changes</button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="card space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={toggleResolved}
            title={resolved ? "Reopen" : "Mark resolved"}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
              resolved
                ? "border-green-500 bg-green-500 text-white"
                : "border-stone-300 text-transparent hover:border-green-500"
            }`}
          >
            ✓
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`font-medium ${
                  resolved ? "text-stone-400 line-through" : "text-stone-900"
                }`}
              >
                {iconFor(ISSUE_CATEGORIES, issue.category)}{" "}
                {labelFor(ISSUE_CATEGORIES, issue.category)}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${SEVERITY_STYLE[issue.severity]}`}
              >
                {labelFor(SEVERITIES, issue.severity)}
              </span>
              {issue.converted_to_lead && (
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                  pro requested
                </span>
              )}
            </div>
            {issue.description && (
              <p
                className={`mt-1 text-sm ${
                  resolved ? "text-stone-400 line-through" : "text-stone-600"
                }`}
              >
                {issue.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {resolved ? (
            <button
              type="button"
              disabled={busy}
              onClick={toggleResolved}
              className="text-xs font-medium text-hearth-700 hover:underline disabled:opacity-50"
            >
              {busy ? "…" : "Undo"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-hearth-700 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      {!issue.converted_to_lead && !resolved && (
        <Link
          href={`/contractors?issue=${issue.id}&category=${issue.category}`}
          className="inline-block text-sm font-medium text-hearth-700 hover:underline"
        >
          Connect me with a vetted pro →
        </Link>
      )}
    </li>
  );
}
