"use client";

// Small strength indicator shown under a password field while the person is
// typing. Scoring is deliberately simple - length plus character variety,
// not an entropy estimate - since the goal is steering someone off "weak"
// and toward "excellent", not grading them precisely.
//
// Bands (mirrors the tone convention in src/lib/health.ts's scoreBand):
//   weak      - under 8 characters. Also the client-side floor: forms using
//               this meter reject anything shorter on submit.
//   good      - 8+ characters but short of the excellent bar below.
//   excellent - 12+ characters AND both letter cases AND (a number or a
//               symbol).
//
// Renders nothing for an empty password so it doesn't show on a fresh page
// load before anyone has typed.

type Strength = "weak" | "good" | "excellent";

function strengthOf(password: string): Strength {
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (password.length < 8) return "weak";
  if (password.length >= 12 && hasLower && hasUpper && (hasNumber || hasSymbol)) {
    return "excellent";
  }
  return "good";
}

const BAND: Record<Strength, { label: string; bar: string; text: string; filled: number }> = {
  weak: { label: "Weak", bar: "bg-red-500", text: "text-red-700 dark:text-red-300", filled: 1 },
  good: { label: "Good", bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", filled: 2 },
  excellent: { label: "Excellent", bar: "bg-green-500", text: "text-green-700 dark:text-green-300", filled: 3 },
};

export default function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;

  const band = BAND[strengthOf(password)];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < band.filled ? band.bar : "bg-stone-200 dark:bg-white/10"
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-sm ${band.text}`}>{band.label}</p>
    </div>
  );
}
