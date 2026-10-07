// Player names for the Hall of hands: 3-12 characters, no slurs or obvious obscenities.
const BAD = [
  "fuck", "shit", "cunt", "nigg", "nigr", "fag", "bitch", "whore", "slut", "rape", "nazi", "hitler", "porn", "dick", "cock",
  "pussy", "retard", "kys", "penis", "vagina", "jizz", "twat", "wank", "bastard", "kike", "chink", "tranny",
];
const LEET: Keyed<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

export function cleanName(raw: string): string {
  return (raw || "").replace(/[^A-Za-z0-9 _.\-]/g, "").replace(/\s+/g, " ").trim();
}

/** null when the name is fine, otherwise the reason. */
export function nameProblem(raw: string): string | null {
  const n = cleanName(raw);
  if (n.length < 3 || n.length > 12) return "Name must be 3-12 letters or digits";
  const flat = n
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "");
  if (BAD.some((w) => flat.includes(w))) return "Pick another name";
  return null;
}
