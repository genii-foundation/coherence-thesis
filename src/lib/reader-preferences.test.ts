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
          fontFamily: "charter",
          theme: "black",
          animations: "none",
        }),
      ),
    ).toEqual({
      fontSize: 115,
      fontFamily: "charter",
      theme: "black",
      animations: "none",
    });
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
        fontFamily: "georgia",
        theme: "light",
        animations: "balanced",
      }),
    ).toBe(
      '{"fontSize":90,"fontFamily":"georgia","theme":"light","animations":"balanced"}',
    );
  });
});
