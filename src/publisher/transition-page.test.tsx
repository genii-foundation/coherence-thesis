import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import type {
  PublisherNextThemeAppearanceProjection,
  PublisherNextThemeColorPalette,
} from "@genii-foundation/publisher-next/theme";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  CoherencePublisherAudioWordBridgeClient: vi.fn(() => null),
  CoherencePublisherBookmarkBridgeClient: vi.fn(() => null),
  LegacyFragmentRedirectIsland: vi.fn(() => null),
  ReaderEngagementIsland: vi.fn(() => null),
  allSections: vi.fn(() => Object.freeze([
    Object.freeze({ sectionId: "section" }),
  ])),
  createCoherencePublisherAudioWordRouteModel: vi.fn(() =>
    Object.freeze({
      authorityBuildId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      schemaVersion: 1,
      sections: Object.freeze([
        Object.freeze({
          bodyStartCharacter: 9,
          bodyWordCount: 1,
          profileText: "Title\n\nword",
          queueIdentity: Object.freeze({
            audioVersionId: "audio-version",
            contentHash: "0123456789abcdef",
          }),
          sectionId: "section",
          titleWordCount: 1,
        }),
      ]),
    })
  ),
  createCoherencePublisherLegacyFragmentModel: vi.fn(
    (page: Readonly<{ kind: string }>) =>
      page.kind === "section"
        ? Object.freeze({
            sections: Object.freeze([
              Object.freeze({
                aliases: Object.freeze([
                  Object.freeze({
                    fragment: "old-section",
                    href: "/manuscripts/1/section/",
                  }),
                ]),
                bareParagraphAliases: Object.freeze([]),
                sectionId: "section",
              }),
            ]),
          })
        : Object.freeze({ sections: Object.freeze([]) }),
  ),
  createCoherencePublisherLegacyProgressModel: vi.fn(() =>
    Object.freeze({
      sections: Object.freeze([
        Object.freeze({
          sectionId: "section",
          continuityId: "section",
          legacyContinuityIds: Object.freeze([]),
          progressContinuityGroups: Object.freeze([
            Object.freeze(["section"]),
          ]),
          legacySectionIds: Object.freeze([]),
          contentHash: "0123456789abcdef",
          paragraphs: Object.freeze([]),
        }),
      ]),
    })
  ),
  createCoherencePublisherBookmarkRouteModel: vi.fn(() =>
    Object.freeze({
      sections: Object.freeze([
        Object.freeze({
          workId: "work",
          publisherSection: Object.freeze({ id: "section" }),
        }),
      ]),
    })
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/components/LegacyFragmentRedirectIsland", () => ({
  LegacyFragmentRedirectIsland: mocks.LegacyFragmentRedirectIsland,
}));
vi.mock("@/components/ReaderEngagementIsland", () => ({
  ReaderEngagementIsland: mocks.ReaderEngagementIsland,
}));
vi.mock("@/lib/manuscript-data", () => ({
  allSections: mocks.allSections,
}));
vi.mock("@/publisher/legacy-audio-word-bridge-client", () => ({
  CoherencePublisherAudioWordBridgeClient:
    mocks.CoherencePublisherAudioWordBridgeClient,
}));
vi.mock("@/publisher/legacy-audio-word-bridge", () => ({
  createCoherencePublisherAudioWordRouteModel:
    mocks.createCoherencePublisherAudioWordRouteModel,
}));
vi.mock("@/publisher/legacy-reader-bookmark-bridge-client", () => ({
  CoherencePublisherBookmarkBridgeClient:
    mocks.CoherencePublisherBookmarkBridgeClient,
}));
vi.mock("@/publisher/legacy-reader-bookmark-bridge", () => ({
  createCoherencePublisherBookmarkRouteModel:
    mocks.createCoherencePublisherBookmarkRouteModel,
}));
vi.mock("@/publisher/legacy-fragment-continuity", () => ({
  createCoherencePublisherLegacyFragmentModel:
    mocks.createCoherencePublisherLegacyFragmentModel,
}));
vi.mock("@/publisher/legacy-reader-progress-bridge", () => ({
  createCoherencePublisherLegacyProgressModel:
    mocks.createCoherencePublisherLegacyProgressModel,
}));

import { renderCoherencePublisherTransitionPage } from "./transition-page";
import {
  coherencePublisherEmbeddedCanvasProperties,
  coherencePublisherEmbeddedCanvasProperty,
} from "./embedded-reader-appearance";
import type { CoherenceReaderStateMigrationArtifact } from "./reader-state-migration-schema";
import type { CoherencePublisherAudioWordAuthority } from "./legacy-audio-word-bridge";

type PublisherTransitionPage = Parameters<
  PublicationNextApplication["renderEmbeddedPage"]
>[0];

const publisherPage = Object.freeze({
  kind: "section",
  path: "/manuscripts/1/section/",
}) as unknown as PublisherTransitionPage;
const publisherWorkPage = Object.freeze({
  kind: "work",
  path: "/manuscripts/9/",
}) as unknown as PublisherTransitionPage;
const migrationArtifact = Object.freeze({
  publicationId: "publication",
}) as unknown as CoherenceReaderStateMigrationArtifact;
const narrationWordAuthority = Object.freeze({
  buildId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
}) as unknown as CoherencePublisherAudioWordAuthority;
const offlineAuthorityBuildId =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const palette = (canvas: string): PublisherNextThemeColorPalette =>
  Object.freeze({
    canvas,
    surface: canvas,
    text: "#111111",
    mutedText: "#222222",
    accent: "#333333",
    focus: "#444444",
    border: "#555555",
  });
const themeAppearance: PublisherNextThemeAppearanceProjection = Object.freeze({
  base: palette("#F4EAD7"),
  light: palette("#FFFFFF"),
  dark: palette("#11100E"),
  black: palette("#000000"),
});

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
      migrationArtifact,
      narrationWordAuthority,
      offlineAuthorityBuildId,
      page: publisherPage,
      themeAppearance,
    });

    expect(renderEmbeddedPage).toHaveBeenCalledExactlyOnceWith(publisherPage);
    expect(
      mocks.createCoherencePublisherLegacyFragmentModel,
    ).toHaveBeenCalledExactlyOnceWith(publisherPage, migrationArtifact);
    expect(
      mocks.createCoherencePublisherAudioWordRouteModel,
    ).toHaveBeenCalledExactlyOnceWith(
      publisherPage,
      narrationWordAuthority,
    );
    expect(
      mocks.createCoherencePublisherLegacyProgressModel,
    ).toHaveBeenCalledExactlyOnceWith(publisherPage, migrationArtifact);
    expect(mocks.allSections).toHaveBeenCalledExactlyOnceWith();
    expect(
      mocks.createCoherencePublisherBookmarkRouteModel,
    ).toHaveBeenCalledExactlyOnceWith(
      publisherPage,
      migrationArtifact,
      mocks.allSections.mock.results[0]?.value,
    );
    expect(result.type).toBe("div");
    const resultProps = result.props as {
      readonly className: string;
      readonly children: ReactElement;
    };
    expect(resultProps.className).toBe("page-frame reader-layout");
    expect(resultProps.children.type).toBe("div");
    const readerMainProps = resultProps.children.props as {
      readonly className: string;
      readonly "data-coherence-publisher-transition-root": string;
      readonly "data-coherence-publisher-runtime-build-id": string;
      readonly children: readonly ReactElement[];
      readonly style: Readonly<Record<string, string>>;
    };
    expect(readerMainProps.className).toBe(
      "reader-main coherence-publisher-transition-canvas",
    );
    expect(
      readerMainProps["data-coherence-publisher-transition-root"],
    ).toBe("true");
    expect(
      readerMainProps["data-coherence-publisher-runtime-build-id"],
    ).toBe(offlineAuthorityBuildId);
    expect(readerMainProps.style).toEqual({
      [coherencePublisherEmbeddedCanvasProperties.base]: "#F4EAD7",
      [coherencePublisherEmbeddedCanvasProperties.light]: "#FFFFFF",
      [coherencePublisherEmbeddedCanvasProperties.dark]: "#11100E",
      [coherencePublisherEmbeddedCanvasProperties.black]: "#000000",
      backgroundColor: `var(${coherencePublisherEmbeddedCanvasProperty}, #F4EAD7)`,
    });
    const children = readerMainProps.children;
    expect(children).toHaveLength(5);
    expect(children[0]?.type).toBe(mocks.LegacyFragmentRedirectIsland);
    expect(children[0]?.props).toEqual({
      publisherFragmentModel:
        mocks.createCoherencePublisherLegacyFragmentModel.mock.results[0]
          ?.value,
    });
    expect(children[1]).toBe(opaquePublisherElement);
    expect(children[2]?.type).toBe(mocks.ReaderEngagementIsland);
    expect(children[2]?.key).toBe("progress:/manuscripts/1/section/");
    expect(children[2]?.props).toEqual({
      domContract: "publisher-embedded",
      initialFragmentPolicy: "inert",
      sections:
        mocks.createCoherencePublisherLegacyProgressModel.mock.results[0]
          ?.value.sections,
    });
    expect(children[3]?.type).toBe(
      mocks.CoherencePublisherBookmarkBridgeClient,
    );
    expect(children[3]?.key).toBe("/manuscripts/1/section/");
    expect(children[3]?.props).toEqual({
      model: mocks.createCoherencePublisherBookmarkRouteModel.mock.results[0]
        ?.value,
    });
    expect(children[4]?.type).toBe(
      mocks.CoherencePublisherAudioWordBridgeClient,
    );
    expect(children[4]?.props).toEqual({
      model: mocks.createCoherencePublisherAudioWordRouteModel.mock.results[0]
        ?.value,
    });
  });

  it("omits work fragment continuity and keeps engagement inert", async () => {
    const opaquePublisherElement = Object.freeze({}) as ReactElement;
    const result = await renderCoherencePublisherTransitionPage({
      application: previewApplication(
        vi.fn(async () => opaquePublisherElement),
      ),
      migrationArtifact,
      narrationWordAuthority,
      offlineAuthorityBuildId,
      page: publisherWorkPage,
      themeAppearance,
    });
    const resultProps = result.props as { readonly children: ReactElement };
    const readerMainProps = resultProps.children.props as {
      readonly children: readonly (ReactElement | null)[];
    };
    const progressIsland = readerMainProps.children[2];
    const bookmarkIsland = readerMainProps.children[3];

    expect(readerMainProps.children[0]).toBeNull();
    expect(
      readerMainProps.children.filter(Boolean).filter((child) =>
        child?.type === mocks.LegacyFragmentRedirectIsland
      ),
    ).toHaveLength(0);
    expect(progressIsland?.type).toBe(mocks.ReaderEngagementIsland);
    expect(progressIsland?.key).toBe("progress:/manuscripts/9/");
    expect(progressIsland?.props).toMatchObject({
      domContract: "publisher-embedded",
      initialFragmentPolicy: "inert",
    });
    expect(bookmarkIsland?.key).toBe("/manuscripts/9/");
    expect(progressIsland?.key).not.toBe(bookmarkIsland?.key);
  });

  it("mounts no engagement island for an inert work model", async () => {
    mocks.createCoherencePublisherLegacyProgressModel.mockReturnValueOnce(
      Object.freeze({ sections: Object.freeze([]) }),
    );
    const result = await renderCoherencePublisherTransitionPage({
      application: previewApplication(
        vi.fn(async () => Object.freeze({}) as ReactElement),
      ),
      migrationArtifact,
      narrationWordAuthority,
      offlineAuthorityBuildId,
      page: publisherWorkPage,
      themeAppearance,
    });
    const resultProps = result.props as { readonly children: ReactElement };
    const readerMainProps = resultProps.children.props as {
      readonly children: readonly (ReactElement | null)[];
    };

    expect(
      readerMainProps.children.filter(Boolean).filter((child) =>
        child?.type === mocks.ReaderEngagementIsland
      ),
    ).toHaveLength(0);
  });

  it("propagates Publisher rendering failures without producing a partial page", async () => {
    const failure = new TypeError("Publisher rendering failed");
    const renderEmbeddedPage = vi.fn(async (): Promise<ReactElement> => {
      throw failure;
    });

    await expect(
      renderCoherencePublisherTransitionPage({
        application: previewApplication(renderEmbeddedPage),
        migrationArtifact,
        narrationWordAuthority,
        offlineAuthorityBuildId,
        page: publisherPage,
        themeAppearance,
      }),
    ).rejects.toBe(failure);
    expect(renderEmbeddedPage).toHaveBeenCalledOnce();
  });
});
