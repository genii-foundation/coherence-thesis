import { describe, expect, test } from "vitest";
import {
  defaultReaderPreferences,
  parseReaderPreferences,
  readerPreferencesStorageKey,
  readerThemeColorByTheme,
  serializeReaderPreferences,
} from "@/lib/reader-preferences";

describe("reader preferences", () => {
  test("uses stable storage key and defaults", () => {
    expect(readerPreferencesStorageKey).toBe("coherence-reader-preferences-v1");
    expect(parseReaderPreferences(null)).toEqual(defaultReaderPreferences);
    expect(parseReaderPreferences("")).toEqual(defaultReaderPreferences);
  });

  test("maps reader themes to browser toolbar colors", () => {
    expect(readerThemeColorByTheme).toEqual({
      textured: "#f4ead7",
      light: "#fffefa",
      dark: "#11100e",
      black: "#000000",
    });
  });

  test("parses valid preferences", () => {
    expect(
      parseReaderPreferences(
        JSON.stringify({
          fontSize: 115,
          fontFamily: "newsreader",
          theme: "black",
          animations: "none",
          highlights: "on",
          schemaVersion: 2,
          focus: "strong",
        }),
      ),
    ).toEqual({
      fontSize: 115,
      fontFamily: "newsreader",
      theme: "black",
      animations: "none",
      highlights: "on",
      focus: "strong",
    });
  });

  test("defaults bookmark highlights on when the stored value is absent or invalid", () => {
    for (const stored of [
      {},
      { highlights: "yes", schemaVersion: 2 },
      { highlights: 1, schemaVersion: 2 },
    ]) {
      expect(parseReaderPreferences(JSON.stringify(stored)).highlights).toBe(
        "on",
      );
    }
  });

  test("migrates legacy bookmark highlights to the visible default", () => {
    expect(
      parseReaderPreferences(JSON.stringify({ highlights: "off" })).highlights,
    ).toBe("on");
    expect(
      parseReaderPreferences(
        JSON.stringify({ highlights: "off", schemaVersion: 2 }),
      ).highlights,
    ).toBe("off");
  });

  test("defaults focus mode off when the stored value is absent or invalid", () => {
    for (const stored of [{}, { focus: "heavy" }, { focus: 3 }]) {
      expect(parseReaderPreferences(JSON.stringify(stored)).focus).toBe("none");
    }
  });

  test("maps legacy font preferences to variable font choices", () => {
    expect(
      parseReaderPreferences(
        JSON.stringify({
          fontSize: 100,
          fontFamily: "iowan",
          theme: "textured",
        }),
      ).fontFamily,
    ).toBe("literata");
    expect(
      parseReaderPreferences(
        JSON.stringify({
          fontSize: 100,
          fontFamily: "georgia",
          theme: "textured",
        }),
      ).fontFamily,
    ).toBe("source-serif");
  });

  test("falls back field by field for malformed preferences", () => {
    expect(
      parseReaderPreferences(
        JSON.stringify({
          fontSize: 116,
          fontFamily: "papyrus",
          theme: "void",
          animations: "sparkle",
        }),
      ),
    ).toEqual(defaultReaderPreferences);

    expect(parseReaderPreferences("{nope")).toEqual(defaultReaderPreferences);
    expect(parseReaderPreferences(JSON.stringify(["dark"]))).toEqual(
      defaultReaderPreferences,
    );
  });

  test("serializes preferences for local storage", () => {
    expect(
      serializeReaderPreferences({
        fontSize: 90,
        fontFamily: "source-serif",
        theme: "light",
        animations: "balanced",
        highlights: "on",
        focus: "light",
      }),
    ).toBe(
      '{"fontSize":90,"fontFamily":"source-serif","theme":"light","animations":"balanced","highlights":"on","focus":"light","schemaVersion":2}',
    );
  });
});
