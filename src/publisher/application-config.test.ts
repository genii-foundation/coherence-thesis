import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({
    style: { fontFamily: '"Mock Cormorant"' },
  }),
  Fraunces: () => ({ style: { fontFamily: '"Mock Fraunces"' } }),
  Literata: () => ({ style: { fontFamily: '"Mock Literata"' } }),
  Newsreader: () => ({ style: { fontFamily: '"Mock Newsreader"' } }),
  Source_Serif_4: () => ({
    style: { fontFamily: '"Mock Source Serif"' },
  }),
}));

import { coherencePublisherTheme } from "./coherence-theme";
import { coherenceReaderStateBootstrap } from "./reader-state-bootstrap";
import { createCoherencePublisherApplicationOptions } from "./application-config";
import { coherencePublisherTransitionPreviewBoundary } from "./transition-preview-application";

describe("Coherence Publisher application configuration", () => {
  it("binds the live Reader, theme, and state bootstrap without activating dormant payloads", () => {
    const reader = Object.freeze({ buildId: "reader-build" });
    const options = createCoherencePublisherApplicationOptions({ reader });

    expect(Object.getOwnPropertyNames(options).sort()).toEqual(
      coherencePublisherTransitionPreviewBoundary.applicationOptionKeys,
    );
    expect(Object.getOwnPropertySymbols(options)).toEqual([]);
    expect(options.reader).toBe(reader);
    for (const key of
      coherencePublisherTransitionPreviewBoundary.absentApplicationOptionKeys) {
      expect(options).not.toHaveProperty(key);
    }
    expect(options.readerStateBootstrap).toBe(coherenceReaderStateBootstrap);
    expect(options.theme).toBe(coherencePublisherTheme);
    expect(Object.isFrozen(options)).toBe(true);
  });
});
