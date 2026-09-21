import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import type {
  PublisherNextThemeAppearanceProjection,
  PublisherNextThemeColorPalette,
} from "@genii-foundation/publisher-next/theme";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sectionIndexSectionIdsByPath: Readonly<Record<
    string,
    readonly string[]
  >> = Object.freeze({
    "/manuscripts/3/governance/": Object.freeze([
      "v03-the-constitutional-problem",
      "v03-a-provisional-constitution",
      "v03-two-entities-in-productive-tension",
      "v03-three-chambers",
      "v03-designing-for-corruption",
      "v03-how-providence-could-fail",
      "v03-measurement-without-meaning",
      "v03-the-wrong-signal",
      "v03-centralization",
      "v03-elite-capture",
      "v03-coherence-theater",
      "v03-cult-dynamics",
      "v03-drift-toward-surveillance-and-rank",
      "v03-correction-as-a-core-function",
      "v03-what-failure-requires-of-us",
      "v03-the-bright-lines",
      "v03-the-danger-being-named",
      "v03-six-bright-lines",
      "v03-the-person-remains-sovereign",
      "v03-intent-is-not-the-difference",
    ]),
    "/manuscripts/3/the-design/": Object.freeze([
      "v03-the-conditions-of-wisdom",
      "v03-the-seven-initiates",
      "v03-inheritance",
      "v03-monasteries-practice-across-time",
      "v03-guilds-mastery-through-relationship",
      "v03-indigenous-governance-accountability-to-place-and-descendants",
      "v03-mutual-aid-and-cooperative-economics-provision-without-capture",
      "v03-scientific-inquiry-and-quaker-process-disciplined-encounter",
      "v03-trusts-and-commons-holding-what-must-not-be-sold",
      "v03-the-synthesis",
      "v03-three-doors-and-a-membrane",
      "v03-the-first-door-one-on-one-mentorship",
      "v03-the-second-door-gatherings-and-retreats",
      "v03-the-third-door-the-year-long-curriculum",
      "v03-the-membrane",
      "v03-the-currency-of-presence",
      "v03-presence-and-presencing",
      "v03-how-it-circulates",
      "v03-where-we-begin",
      "v03-the-container-must-fit-the-currency",
      "v03-the-reasonable-doubt",
    ]),
    "/manuscripts/6/the-whole-in-the-fewest-words/": Object.freeze([
      "v06-on-nests",
      "v06-the-whole-briefly",
      "v06-the-whole-unfolded",
      "v06-what-this-is-for",
      "v06-the-current",
      "v06-the-between",
      "v06-the-unspent-gift",
      "v06-the-pathway",
      "v06-the-seeing",
      "v06-your-people",
      "v06-the-loom",
      "v06-the-currency",
      "v06-the-right-size",
      "v06-the-dragon",
      "v06-the-smallest-nest",
      "v06-the-first-nest-is-whole",
    ]),
  });

  return ({
  sectionIndexSectionIdsByPath,
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
    (page: Readonly<{ kind: string; path: string }>) => {
      if (page.kind === "section") {
        return Object.freeze({
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
        });
      }
      const sectionIndexIds = sectionIndexSectionIdsByPath[page.path];
      if (page.kind === "section-index" && sectionIndexIds !== undefined) {
        return Object.freeze({
          routeKind: "section-index" as const,
          routePath: page.path,
          sections: Object.freeze(sectionIndexIds.map((sectionId) =>
            Object.freeze({
              aliases: Object.freeze([
                Object.freeze({
                  fragment: sectionId,
                  href: `/manuscripts/${sectionId}/`,
                }),
              ]),
              bareParagraphAliases: Object.freeze([]),
              sectionId,
            })
          )),
        });
      }
      if (page.kind === "work" && page.path === "/manuscripts/9/") {
        return Object.freeze({
          routeKind: "work" as const,
          sections: Object.freeze([
            "v09-a-note-on-the-register",
            "v09-the-ninth-turn-where-the-eight-have-brought-us",
            "v09-what-a-scale-is",
            "v09-providence-the-device-that-coordinates-the-many",
            "v09-what-the-design-holds-and-what-remains-open",
            "v09-what-the-design-commits-to",
            "v09-what-remains-open",
            "v09-the-invitation-to-test-the-design",
            "v09-closing",
            "v09-providence",
          ].map((sectionId) => Object.freeze({
            aliases: Object.freeze([
              Object.freeze({
                fragment: sectionId,
                href: `/manuscripts/9/${sectionId}/`,
              }),
            ]),
            bareParagraphAliases: Object.freeze([]),
            sectionId,
          }))),
        });
      }
      return Object.freeze({ sections: Object.freeze([]) });
    },
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
  });
});

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
const publisherInertWorkPage = Object.freeze({
  kind: "work",
  path: "/manuscripts/8/",
}) as unknown as PublisherTransitionPage;
const publisherSectionIndexPages = Object.freeze([
  Object.freeze({
    count: 20,
    path: "/manuscripts/3/governance/",
    sectionIds:
      mocks.sectionIndexSectionIdsByPath["/manuscripts/3/governance/"]!,
  }),
  Object.freeze({
    count: 21,
    path: "/manuscripts/3/the-design/",
    sectionIds:
      mocks.sectionIndexSectionIdsByPath["/manuscripts/3/the-design/"]!,
  }),
  Object.freeze({
    count: 16,
    path: "/manuscripts/6/the-whole-in-the-fewest-words/",
    sectionIds:
      mocks.sectionIndexSectionIdsByPath[
        "/manuscripts/6/the-whole-in-the-fewest-words/"
      ]!,
  }),
]);
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

  it("mounts Volume IX work fragment continuity and keeps engagement inert", async () => {
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

    expect(readerMainProps.children[0]?.type).toBe(
      mocks.LegacyFragmentRedirectIsland,
    );
    expect(readerMainProps.children[0]?.props).toEqual({
      publisherFragmentModel:
        mocks.createCoherencePublisherLegacyFragmentModel.mock.results.at(-1)
          ?.value,
    });
    const fragmentIslandProps = readerMainProps.children[0]?.props as {
      readonly publisherFragmentModel: {
        readonly routeKind: string;
        readonly sections: readonly Readonly<{
          aliases: readonly unknown[];
          bareParagraphAliases: readonly unknown[];
        }>[];
      };
    };
    const fragmentModel = fragmentIslandProps.publisherFragmentModel;
    expect(fragmentModel.routeKind).toBe("work");
    expect(fragmentModel.sections).toHaveLength(10);
    expect(fragmentModel.sections.every(
      ({ aliases, bareParagraphAliases }) =>
        aliases.length > 0 && bareParagraphAliases.length === 0,
    )).toBe(true);
    expect(
      readerMainProps.children.filter(Boolean).filter((child) =>
        child?.type === mocks.LegacyFragmentRedirectIsland
      ),
    ).toHaveLength(1);
    expect(progressIsland?.type).toBe(mocks.ReaderEngagementIsland);
    expect(progressIsland?.key).toBe("progress:/manuscripts/9/");
    expect(progressIsland?.props).toMatchObject({
      domContract: "publisher-embedded",
      initialFragmentPolicy: "inert",
    });
    expect(bookmarkIsland?.key).toBe("/manuscripts/9/");
    expect(progressIsland?.key).not.toBe(bookmarkIsland?.key);
  });

  it.each(publisherSectionIndexPages)(
    "mounts exact section-index fragment continuity with inert engagement at $path",
    async ({ count, path, sectionIds }) => {
      mocks.createCoherencePublisherLegacyProgressModel.mockReturnValueOnce(
        Object.freeze({ sections: Object.freeze([]) }),
      );
      mocks.createCoherencePublisherBookmarkRouteModel.mockReturnValueOnce(
        Object.freeze({ sections: Object.freeze([]) }),
      );
      mocks.createCoherencePublisherAudioWordRouteModel.mockReturnValueOnce(
        Object.freeze({
          authorityBuildId:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          schemaVersion: 1,
          sections: Object.freeze([]),
        }),
      );
      const page = Object.freeze({
        kind: "section-index",
        path,
      }) as unknown as PublisherTransitionPage;
      const result = await renderCoherencePublisherTransitionPage({
        application: previewApplication(
          vi.fn(async () => Object.freeze({}) as ReactElement),
        ),
        migrationArtifact,
        narrationWordAuthority,
        offlineAuthorityBuildId,
        page,
        themeAppearance,
      });
      const resultProps = result.props as { readonly children: ReactElement };
      const readerMainProps = resultProps.children.props as {
        readonly children: readonly (ReactElement | null)[];
      };
      const fragmentIsland = readerMainProps.children[0];
      const fragmentIslandProps = fragmentIsland?.props as {
        readonly publisherFragmentModel: unknown;
      } | undefined;
      const fragmentModel = fragmentIslandProps?.publisherFragmentModel as {
        readonly routeKind: string;
        readonly routePath: string;
        readonly sections: readonly Readonly<{ sectionId: string }>[];
      };

      expect(fragmentIsland?.type).toBe(mocks.LegacyFragmentRedirectIsland);
      expect(fragmentModel.routeKind).toBe("section-index");
      expect(fragmentModel.routePath).toBe(path);
      expect(fragmentModel.sections).toHaveLength(count);
      expect(fragmentModel.sections.map(({ sectionId }) => sectionId)).toEqual(
        sectionIds,
      );
      expect(
        readerMainProps.children.filter(Boolean).filter((child) =>
          child?.type === mocks.LegacyFragmentRedirectIsland
        ),
      ).toHaveLength(1);
      expect(
        readerMainProps.children.filter(Boolean).filter((child) =>
          child?.type === mocks.ReaderEngagementIsland
        ),
      ).toHaveLength(0);
      expect(
        readerMainProps.children.filter(Boolean).filter((child) =>
          child?.type === mocks.CoherencePublisherBookmarkBridgeClient ||
          child?.type === mocks.CoherencePublisherAudioWordBridgeClient
        ),
      ).toHaveLength(0);
    },
  );

  it.each(Array.from(
    { length: 8 },
    (_, index) => `/manuscripts/${index + 1}/`,
  ))("keeps the other work fragment model empty and engagement inert at %s", async (workPath) => {
    const inertWorkPage = Object.freeze({
      kind: "work",
      path: workPath,
    }) as unknown as PublisherTransitionPage;
    const result = await renderCoherencePublisherTransitionPage({
      application: previewApplication(
        vi.fn(async () => Object.freeze({}) as ReactElement),
      ),
      migrationArtifact,
      narrationWordAuthority,
      offlineAuthorityBuildId,
      page: inertWorkPage,
      themeAppearance,
    });
    const resultProps = result.props as { readonly children: ReactElement };
    const readerMainProps = resultProps.children.props as {
      readonly children: readonly (ReactElement | null)[];
    };
    const progressIsland = readerMainProps.children[2];

    expect(readerMainProps.children[0]).toBeNull();
    expect(progressIsland?.type).toBe(mocks.ReaderEngagementIsland);
    expect(progressIsland?.key).toBe(`progress:${workPath}`);
    expect(progressIsland?.props).toMatchObject({
      domContract: "publisher-embedded",
      initialFragmentPolicy: "inert",
    });
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
      page: publisherInertWorkPage,
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
