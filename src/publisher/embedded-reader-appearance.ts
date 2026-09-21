import {
  projectPublisherNextThemeAppearance,
  type PublisherNextThemeAppearanceProjection,
  type PublisherNextThemeInstance,
} from "@genii-foundation/publisher-next/theme";

export const coherencePublisherEmbeddedCanvasProperty =
  "--coherence-publisher-embedded-canvas";

export const coherencePublisherEmbeddedCanvasProperties = Object.freeze({
  base: "--coherence-publisher-embedded-base-canvas",
  light: "--coherence-publisher-embedded-light-canvas",
  dark: "--coherence-publisher-embedded-dark-canvas",
  black: "--coherence-publisher-embedded-black-canvas",
} as const);

export { coherencePublisherEmbeddedSchemeByTheme } from "@/lib/reader-preferences";

export function projectCoherencePublisherEmbeddedAppearance(
  theme: PublisherNextThemeInstance,
): PublisherNextThemeAppearanceProjection {
  return projectPublisherNextThemeAppearance(theme);
}
