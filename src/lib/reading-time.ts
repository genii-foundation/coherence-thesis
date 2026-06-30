const WORDS_PER_MINUTE = 220;

export function readingMinutesForWords(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

export function formatReadingDuration(minutes: number): string {
  const safeMinutes = Math.max(1, Math.ceil(minutes));

  if (safeMinutes < 60) {
    return `${safeMinutes.toLocaleString()} minute${safeMinutes === 1 ? "" : "s"}`;
  }

  const hours = safeMinutes / 60;
  const formattedHours = Number.isInteger(hours)
    ? hours.toLocaleString()
    : hours.toLocaleString(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      });

  return `${formattedHours} hour${hours === 1 ? "" : "s"}`;
}

export function formatReadingDurationForWords(wordCount: number): string {
  return formatReadingDuration(readingMinutesForWords(wordCount));
}
