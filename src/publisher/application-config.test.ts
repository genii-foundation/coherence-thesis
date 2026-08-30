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
import {
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  createCoherenceReaderStateMigrationBootstrapProjection,
} from "./reader-state-migration-extension";

describe("Coherence Publisher application configuration", () => {
  it("binds the live Reader, migration extension, theme, and state bootstrap", () => {
    const reader = Object.freeze({ buildId: "reader-build" });
    const extensionData = Object.freeze({ buildId: "extension-build" });
    const stateMigrationProjection =
      createCoherenceReaderStateMigrationBootstrapProjection(
        "coherence-thesis",
      );
    const options = createCoherencePublisherApplicationOptions({
      reader,
      extensionData: extensionData as never,
      stateMigrationProjection,
    });

    expect(options.reader).toBe(reader);
    expect(options.extensionData).toBe(extensionData);
    expect(options.readerStateBootstrap).toBe(coherenceReaderStateBootstrap);
    expect(options.theme).toBe(coherencePublisherTheme);
    const registrations = options.extensions as ReadonlyArray<{
      id: string;
      implementation: {
        project?: (input: unknown) => unknown;
      };
    }>;
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.id).toBe(
      COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
    );
    expect(registrations[0]?.implementation.project?.({
      content: { publicationId: "coherence-thesis" },
      config: {},
      payloads: [],
    })).toMatchObject({
      valid: true,
      value: { clientData: stateMigrationProjection },
    });
    expect(Object.isFrozen(registrations)).toBe(true);
    expect(Object.isFrozen(options)).toBe(true);
  });
});
