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

describe("Coherence Publisher application configuration", () => {
  it("binds the live Reader to the Coherence theme and state bootstrap", () => {
    const reader = Object.freeze({ buildId: "reader-build" });
    const options = createCoherencePublisherApplicationOptions(reader);

    expect(options).toEqual({
      reader,
      readerStateBootstrap: coherenceReaderStateBootstrap,
      theme: coherencePublisherTheme,
    });
    expect(Object.isFrozen(options)).toBe(true);
  });
});
