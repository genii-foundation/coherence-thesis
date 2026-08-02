import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AudioClipManifest } from "../../src/lib/audio-manifest";
import type { CompiledCatalog, VolumeConfig } from "../manuscripts/types";
import { generatedCatalogPath, repoRoot } from "../repository/paths";
import type { AudioPublicationCheckpoint } from "./audio-publication-checkpoints";
import {
  changedManuscriptAudio,
  formatAudioPublicationFailure,
  manuscriptAudioPublicationIssues,
  manuscriptAudioSections,
  removedPublishedNarrators,
  type ChangedManuscriptAudio,
} from "./verify-manuscript-audio";

const config: VolumeConfig = {
  schemaVersion: 1,
  editorialId: "volume-01",
  volumeId: "test-volume",
  title: "Test Volume",
  subtitle: "",
  order: 1,
  numberLabel: "I",
  planet: "Sun",
  coverImage: "/cover.png",
  coverAlt: "Test cover",
  sourcePath: "editorial/sources/volumes/volume-01/manuscript.md",
  voiceCardPath: "editorial/sources/volumes/volume-01/voice-card.md",
  historicalSourcePaths: [],
  import: { startMarkers: ["Opening"] },
};

function manifest(
  sections: Array<{ sectionId: string; audioVersionId: string }>,
): AudioClipManifest {
  return {
    version: 1,
    voices: [
      {
        id: "narrator",
        label: "Narrator",
        sections: sections.map((section) => ({
          ...section,
          href: `https://audio.example/${section.audioVersionId}.opus`,
        })),
      },
    ],
  };
}

describe("manuscript audio publication", () => {
  it("matches the production compiler for a canonical volume", () => {
    const configPath = path.join(
      repoRoot,
      "editorial/sources/volumes/volume-01/volume.json",
    );
    const canonicalConfig = JSON.parse(
      fs.readFileSync(configPath, "utf8"),
    ) as VolumeConfig;
    const source = fs.readFileSync(
      path.join(repoRoot, canonicalConfig.sourcePath),
      "utf8",
    );
    const catalog = JSON.parse(
      fs.readFileSync(generatedCatalogPath, "utf8"),
    ) as CompiledCatalog;
    const expected = catalog.sections
      .filter((section) => section.volumeId === canonicalConfig.volumeId)
      .map((section) => [section.sectionId, section.audioVersionId]);
    const actual = manuscriptAudioSections(canonicalConfig, source).map(
      (section) => [section.sectionId, section.audioVersionId],
    );

    expect(actual).toEqual(expected);
  });

  it("derives the same audio identity for formatting-only copy changes", () => {
    const previous = manuscriptAudioSections(
      config,
      "# Opening\n\nThe *same* spoken words.\n",
    );
    const current = manuscriptAudioSections(
      config,
      "# Opening\n\nThe **same** spoken words.\n",
    );

    expect(previous).toHaveLength(1);
    expect(current).toHaveLength(1);
    expect(changedManuscriptAudio(previous, current)).toEqual([]);
  });

  it("reports only current segments whose spoken input changed", () => {
    const previous = manuscriptAudioSections(
      config,
      "# Opening\n\nOld words.\n\n## Unchanged\n\nSame words.\n",
    );
    const current = manuscriptAudioSections(
      config,
      "# Opening\n\nNew words.\n\n## Unchanged\n\nSame words.\n",
    );
    const changed = changedManuscriptAudio(previous, current);

    expect(changed.map((section) => section.sectionId)).toEqual([
      "v01-opening",
    ]);
    expect(changed[0]?.previousAudioVersionId).not.toBe(
      changed[0]?.audioVersionId,
    );
  });

  it("fails when any published narrator lacks the current immutable segment", () => {
    const changed: ChangedManuscriptAudio[] = [
      {
        editorialId: "volume-01",
        volumeId: "test-volume",
        sectionId: "v01-opening",
        title: "Opening",
        previousAudioVersionId: "v01-opening-old",
        audioVersionId: "v01-opening-current",
      },
    ];
    const issues = manuscriptAudioPublicationIssues(
      manifest([
        {
          sectionId: "v01-opening",
          audioVersionId: "v01-opening-old",
        },
      ]),
      changed,
    );

    expect(issues).toMatchObject([
      {
        voiceId: "narrator",
        sectionId: "v01-opening",
        publishedAudioVersionId: "v01-opening-old",
      },
    ]);
    expect(formatAudioPublicationFailure("abc123", issues)).toContain(
      "Generate the exact sections: v01-opening",
    );
  });

  it("passes when every published narrator points to the current segment", () => {
    const changed: ChangedManuscriptAudio[] = [
      {
        editorialId: "volume-01",
        volumeId: "test-volume",
        sectionId: "v01-opening",
        title: "Opening",
        previousAudioVersionId: "v01-opening-old",
        audioVersionId: "v01-opening-current",
      },
    ];

    expect(
      manuscriptAudioPublicationIssues(
        manifest([
          {
            sectionId: "v01-opening",
            audioVersionId: "v01-opening-current",
          },
        ]),
        changed,
      ),
    ).toEqual([]);
  });

  it("rejects a current manifest entry without verified checkpoint evidence", () => {
    const changed: ChangedManuscriptAudio[] = [
      {
        editorialId: "volume-01",
        volumeId: "test-volume",
        sectionId: "v01-opening",
        title: "Opening",
        previousAudioVersionId: "v01-opening-old",
        audioVersionId: "v01-opening-current",
      },
    ];
    const current = manifest([
      {
        sectionId: "v01-opening",
        audioVersionId: "v01-opening-current",
      },
    ]);

    expect(manuscriptAudioPublicationIssues(current, changed, [])).toMatchObject(
      [{ reason: "missing-checkpoint-evidence" }],
    );
  });

  it("accepts a manifest entry tied to its remotely verified checkpoint", () => {
    const changed: ChangedManuscriptAudio[] = [
      {
        editorialId: "volume-01",
        volumeId: "test-volume",
        sectionId: "v01-opening",
        title: "Opening",
        previousAudioVersionId: "v01-opening-old",
        audioVersionId: "v01-opening-current",
      },
    ];
    const current: AudioClipManifest = {
      version: 1,
      voices: [
        {
          id: "narrator",
          label: "Narrator",
          sections: [
            {
              sectionId: "v01-opening",
              audioVersionId: "v01-opening-current",
              href: "https://audio.example/audiobook/revision/narrator/v01-opening-current.opus",
              byteSize: 100,
              timingsByteSize: 200,
              durationSeconds: 30,
            },
          ],
        },
      ],
    };
    const checkpoint = {
      narrator: { id: "narrator" },
      files: [
        {
          sectionId: "v01-opening",
          audioVersionId: "v01-opening-current",
          durationSeconds: 30,
          audio: {
            objectKey:
              "audiobook/revision/narrator/v01-opening-current.opus",
            byteSize: 100,
          },
          timings: { byteSize: 200 },
        },
      ],
    } as AudioPublicationCheckpoint;

    expect(
      manuscriptAudioPublicationIssues(current, changed, [checkpoint]),
    ).toEqual([]);
  });

  it("rejects removing a narrator that was public at the base", () => {
    const previous = manifest([
      { sectionId: "v01-opening", audioVersionId: "v01-opening-old" },
    ]);

    expect(
      removedPublishedNarrators(previous, { version: 1, voices: [] }),
    ).toEqual(["narrator"]);
  });
});
