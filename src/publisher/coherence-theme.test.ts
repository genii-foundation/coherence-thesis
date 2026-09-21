import { readFileSync } from "node:fs";
import type { PublisherNextJsonObject } from "@genii-foundation/publisher-next/theme";
import { describe, expect, it, vi } from "vitest";

const { calls, families } = vi.hoisted(() => ({
  calls: {
    cormorant: [] as unknown[],
    fraunces: [] as unknown[],
    literata: [] as unknown[],
    newsreader: [] as unknown[],
    sourceSerif: [] as unknown[],
  },
  families: {
    cormorant: '"Mock Cormorant Direct"',
    fraunces: '"Mock Fraunces Direct"',
    literata: '"Mock Literata Direct"',
    newsreader: '"Mock Newsreader Direct"',
    sourceSerif: '"Mock Source Serif Direct"',
  },
}));

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: (options: unknown) => {
    calls.cormorant.push(options);
    return {
      className: "mock-cormorant",
      style: { fontFamily: families.cormorant },
      variable: "mock-cormorant-variable",
    };
  },
  Fraunces: (options: unknown) => {
    calls.fraunces.push(options);
    return {
      className: "mock-fraunces",
      style: { fontFamily: families.fraunces },
      variable: "mock-fraunces-variable",
    };
  },
  Literata: (options: unknown) => {
    calls.literata.push(options);
    return {
      className: "mock-literata",
      style: { fontFamily: families.literata },
      variable: "mock-literata-variable",
    };
  },
  Newsreader: (options: unknown) => {
    calls.newsreader.push(options);
    return {
      className: "mock-newsreader",
      style: { fontFamily: families.newsreader },
      variable: "mock-newsreader-variable",
    };
  },
  Source_Serif_4: (options: unknown) => {
    calls.sourceSerif.push(options);
    return {
      className: "mock-source-serif",
      style: { fontFamily: families.sourceSerif },
      variable: "mock-source-serif-variable",
    };
  },
}));

import { coherencePublisherTheme } from "./coherence-theme";
import { coherencePublisherThemeCanvas } from "./coherence-theme-contract";
import { projectCoherencePublisherEmbeddedAppearance } from "./embedded-reader-appearance";

function configuredTheme() {
  const configured = coherencePublisherTheme.implementation.configure(
    coherencePublisherTheme.config,
  );
  if (!configured.valid) {
    throw new Error(JSON.stringify(configured.diagnostics));
  }
  return configured.value;
}

function expectDeepFrozen(value: unknown, seen = new Set<unknown>()): void {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    seen.has(value)
  ) {
    return;
  }
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if ("value" in descriptor) expectDeepFrozen(descriptor.value, seen);
  }
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  return (
    0.2126 * channelToLinear(Number.parseInt(color.slice(1, 3), 16)) +
    0.7152 * channelToLinear(Number.parseInt(color.slice(3, 5), 16)) +
    0.0722 * channelToLinear(Number.parseInt(color.slice(5, 7), 16))
  );
}

function contrast(left: string, right: string): number {
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function cssRule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const end = source.indexOf("}", start);
  if (end < 0) throw new Error(`Unclosed CSS rule: ${selector}`);
  return source.slice(start, end);
}

function cssHexVariable(rule: string, name: string): string {
  const match = rule.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`, "u"),
  );
  if (!match?.[1]) throw new Error(`Missing CSS color variable: --${name}`);
  return match[1].toUpperCase();
}

function opaqueLineOverCanvas(rule: string, canvas: string): string {
  const match = rule.match(
    /--line:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\);/u,
  );
  if (!match) throw new Error("Missing canonical --line color.");
  const alpha = Number(match[4]);
  const canvasChannels = [
    Number.parseInt(canvas.slice(1, 3), 16),
    Number.parseInt(canvas.slice(3, 5), 16),
    Number.parseInt(canvas.slice(5, 7), 16),
  ];
  return `#${[1, 2, 3]
    .map((index) =>
      Math.round(
        Number(match[index]) * alpha +
          canvasChannels[index - 1]! * (1 - alpha),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function publisherPaletteFromCss(
  source: string,
  selector: string,
  opaqueBorder: boolean,
) {
  const rule = cssRule(source, selector);
  const canvas = cssHexVariable(rule, "paper");
  return {
    canvas,
    surface: cssHexVariable(rule, "paper-soft"),
    text: cssHexVariable(rule, "ink"),
    mutedText: cssHexVariable(rule, "ink-muted"),
    accent: cssHexVariable(rule, "emphasis"),
    focus: cssHexVariable(rule, "sage"),
    border: opaqueBorder
      ? opaqueLineOverCanvas(rule, canvas)
      : cssHexVariable(rule, "paper-deep"),
  };
}

describe("Coherence Publisher theme", () => {
  it("uses the closed Theme API 2.0 adapter identity", () => {
    expect(coherencePublisherTheme).toMatchObject({
      package: "coherence-thesis",
      version: "0.1.0",
      rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
      config: {},
      implementation: {
        kind: "genii.publisher.next-theme",
        apiVersion: "2.0",
      },
    });
    expect(Reflect.ownKeys(coherencePublisherTheme.config)).toEqual([]);
  });

  it("loads the same five Google font families with the production options", () => {
    const variableOptions = (variable: string) => ({
      axes: ["opsz"],
      display: "swap",
      style: ["normal", "italic"],
      subsets: ["latin"],
      variable,
      weight: "variable",
    });

    expect(calls.literata).toEqual([variableOptions("--font-literata")]);
    expect(calls.sourceSerif).toEqual([
      variableOptions("--font-source-serif"),
    ]);
    expect(calls.newsreader).toEqual([variableOptions("--font-newsreader")]);
    expect(calls.fraunces).toEqual([variableOptions("--font-fraunces")]);
    expect(calls.cormorant).toEqual([
      {
        display: "swap",
        style: ["normal", "italic"],
        subsets: ["latin"],
        variable: "--font-cormorant",
        weight: "variable",
      },
    ]);
  });

  it("preserves the bounded Coherence palette and reading geometry", () => {
    const { tokens } = configuredTheme();

    expect(tokens.color).toEqual({
      canvas: coherencePublisherThemeCanvas,
      surface: "#FBF6EB",
      text: "#13202A",
      mutedText: "#5A666C",
      accent: "#77542A",
      focus: "#60796D",
      border: "#E3D1AD",
    });
    expect(tokens.colorSchemes).toEqual({
      light: {
        canvas: "#FFFFFF",
        surface: "#FFFFFF",
        text: "#111827",
        mutedText: "#586573",
        accent: "#594018",
        focus: "#3F6858",
        border: "#D9DADC",
      },
      dark: {
        canvas: "#11100E",
        surface: "#181715",
        text: "#F4EFE6",
        mutedText: "#9C9182",
        accent: "#E2BD7C",
        focus: "#8DB19E",
        border: "#433A28",
      },
      black: {
        canvas: "#000000",
        surface: "#050505",
        text: "#F7F7F5",
        mutedText: "#8C8C86",
        accent: "#E3DED2",
        focus: "#B8B2A4",
        border: "#2E2E2E",
      },
    });
    expect(tokens.layout).toEqual({
      readingMeasure: "48rem",
      pageGutter: "1.5rem",
      sectionGap: "3rem",
      controlRadius: "8px",
    });
    expect(tokens.typography).toMatchObject({
      bodyFamily: families.literata,
      headingFamily: families.literata,
      monoFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace",
      baseSize: "1.12rem",
      lineHeight: 1.78,
      defaultReaderFontFamilyId: "literata",
    });
  });

  it("keeps the existing font order, Literata default, and stable serif choice", () => {
    const { typography } = configuredTheme().tokens;

    expect(typography.readerFontFamilies).toEqual([
      { id: "literata", label: "Literata", family: families.literata },
      {
        id: "source-serif",
        label: "Source Serif 4",
        family: families.sourceSerif,
      },
      {
        id: "newsreader",
        label: "Newsreader",
        family: families.newsreader,
      },
      {
        id: "cormorant",
        label: "Cormorant Garamond",
        family: families.cormorant,
      },
      { id: "fraunces", label: "Fraunces", family: families.fraunces },
      {
        id: "serif",
        label: "System serif",
        family: 'Georgia, "Times New Roman", serif',
      },
    ]);
    expect(typography.defaultReaderFontFamilyId).toBe("literata");
    for (const family of [
      typography.bodyFamily,
      typography.headingFamily,
      typography.monoFamily,
      ...typography.readerFontFamilies.map((choice) => choice.family),
    ]) {
      expect(family).not.toContain("var(");
    }
  });

  it("passes Publisher validation and explicit contrast thresholds", () => {
    const configured = coherencePublisherTheme.implementation.configure({});
    expect(configured.valid).toBe(true);
    if (!configured.valid) return;

    const { color, colorSchemes } = configured.value.tokens;
    expect(colorSchemes).toBeDefined();
    for (const palette of [
      color,
      colorSchemes?.light,
      colorSchemes?.dark,
      colorSchemes?.black,
    ]) {
      expect(palette).toBeDefined();
      if (palette === undefined) continue;
      for (const background of [palette.canvas, palette.surface]) {
        expect(contrast(background, palette.text)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(background, palette.mutedText)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(background, palette.accent)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(background, palette.focus)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("projects the validated palettes through the browser-safe Publisher API", () => {
    const theme = configuredTheme();
    const appearance = projectCoherencePublisherEmbeddedAppearance(theme);

    expect(appearance).toEqual({
      base: theme.tokens.color,
      light: theme.tokens.colorSchemes?.light,
      dark: theme.tokens.colorSchemes?.dark,
      black: theme.tokens.colorSchemes?.black,
    });
    expect(appearance.base).toBe(theme.tokens.color);
    expect(appearance.light).toBe(theme.tokens.colorSchemes?.light);
    expect(appearance.dark).toBe(theme.tokens.colorSchemes?.dark);
    expect(appearance.black).toBe(theme.tokens.colorSchemes?.black);
    expectDeepFrozen(appearance);
  });

  it("binds every Publisher palette to the canonical Coherence CSS colors", () => {
    const source = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    const theme = configuredTheme();

    expect(theme.tokens.color).toEqual(
      publisherPaletteFromCss(source, ":root", false),
    );
    expect(theme.tokens.colorSchemes).toEqual({
      light: publisherPaletteFromCss(
        source,
        'html[data-reader-theme="light"]',
        true,
      ),
      dark: publisherPaletteFromCss(
        source,
        'html[data-reader-theme="dark"]',
        true,
      ),
      black: publisherPaletteFromCss(
        source,
        'html[data-reader-theme="black"]',
        true,
      ),
    });
  });

  it("returns detached deeply frozen values", () => {
    const first = configuredTheme();
    const second = configuredTheme();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.tokens).not.toBe(second.tokens);
    expect(first.tokens.typography.readerFontFamilies).not.toBe(
      second.tokens.typography.readerFontFamilies,
    );
    expectDeepFrozen(coherencePublisherTheme);
    expectDeepFrozen(first);
    expectDeepFrozen(second);
  });

  it("rejects every open or unsafe configuration with one private-safe result", () => {
    const privateSentinel = "PRIVATE THEME SENTINEL";
    let accessorRead = false;
    const accessor = {};
    Object.defineProperty(accessor, "private", {
      enumerable: true,
      get() {
        accessorRead = true;
        throw new Error(privateSentinel);
      },
    });
    const symbolic = { [Symbol(privateSentinel)]: privateSentinel };
    class NonPlainConfig {
      readonly private = privateSentinel;
    }
    const uninspectable = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error(privateSentinel);
        },
      },
    );
    const invalidConfigs: unknown[] = [
      { mode: privateSentinel },
      accessor,
      symbolic,
      new NonPlainConfig(),
      [],
      null,
      uninspectable,
    ];
    const expected = {
      valid: false,
      diagnostics: [
        {
          code: "next.theme.coherence_config.invalid",
          severity: "error",
          path: "/theme/config",
          message:
            "The Coherence theme configuration must be one empty plain data object.",
          keyword: "properties",
          params: {},
        },
      ],
    };

    for (const config of invalidConfigs) {
      const result = coherencePublisherTheme.implementation.configure(
        config as PublisherNextJsonObject,
      );
      expect(result).toEqual(expected);
      expect(JSON.stringify(result)).not.toContain(privateSentinel);
      expectDeepFrozen(result);
    }
    expect(accessorRead).toBe(false);
  });

  it("keeps the production module on the browser-safe theme entry", () => {
    const source = readFileSync(
      new URL("./coherence-theme.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('from "@genii-foundation/publisher-next/theme"');
    expect(source).not.toContain("@genii-foundation/publisher-next/server");
    expect(source).not.toContain("server-only");

    const appearanceSource = readFileSync(
      new URL("./embedded-reader-appearance.ts", import.meta.url),
      "utf8",
    );
    expect(appearanceSource).toContain(
      "projectPublisherNextThemeAppearance(theme)",
    );
    expect(appearanceSource).toContain(
      'from "@genii-foundation/publisher-next/theme"',
    );
    expect(appearanceSource).not.toContain("next/font");
    expect(appearanceSource).not.toContain("server-only");
  });
});
