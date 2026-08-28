import { canonicalizeJson } from "@genii-foundation/publisher-content";
import type { JSONValue } from "@genii-foundation/publisher-schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";
import {
  COHERENCE_READER_STATE_MIGRATION_HREF,
  COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
  MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES,
  createCoherenceReaderStateMigrationArtifact,
  createCoherenceReaderStateOffsetSegments,
  materializeCoherenceReaderStateMigrationArtifact,
  type CoherenceReaderStateMigrationArtifact,
} from "./reader-state-migration-artifact";

let authorities: CoherencePublisherContentAuthorities;
let proof: CoherencePublisherContentProof;
let artifact: CoherenceReaderStateMigrationArtifact;

beforeAll(async () => {
  authorities = await loadCoherencePublisherContentAuthorities();
  proof = await adaptCoherencePublisherContent(authorities);
  artifact = createCoherenceReaderStateMigrationArtifact({
    catalog: authorities.rawCatalog,
    workInputs: authorities.sourceWorks,
    reader: proof.reader,
  });
}, 30_000);

describe("Coherence Reader state migration artifact", () => {
  it("records only exact equal text runs across bounded drift", () => {
    expect(createCoherenceReaderStateOffsetSegments("same text", "same text"))
      .toEqual([{ legacyStart: 0, targetStart: 0, length: 9 }]);
    expect(
      createCoherenceReaderStateOffsetSegments(
        "before after",
        "before inserted after",
      ),
    ).toEqual([
      { legacyStart: 0, targetStart: 0, length: 7 },
      { legacyStart: 7, targetStart: 16, length: 5 },
    ]);
    expect(
      createCoherenceReaderStateOffsetSegments(
        `start ${"x".repeat(300)} finish-a`,
        `start ${"y".repeat(300)} finish-b`,
      ),
    ).toEqual([{ legacyStart: 0, targetStart: 0, length: 6 }]);
  });

  it("binds the complete legacy section and paragraph census to current Reader owners", () => {
    const paragraphs = artifact.sections.flatMap((section) =>
      section.paragraphs.map((paragraph) => ({ section, paragraph })),
    );
    const readerSections = new Map(
      proof.reader.works.flatMap((work) =>
        work.sections.map((section) => [section.id, section] as const),
      ),
    );

    expect(artifact.schemaVersion).toBe(
      COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
    );
    expect(artifact.href).toBe(COHERENCE_READER_STATE_MIGRATION_HREF);
    expect(artifact.publicationId).toBe(proof.reader.publicationId);
    expect(artifact.readerBuildId).toBe(proof.reader.buildId);
    expect(artifact.buildId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifact.sections).toHaveLength(525);
    expect(paragraphs).toHaveLength(2_554);

    for (const { section, paragraph } of paragraphs) {
      const readerSection = readerSections.get(section.sectionId);
      expect(readerSection).toBeDefined();
      expect(
        readerSection?.blocks.some(
          (block) =>
            block.id === paragraph.blockId &&
            block.contentHash === paragraph.blockContentHash,
        ),
      ).toBe(true);
      expect(paragraph.legacyContentHash).toMatch(/^[0-9a-f]{16}$/);
      expect(paragraph.blockContentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      for (const segment of paragraph.offsetSegments) {
        expect(segment.length).toBeGreaterThan(0);
        expect(segment.legacyStart + segment.length).toBeLessThanOrEqual(
          paragraph.legacyTextCodeUnits,
        );
        expect(segment.targetStart + segment.length).toBeLessThanOrEqual(
          paragraph.blockTextCodeUnits,
        );
      }
    }

    const serialized = canonicalizeJson(artifact as unknown as JSONValue);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(
      MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES,
    );
    expect(serialized).not.toContain(authorities.rawCatalog.sections[0]?.body);
    expect(serialized).not.toContain(
      authorities.rawCatalog.sections[0]?.paragraphs[0]?.text,
    );
  });

  it("materializes one exact bounded browser artifact receipt", () => {
    const materialized = materializeCoherenceReaderStateMigrationArtifact({
      catalog: authorities.rawCatalog,
      workInputs: authorities.sourceWorks,
      reader: proof.reader,
    });

    expect(materialized.artifact).toEqual(artifact);
    expect(materialized.text).toBe(
      canonicalizeJson(artifact as unknown as JSONValue),
    );
    expect(materialized.byteSize).toBe(
      Buffer.byteLength(materialized.text, "utf8"),
    );
    expect(materialized.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(materialized.byteSize).toBeLessThan(
      MAXIMUM_COHERENCE_STATE_MIGRATION_BYTES,
    );
  });

  it("keeps grouped legacy paragraphs attached to their exact current block offsets", () => {
    const section = artifact.sections.find(
      ({ sectionId }) =>
        sectionId === "v09-the-ninth-turn-where-the-eight-have-brought-us",
    );
    const grouped = section?.paragraphs.filter(
      ({ blockId }) =>
        blockId ===
        "markdown-block-77424f07237aff13e23a4bf0b14f85fa74293359f9584f58290fdeb123790aba",
    );

    expect(grouped).toHaveLength(8);
    expect(grouped?.map(({ offsetSegments }) => offsetSegments[0]?.targetStart))
      .toEqual([0, 412, 724, 1_477, 2_113, 2_480, 2_790, 3_324]);
  });

  it("fails closed when a legacy hash or section census drifts", () => {
    const firstSection = authorities.rawCatalog.sections[0];
    expect(firstSection).toBeDefined();
    if (firstSection === undefined) return;

    expect(() =>
      createCoherenceReaderStateMigrationArtifact({
        catalog: {
          ...authorities.rawCatalog,
          sections: [
            { ...firstSection, contentHash: "changed" },
            ...authorities.rawCatalog.sections.slice(1),
          ],
        },
        workInputs: authorities.sourceWorks,
        reader: proof.reader,
      }),
    ).toThrow("invalid legacy content hash");

    expect(() =>
      createCoherenceReaderStateMigrationArtifact({
        catalog: {
          ...authorities.rawCatalog,
          sections: authorities.rawCatalog.sections.slice(1),
        },
        workInputs: authorities.sourceWorks,
        reader: proof.reader,
      }),
    ).toThrow("section censuses differ");
  });
});
