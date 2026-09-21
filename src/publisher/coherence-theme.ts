import type { ValidationResult } from "@genii-foundation/publisher-schema";
import {
  validatePublisherNextThemeInstance,
  type PublisherNextJsonObject,
  type PublisherNextTheme,
  type PublisherNextThemeInstance,
  type ResolvedPublisherNextTheme,
} from "@genii-foundation/publisher-next/theme";
import {
  Cormorant_Garamond,
  Fraunces,
  Literata,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";
import { coherencePublisherThemeCanvas } from "@/publisher/coherence-theme-contract";

const literata = Literata({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-literata",
  weight: "variable",
});

const sourceSerif = Source_Serif_4({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: "variable",
});

const newsreader = Newsreader({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: "variable",
});

const cormorant = Cormorant_Garamond({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: "variable",
});

const fraunces = Fraunces({
  axes: ["opsz"],
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: "variable",
});

const INVALID_CONFIG_RESULT: ValidationResult<PublisherNextThemeInstance> =
  Object.freeze({
    valid: false,
    diagnostics: Object.freeze([
      Object.freeze({
        code: "next.theme.coherence_config.invalid",
        severity: "error" as const,
        path: "/theme/config",
        message:
          "The Coherence theme configuration must be one empty plain data object.",
        keyword: "properties",
        params: Object.freeze({}),
      }),
    ]),
  });

function hasClosedEmptyConfig(config: unknown): boolean {
  try {
    if (config === null || typeof config !== "object") return false;
    const prototype = Object.getPrototypeOf(config);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (Object.getOwnPropertySymbols(config).length > 0) return false;
    return Object.keys(Object.getOwnPropertyDescriptors(config)).length === 0;
  } catch {
    return false;
  }
}

const configureCoherenceTheme = Object.freeze(
  (
    config: PublisherNextJsonObject,
  ): ValidationResult<PublisherNextThemeInstance> => {
    if (!hasClosedEmptyConfig(config)) return INVALID_CONFIG_RESULT;

    return validatePublisherNextThemeInstance({
      tokens: {
        color: {
          canvas: coherencePublisherThemeCanvas,
          surface: "#FBF6EB",
          text: "#13202A",
          mutedText: "#5A666C",
          accent: "#77542A",
          focus: "#60796D",
          border: "#E3D1AD",
        },
        colorSchemes: {
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
        },
        typography: {
          bodyFamily: literata.style.fontFamily,
          headingFamily: literata.style.fontFamily,
          monoFamily:
            "SFMono-Regular, Consolas, Liberation Mono, monospace",
          baseSize: "1.12rem",
          lineHeight: 1.78,
          defaultReaderFontFamilyId: "literata",
          readerFontFamilies: [
            {
              id: "literata",
              label: "Literata",
              family: literata.style.fontFamily,
            },
            {
              id: "source-serif",
              label: "Source Serif 4",
              family: sourceSerif.style.fontFamily,
            },
            {
              id: "newsreader",
              label: "Newsreader",
              family: newsreader.style.fontFamily,
            },
            {
              id: "cormorant",
              label: "Cormorant Garamond",
              family: cormorant.style.fontFamily,
            },
            {
              id: "fraunces",
              label: "Fraunces",
              family: fraunces.style.fontFamily,
            },
            {
              id: "serif",
              label: "System serif",
              family: 'Georgia, "Times New Roman", serif',
            },
          ],
        },
        layout: {
          readingMeasure: "48rem",
          pageGutter: "1.5rem",
          sectionGap: "3rem",
          controlRadius: "8px",
        },
      },
    });
  },
);

const implementation: PublisherNextTheme = Object.freeze({
  kind: "genii.publisher.next-theme",
  apiVersion: "2.0",
  configure: configureCoherenceTheme,
});

export const coherencePublisherTheme: ResolvedPublisherNextTheme =
  Object.freeze({
    package: "coherence-thesis",
    version: "0.1.0",
    rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
    config: Object.freeze({}),
    implementation,
  });
