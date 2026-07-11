import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { GitHubMark } from "@/components/GitHubMark";
import { MarkdownBody } from "@/components/MarkdownBody";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { LegacySectionAnchors } from "@/components/LegacySectionAnchors";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { ReaderAudioWordInteractionIsland } from "@/components/ReaderAudioWordInteractionIsland";
import { ReaderEngagementIsland } from "@/components/ReaderEngagementIsland";
import { ReaderLinkableHeading } from "@/components/ReaderLinkableHeading";
import { SectionRevisionNotice } from "@/components/SectionRevisionNotice";
import { SectionAliasRedirectIsland } from "@/components/SectionAliasRedirectIsland";
import {
  sectionNavigation,
  toProgressSection,
  type PageNavigation,
  type Section,
  type SectionAlias,
} from "@/lib/manuscript-data";
import { formatReadingDuration } from "@/lib/reading-time";
import { sectionHeadingHref } from "@/lib/reader-heading-links";

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
    <article
      id={section.sectionId}
      className="reader-main"
      data-reader-section-id={section.sectionId}
    >
      {alias ? (
        <SectionAliasRedirectIsland
          readerHref={section.readerHref}
          section={toProgressSection(section)}
        />
      ) : (
        <LegacyFragmentRedirectIsland sections={[toProgressSection(section)]} />
      )}
      <LegacySectionAnchors
        currentSectionId={section.sectionId}
        legacySectionIds={section.legacySectionIds}
      />
      <header className="manuscript-heading">
        <ReaderLinkableHeading
          href={sectionHeadingHref(section.readerHref, section.sectionId)}
          level={1}
          title={section.title}
        />
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
        anchorPrefix={alias ? `${section.sectionId}-` : ""}
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
