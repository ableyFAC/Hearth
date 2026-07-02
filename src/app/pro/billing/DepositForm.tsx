"use client";

import { useRef, useState } from "react";
import { depositAction } from "./actions";

type Tier = { min_cents: number; max_cents: number | null; bonus_pct: number };

// Fallback so the live preview works even if the tiers table didn't load.
const DEFAULT_TIERS: Tier[] = [
  { min_cents: 20000, max_cents: 39999, bonus_pct: 10 },
  { min_cents: 40000, max_cents: 79999, bonus_pct: 15 },
  { min_cents: 80000, max_cents: null, bonus_pct: 20 },
];

// Mirror of the DB bonus_for_deposit() math (integer cents).
function bonusFor(cents: number, tiers: Tier[]) {
  const t = [...tiers]
    .sort((a, b) => b.min_cents - a.min_cents)
    .find(
      (t) => cents >= t.min_cents && (t.max_cents == null || cents <= t.max_cents)
    );
  const pct = t?.bonus_pct ?? 0;
  return { pct, bonus: Math.floor((cents * pct) / 100) };
}

const PRESETS = [100, 200, 400, 800];

export default function DepositForm({ tiers }: { tiers: Tier[] }) {
  // Committed amount (string so the field can be cleared); default $200 so the
  // first bonus tier is visible out of the gate.
  const [amount, setAmount] = useState("200");
  // Preview while hovering a preset - reverts to the committed amount on leave.
  const [hover, setHover] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = hover !== null ? String(hover) : amount;
  const num = Number(shown) || 0;

  const effTiers = tiers.length ? tiers : DEFAULT_TIERS;
  const cents = Math.round(num * 100);
  const { bonus } = bonusFor(cents, effTiers);
  const bonusDollars = bonus / 100;
  const totalCredit = (cents + bonus) / 100;

  return (
    <form action={depositAction} className="card space-y-4">
      <input type="hidden" name="amount" value={num} />

      {/* Presets, then Custom. Hover a preset to preview; click to set. */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active = hover !== null ? hover === p : Number(amount) === p;
          return (
            <button
              key={p}
              type="button"
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onClick={() => {
                setAmount(String(p));
                setHover(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? "border-hearth-500 bg-hearth-50 text-hearth-800"
                  : "border-stone-200 text-stone-600 hover:border-hearth-300"
              }`}
            >
              ${p}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:border-hearth-300"
        >
          Custom
        </button>
      </div>

      <div>
        <label className="label">Deposit amount</label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-stone-500">$</span>
          <input
            ref={inputRef}
            type="number"
            min={0}
            step={10}
            value={shown}
            placeholder="0"
            // Digits only - no letters, symbols, or emojis.
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            className="input max-w-[120px]"
          />
          {bonus > 0 && (
            <span className="text-sm font-semibold text-green-600">
              + ${bonusDollars.toFixed(2)} bonus
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-stone-400">
          $200+ earns bonus credit
          {bonus > 0 ? ` · $${totalCredit.toFixed(2)} total credit` : ""}.
        </p>
      </div>

      <p className="text-xs text-stone-400">
        Deposits are non-refundable and can only be spent on leads. Bonus credit
        is promotional, has no cash value, and expires 60 days after it&apos;s
        added. Lead prices vary by service.
      </p>

      <label className="flex items-center gap-2 text-xs text-stone-600">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="accent-hearth-600"
        />
        I understand and agree.
      </label>

      <button className="btn-primary" disabled={!agreed || num < 5}>
        Deposit ${num || 0}
      </button>
    </form>
  );
}
