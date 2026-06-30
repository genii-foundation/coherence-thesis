import { describe, expect, it } from "vitest";
import {
  formatReadingDuration,
  formatReadingDurationForWords,
  readingMinutesForWords,
} from "./reading-time";

describe("reading time formatting", () => {
  it("matches the manuscript compiler reading speed", () => {
    expect(readingMinutesForWords(220)).toBe(1);
    expect(readingMinutesForWords(221)).toBe(2);
  });

  it("formats minutes and decimal hours as a single duration", () => {
    expect(formatReadingDuration(1)).toBe("1 minute");
    expect(formatReadingDuration(12)).toBe("12 minutes");
    expect(formatReadingDuration(60)).toBe("1 hour");
    expect(formatReadingDuration(90)).toBe("1.5 hours");
    expect(formatReadingDurationForWords(19_800)).toBe("1.5 hours");
  });
});
