export type AudioWordTiming = {
  charStart: number;
  charEnd: number;
  startSeconds: number;
  endSeconds: number;
  match: "exact" | "interpolated";
};

export type AudioTimingDocument = {
  version: 1;
  sectionId: string;
  audioVersionId: string;
  voiceId: string;
  textCharacters: number;
  durationSeconds: number;
  exactWordCount: number;
  interpolatedWordCount: number;
  words: AudioWordTiming[];
};

export type FishTimestampSegment = {
  text: string;
  start: number;
  end: number;
};

export type FishTimestampChunk = {
  chunkSeq: number;
  content: string;
  offsetSeconds: number;
  audioDurationSeconds: number;
  segments: FishTimestampSegment[];
};

type SourceWord = {
  normalized: string;
  charStart: number;
  charEnd: number;
};

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'’·ˈ]*/gu;
export const minimumExactTimingRatio = 0.6;
export const maximumInterpolatedWordRun = 12;

function roundSeconds(value: number): number {
  return Number(value.toFixed(3));
}

function normalizedWord(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function sourceWords(text: string): SourceWord[] {
  wordPattern.lastIndex = 0;
  const words: SourceWord[] = [];
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(text)) !== null) {
    const normalized = normalizedWord(match[0]);
    if (!normalized) continue;
    words.push({
      normalized,
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }
  return words;
}

function findNextSourceWord(
  words: SourceWord[],
  normalized: string,
  fromIndex: number,
): number {
  const searchEnd = Math.min(words.length, fromIndex + 24);
  for (let index = fromIndex; index < searchEnd; index += 1) {
    if (words[index]?.normalized === normalized) return index;
  }
  return -1;
}

type MappedContentWord = {
  normalized: string;
  sourceIndex: number;
};

type NormalizedTimestampSegment = {
  normalized: string;
  segment: FishTimestampSegment;
};

function alignTimestampSegments(
  words: MappedContentWord[],
  segments: FishTimestampSegment[],
): Array<{ contentIndex: number; segment: FishTimestampSegment }> {
  const normalizedSegments: NormalizedTimestampSegment[] = segments.flatMap((segment) => {
    const normalized = normalizedWord(segment.text);
    return normalized ? [{ normalized, segment }] : [];
  });
  const matches = Array.from(
    { length: normalizedSegments.length + 1 },
    () => new Uint16Array(words.length + 1),
  );

  for (let segmentIndex = normalizedSegments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
    for (let contentIndex = words.length - 1; contentIndex >= 0; contentIndex -= 1) {
      matches[segmentIndex]![contentIndex] =
        normalizedSegments[segmentIndex]!.normalized === words[contentIndex]!.normalized
          ? matches[segmentIndex + 1]![contentIndex + 1]! + 1
          : Math.max(
              matches[segmentIndex + 1]![contentIndex]!,
              matches[segmentIndex]![contentIndex + 1]!,
            );
    }
  }

  const aligned: Array<{ contentIndex: number; segment: FishTimestampSegment }> = [];
  let segmentIndex = 0;
  let contentIndex = 0;
  while (segmentIndex < normalizedSegments.length && contentIndex < words.length) {
    const candidate = normalizedSegments[segmentIndex]!;
    if (candidate.normalized === words[contentIndex]!.normalized) {
      aligned.push({ contentIndex, segment: candidate.segment });
      segmentIndex += 1;
      contentIndex += 1;
      continue;
    }
    if (matches[segmentIndex + 1]![contentIndex]! >= matches[segmentIndex]![contentIndex + 1]!) {
      segmentIndex += 1;
    } else {
      contentIndex += 1;
    }
  }
  return aligned;
}

function interpolateMissingTimings(
  timings: Array<AudioWordTiming | undefined>,
  words: SourceWord[],
  durationSeconds: number,
): AudioWordTiming[] {
  const result = [...timings];
  let index = 0;
  while (index < result.length) {
    if (result[index]) {
      index += 1;
      continue;
    }
    const gapStart = index;
    while (index < result.length && !result[index]) index += 1;
    const gapEnd = index;
    const previousEnd = gapStart > 0 ? result[gapStart - 1]?.endSeconds ?? 0 : 0;
    const nextStart = gapEnd < result.length
      ? result[gapEnd]?.startSeconds ?? durationSeconds
      : durationSeconds;
    const span = Math.max(0, nextStart - previousEnd);
    const count = gapEnd - gapStart;
    for (let offset = 0; offset < count; offset += 1) {
      const wordIndex = gapStart + offset;
      const word = words[wordIndex]!;
      result[wordIndex] = {
        charStart: word.charStart,
        charEnd: word.charEnd,
        startSeconds: roundSeconds(previousEnd + (span * offset) / count),
        endSeconds: roundSeconds(previousEnd + (span * (offset + 1)) / count),
        match: "interpolated",
      };
    }
  }
  return result as AudioWordTiming[];
}

function longestMissingTimingRun(
  timings: Array<AudioWordTiming | undefined>,
): number {
  let longest = 0;
  let current = 0;
  for (const timing of timings) {
    if (timing) {
      current = 0;
      continue;
    }
    current += 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function createAudioTimingDocument(input: {
  sectionId: string;
  audioVersionId: string;
  voiceId: string;
  text: string;
  chunks: FishTimestampChunk[];
}): AudioTimingDocument {
  const words = sourceWords(input.text);
  const timings: Array<AudioWordTiming | undefined> = Array.from({ length: words.length });
  const contentSourceIndexes = new Set<number>();
  let contentSourceIndex = 0;
  let durationSeconds = 0;

  for (const chunk of [...input.chunks].sort((left, right) => left.chunkSeq - right.chunkSeq)) {
    durationSeconds = Math.max(
      durationSeconds,
      chunk.offsetSeconds + chunk.audioDurationSeconds,
    );
    const mappedContentWords: MappedContentWord[] = [];
    let chunkSourceIndex = contentSourceIndex;
    for (const contentWord of sourceWords(chunk.content)) {
      const matchedIndex = findNextSourceWord(
        words,
        contentWord.normalized,
        chunkSourceIndex,
      );
      if (matchedIndex < 0) continue;
      mappedContentWords.push({
        normalized: contentWord.normalized,
        sourceIndex: matchedIndex,
      });
      contentSourceIndexes.add(matchedIndex);
      chunkSourceIndex = matchedIndex + 1;
    }
    if (mappedContentWords.length > 0) {
      contentSourceIndex = mappedContentWords.at(-1)!.sourceIndex + 1;
    }

    for (const aligned of alignTimestampSegments(mappedContentWords, chunk.segments)) {
      const sourceWordIndex = mappedContentWords[aligned.contentIndex]!.sourceIndex;
      const word = words[sourceWordIndex]!;
      timings[sourceWordIndex] = {
        charStart: word.charStart,
        charEnd: word.charEnd,
        startSeconds: roundSeconds(chunk.offsetSeconds + aligned.segment.start),
        endSeconds: roundSeconds(chunk.offsetSeconds + aligned.segment.end),
        match: "exact",
      };
    }
  }

  if (words.length === 0) {
    throw new Error(`No words found for audio timing document ${input.sectionId}.`);
  }
  const contentCoverageRatio = contentSourceIndexes.size / words.length;
  if (contentCoverageRatio < 0.9) {
    throw new Error(
      `Fish timestamp content matched only ${(contentCoverageRatio * 100).toFixed(1)}% of words for ${input.sectionId}.`,
    );
  }
  const exactWordCount = timings.filter(Boolean).length;
  const exactTimingRatio = exactWordCount / words.length;
  if (exactTimingRatio < minimumExactTimingRatio) {
    throw new Error(
      `Fish timestamp alignment anchored only ${(exactTimingRatio * 100).toFixed(1)}% of words for ${input.sectionId}.`,
    );
  }
  const interpolatedWordRun = longestMissingTimingRun(timings);
  if (interpolatedWordRun > maximumInterpolatedWordRun) {
    throw new Error(
      `Fish timestamp alignment left an interpolated gap of ${interpolatedWordRun} words for ${input.sectionId}.`,
    );
  }
  const completeTimings = interpolateMissingTimings(timings, words, durationSeconds);
  return {
    version: 1,
    sectionId: input.sectionId,
    audioVersionId: input.audioVersionId,
    voiceId: input.voiceId,
    textCharacters: input.text.length,
    durationSeconds: roundSeconds(durationSeconds),
    exactWordCount,
    interpolatedWordCount: words.length - exactWordCount,
    words: completeTimings,
  };
}

export function isAudioTimingDocument(value: unknown): value is AudioTimingDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AudioTimingDocument>;
  if (!(
    candidate.version === 1 &&
    typeof candidate.sectionId === "string" &&
    typeof candidate.audioVersionId === "string" &&
    typeof candidate.voiceId === "string" &&
    typeof candidate.textCharacters === "number" &&
    typeof candidate.durationSeconds === "number" &&
    candidate.durationSeconds > 0 &&
    typeof candidate.exactWordCount === "number" &&
    Number.isInteger(candidate.exactWordCount) &&
    candidate.exactWordCount >= 0 &&
    typeof candidate.interpolatedWordCount === "number" &&
    Number.isInteger(candidate.interpolatedWordCount) &&
    candidate.interpolatedWordCount >= 0 &&
    Array.isArray(candidate.words) &&
    candidate.words.length > 0
  )) return false;
  let previousCharEnd = 0;
  let previousStartSeconds = 0;
  let exactWordCount = 0;
  let interpolatedWordCount = 0;
  let currentInterpolatedRun = 0;
  let longestInterpolatedRun = 0;
  for (const word of candidate.words) {
    if (
      !word ||
      typeof word.charStart !== "number" ||
      typeof word.charEnd !== "number" ||
      typeof word.startSeconds !== "number" ||
      typeof word.endSeconds !== "number" ||
      (word.match !== "exact" && word.match !== "interpolated") ||
      word.charStart < previousCharEnd ||
      word.charEnd < word.charStart ||
      word.startSeconds < previousStartSeconds ||
      word.endSeconds < word.startSeconds ||
      word.endSeconds > candidate.durationSeconds
    ) {
      return false;
    }
    previousCharEnd = word.charEnd;
    previousStartSeconds = word.startSeconds;
    if (word.match === "exact") {
      exactWordCount += 1;
      currentInterpolatedRun = 0;
    } else {
      interpolatedWordCount += 1;
      currentInterpolatedRun += 1;
      longestInterpolatedRun = Math.max(
        longestInterpolatedRun,
        currentInterpolatedRun,
      );
    }
  }
  return (
    candidate.exactWordCount === exactWordCount &&
    candidate.interpolatedWordCount === interpolatedWordCount &&
    exactWordCount / candidate.words.length >= minimumExactTimingRatio &&
    longestInterpolatedRun <= maximumInterpolatedWordRun
  );
}

export function timingForSeconds(
  timings: AudioTimingDocument,
  seconds: number,
): AudioWordTiming | undefined {
  if (timings.words.length === 0) return undefined;
  let low = 0;
  let high = timings.words.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const timing = timings.words[middle]!;
    if (seconds < timing.startSeconds) {
      high = middle - 1;
    } else if (seconds > timing.endSeconds) {
      low = middle + 1;
    } else {
      return timing;
    }
  }
  return timings.words[Math.max(0, Math.min(low - 1, timings.words.length - 1))];
}

export function timingForCharIndex(
  timings: AudioTimingDocument,
  charIndex: number,
): AudioWordTiming | undefined {
  return (
    timings.words.find(
      (timing) => charIndex >= timing.charStart && charIndex <= timing.charEnd,
    ) ?? timings.words.find((timing) => timing.charStart >= charIndex)
  );
}
