import { MarkdownBody } from "@/components/MarkdownBody";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { SectionRevisionNotice } from "@/components/SectionRevisionNotice";
import {
  sectionById,
  toProgressSection,
  type Section,
  type SectionAlias,
} from "@/lib/manuscript-data";

export function SectionReader({
  section,
  alias,
}: {
  section: Section;
  alias?: SectionAlias;
}) {
  const previous = section.previousSectionId ? sectionById(section.previousSectionId) : null;
  const next = section.nextSectionId ? sectionById(section.nextSectionId) : null;

  return (
    <article className="reader-main">
      <header className="manuscript-heading">
        <h1>{section.title}</h1>
        <p>
          {section.wordCount.toLocaleString()} words, about {section.readingMinutes} minute
          {section.readingMinutes === 1 ? "" : "s"}.
        </p>
      </header>
      {alias && (
        <aside className="revision-notice" aria-label="Section alias notice">
          <span>This older link now opens the current section.</span>
          <a href={section.href}>Use the canonical link</a>
        </aside>
      )}
      <SectionRevisionNotice section={toProgressSection(section)} />
      <MarkdownBody markdown={section.body} paragraphs={section.paragraphs} />
      <ManuscriptNavigation previous={previous} next={next} />
    </article>
  );
}
