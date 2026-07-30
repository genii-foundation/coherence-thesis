const PROTECTED_FIELD = /^- Protected lines or passages:(.*)$/m;

/** Pull the exactly quoted passages out of a voice card's protected line field. */
export function protectedLinesFrom(voiceCard: string): string[] {
  const field = PROTECTED_FIELD.exec(voiceCard);
  if (!field) return [];
  return [...(field[1] ?? "").matchAll(/["“]([^"”]+)["”]/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
}

/**
 * Compare the words a reader sees rather than Markdown emphasis delimiters.
 * Voice cards quote protected prose without source formatting, while a manuscript
 * may set the same sentence in italics or split a protected passage across lines.
 */
export const normalizeProtectedText = (source: string): string =>
  source
    .replace(/(?<!\\)[*_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
