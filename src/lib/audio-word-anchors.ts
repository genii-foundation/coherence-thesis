const audioWordPattern = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

function audioWordSectionSlug(sectionId: string): string {
  return sectionId.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function audioWordId(sectionId: string, wordIndex: number): string {
  return `audio-word-${audioWordSectionSlug(sectionId)}-${wordIndex}`;
}

export function audioWordIdForCharIndex({
  sectionId,
  text,
  charIndex,
}: {
  sectionId: string;
  text: string;
  charIndex: number;
}): string | undefined {
  audioWordPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  let wordIndex = 0;
  let lastWordIndex: number | undefined;

  while ((match = audioWordPattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (charIndex >= start && charIndex <= end) {
      return audioWordId(sectionId, wordIndex);
    }
    if (start >= charIndex) {
      return audioWordId(sectionId, wordIndex);
    }
    lastWordIndex = wordIndex;
    wordIndex += 1;
  }

  return typeof lastWordIndex === "number"
    ? audioWordId(sectionId, lastWordIndex)
    : undefined;
}
