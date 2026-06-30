import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import { SectionReader } from "@/components/SectionReader";
import { UpdatedMarkerIsland } from "@/components/UpdatedMarkerIsland";
import {
  chapterByHref,
  chapterNavigation,
  manuscriptHrefFromRoute,
  manuscriptPathParams,
  partByHref,
  partNavigation,
  sectionByHrefOrAlias,
  sectionsForChapter,
  sectionsForPart,
  toProgressSection,
  type ChapterRouteMatch,
  type PartRouteMatch,
} from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export const dynamicParams = false;

type RouteParams = {
  volumeId: string;
  route: string[];
};

export function generateStaticParams() {
  return manuscriptPathParams();
}

function routeHref(params: RouteParams): string {
  return manuscriptHrefFromRoute(params.volumeId, params.route);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const href = routeHref(resolvedParams);
  const section = sectionByHrefOrAlias(href)?.section;
  if (section) {
    return {
      title: section.title,
      description: section.text.slice(0, 155),
      alternates: { canonical: section.href },
    };
  }

  const chapter = chapterByHref(href)?.chapter;
  if (chapter) {
    return {
      title: chapter.title,
      description: `${chapter.title} in The Coherence Thesis.`,
    };
  }

  const part = partByHref(href)?.part;
  return {
    title: part?.title ?? "Manuscript",
    description: part ? `${part.title} in The Coherence Thesis.` : undefined,
  };
}

function PartPage({ match }: { match: PartRouteMatch }) {
  const { volume, part } = match;
  const navigation = partNavigation(volume.volumeId, part.partId);
  if (!navigation) notFound();
  const sections = sectionsForPart(volume.volumeId, part.partId);
  const showSections = part.chapters.length === 1 && part.chapters[0]?.href === part.href;
  const count = showSections ? sections.length : part.chapters.length;
  const label = showSections
    ? `section${count === 1 ? "" : "s"}`
    : `chapter${count === 1 ? "" : "s"}`;

  return (
    <div className="page-frame">
      <header className="page-heading">
        <p className="eyebrow">Part {part.order || "0"}</p>
        <h1>{part.title}</h1>
        <p>
          {formatReadingDurationForWords(part.wordCount)} across {count} {label}.
        </p>
      </header>
      <section
        className="chapter-list-section"
        aria-labelledby="part-sections-heading"
      >
        <h2 id="part-sections-heading">Sections</h2>
        <div className="chapter-list">
          {showSections
            ? sections.map((section) => (
                <Link
                  key={section.sectionId}
                  href={section.href}
                  className="chapter-card"
                >
                  <span className="card-kicker">
                    {String(section.sectionOrder).padStart(2, "0")}
                    <span className="content-status-row">
                      <UpdatedMarkerIsland sections={[toProgressSection(section)]} />
                      <ReadCheckmarkIsland sections={[toProgressSection(section)]} />
                    </span>
                  </span>
                  <strong>{section.title}</strong>
                  <small>{formatReadingDurationForWords(section.wordCount)}</small>
                </Link>
              ))
            : part.chapters.map((chapter) => {
                const chapterSections = sections.filter(
                  (section) => section.chapterId === chapter.chapterId,
                );
                const onlySection = chapterSections[0];
                const href =
                  chapterSections.length === 1 && onlySection
                    ? onlySection.href
                    : chapter.href;
                const progressSections = chapterSections.map(toProgressSection);

                return (
                  <Link
                    key={chapter.chapterId}
                    href={href}
                    className="chapter-card"
                  >
                    <span className="card-kicker">
                      {String(chapter.order).padStart(2, "0")}
                      <span className="content-status-row">
                        <UpdatedMarkerIsland sections={progressSections} />
                        <ReadCheckmarkIsland sections={progressSections} />
                      </span>
                    </span>
                    <strong>{chapter.title}</strong>
                    <small>{formatReadingDurationForWords(chapter.wordCount)}</small>
                  </Link>
                );
              })}
        </div>
      </section>
      <ManuscriptNavigation
        previous={navigation.previous}
        parent={navigation.parent}
        next={navigation.next}
      />
    </div>
  );
}

function ChapterPage({ match }: { match: ChapterRouteMatch }) {
  const { volume, part, chapter } = match;
  const navigation = chapterNavigation(volume.volumeId, part.partId, chapter.chapterId);
  if (!navigation) notFound();
  const sections = sectionsForChapter(volume.volumeId, part.partId, chapter.chapterId);
  const onlySection = sections[0];
  if (sections.length === 1 && onlySection) {
    return (
      <div className="page-frame reader-layout">
        <SectionReader section={onlySection} navigation={navigation} />
      </div>
    );
  }

  return (
    <div className="page-frame reader-layout">
      <article className="reader-main">
        <header className="page-heading">
          <p className="eyebrow">Chapter {chapter.order || "0"}</p>
          <h1>{chapter.title}</h1>
          <p>
            {formatReadingDurationForWords(chapter.wordCount)} across{" "}
            {sections.length} sections.
          </p>
        </header>
        <div className="section-index">
          {sections.map((section) => (
            <Link key={section.sectionId} href={section.href}>
              <span>{section.title}</span>
              <span className="content-status-row">
                <UpdatedMarkerIsland sections={[toProgressSection(section)]} />
                <ReadCheckmarkIsland sections={[toProgressSection(section)]} />
              </span>
            </Link>
          ))}
        </div>
        <ManuscriptNavigation
          previous={navigation.previous}
          parent={navigation.parent}
          next={navigation.next}
        />
      </article>
    </div>
  );
}

export default async function ManuscriptRoutePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const resolvedParams = await params;
  const href = routeHref(resolvedParams);
  const section = sectionByHrefOrAlias(href);
  if (section) {
    return (
      <div className="page-frame reader-layout">
        <SectionReader section={section.section} alias={section.alias} />
      </div>
    );
  }

  const chapter = chapterByHref(href);
  if (chapter) return <ChapterPage match={chapter} />;

  const part = partByHref(href);
  if (part) return <PartPage match={part} />;

  notFound();
}
