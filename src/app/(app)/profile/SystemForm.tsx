"use client";

import { useRef, useState } from "react";
import { addSystemAction } from "./actions";
import { SYSTEM_TYPES, materialLabel } from "@/lib/constants";
import PhotoUpload from "@/components/PhotoUpload";
import MonthYearInput from "@/components/MonthYearInput";
import MaterialSelect from "@/components/MaterialSelect";

export default function SystemForm({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const [systemType, setSystemType] = useState<string>(SYSTEM_TYPES[0].value);
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
          <select
            name="system_type"
            className="select"
            value={systemType}
            onChange={(e) => setSystemType(e.target.value)}
            required
          >
            {SYSTEM_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{materialLabel(systemType)} (optional)</label>
          <MaterialSelect key={systemType} systemType={systemType} />
        </div>
        <div>
          <label className="label">Install year</label>
          <input name="install_year" type="number" className="input" placeholder="2015" />
        </div>
        <div>
          <label className="label">Last serviced</label>
          <MonthYearInput name="last_serviced" />
        </div>
        <div>
          <label className="label">Condition</label>
          <select name="condition_rating" className="select" defaultValue="">
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
        <textarea name="notes" className="textarea" rows={2} />
      </div>

      <PhotoUpload propertyId={propertyId} />

      <div className="flex gap-3">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn-primary flex-1">Save system</button>
      </div>
    </form>
  );
}
