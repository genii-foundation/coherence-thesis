import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import { Fragment, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  LegacyFragmentRedirectIsland: vi.fn(() => null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/components/LegacyFragmentRedirectIsland", () => ({
  LegacyFragmentRedirectIsland: mocks.LegacyFragmentRedirectIsland,
}));

import { renderCoherencePublisherTransitionPage } from "./transition-page";

type PublisherTransitionPage = Parameters<
  PublicationNextApplication["renderPage"]
>[0];

const publisherPage = Object.freeze({
  kind: "home",
}) as unknown as PublisherTransitionPage;

function previewApplication(
  renderPage: PublicationNextApplication["renderPage"],
) {
  return Object.defineProperties(Object.create(null), {
    ReaderPrepaint: { enumerable: true, value: vi.fn() },
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
    RootPage: { enumerable: true, value: vi.fn(async () => null) },
    renderPage: { enumerable: true, value: renderPage },
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
    const renderPage = vi.fn(async () => opaquePublisherElement);

    const result = await renderCoherencePublisherTransitionPage({
      application: previewApplication(renderPage),
      page: publisherPage,
    });

    expect(renderPage).toHaveBeenCalledExactlyOnceWith(publisherPage);
    expect(result.type).toBe(Fragment);
    const resultProps = result.props as {
      readonly children: readonly ReactElement[];
    };
    const children = resultProps.children;
    expect(children).toHaveLength(2);
    expect(children[0]?.type).toBe(mocks.LegacyFragmentRedirectIsland);
    expect(children[1]).toBe(opaquePublisherElement);
  });

  it("propagates Publisher rendering failures without producing a partial page", async () => {
    const failure = new TypeError("Publisher rendering failed");
    const renderPage = vi.fn(async (): Promise<ReactElement> => {
      throw failure;
    });

    await expect(
      renderCoherencePublisherTransitionPage({
        application: previewApplication(renderPage),
        page: publisherPage,
      }),
    ).rejects.toBe(failure);
    expect(renderPage).toHaveBeenCalledOnce();
  });
});
