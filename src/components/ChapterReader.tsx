import { MarkdownBody } from "@/components/MarkdownBody";
import { LegacySectionAnchors } from "@/components/LegacySectionAnchors";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { ReaderEngagementIsland } from "@/components/ReaderEngagementIsland";
import { SectionRevisionNotice } from "@/components/SectionRevisionNotice";
import {
  toProgressSection,
  type Chapter,
  type PageNavigation,
  type Section,
} from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

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

  return (
    <article className="reader-main">
      <LegacyFragmentRedirectIsland sections={progressSections} />
      <header className="manuscript-heading">
        <p className="eyebrow">Chapter {chapter.order || "0"}</p>
        <h1>{chapter.title}</h1>
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
          {showSectionHeading(section, chapter, index) && <h2>{section.title}</h2>}
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
