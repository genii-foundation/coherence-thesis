import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChapterReader } from "@/components/ChapterReader";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import { SectionCardGrid } from "@/components/SectionCardGrid";
import { SectionReader } from "@/components/SectionReader";
import { UpdatedMarkerIsland } from "@/components/UpdatedMarkerIsland";
import {
  chapterByHref,
  chapterNavigation,
  manuscriptHrefFromRoute,
  manuscriptPathParams,
  partByHref,
  partNavigation,
  routeAliasByHref,
  sectionByHrefOrAlias,
  sectionsForChapter,
  sectionsForPart,
  toProgressSection,
  type ChapterRouteMatch,
  type PartRouteMatch,
} from "@/lib/manuscript-data";
import {
  displayPartKicker,
  displayPartTitle,
} from "@/lib/manuscript-labels";
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
  const requestedHref = routeHref(resolvedParams);
  const href = routeAliasByHref(requestedHref)?.targetHref ?? requestedHref;
  const section = sectionByHrefOrAlias(href)?.section;
  if (section) {
    return {
      title: section.title,
      description: section.text.slice(0, 155),
      alternates: { canonical: section.readerHref },
    };
  }

  const chapter = chapterByHref(href)?.chapter;
  if (chapter) {
    return {
      title: chapter.title,
      description: `${chapter.title} in The Coherence Thesis.`,
      alternates: { canonical: chapter.href },
    };
  }

  const partMatch = partByHref(href);
  const part = partMatch?.part;
  return {
    title: partMatch ? displayPartTitle(partMatch.part, partMatch.volume) : "Manuscript",
    description: partMatch
      ? `${displayPartTitle(partMatch.part, partMatch.volume)} in The Coherence Thesis.`
      : undefined,
    alternates: part ? { canonical: part.href } : undefined,
  };
}

function PartPage({ match }: { match: PartRouteMatch }) {
  const { volume, part } = match;
  const navigation = partNavigation(volume.volumeId, part.partId);
  if (!navigation) notFound();
  const sections = sectionsForPart(volume.volumeId, part.partId);
  const progressSections = sections.map(toProgressSection);
  const showSections =
    part.chapters.length === 1 && part.chapters[0]?.href === part.href;
  const count = showSections ? sections.length : part.chapters.length;
  const label = showSections
    ? `section${count === 1 ? "" : "s"}`
    : `chapter${count === 1 ? "" : "s"}`;
  const partTitle = displayPartTitle(part, volume);
  const partKicker = displayPartKicker(part, volume);
  const showPartKicker = partKicker !== partTitle;

  return (
    <div className="page-frame reader-layout">
      <article className="reader-main">
        <LegacyFragmentRedirectIsland sections={progressSections} />
        <header className="page-heading">
          {showPartKicker && <p className="eyebrow">{partKicker}</p>}
          <h1>{partTitle}</h1>
          <p>
            {formatReadingDurationForWords(part.wordCount)} across {count}{" "}
            {label}.
          </p>
        </header>
        <section
          className="chapter-list-section"
          aria-labelledby="part-sections-heading"
        >
          <h2 id="part-sections-heading">Sections</h2>
          {showSections ? (
            <SectionCardGrid sections={sections} />
          ) : (
            <div className="chapter-list">
              {part.chapters.map((chapter) => {
                const chapterSections = sections.filter(
                  (section) => section.chapterId === chapter.chapterId,
                );
                const onlySection = chapterSections[0];
                const href =
                  chapterSections.length === 1 && onlySection
                    ? onlySection.href
                    : chapter.href;
                const progressSections =
                  chapterSections.map(toProgressSection);

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
                    <small>
                      {formatReadingDurationForWords(chapter.wordCount)}
                    </small>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        <ManuscriptNavigation
          previous={navigation.previous}
          parent={navigation.parent}
          next={navigation.next}
        />
      </article>
    </div>
  );
}

function ChapterPage({ match }: { match: ChapterRouteMatch }) {
  const { volume, part, chapter } = match;
  const navigation = chapterNavigation(
    volume.volumeId,
    part.partId,
    chapter.chapterId,
  );
  if (!navigation) notFound();
  const sections = sectionsForChapter(
    volume.volumeId,
    part.partId,
    chapter.chapterId,
  );
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
      <ChapterReader chapter={chapter} sections={sections} navigation={navigation} />
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
  const routeAlias = routeAliasByHref(href);
  if (routeAlias) redirect(routeAlias.targetHref);
  const section = sectionByHrefOrAlias(href);
  if (section) {
    if (!section.alias && section.section.readerHref !== href) {
      redirect(section.section.readerHref);
    }
    return (
      <div className="page-frame reader-layout">
        <SectionReader section={section.section} alias={section.alias} />
      </div>
    );
  }

  const chapter = chapterByHref(href);
  if (chapter) {
    if (chapter.chapter.href !== href) redirect(chapter.chapter.href);
    return <ChapterPage match={chapter} />;
  }

  const part = partByHref(href);
  if (part) {
    if (part.part.href !== href) redirect(part.part.href);
    return <PartPage match={part} />;
  }

  notFound();
}
