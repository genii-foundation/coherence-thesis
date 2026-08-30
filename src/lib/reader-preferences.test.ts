import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import {
  applyReaderPreferences,
  defaultReaderPreferences,
  parseReaderPreferences,
  readerPreferencesStorageKey,
  readerThemeOptions,
  readerThemeColorByTheme,
  serializeReaderPreferences,
} from "@/lib/reader-preferences";
import {
  coherencePublisherEmbeddedAppearanceByTheme,
  coherencePublisherEmbeddedCanvasProperty,
} from "@/publisher/embedded-reader-appearance";

const require = createRequire(import.meta.url);

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

  test("projects every theme to one exact Publisher scheme and canvas", () => {
    expect(coherencePublisherEmbeddedAppearanceByTheme).toEqual({
      textured: { canvas: "#F4EAD7", scheme: "system" },
      light: { canvas: "#f5f7f4", scheme: "light" },
      dark: { canvas: "#11191b", scheme: "dark" },
      black: { canvas: "#000", scheme: "black" },
    });
    expect(Object.isFrozen(coherencePublisherEmbeddedAppearanceByTheme)).toBe(
      true,
    );
    for (const theme of readerThemeOptions) {
      expect(
        Object.isFrozen(coherencePublisherEmbeddedAppearanceByTheme[theme]),
      ).toBe(true);
    }
  });

  test("keeps projected canvases pinned to the installed Publisher schemes", () => {
    const publisherStyles = fs.readFileSync(
      require.resolve("@genii-foundation/publisher-next/styles.css"),
      "utf8",
    );

    for (const theme of ["light", "dark", "black"] as const) {
      const appearance = coherencePublisherEmbeddedAppearanceByTheme[theme];
      const selector = `html[data-publisher-reader-scheme="${appearance.scheme}"] .publisher-root`;
      const selectorIndex = publisherStyles.lastIndexOf(selector);
      const blockEnd = publisherStyles.indexOf("}", selectorIndex);
      expect(selectorIndex).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(selectorIndex);
      expect(publisherStyles.slice(selectorIndex, blockEnd)).toContain(
        `--publisher-color-canvas: ${appearance.canvas} !important;`,
      );
    }
  });

  test("applies the Publisher scheme and canvas without a second preference state", () => {
    for (const theme of readerThemeOptions) {
      const dataset: Record<string, string> = {};
      const styles = new Map<string, string>();
      const root = {
        dataset,
        style: {
          setProperty(name: string, value: string) {
            styles.set(name, value);
          },
        },
      } as unknown as HTMLElement;

      applyReaderPreferences(
        { ...defaultReaderPreferences, theme },
        root,
      );

      const appearance = coherencePublisherEmbeddedAppearanceByTheme[theme];
      expect(dataset.publisherReaderScheme).toBe(appearance.scheme);
      expect(styles.get(coherencePublisherEmbeddedCanvasProperty)).toBe(
        appearance.canvas,
      );
      expect(dataset.publisherReaderFocus).toBeUndefined();
      expect(dataset.publisherReaderMotion).toBeUndefined();
      expect(dataset.publisherReaderHighlights).toBeUndefined();
      expect(styles.has("--publisher-reader-font-scale")).toBe(false);
      expect(styles.has("--publisher-reader-font-family")).toBe(false);
    }
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
