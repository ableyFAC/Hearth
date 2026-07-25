import { randomBytes } from "crypto";

// Fence untrusted, user-supplied text before it is interpolated into a model
// prompt.
//
// WHY THIS EXISTS: the old approach wrapped untrusted content in fixed
// delimiters (<<<JOB POST>>> ... <<<END JOB POST>>>, <job_description>...
// </job_description>) and told the model to treat everything between them as
// data. That boundary was prompt-only: an attacker who knows the delimiter can
// simply TYPE the literal closing token inside their own text to forge an early
// boundary, then write "instructions" that appear to come from the app rather
// than from inside the data. This matters most cross-actor, e.g. a homeowner's
// job description that a pro's copilot later reads.
//
// THE FIX is code-enforced, not prompt-enforced:
//   1. Each call mints a fresh random nonce and builds the open/close tokens
//      around it. The user cannot forge a boundary they cannot predict.
//   2. As defence in depth, any occurrence of the tokens, and any generic
//      multi-angle-bracket fence a user might paste to fake a boundary, is
//      stripped from the content itself before it is fenced.
//
// The real marker tokens appear literally in the returned block, so a caller's
// surrounding instruction can keep referring to "everything between the
// markers" without needing to know the nonce. Keep that instruction, and keep
// telling the model the fenced content is untrusted data, never instructions.
export function wrapUntrusted(content: string, opts?: { label?: string }): string {
  const label =
    (opts?.label ?? "UNTRUSTED DATA")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .trim() || "UNTRUSTED DATA";
  const nonce = randomBytes(8).toString("hex"); // 16 unpredictable hex chars
  const open = `<<<BEGIN ${label} ${nonce}>>>`;
  const close = `<<<END ${label} ${nonce}>>>`;
  const cleaned = defang(String(content ?? ""), [open, close]);
  return `${open}\n${cleaned}\n${close}`;
}

// Strip anything from untrusted content that could imitate a boundary marker:
// the exact (random) tokens for this call, plus any generic run of angle
// brackets a user might paste to fake a <<<...>>> style fence. Everything else
// is left byte-for-byte so the model still reads the user's real words.
function defang(content: string, tokens: string[]): string {
  let out = content;
  for (const t of tokens) {
    if (t) out = out.split(t).join(" ");
  }
  // Neutralize forged fences without otherwise altering the text: a run of two
  // or more angle brackets becomes a curly quote, so a pasted "<<<END ...>>>"
  // can no longer read as a real boundary.
  return out.replace(/<{2,}/g, "“").replace(/>{2,}/g, "”");
}
