// Basic chat censorship — masks profanity, slurs, and hate speech before a
// message is stored. Intentionally simple (client-side, best-effort) for an
// MVP; not a substitute for real moderation. Add/remove words below as needed.

// General profanity — masked, but not severe enough to auto-report.
const PROFANITY = [
  "fuck",
  "motherfuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "piss",
  "twat",
  "prick",
  "wanker",
  "douche",
  "jackass",
  "pussy",
  "goddamn",
];

// Slurs / hate speech — masked AND auto-flagged for review.
const SLURS = [
  // racist
  "nigger",
  "nigga",
  "chink",
  "spic",
  "kike",
  "gook",
  "wetback",
  "beaner",
  "coon",
  "raghead",
  "towelhead",
  // sexist / demeaning
  "cunt",
  "slut",
  "whore",
  "skank",
  "thot",
  "hoe",
  // homophobic / transphobic / ableist
  "fag",
  "faggot",
  "dyke",
  "tranny",
  "retard",
];

// Word + common suffixes (fucking, bitches, etc.). Excludes "y" to avoid false
// positives like "spicy"; \b word boundaries prevent matches inside other words.
const SUFFIX = "(s|es|ing|ed|er|in|in')?";
const reFrom = (words: string[]) =>
  new RegExp(`\\b(${words.join("|")})${SUFFIX}\\b`, "gi");

const SLUR_RE = reFrom(SLURS);
const PROFANITY_RE = reFrom(PROFANITY);

const mask = (m: string) => "*".repeat(m.length);

// Returns the cleaned text, whether anything was masked (`flagged`), and whether
// a slur/hate term was used (`slur`) — the latter triggers an auto-report.
export function censor(input: string): {
  clean: string;
  flagged: boolean;
  slur: boolean;
} {
  let flagged = false;
  let slur = false;
  let clean = input.replace(SLUR_RE, (m) => {
    flagged = true;
    slur = true;
    return mask(m);
  });
  clean = clean.replace(PROFANITY_RE, (m) => {
    flagged = true;
    return mask(m);
  });
  return { clean, flagged, slur };
}
