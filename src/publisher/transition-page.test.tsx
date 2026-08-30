import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  LegacyFragmentRedirectIsland: vi.fn(() => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/components/LegacyFragmentRedirectIsland", () => ({
  LegacyFragmentRedirectIsland: mocks.LegacyFragmentRedirectIsland,
}));

import { renderCoherencePublisherTransitionPage } from "./transition-page";
import { coherencePublisherThemeCanvas } from "./coherence-theme-contract";
import { coherencePublisherEmbeddedCanvasProperty } from "./embedded-reader-appearance";

type PublisherTransitionPage = Parameters<
  PublicationNextApplication["renderEmbeddedPage"]
>[0];

const publisherPage = Object.freeze({
  kind: "home",
}) as unknown as PublisherTransitionPage;

function previewApplication(
  renderEmbeddedPage: PublicationNextApplication["renderEmbeddedPage"],
) {
  return Object.defineProperties(Object.create(null), {
    ReaderPrepaint: {
      enumerable: true,
      get(): never {
        throw new TypeError("ReaderPrepaint must stay outside the transition");
      },
    },
    ReaderProviders: {
      enumerable: true,
      get(): never {
        throw new TypeError("ReaderProviders must stay outside the transition");
      },
    },
    RootLayout: {
      enumerable: true,
      get(): never {
        throw new TypeError("RootLayout must stay outside the transition");
      },
    },
    RootPage: {
      enumerable: true,
      get(): never {
        throw new TypeError("RootPage must stay outside the transition");
      },
    },
    renderPage: {
      enumerable: true,
      get(): never {
        throw new TypeError("renderPage must stay outside the transition");
      },
    },
    renderEmbeddedPage: { enumerable: true, value: renderEmbeddedPage },
    resolveRoute: {
      enumerable: true,
      value: vi.fn(() => ({ status: "not-found" as const })),
    },
  }) as unknown as PublicationNextApplication;
}

describe("Coherence Publisher transition page", () => {
  it("adds legacy fragment continuity without inspecting the Publisher element", async () => {
    const opaquePublisherElement = Object.defineProperties(
      Object.create(null),
      {
        key: { enumerable: true, value: "opaque-publisher-page" },
        props: {
          enumerable: true,
          get(): never {
            throw new TypeError("Publisher element props must stay opaque");
          },
        },
        type: {
          enumerable: true,
          get(): never {
            throw new TypeError("Publisher element type must stay opaque");
          },
        },
      },
    ) as unknown as ReactElement;
    const renderEmbeddedPage = vi.fn(async () => opaquePublisherElement);

    const result = await renderCoherencePublisherTransitionPage({
      application: previewApplication(renderEmbeddedPage),
      page: publisherPage,
    });

    expect(renderEmbeddedPage).toHaveBeenCalledExactlyOnceWith(publisherPage);
    expect(result.type).toBe("div");
    const resultProps = result.props as {
      readonly className: string;
      readonly children: ReactElement;
    };
    expect(resultProps.className).toBe("page-frame reader-layout");
    expect(resultProps.children.type).toBe("div");
    const readerMainProps = resultProps.children.props as {
      readonly className: string;
      readonly children: readonly ReactElement[];
      readonly style: Readonly<{
        backgroundColor: string;
      }>;
    };
    expect(readerMainProps.className).toBe("reader-main");
    expect(readerMainProps.style).toEqual({
      backgroundColor: `var(${coherencePublisherEmbeddedCanvasProperty}, ${coherencePublisherThemeCanvas})`,
    });
    const children = readerMainProps.children;
    expect(children).toHaveLength(2);
    expect(children[0]?.type).toBe(mocks.LegacyFragmentRedirectIsland);
    expect(children[1]).toBe(opaquePublisherElement);
  });

  it("propagates Publisher rendering failures without producing a partial page", async () => {
    const failure = new TypeError("Publisher rendering failed");
    const renderEmbeddedPage = vi.fn(async (): Promise<ReactElement> => {
      throw failure;
    });

    await expect(
      renderCoherencePublisherTransitionPage({
        application: previewApplication(renderEmbeddedPage),
        page: publisherPage,
      }),
    ).rejects.toBe(failure);
    expect(renderEmbeddedPage).toHaveBeenCalledOnce();
  });
});
