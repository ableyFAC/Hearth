"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Step = {
  emoji: string;
  title: string;
  benefit: string;
  href?: string;
  cta?: string;
};

const STEPS: Step[] = [
  {
    emoji: "🎉",
    title: "You're on Hearth Plus",
    benefit: "Here's everything you just unlocked.",
  },
  {
    emoji: "📈",
    title: "Cost forecast",
    benefit:
      "See what will need replacing and how much to set aside each month.",
    href: "/forecast",
    cta: "Try it",
  },
  {
    emoji: "🔍",
    title: "Quote analyzer",
    benefit: "Snap a contractor's quote and check if the price is fair.",
    href: "/quote-check",
    cta: "Try it",
  },
  {
    emoji: "📋",
    title: "Home report",
    benefit: "A shareable record of your home for insurance and resale.",
    href: "/home-report",
    cta: "Try it",
  },
  {
    emoji: "🗓️",
    title: "Maintenance plan",
    benefit: "A full year of upkeep reminders, auto-built for your home.",
    href: "/dashboard",
    cta: "Try it",
  },
  {
    emoji: "🏠",
    title: "Up to 5 homes, unlimited jobs",
    benefit:
      "Track every property and post as many jobs as you need, matched first.",
  },
  {
    emoji: "🔔",
    title: "Every proactive alert",
    benefit:
      "Storms, recalls, and aging systems, before they become emergencies.",
  },
];

// Animated stepped tour shown right after checkout, off the ?welcome=1 flag.
// Client-side so Next/Back/dots can advance instantly with no round trip.
// Each step re-mounts on `key={step}` so the fade/slide-in transition replays.
export default function PlusWelcome() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  // Drive the fade/slide-in transition: drop back to the "entering" position
  // the instant the step changes, then flip to visible a tick later so the
  // motion-safe transition classes actually have something to animate.
  useEffect(() => {
    setVisible(false);
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [step]);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6 text-center">
      <div
        key={step}
        className={`space-y-4 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out ${
          visible
            ? "opacity-100 translate-y-0"
            : "motion-safe:opacity-0 motion-safe:translate-y-2"
        }`}
      >
        <div
          className={`text-6xl ${step === 0 ? "motion-safe:animate-bounce" : ""}`}
        >
          {current.emoji}
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-stone-900">
            {current.title}
          </h1>
          <p className="mt-2 text-stone-600">{current.benefit}</p>
        </div>
        {current.href && current.cta && (
          <Link
            href={current.href}
            className="inline-block text-sm text-hearth-700 hover:underline"
          >
            {current.cta} →
          </Link>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <span
            key={s.title}
            className={`h-2 w-2 rounded-full transition-colors ${
              i === step ? "bg-hearth-600" : "bg-stone-200"
            }`}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="btn-secondary flex-1"
            >
              Back
            </button>
          )}
          {last ? (
            <Link href="/dashboard" className="btn-primary flex-1">
              Go to my dashboard
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="btn-primary flex-1"
            >
              Next
            </button>
          )}
        </div>
        {!last && (
          <Link href="/dashboard" className="text-sm text-stone-400 hover:underline">
            Skip
          </Link>
        )}
      </div>

      {last && (
        <p className="text-xs text-stone-400">
          If a Plus feature still looks locked, give it a minute to sync, then
          refresh.
        </p>
      )}
    </div>
  );
}
