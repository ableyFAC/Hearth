"use client";

import { useRef, useState } from "react";
import { addSystemAction } from "./actions";
import { SYSTEM_TYPES } from "@/lib/constants";

export default function SystemForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Add a system
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await addSystemAction(fd);
        formRef.current?.reset();
        setOpen(false);
      }}
      className="card space-y-4"
    >
      <h3 className="font-semibold text-stone-900">Add a system</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select name="system_type" className="select" required>
            {SYSTEM_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Material / model</label>
          <input
            name="material_or_model"
            className="input"
            placeholder="e.g. Rheem 50-gal gas"
          />
        </div>
        <div>
          <label className="label">Install year</label>
          <input name="install_year" type="number" className="input" placeholder="2015" />
        </div>
        <div>
          <label className="label">Last serviced</label>
          <input name="last_serviced" type="date" className="input" />
        </div>
        <div>
          <label className="label">Condition (1–5)</label>
          <select name="condition_rating" className="select" defaultValue="">
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
        <textarea name="notes" className="textarea" rows={2} />
      </div>

      <div className="flex gap-3">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn-primary flex-1">Save system</button>
      </div>
    </form>
  );
}
