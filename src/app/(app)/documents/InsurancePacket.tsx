"use client";

import { useState } from "react";
import Link from "next/link";

// The "give me a head start on shopping" button on the Home insurance card.
// Plus members get a Gemini-built requote packet: a plain-language summary of
// the home's facts and recent upkeep they can hand to insurance agents when
// shopping for quotes. Free users see what they'd get and a path to Plus.
// Rendered in a copyable block because the whole point is taking it OUT of
// Hearth and into an email or a call with an agent. Mirrors AppealLetter on
// /taxes.
export default function InsurancePacket({ isPlus }: { isPlus: boolean }) {
  const [loading, setLoading] = useState(false);
  const [packet, setPacket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isPlus) {
    return (
      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-stone-900">
          Want a head start on requoting?
        </h3>
        <p className="text-sm text-stone-600">
          Hearth Plus can build a requote packet from your home&apos;s facts:
          the details agents always ask for, your recent maintenance and
          upgrades, and the questions worth asking beyond price. You stay in
          control: Hearth never contacts insurers for you.
        </p>
        <Link href="/plus?reason=insurance" className="btn-primary inline-block">
          Unlock with Hearth Plus
        </Link>
      </div>
    );
  }

  const generate = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const resp = await fetch("/api/insurance-packet", { method: "POST" });
      const data = await resp.json().catch(() => ({}));
      if (typeof data?.packet === "string" && data.packet) {
        setPacket(data.packet);
      } else if (data?.error === "plus_required") {
        setError(
          "An active Hearth Plus subscription is needed to build the packet."
        );
      } else if (data?.reason === "rate_limited") {
        setError("Hearth has hit today's usage limit. Please try again later.");
      } else if (data?.reason === "no_key") {
        setError("The packet builder isn't set up yet.");
      } else {
        setError(
          data?.error ||
            "Couldn't build the packet right now. Please try again in a bit."
        );
      }
    } catch {
      setError(
        "Couldn't build the packet right now. Please try again in a bit."
      );
    }
    setLoading(false);
  };

  const copy = async () => {
    if (!packet) return;
    try {
      await navigator.clipboard.writeText(packet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, http): the textarea below is still
      // selectable, so the owner can copy by hand.
    }
  };

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-stone-900">
        Build my requote packet
      </h3>
      <p className="text-sm text-stone-600">
        Hearth will put your home&apos;s facts and recent upkeep into one
        plain-language summary you can hand to insurance agents when you shop
        for quotes, plus the coverage questions worth asking. Review it and
        fill in anything only you know, like your current coverage limits.
      </p>

      {!packet && (
        <button className="btn-primary" onClick={generate} disabled={loading}>
          {loading ? "Building your packet..." : "Build my requote packet"}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {packet && (
        <div className="space-y-2">
          <textarea
            readOnly
            value={packet}
            rows={16}
            className="input w-full font-mono text-xs leading-relaxed"
          />
          <div className="flex gap-3">
            <button className="btn-primary" onClick={copy}>
              {copied ? "Copied" : "Copy packet"}
            </button>
            <button
              className="btn-secondary"
              onClick={generate}
              disabled={loading}
            >
              {loading ? "Building..." : "Build again"}
            </button>
          </div>
          <p className="text-xs text-stone-400">
            This is a starting point, not insurance advice, and requoting is
            never guaranteed to save money. Read it closely, correct anything
            that doesn&apos;t match your home, and add the details only you
            have before you share it.
          </p>
        </div>
      )}
    </div>
  );
}
