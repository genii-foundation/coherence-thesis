import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ManuscriptNavigation } from "@/components/ManuscriptNavigation";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import { UpdatedMarkerIsland } from "@/components/UpdatedMarkerIsland";
import {
  catalog,
  partById,
  partNavigation,
  sectionsForPart,
  toProgressSection,
} from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalog.volumes.flatMap((volume) =>
    volume.parts.map((part) => ({
      volumeId: volume.volumeId,
      partId: part.partId,
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ volumeId: string; partId: string }>;
}): Promise<Metadata> {
  const { volumeId, partId } = await params;
  const part = partById(volumeId, partId);
  return {
    title: part?.title ?? "Part",
    description: part ? `${part.title} in The Coherence Thesis.` : undefined,
  };
}

export default async function PartPage({
  params,
}: {
  params: Promise<{ volumeId: string; partId: string }>;
}) {
  const { volumeId, partId } = await params;
  const part = partById(volumeId, partId);
  if (!part) notFound();
  const navigation = partNavigation(volumeId, partId);
  if (!navigation) notFound();
  const sections = sectionsForPart(volumeId, partId);

  return (
    <div className="page-frame">
      <header className="page-heading">
        <p className="eyebrow">Part {part.order || "0"}</p>
        <h1>{part.title}</h1>
        <p>
          {formatReadingDurationForWords(part.wordCount)} across{" "}
          {part.chapters.length} chapters.
        </p>
      </header>
      <section
        className="chapter-list-section"
        aria-labelledby="part-sections-heading"
      >
        <h2 id="part-sections-heading">Sections</h2>
        <div className="chapter-list">
          {part.chapters.map((chapter) => {
            const chapterSections = sections
              .filter((section) => section.chapterId === chapter.chapterId);
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
