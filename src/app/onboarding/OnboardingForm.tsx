"use client";

import { useState } from "react";
import { lookupParcelAction, claimPropertyAction } from "./actions";
import type { ParcelFacts } from "@/lib/parcel";
import { PROPERTY_TYPES } from "@/lib/constants";

export default function OnboardingForm() {
  const [step, setStep] = useState<"address" | "confirm">("address");
  const [address, setAddress] = useState("");
  const [facts, setFacts] = useState<ParcelFacts | null>(null);
  const [busy, setBusy] = useState(false);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await lookupParcelAction(address);
    setFacts(result);
    setBusy(false);
    setStep("confirm");
  }

  return (
    <div className="card">
      {step === "address" && (
        <form onSubmit={onLookup} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              What&apos;s your home address?
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              We&apos;ll pull the public records so you don&apos;t have to type
              it all in.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              className="input"
              placeholder="123 Oak St, San Francisco, CA 94110"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Looking up…" : "Find my home"}
          </button>
        </form>
      )}

      {step === "confirm" && facts && (
        <form action={claimPropertyAction} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              Does this look right?
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              We auto-filled what we could from public records. Edit anything
              that&apos;s off.
            </p>
          </div>

          <input type="hidden" name="parcel_id" value={facts.parcel_id ?? ""} />

          <div>
            <label className="label">Address</label>
            <input
              name="address_line1"
              className="input"
              defaultValue={facts.address_line1}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">State</label>
              <input name="state" className="input" defaultValue={facts.state ?? ""} />
            </div>
            <div>
              <label className="label">City</label>
              <input name="city" className="input" defaultValue={facts.city ?? ""} />
            </div>
            <div>
              <label className="label">ZIP</label>
              <input
                name="zip"
                className="input"
                defaultValue={facts.zip ?? ""}
                placeholder="Auto-filled from city"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Year built (optional)</label>
              <input
                name="year_built"
                type="number"
                className="input"
                placeholder="We try to find this automatically"
                defaultValue={facts.year_built ?? ""}
              />
            </div>
            <div>
              <label className="label">Square feet</label>
              <input
                name="sqft"
                type="number"
                className="input"
                defaultValue={facts.sqft ?? ""}
              />
            </div>
            <div>
              <label className="label">Beds</label>
              <input
                name="beds"
                type="number"
                className="input"
                defaultValue={facts.beds ?? ""}
              />
            </div>
            <div>
              <label className="label">Baths</label>
              <input
                name="baths"
                type="number"
                step="0.5"
                className="input"
                defaultValue={facts.baths ?? ""}
              />
            </div>
            <div>
              <label className="label">Lot size (sqft)</label>
              <input
                name="lot_size_sqft"
                type="number"
                className="input"
                defaultValue={facts.lot_size_sqft ?? ""}
              />
            </div>
            <div>
              <label className="label">Property type</label>
              <select
                name="property_type"
                className="select"
                defaultValue={facts.property_type ?? "single_family"}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="rounded-lg bg-hearth-50 p-3 text-xs text-hearth-800">
            By claiming this home you confirm you own or manage it. We start with
            your word and may verify later.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep("address")}
            >
              Back
            </button>
            <button className="btn-primary flex-1">
              Claim my home
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
