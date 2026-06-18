"use client";

import { useState } from "react";
import Link from "next/link";
import { assessSystem } from "@/lib/health";
import {
  labelFor,
  iconFor,
  SYSTEM_TYPES,
  STARTER_SYSTEM_NOTE,
  categoryForSystem,
} from "@/lib/constants";
import type { HomeSystem } from "@/lib/database.types";
import { updateSystemAction, deleteSystemAction } from "./actions";

const STAGE_STYLE: Record<string, string> = {
  healthy: "bg-green-50 text-green-700 border-green-200",
  aging: "bg-amber-50 text-amber-700 border-amber-200",
  due: "bg-red-50 text-red-700 border-red-200",
  unknown: "bg-stone-50 text-stone-500 border-stone-200",
};

export default function SystemRow({ system: s }: { system: HomeSystem }) {
  const [editing, setEditing] = useState(false);
  const h = assessSystem(s);

  if (editing) {
    return (
      <li className="card">
        <form
          action={async (fd) => {
            await updateSystemAction(fd);
            setEditing(false);
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={s.id} />
          <p className="font-medium text-stone-900">
            {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
            {labelFor(SYSTEM_TYPES, s.system_type)}
          </p>

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
              <input
                name="last_serviced"
                type="date"
                className="input"
                defaultValue={s.last_serviced ?? ""}
              />
            </div>
            <div>
              <label className="label">Material / model</label>
              <input
                name="material_or_model"
                className="input"
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
                <option value="5">5 — like new</option>
                <option value="4">4 — good</option>
                <option value="3">3 — fair</option>
                <option value="2">2 — worn</option>
                <option value="1">1 — failing</option>
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
    <li className="card flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-900">
            {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
            {labelFor(SYSTEM_TYPES, s.system_type)}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${STAGE_STYLE[h.stage]}`}
          >
            {h.stage}
          </span>
        </div>
        {s.material_or_model && (
          <p className="text-sm text-stone-500">{s.material_or_model}</p>
        )}
        <p className="mt-1 text-sm text-stone-600">{h.message}</p>
        {s.notes && s.notes !== STARTER_SYSTEM_NOTE && (
          <p className="mt-1 text-xs text-stone-400">{s.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Link
          href={`/contractors?category=${categoryForSystem(s.system_type)}`}
          className="rounded-md bg-hearth-600 px-2 py-1 text-xs font-medium text-white hover:bg-hearth-700"
        >
          Find a pro
        </Link>
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-hearth-700 hover:underline"
        >
          Edit
        </button>
        <form action={deleteSystemAction}>
          <input type="hidden" name="id" value={s.id} />
          <button className="text-xs text-stone-400 hover:text-red-600">
            Remove
          </button>
        </form>
      </div>
    </li>
  );
}
