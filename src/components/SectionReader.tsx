import { notFound } from "next/navigation";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { SectionRevisionNotice } from "@/components/SectionRevisionNotice";
import {
  sectionNavigation,
  toProgressSection,
  type PageNavigation,
  type Section,
  type SectionAlias,
} from "@/lib/manuscript-data";

function formatVersionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unpublished";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function SectionReader({
  section,
  alias,
  navigation,
}: {
  section: Section;
  alias?: SectionAlias;
  navigation?: PageNavigation;
}) {
  const resolvedNavigation = navigation ?? sectionNavigation(section);

  if (!resolvedNavigation) notFound();

  return (
    <article className="reader-main">
      <header className="manuscript-heading">
        <h1>{section.title}</h1>
        <p>
          {section.wordCount.toLocaleString()} words, about {section.readingMinutes} minute
          {section.readingMinutes === 1 ? "" : "s"}.
        </p>
        <p className="section-version-meta">
          <span>Version {section.versionHash}</span>
          {section.versionUrl ? (
            <a href={section.versionUrl}>Codified {formatVersionDate(section.versionDate)}</a>
          ) : (
            <span>Codified {formatVersionDate(section.versionDate)}</span>
          )}
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
      <ManuscriptNavigation
        previous={resolvedNavigation.previous}
        parent={resolvedNavigation.parent}
        next={resolvedNavigation.next}
      />
    </article>
  );
}
