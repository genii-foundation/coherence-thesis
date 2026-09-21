import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type {
  Chapter,
  PageNavigation,
  Section,
} from "@/lib/manuscript-data";

const audioMocks = vi.hoisted(() => ({
  host: vi.fn(() => null),
  singular: vi.fn(() => null),
}));

vi.mock("@/components/ReaderAudioWordInteractionIsland", () => ({
  ReaderAudioWordInteractionHostIsland: audioMocks.host,
  ReaderAudioWordInteractionIsland: audioMocks.singular,
}));

import { ChapterReader } from "./ChapterReader";

function section(sectionId: string, order: number): Section {
  return {
    audioVersionId: `audio-${sectionId}`,
    body: `Body ${sectionId}`,
    chapterHref: "/manuscripts/1/chapter/",
    chapterId: "chapter",
    chapterOrder: 1,
    chapterTitle: "Chapter",
    contentHash: `${sectionId}-content`,
    continuityId: `${sectionId}-continuity`,
    href: `/manuscripts/1/chapter/${sectionId}/`,
    legacyContinuityIds: [],
    legacySectionIds: [],
    nextSectionId: null,
    paragraphs: [],
    partId: "part",
    partOrder: 1,
    partTitle: "Part",
    path: `volume/part/chapter/${sectionId}`,
    previousSectionId: null,
    progressContinuityGroups: [],
    readerHref: `/manuscripts/1/${sectionId}/`,
    readingMinutes: 1,
    sectionId,
    sectionOrder: order,
    text: `Body ${sectionId}`,
    title: `Section ${order}`,
    versionDate: "2026-08-30",
    versionHash: `${sectionId}-version`,
    versionUrl: "",
    volumeId: "volume",
    volumeOrder: 1,
    volumeTitle: "Volume",
    wordCount: 2,
  };
}

type TestElement = ReactElement<{
  children?: ReactNode;
  className?: string;
  sections?: readonly Readonly<{ sectionId: string }>[];
}>;

function childNodes(node: ReactNode): TestElement[] {
  if (Array.isArray(node)) return node.flatMap(childNodes);
  if (!isValidElement<TestElement["props"]>(node)) return [];
  const element = node as TestElement;
  return [element, ...childNodes(element.props.children)];
}

describe("ChapterReader audio interaction topology", () => {
  it("mounts one ordered host and no singular section wrappers", () => {
    const sections = [section("section-a", 1), section("section-b", 2)];
    const chapter: Chapter = {
      chapterId: "chapter",
      href: "/manuscripts/1/chapter/",
      order: 1,
      sectionIds: sections.map(({ sectionId }) => sectionId),
      title: "Chapter",
      wordCount: 4,
    };
    const navigation: PageNavigation = {
      parent: { href: "/manuscripts/1/", title: "Volume" },
    };

    const output = ChapterReader({ chapter, navigation, sections });
    const nodes = childNodes(output);
    const hosts = nodes.filter(({ type }) => type === audioMocks.host);
    const sectionSubtrees = nodes.filter(
      ({ props, type }) =>
        type === "section" &&
        props.className === "chapter-reader-section",
    );

    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.props).toMatchObject({
      sections: [
        { sectionId: "section-a" },
        { sectionId: "section-b" },
      ],
    });
    expect(sectionSubtrees).toHaveLength(2);
    for (const subtree of sectionSubtrees) {
      expect(
        childNodes(subtree.props.children).filter(
          ({ type }) => type === audioMocks.singular,
        ),
      ).toHaveLength(0);
    }
    expect(nodes.filter(({ type }) => type === audioMocks.singular)).toHaveLength(0);
  });
});
