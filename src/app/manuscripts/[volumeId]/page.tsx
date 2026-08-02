import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { AstrologyIcon } from "@/components/AstrologyIcon";
import { BookmarkMarkerIsland } from "@/components/BookmarkMarkerIsland";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import { UpdatedMarkerIsland } from "@/components/UpdatedMarkerIsland";
import {
  catalog,
  sectionsForChapter,
  sectionsForPart,
  toProgressSection,
  volumeNavigation,
  volumeByRouteSegment,
} from "@/lib/manuscript-data";
import {
  displayPartCountLabel,
  displayPartKicker,
  displayPartTitle,
  isSyntheticFrontMatterPart,
} from "@/lib/manuscript-labels";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export const dynamicParams = false;

export function generateStaticParams() {
  const params = new Map<string, { volumeId: string }>();
  for (const volume of catalog.volumes) {
    const canonical = volume.href.split("/").filter(Boolean)[1] ?? volume.volumeId;
    params.set(canonical, { volumeId: canonical });
    params.set(volume.volumeId, { volumeId: volume.volumeId });
  }
  return [...params.values()];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ volumeId: string }>;
}): Promise<Metadata> {
  const { volumeId } = await params;
  const volume = volumeByRouteSegment(volumeId);
  return {
    title: volume?.title ?? "Manuscript",
    description: volume
      ? `${volume.title}, part of The Coherence Thesis.`
      : "The Coherence Thesis manuscript.",
    alternates: volume ? { canonical: volume.href } : undefined,
  };
}

export default async function VolumePage({
  params,
}: {
  params: Promise<{ volumeId: string }>;
}) {
  const { volumeId } = await params;
  const volume = volumeByRouteSegment(volumeId);
  if (!volume) notFound();
  if (`/manuscripts/${volumeId}/` !== volume.href) redirect(volume.href);
  const navigation = volumeNavigation(volume.volumeId);
  if (!navigation) notFound();
  const topLevelChapters =
    volume.parts.find(isSyntheticFrontMatterPart)?.chapters ?? [];
  const authoredParts = volume.parts.filter(
    (part) => !isSyntheticFrontMatterPart(part),
  );

  return (
    <div className="page-frame reader-layout">
      <div className="reader-main">
        <LegacyFragmentRedirectIsland />
        <section
          className="volume-hero volume-heading"
          aria-labelledby="volume-title"
        >
          <Image
            src={volume.coverImage}
            alt={volume.coverAlt}
            width={512}
            height={768}
            priority
          />
          <div className="volume-hero-copy">
            <p className="eyebrow">Volume {volume.numberLabel}</p>
            <h1 id="volume-title">{volume.title}</h1>
            <p>{volume.subtitle}</p>
            <div className="volume-meta-tags" aria-label="Volume details">
              <AstrologyIcon
                planet={volume.planet}
                size="compact"
                className="volume-meta-astrology-icon"
              />
              <span>{displayPartCountLabel(volume)}</span>
              <span>{volume.sectionIds.length.toLocaleString()} sections</span>
              <span>{formatReadingDurationForWords(volume.wordCount)}</span>
            </div>
          </div>
        </section>
        <section
          className="chapter-list-section"
          aria-labelledby="volume-contents-heading"
        >
          <h2 id="volume-contents-heading">Contents</h2>
          <div className="part-list">
            {topLevelChapters.map((chapter) => {
              const chapterSections = sectionsForChapter(
                volume.volumeId,
                "front-matter",
                chapter.chapterId,
              );
              const progressSections = chapterSections.map(toProgressSection);
              const onlySection = chapterSections[0];
              const href =
                chapterSections.length === 1 && onlySection
                  ? onlySection.readerHref
                  : chapter.href;

              return (
                <Link key={chapter.chapterId} href={href} className="chapter-card">
                  <span className="card-kicker">
                    <BookOpen aria-hidden="true" size={21} />
                    Chapter
                    <span className="content-status-row">
                      <BookmarkMarkerIsland sections={progressSections} />
                      <UpdatedMarkerIsland sections={progressSections} />
                      <ReadCheckmarkIsland sections={progressSections} />
                    </span>
                  </span>
                  <strong>{chapter.title}</strong>
                  <small>{formatReadingDurationForWords(chapter.wordCount)}</small>
                </Link>
              );
            })}
            {authoredParts.map((part) => {
              const partSections = sectionsForPart(
                volume.volumeId,
                part.partId,
              ).map(toProgressSection);

              return (
                <Link key={part.partId} href={part.href} className="part-card">
                  <span className="card-kicker">
                    <BookOpen aria-hidden="true" size={21} />
                    {displayPartKicker(part)}
                    <span className="content-status-row">
                      <UpdatedMarkerIsland sections={partSections} />
                      <ReadCheckmarkIsland sections={partSections} />
                    </span>
                  </span>
                  <strong>{displayPartTitle(part, volume)}</strong>
                  <small>{formatReadingDurationForWords(part.wordCount)}</small>
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
    </div>
  );
}
