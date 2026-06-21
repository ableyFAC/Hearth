"use client";

import { useState } from "react";
import Link from "next/link";
import { assessSystem } from "@/lib/health";
import {
  labelFor,
  iconFor,
  SYSTEM_TYPES,
  ISSUE_CATEGORIES,
  STARTER_SYSTEM_NOTE,
  categoryForSystem,
  tipForSystem,
  materialLabel,
} from "@/lib/constants";
import type { HomeSystem } from "@/lib/database.types";
import { updateSystemAction, deleteSystemAction } from "./actions";
import PhotoUpload from "@/components/PhotoUpload";
import MonthYearInput from "@/components/MonthYearInput";
import MaterialSelect from "@/components/MaterialSelect";

const STAGE_STYLE: Record<string, string> = {
  healthy: "bg-green-50 text-green-700 border-green-200",
  aging: "bg-amber-50 text-amber-700 border-amber-200",
  due: "bg-red-50 text-red-700 border-red-200",
  unknown: "bg-stone-50 text-stone-500 border-stone-200",
};

// Plain-language label for each life stage, shown right next to the system so an
// owner can tell at a glance whether it needs attention.
const STAGE_LABEL: Record<string, string> = {
  healthy: "Healthy",
  aging: "Plan ahead",
  due: "Needs maintenance",
  unknown: "Add details",
};

// Stored dates are YYYY-MM-DD; show them as MM/YYYY in the simple text field.
function dateToMmYyyy(d: string | null | undefined): string {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : "";
}

type OpenIssue = { category: string; description: string | null } | null;

export default function SystemRow({
  system: s,
  openIssue = null,
  photos = [],
}: {
  system: HomeSystem;
  openIssue?: OpenIssue;
  photos?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const h = assessSystem(s);
  // A system to deal with now: reported failing, or with an open reported issue.
  const mustDo = s.condition_rating === 1 || !!openIssue;
  // Red-bordered if it needs attention now: must-do, or due for maintenance.
  const needsBorder = mustDo || h.stage === "due";

  // Plain-language detail lines shown when the owner expands a system.
  const ageText =
    h.age != null ? `${h.age} years` : "Unknown, add an install year";
  const lifeLeftText =
    h.remaining == null
      ? "Add an install year to estimate"
      : h.remaining > 0
        ? `about ${h.remaining} more years`
        : `past due by ${Math.abs(h.remaining)} years`;
  const lastServicedText = dateToMmYyyy(s.last_serviced) || "Not recorded";
  const conditionText = s.condition_rating
    ? `${s.condition_rating} of 5`
    : "Not set";

  // Plain explanation of why this system has its current status (must do / needs
  // maintenance / plan ahead / healthy), combining any reported issue, the
  // owner-set condition, and the age-based assessment.
  const whyParts: string[] = [];
  if (openIssue) {
    whyParts.push(
      `You reported a ${labelFor(ISSUE_CATEGORIES, openIssue.category)} issue${
        openIssue.description ? `: ${openIssue.description}` : ""
      }.`
    );
  }
  if (s.condition_rating === 1)
    whyParts.push("You marked its condition as failing.");
  else if (s.condition_rating === 2)
    whyParts.push("You marked its condition as worn.");
  whyParts.push(h.message);
  const whyText = whyParts.join(" ");

  if (editing) {
    return (
      <li className="card space-y-3">
        {/* Header + Remove sit OUTSIDE the update form (a separate delete form
            can't be nested inside another form). */}
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-stone-900">
            {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
            {labelFor(SYSTEM_TYPES, s.system_type)}
          </p>
          <form action={deleteSystemAction}>
            <input type="hidden" name="id" value={s.id} />
            {confirmRemove ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs text-stone-500 hover:text-stone-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                >
                  Confirm remove?
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-xs text-stone-400 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </form>
        </div>
        <form
          action={async (fd) => {
            await updateSystemAction(fd);
            setEditing(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={s.id} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Install year</label>
              <input
                name="install_year"
                type="number"
                className="input"
                defaultValue={s.install_year ?? ""}
                placeholder="2015"
              />
            </div>
            <div>
              <label className="label">Last serviced</label>
              <MonthYearInput
                name="last_serviced"
                defaultValue={dateToMmYyyy(s.last_serviced)}
              />
            </div>
            <div>
              <label className="label">
                {materialLabel(s.system_type)} (optional)
              </label>
              <MaterialSelect
                systemType={s.system_type}
                defaultValue={s.material_or_model ?? ""}
              />
            </div>
            <div>
              <label className="label">Condition</label>
              <select
                name="condition_rating"
                className="select"
                defaultValue={s.condition_rating ?? ""}
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

          <div>
            <label className="label">Notes</label>
            <textarea
              name="notes"
              className="textarea"
              rows={2}
              defaultValue={s.notes === STARTER_SYSTEM_NOTE ? "" : s.notes ?? ""}
            />
          </div>

          <PhotoUpload propertyId={s.property_id} />

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
    <li
      onClick={() => setExpanded((v) => !v)}
      className={`card flex cursor-pointer items-start justify-between gap-4 ${
        needsBorder ? "!border !border-red-400" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900">
            {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
            {labelFor(SYSTEM_TYPES, s.system_type)}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${STAGE_STYLE[h.stage]}`}
          >
            {STAGE_LABEL[h.stage] ?? h.stage}
          </span>
          {mustDo && (
            <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              🚨 Must do
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="mt-0.5 text-xs font-medium text-hearth-700 hover:underline"
        >
          Edit
        </button>
        {expanded && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-stone-50 p-3 text-xs">
            <div className="col-span-2 mb-2 border-b border-stone-200 pb-3">
              <dt className="font-medium text-stone-800">Why this status</dt>
              <dd className="mt-1 text-stone-500">{whyText}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">How old it is</dt>
              <dd className="text-stone-500">{ageText}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Typical replacement</dt>
              <dd className="text-stone-500">
                every {h.lifespan} years
              </dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Life left</dt>
              <dd className="text-stone-500">{lifeLeftText}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Last serviced</dt>
              <dd className="text-stone-500">{lastServicedText}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Condition</dt>
              <dd className="text-stone-500">{conditionText}</dd>
            </div>
            {s.material_or_model && (
              <div className="col-span-2">
                <dt className="font-medium text-stone-800">{materialLabel(s.system_type)}</dt>
                <dd className="text-stone-500">
                  {s.material_or_model}
                </dd>
              </div>
            )}
            {s.notes && s.notes !== STARTER_SYSTEM_NOTE && (
              <div className="col-span-2">
                <dt className="font-medium text-stone-800">Notes</dt>
                <dd className="text-stone-500">{s.notes}</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="font-medium text-stone-800">Maintenance tip</dt>
              <dd className="text-stone-500">{tipForSystem(s.system_type)}</dd>
            </div>
          </dl>
        )}
        {openIssue && (
          <p className="mt-1 text-xs font-medium text-red-600">
            ⚠ You reported a{" "}
            {labelFor(ISSUE_CATEGORIES, openIssue.category)} issue
            {openIssue.description ? `: ${openIssue.description}` : ""}.
          </p>
        )}
        {photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt={`${labelFor(SYSTEM_TYPES, s.system_type)} photo`}
                className="h-16 w-16 rounded-md object-cover"
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="flex shrink-0 flex-col items-end justify-center self-stretch"
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          href={`/contractors?category=${categoryForSystem(s.system_type)}`}
          className="rounded-md bg-hearth-600 px-2 py-1 text-xs font-medium text-white hover:bg-hearth-700"
        >
          Find a pro
        </Link>
      </div>
    </li>
  );
}
