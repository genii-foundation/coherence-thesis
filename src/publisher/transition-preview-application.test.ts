import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import { describe, expect, it, vi } from "vitest";
import {
  coherencePublisherTransitionPreviewBoundary,
  createCoherencePublisherTransitionPreviewApplication,
} from "./transition-preview-application";

describe("Coherence Publisher transition preview application", () => {
  it("freezes the exact transition surface without reading provider or layout exports", () => {
    const ReaderPrepaint = vi.fn();
    const RootPage = vi.fn(async () => null);
    const renderPage = vi.fn(async () => null);
    const resolveRoute = vi.fn(() => ({ status: "not-found" as const }));
    const application = Object.defineProperties(Object.create(null), {
      ReaderPrepaint: { enumerable: true, value: ReaderPrepaint },
      ReaderProviders: {
        enumerable: true,
        get(): never {
          throw new TypeError(
            "ReaderProviders must remain outside the transition preview",
          );
        },
      },
      RootLayout: {
        enumerable: true,
        get(): never {
          throw new TypeError("RootLayout must remain outside the transition preview");
        },
      },
      RootPage: { enumerable: true, value: RootPage },
      renderPage: { enumerable: true, value: renderPage },
      resolveRoute: { enumerable: true, value: resolveRoute },
    }) as unknown as PublicationNextApplication;

    const facade =
      createCoherencePublisherTransitionPreviewApplication(application);

    expect(Reflect.ownKeys(facade)).toEqual(
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    );
    expect("ReaderProviders" in facade).toBe(false);
    expect("RootLayout" in facade).toBe(false);
    expect(facade.ReaderPrepaint).toBe(ReaderPrepaint);
    expect(facade.RootPage).toBe(RootPage);
    expect(facade.renderPage).toBe(renderPage);
    expect(facade.resolveRoute).toBe(resolveRoute);
    expect(Object.isFrozen(facade)).toBe(true);
  });

  it("publishes one frozen exact transition boundary", () => {
    expect(coherencePublisherTransitionPreviewBoundary).toEqual({
      applicationOptionKeys: ["reader", "readerStateBootstrap", "theme"],
      absentApplicationOptionKeys: [
        "audioData",
        "extensionData",
        "extensions",
        "syncData",
        "updates",
        "updatesData",
      ],
      exposedApplicationKeys: [
        "ReaderPrepaint",
        "RootPage",
        "renderPage",
        "resolveRoute",
      ],
      readerProvidersExposed: false,
      rootLayoutExposed: false,
    });
    expect(Object.isFrozen(coherencePublisherTransitionPreviewBoundary)).toBe(
      true,
    );
    for (const value of [
      coherencePublisherTransitionPreviewBoundary.applicationOptionKeys,
      coherencePublisherTransitionPreviewBoundary.absentApplicationOptionKeys,
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});
