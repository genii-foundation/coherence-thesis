import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
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

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 16 16"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.08-2.7-1.08-.37-.92-.9-1.17-.9-1.17-.72-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.7 7.7 0 0 1 8 3.89c.68 0 1.36.09 2 .27 1.52-1.03 2.2-.82 2.2-.82.43 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.74-3.65 3.94.29.25.54.73.54 1.48v2.18c0 .21.14.46.55.38A8 8 0 0 0 8 0Z"
      />
    </svg>
  );
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
