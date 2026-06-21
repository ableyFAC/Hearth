// Chat censorship - masks profanity, slurs, and hate speech before a message is
// stored. Best-effort client-side filter (not a substitute for real moderation).
// Catches common evasion: leet substitutions (f3=e, 1=i, $=s, @=a …) and
// separators between letters (f u c k, f-u-c-k, f.u.c.k).

// General profanity - masked, but not severe enough to auto-report.
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

// Slurs / hate speech - masked AND auto-flagged for review.
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

// Leet / look-alike substitutions, per letter (the letter itself is included).
const LEET: Record<string, string> = {
  a: "a@4",
  b: "b8",
  e: "e3",
  g: "g9",
  i: "i1!",
  l: "l1",
  o: "o0",
  s: "s5$",
  t: "t7",
  z: "z2",
};

// Up to 2 separator chars allowed between letters (spaces, dots, dashes, *).
const SEP = "[\\s._*\\-]{0,2}";
const SUFFIX = "(?:s|es|ing|ed|er|in|in')?";

function charClass(ch: string): string {
  const variants = LEET[ch] ?? ch;
  // Escape characters that are special inside a regex character class.
  const escaped = variants.replace(/[\]\\^-]/g, "\\$&");
  return `[${escaped}]`;
}

function wordPattern(word: string): string {
  return word.split("").map(charClass).join(SEP) + SUFFIX;
}

function buildRe(words: string[]): RegExp {
  const body = words.map(wordPattern).join("|");
  // Boundaries: not preceded/followed by a normal word char, so we don't match
  // inside legit words (e.g. "spicy" won't trip "spic").
  return new RegExp(`(?<![a-z0-9])(?:${body})(?![a-z0-9])`, "gi");
}

const SLUR_RE = buildRe(SLURS);
const PROFANITY_RE = buildRe(PROFANITY);

const mask = (m: string) => "*".repeat(m.length);

// Returns the cleaned text, whether anything was masked (`flagged`), and whether
// a slur/hate term was used (`slur`) - the latter triggers an auto-report.
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
