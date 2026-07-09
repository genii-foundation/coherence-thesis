import { describe, expect, it } from "vitest";
import { emptyAudioClipManifest } from "@/lib/audio-manifest";
import { buildOfflineAudioPacks } from "@/lib/audio-offline-cache";
import type { OutlineVolume, ProgressSectionData } from "@/lib/reader-data";

const volumes: OutlineVolume[] = [
  {
    title: "Volume One",
    subtitle: "",
    href: "/manuscripts/volume-one/",
    numberLabel: "I",
    wordCount: 100,
    parts: [],
  },
  {
    title: "Volume Two",
    subtitle: "",
    href: "/manuscripts/volume-two/",
    numberLabel: "II",
    wordCount: 100,
    parts: [],
  },
];

const sections: ProgressSectionData[] = [
  {
    sectionId: "one-a",
    contentHash: "a",
    title: "One A",
    href: "/manuscripts/volume-one/part/chapter/one-a/",
    chapterHref: "/manuscripts/volume-one/part/chapter/",
    readerHref: "/manuscripts/volume-one/part/chapter/#one-a",
    audioVersionId: "one-a-a",
    paragraphs: [],
  },
  {
    sectionId: "one-b",
    contentHash: "b",
    title: "One B",
    href: "/manuscripts/volume-one/part/chapter/one-b/",
    chapterHref: "/manuscripts/volume-one/part/chapter/",
    readerHref: "/manuscripts/volume-one/part/chapter/#one-b",
    audioVersionId: "one-b-b",
    paragraphs: [],
  },
  {
    sectionId: "two-a",
    contentHash: "c",
    title: "Two A",
    href: "/manuscripts/volume-two/part/chapter/two-a/",
    chapterHref: "/manuscripts/volume-two/part/chapter/",
    readerHref: "/manuscripts/volume-two/part/chapter/#two-a",
    audioVersionId: "two-a-c",
    paragraphs: [],
  },
];

describe("offline audio packs", () => {
  it("groups sections by manuscript and includes shared reader data", () => {
    const packs = buildOfflineAudioPacks({
      volumes,
      sections,
      manifest: emptyAudioClipManifest,
    });

    expect(packs).toHaveLength(2);
    expect(packs[0]).toMatchObject({
      volumeId: "volume-one",
      title: "Volume One",
      numberLabel: "I",
      sectionCount: 2,
      audioClipCount: 0,
    });
    expect(packs[0]!.urls).toEqual(
      expect.arrayContaining([
        "/",
        "/data/audio-manifest.json",
        "/data/progress-sections.json",
        "/data/reader-sections.json",
        "/manuscripts/volume-one/",
        "/manuscripts/volume-one/part/chapter/one-a/",
        "/manuscripts/volume-one/part/chapter/one-b/",
      ]),
    );
  });

  it("adds all hosted clip urls for each manuscript", () => {
    const packs = buildOfflineAudioPacks({
      volumes,
      sections,
      manifest: {
        version: 1,
        voices: [
          {
            id: "fish-default",
            label: "Fish default",
            sections: [
              {
                sectionId: "one-a",
                audioVersionId: "one-a-a",
                href: "/audio/fish-default/one-a.mp3",
              },
              {
                sectionId: "one-b",
                audioVersionId: "one-b-b",
                href: "/audio/fish-default/one-b.mp3",
              },
              {
                sectionId: "two-a",
                audioVersionId: "two-a-c",
                href: "/audio/fish-default/two-a.mp3",
              },
            ],
          },
          {
            id: "second",
            label: "Second",
            sections: [
              {
                sectionId: "one-a",
                audioVersionId: "one-a-a",
                href: "/audio/second/one-a.mp3",
              },
            ],
          },
        ],
      },
    });

    expect(packs[0]!.audioClipCount).toBe(3);
    expect(packs[0]!.urls).toEqual(
      expect.arrayContaining([
        "/audio/fish-default/one-a.mp3",
        "/audio/fish-default/one-b.mp3",
        "/audio/second/one-a.mp3",
      ]),
    );
    expect(packs[1]!.audioClipCount).toBe(1);
    expect(packs[1]!.urls).toEqual(
      expect.arrayContaining(["/audio/fish-default/two-a.mp3"]),
    );
  });
});
