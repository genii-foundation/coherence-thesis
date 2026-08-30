import { coherencePublisherThemeCanvas } from "@/publisher/coherence-theme-contract";

export const coherencePublisherEmbeddedCanvasProperty =
  "--coherence-publisher-embedded-canvas";

export const coherencePublisherEmbeddedAppearanceByTheme = Object.freeze({
  textured: Object.freeze({
    canvas: coherencePublisherThemeCanvas,
    scheme: "system" as const,
  }),
  light: Object.freeze({
    canvas: "#f5f7f4",
    scheme: "light" as const,
  }),
  dark: Object.freeze({
    canvas: "#11191b",
    scheme: "dark" as const,
  }),
  black: Object.freeze({
    canvas: "#000",
    scheme: "black" as const,
  }),
});
