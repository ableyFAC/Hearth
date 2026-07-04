// Contact redaction for contractor application messages (anti-harvesting).
// A pro could drop their phone or email in the application note and take the
// job off-platform before the homeowner ever picks anyone, dodging the
// marketplace entirely. So while a job is still unassigned, the homeowner sees
// contact details scrubbed; once they pick the pro, the message shows as
// written (the applicants list only renders pre-pick, so callers just apply
// this wherever an unchosen application's message is displayed).

const HIDDEN = "[hidden until you reply]";

// Email addresses.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Candidate phone runs: digits joined by common separators. Only runs carrying
// 7+ actual digits get redacted, so short figures like "$1500" survive.
const PHONE_RE = /\+?\d[\d\s().\/-]*\d/g;

export function redactContact(text: string): string {
  return text
    .replace(EMAIL_RE, HIDDEN)
    .replace(PHONE_RE, (m) =>
      (m.match(/\d/g)?.length ?? 0) >= 7 ? HIDDEN : m
    );
}
