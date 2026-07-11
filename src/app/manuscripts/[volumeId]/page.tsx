import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { AstrologyIcon } from "@/components/AstrologyIcon";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { LegacyFragmentRedirectIsland } from "@/components/LegacyFragmentRedirectIsland";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import { SectionCardGrid } from "@/components/SectionCardGrid";
import { UpdatedMarkerIsland } from "@/components/UpdatedMarkerIsland";
import {
  catalog,
  sectionsForPart,
  toProgressSection,
  volumeNavigation,
  volumeByRouteSegment,
} from "@/lib/manuscript-data";
import {
  authoredPartCount,
  displayPartCountLabel,
  displayPartKicker,
  displayPartTitle,
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
  const showSections = authoredPartCount(volume) === 0;
  const sections = showSections
    ? catalog.sections.filter((section) => section.volumeId === volume.volumeId)
    : [];

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
        {showSections ? (
          <section
            className="chapter-list-section"
            aria-labelledby="volume-sections-heading"
          >
            <h2 id="volume-sections-heading">Sections</h2>
            <SectionCardGrid sections={sections} />
          </section>
        ) : (
          <section className="part-list">
            {volume.parts.map((part) => {
              const partSections = sectionsForPart(
                volume.volumeId,
                part.partId,
              ).map(toProgressSection);

              return (
                <Link key={part.partId} href={part.href} className="part-card">
                  <span className="card-kicker">
                    <BookOpen aria-hidden="true" size={21} />
                    {displayPartKicker(part, volume)}
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
          </section>
        )}
        <ManuscriptNavigation
          previous={navigation.previous}
          parent={navigation.parent}
          next={navigation.next}
        />
      </div>
    </div>
  );
}
