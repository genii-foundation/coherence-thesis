import type { PublicationNextApplication } from "@genii-foundation/publisher-next/server";
import type { PublisherNextThemeAppearanceProjection } from "@genii-foundation/publisher-next/theme";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  coherencePublisherEmbeddedCandidateBuildId,
  createCoherencePublisherEmbeddedOfflineAuthority,
  createCoherencePublisherEmbeddedOfflineAuthorityBuildId,
  type CoherencePublisherEmbeddedOfflineAuthorityBasis,
} from "./embedded-offline-authority";

function sha(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

const palette = (canvas: string) => Object.freeze({
  accent: "#77542A",
  border: "#E3D1AD",
  canvas,
  focus: "#60796D",
  mutedText: "#5A666C",
  surface: canvas,
  text: "#13202A",
});

const appearance: PublisherNextThemeAppearanceProjection = Object.freeze({
  base: palette("#F4EAD7"),
  black: palette("#000000"),
  dark: palette("#11100E"),
  light: palette("#FFFFFF"),
});

function application(): Pick<
  PublicationNextApplication,
  "artifact" | "manifest" | "offlineCatalog" | "reader"
> {
  const publicationId = "coherence-thesis";
  const readerBuildId = sha("b");
  const applicationBuildId = sha("c");
  const manifest = {
    buildId: applicationBuildId,
    publicationId,
    source: { readerBuildId },
  };
  return {
    reader: { buildId: readerBuildId, publicationId },
    manifest,
    artifact: {
      hash: sha("d"),
      manifest,
    },
    offlineCatalog: {
      catalogHref: "/publication-offline.json",
      kind: "genii.publisher.reader.offline-catalog",
      mediaType: "application/json",
      packages: [],
      publicationId,
      readerBuildId,
      relativePath: "publication-offline.json",
      rendererBuildId: applicationBuildId,
      schemaVersion: "1.0",
    },
  } as unknown as Pick<
    PublicationNextApplication,
    "artifact" | "manifest" | "offlineCatalog" | "reader"
  >;
}

describe("Coherence Publisher embedded offline authority", () => {
  it("binds the tracked candidate and every exact runtime identity", () => {
    const authority = createCoherencePublisherEmbeddedOfflineAuthority({
      application: application(),
      extensionBuildId: sha("e"),
      migrationBuildId: sha("f"),
      narrationBuildId: sha("1"),
      themeAppearance: appearance,
    });

    expect(authority.candidateBuildId).toBe(
      "sha256:520f8850edf46a0e83f326f9eb04b80467461310822781d5dba7f27ee912c2cc",
    );
    expect(authority.candidateBuildId).toBe(
      coherencePublisherEmbeddedCandidateBuildId,
    );
    expect(authority.applicationBuildId).toBe(sha("c"));
    expect(authority.applicationArtifactBuildId).toBe(sha("d"));
    expect(authority.readerBuildId).toBe(sha("b"));
    expect(authority.extensionBuildId).toBe(sha("e"));
    expect(authority.migrationBuildId).toBe(sha("f"));
    expect(authority.narrationBuildId).toBe(sha("1"));
    expect(authority.offlineCatalogBuildId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(authority.appearanceBuildId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(authority.hostSourcesBuildId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(authority.buildId).toBe(
      createCoherencePublisherEmbeddedOfflineAuthorityBuildId(
        Object.fromEntries(
          Object.entries(authority).filter(([key]) => key !== "buildId"),
        ) as CoherencePublisherEmbeddedOfflineAuthorityBasis,
      ),
    );
    expect(Object.isFrozen(authority)).toBe(true);
  });

  it("changes the aggregate for every independent authority dimension", () => {
    const basis: CoherencePublisherEmbeddedOfflineAuthorityBasis = Object.freeze({
      applicationArtifactBuildId: sha("a"),
      applicationBuildId: sha("b"),
      appearanceBuildId: sha("c"),
      candidateBuildId: sha("d"),
      extensionBuildId: sha("e"),
      hostSourcesBuildId: sha("f"),
      migrationBuildId: sha("1"),
      narrationBuildId: sha("2"),
      offlineCatalogBuildId: sha("3"),
      publicationId: "coherence-thesis",
      readerBuildId: sha("4"),
      schemaVersion: "1.0",
    });
    const current = createCoherencePublisherEmbeddedOfflineAuthorityBuildId(basis);

    for (const key of Object.keys(basis) as Array<keyof typeof basis>) {
      const changed = {
        ...basis,
        [key]: key === "publicationId"
          ? "other-publication"
          : key === "schemaVersion"
            ? "1.0"
            : sha("9"),
      } as CoherencePublisherEmbeddedOfflineAuthorityBasis;
      if (key === "schemaVersion") continue;
      expect(
        createCoherencePublisherEmbeddedOfflineAuthorityBuildId(changed),
        key,
      ).not.toBe(current);
    }
    expect(() =>
      createCoherencePublisherEmbeddedOfflineAuthorityBuildId({
        ...basis,
        schemaVersion: "2.0" as "1.0",
      })
    ).toThrow("authority identity is invalid");
  });

  it("fails closed when application and offline catalog identities disagree", () => {
    const current = application();
    const mismatched = {
      ...current,
      offlineCatalog: {
        ...current.offlineCatalog,
        rendererBuildId: sha("9"),
      },
    } as unknown as Pick<
      PublicationNextApplication,
      "artifact" | "manifest" | "offlineCatalog" | "reader"
    >;

    expect(() => createCoherencePublisherEmbeddedOfflineAuthority({
      application: mismatched,
      extensionBuildId: sha("e"),
      migrationBuildId: sha("f"),
      narrationBuildId: sha("1"),
      themeAppearance: appearance,
    })).toThrow("application and offline catalog identities do not match");
  });
});
