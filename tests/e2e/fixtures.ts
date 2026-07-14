import { expect, type Page } from "@playwright/test";
import audioManifestSource from "../../publishing/audio/manifest.json";
import {
  clipVoicePreferenceId,
  type AudioClipManifest,
} from "../../src/lib/audio-manifest";
import { catalog, partById } from "../../src/lib/manuscript-data";
import { readerEventsStorageKey } from "../../src/lib/reader-engagement";
import { readerPreferencesStorageKey } from "../../src/lib/reader-preferences";
import { readerProgressStorageKey } from "../../src/lib/reader-state";
import { formatReadingDurationForWords } from "../../src/lib/reading-time";

const audioManifest = audioManifestSource as AudioClipManifest;

export const highQualityVoicePreferenceId = clipVoicePreferenceId(
  audioManifest.voices[0]?.id ?? "default",
);

export const firstSection = catalog.sections[0]!;
export const firstSectionVolume = catalog.volumes.find(
  (volume) => volume.volumeId === firstSection.volumeId,
)!;
export const firstSectionPdfFileName =
  "The Coherence Thesis - 01.001 - Orientation.pdf";
export const firstManuscriptPdfFileName =
  "The Coherence Thesis - 01 - Humanity's Most Viable Future.pdf";
export const firstSectionVersionDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(firstSection.versionDate));
export const firstOverviewReference = catalog.overview.nodes.flatMap(
  (node) => node.references,
)[0]!;
export const firstOverviewSection = catalog.sections.find(
  (section) => section.sectionId === firstOverviewReference.sectionId,
)!;
export const searchTargetSection = catalog.sections.find((section) =>
  section.title.includes("Federated Footprint"),
)!;
export const wieldingVolume = catalog.volumes.find(
  (volume) => volume.volumeId === "wielding-intelligence",
)!;
export const wieldingFrontMatter = wieldingVolume.parts.find(
  (part) => part.partId === "front-matter",
)!;
export const wieldingDiagnosis = wieldingVolume.parts.find(
  (part) => part.partId === "the-diagnosis",
)!;
export const volumeWithNeighborsIndex = catalog.volumes.findIndex(
  (_volume, index) => index > 0 && index < catalog.volumes.length - 1,
);
export const volumeWithNeighbors = catalog.volumes[volumeWithNeighborsIndex]!;
export const previousVolume = catalog.volumes[volumeWithNeighborsIndex - 1]!;
export const nextVolume = catalog.volumes[volumeWithNeighborsIndex + 1]!;
export const partNavigationVolume = catalog.volumes.find(
  (volume) => volume.parts.length > 2,
)!;
export const partWithNeighborsIndex = partNavigationVolume.parts.findIndex(
  (_part, index) => index > 0 && index < partNavigationVolume.parts.length - 1,
);
export const partWithNeighbors = partNavigationVolume.parts[partWithNeighborsIndex]!;
export const previousPart = partNavigationVolume.parts[partWithNeighborsIndex - 1]!;
export const nextPart = partNavigationVolume.parts[partWithNeighborsIndex + 1]!;
export const chapterNavigationContext = catalog.volumes
  .flatMap((volume) =>
    volume.parts.map((part) => ({
      volume,
      part,
      chapterIndex: part.chapters.findIndex(
        (chapter, index) =>
          index > 0 &&
          index < part.chapters.length - 1 &&
          chapter.sectionIds.length > 1,
      ),
    })),
  )
  .find((context) => context.chapterIndex > 0)!;
export const chapterWithNeighbors =
  chapterNavigationContext.part.chapters[
    chapterNavigationContext.chapterIndex
  ]!;
export const previousChapter =
  chapterNavigationContext.part.chapters[
    chapterNavigationContext.chapterIndex - 1
  ]!;
export const nextChapter =
  chapterNavigationContext.part.chapters[
    chapterNavigationContext.chapterIndex + 1
  ]!;
export const wieldingSection = catalog.sections.find(
  (section) => section.volumeId === "wielding-intelligence",
)!;
export const singleSectionChapterTarget = catalog.sections.find((section) => {
  const chapter = partById(section.volumeId, section.partId)?.chapters.find(
    (candidate) => candidate.chapterId === section.chapterId,
  );
  return chapter?.sectionIds.length === 1;
})!;
export const singleSectionPart = partById(
  singleSectionChapterTarget.volumeId,
  singleSectionChapterTarget.partId,
)!;
export const singleSectionChapter = singleSectionPart.chapters.find(
  (chapter) => chapter.chapterId === singleSectionChapterTarget.chapterId,
)!;
export const centralWoundSection = catalog.sections.find(
  (section) => section.sectionId === "v03-the-central-wound",
)!;
export const centralWoundPart = partById(
  centralWoundSection.volumeId,
  centralWoundSection.partId,
)!;
export const sectionWithNeighbors = catalog.sections.find((section) => {
  const chapter = partById(section.volumeId, section.partId)?.chapters.find(
    (candidate) => candidate.chapterId === section.chapterId,
  );
  return Boolean(
    section.previousSectionId &&
    section.nextSectionId &&
    chapter &&
    chapter.sectionIds.length === 1,
  );
})!;
export const previousSection = catalog.sections.find(
  (section) => section.sectionId === sectionWithNeighbors.previousSectionId,
)!;
export const nextSection = catalog.sections.find(
  (section) => section.sectionId === sectionWithNeighbors.nextSectionId,
)!;
export const parentSectionContainer = partById(
  sectionWithNeighbors.volumeId,
  sectionWithNeighbors.partId,
)!;

export const currentYear = new Date().getFullYear();
export const copyrightYearLabel =
  currentYear > 2026 ? `2026 to ${currentYear}` : "2026";

export function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgb(${red}, ${green}, ${blue})`;
}

export async function expectMenuFitsViewport(
  page: Page,
  selector: string,
  scrollSelector = selector,
): Promise<void> {
  const menu = page.locator(selector);
  await expect(menu).toBeVisible();
  const metrics = await menu.evaluate((element, targetSelector) => {
    const menuBox = element.getBoundingClientRect();
    const scrollTarget =
      targetSelector === "__self__"
        ? element
        : (element.querySelector(targetSelector) ?? element);
    const scrollStyle = window.getComputedStyle(scrollTarget);
    return {
      bottom: menuBox.bottom,
      clientHeight: scrollTarget.clientHeight,
      scrollHeight: scrollTarget.scrollHeight,
      top: menuBox.top,
      viewportHeight: window.innerHeight,
      overflowY: scrollStyle.overflowY,
    };
  }, scrollSelector === selector ? "__self__" : scrollSelector);

  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  if (metrics.scrollHeight > metrics.clientHeight + 1) {
    expect(["auto", "scroll", "overlay"]).toContain(metrics.overflowY);
  }
}

export function pdfObjectCount(bytes: Buffer, pattern: RegExp): number {
  return (bytes.toString("latin1").match(pattern) ?? []).length;
}

export function pdfPageCount(bytes: Buffer): number {
  return pdfObjectCount(bytes, /^\/Type \/Page$/gm);
}

export function pdfImageCount(bytes: Buffer): number {
  return pdfObjectCount(bytes, /^\/Subtype \/Image$/gm);
}

export {
  catalog,
  partById,
  readerEventsStorageKey,
  readerPreferencesStorageKey,
  readerProgressStorageKey,
  formatReadingDurationForWords,
};
