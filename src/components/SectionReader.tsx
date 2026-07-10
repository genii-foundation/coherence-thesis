import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { GitHubMark } from "@/components/GitHubMark";
import { MarkdownBody } from "@/components/MarkdownBody";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { ReaderAudioWordInteractionIsland } from "@/components/ReaderAudioWordInteractionIsland";
import { ReaderEngagementIsland } from "@/components/ReaderEngagementIsland";
import { SectionRevisionNotice } from "@/components/SectionRevisionNotice";
import {
  sectionNavigation,
  toProgressSection,
  type PageNavigation,
  type Section,
  type SectionAlias,
} from "@/lib/manuscript-data";
import { formatReadingDuration } from "@/lib/reading-time";

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
    <article className="reader-main" data-reader-section-id={section.sectionId}>
      <header className="manuscript-heading">
        <h1>{section.title}</h1>
        <p>{formatReadingDuration(section.readingMinutes)} read.</p>
        <p className="section-version-meta">
          <span>Last Updated:</span>
          {section.versionUrl ? (
            <a
              href={section.versionUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${formatVersionDate(section.versionDate)}, open version on GitHub`}
            >
              <span>{formatVersionDate(section.versionDate)}</span>
              <span className="section-version-link-icons" aria-hidden="true">
                <GitHubMark className="section-version-github-icon" />
                <ExternalLink size={14} />
              </span>
            </a>
          ) : (
            <span>{formatVersionDate(section.versionDate)}</span>
          )}
        </p>
      </header>
      {alias && (
        <aside className="revision-notice" aria-label="Section alias notice">
          <span>This older link now opens the current section.</span>
          <a href={section.readerHref}>Use the canonical link</a>
        </aside>
      )}
      <SectionRevisionNotice section={toProgressSection(section)} />
      <MarkdownBody
        markdown={section.body}
        paragraphs={section.paragraphs}
        sectionId={section.sectionId}
      />
      <ReaderAudioWordInteractionIsland sectionId={section.sectionId} />
      <ReaderEngagementIsland sections={[toProgressSection(section)]} />
      <ManuscriptNavigation
        previous={resolvedNavigation.previous}
        parent={resolvedNavigation.parent}
        next={resolvedNavigation.next}
      />
    </article>
  );
}
