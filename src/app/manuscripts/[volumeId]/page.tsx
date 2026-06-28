import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { ReadCheckmarkIsland } from "@/components/ReadCheckmarkIsland";
import {
  catalog,
  sectionsForPart,
  toProgressSection,
  volumeById,
} from "@/lib/manuscript-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return catalog.volumes.map((volume) => ({ volumeId: volume.volumeId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ volumeId: string }>;
}): Promise<Metadata> {
  const { volumeId } = await params;
  const volume = volumeById(volumeId);
  return {
    title: volume?.title ?? "Manuscript",
    description: volume
      ? `${volume.title}, part of The Coherence Thesis.`
      : "The Coherence Thesis manuscript.",
  };
}

export default async function VolumePage({
  params,
}: {
  params: Promise<{ volumeId: string }>;
}) {
  const { volumeId } = await params;
  const volume = volumeById(volumeId);
  if (!volume) notFound();

  return (
    <div className="page-frame">
      <header className="page-heading volume-heading">
        <p className="eyebrow">Manuscript</p>
        <h1>{volume.title}</h1>
        <p>
          {volume.parts.length} parts, {volume.wordCount.toLocaleString()} words.
        </p>
      </header>
      <section className="part-list">
        {volume.parts.map((part) => {
          const partSections = sectionsForPart(volume.volumeId, part.partId).map(
            toProgressSection,
          );

          return (
            <Link key={part.partId} href={part.href} className="part-card">
              <span className="card-kicker">
                <BookOpen aria-hidden="true" size={21} />
                Part {part.order || "0"}
                <ReadCheckmarkIsland sections={partSections} />
              </span>
              <strong>{part.title}</strong>
              <small>{part.wordCount.toLocaleString()} words</small>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
