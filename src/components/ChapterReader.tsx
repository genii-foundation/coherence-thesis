import { MarkdownBody } from "@/components/MarkdownBody";
import { LegacySectionAnchors } from "@/components/LegacySectionAnchors";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { ReaderEngagementIsland } from "@/components/ReaderEngagementIsland";
import { ReaderLinkableHeading } from "@/components/ReaderLinkableHeading";
import { SectionRevisionNotice } from "@/components/SectionRevisionNotice";
import {
  toProgressSection,
  type Chapter,
  type PageNavigation,
  type Section,
} from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";
import { sectionHeadingHref } from "@/lib/reader-fragments";

function showSectionHeading(section: Section, chapter: Chapter, index: number): boolean {
  return index > 0 || section.title !== chapter.title;
}

export function ChapterReader({
  chapter,
  sections,
  navigation,
}: {
  chapter: Chapter;
  sections: Section[];
  navigation: PageNavigation;
}) {
  const progressSections = sections.map(toProgressSection);
  const firstSection = sections[0];
  const chapterHeadingHref =
    firstSection && !showSectionHeading(firstSection, chapter, 0)
      ? sectionHeadingHref(firstSection.readerHref, firstSection.sectionId)
      : chapter.href;

  return (
    <article className="reader-main">
      <LegacyFragmentRedirectIsland sections={progressSections} />
      <header className="manuscript-heading">
        <p className="eyebrow">Chapter {chapter.order || "0"}</p>
        <ReaderLinkableHeading
          href={chapterHeadingHref}
          level={1}
          title={chapter.title}
        />
        <p>{formatReadingDurationForWords(chapter.wordCount)} read.</p>
      </header>
      {sections.map((section, index) => (
        <section
          key={section.sectionId}
          id={section.sectionId}
          className="chapter-reader-section"
          data-reader-section-id={section.sectionId}
        >
          <LegacySectionAnchors
            currentSectionId={section.sectionId}
            legacySectionIds={section.legacySectionIds}
          />
          {showSectionHeading(section, chapter, index) && (
            <ReaderLinkableHeading
              href={sectionHeadingHref(
                section.readerHref,
                section.sectionId,
              )}
              level={2}
              title={section.title}
            />
          )}
          <SectionRevisionNotice section={toProgressSection(section)} />
          <MarkdownBody
            markdown={section.body}
            paragraphs={section.paragraphs}
            anchorPrefix={`${section.sectionId}-`}
          />
        </section>
      ))}
      <ReaderEngagementIsland sections={progressSections} />
      <ManuscriptNavigation
        previous={navigation.previous}
        parent={navigation.parent}
        next={navigation.next}
      />
    </article>
  );
}
