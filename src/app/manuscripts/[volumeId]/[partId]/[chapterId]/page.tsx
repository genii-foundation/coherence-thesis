import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  chapterById,
  catalog,
  sectionsForChapter,
} from "@/lib/manuscript-data";

export const dynamicParams = false;

export function generateStaticParams() {
  const chapters = new Map<string, { volumeId: string; partId: string; chapterId: string }>();
  for (const section of catalog.sections) {
    chapters.set(`${section.volumeId}:${section.partId}:${section.chapterId}`, {
      volumeId: section.volumeId,
      partId: section.partId,
      chapterId: section.chapterId,
    });
  }
  return [...chapters.values()];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ volumeId: string; partId: string; chapterId: string }>;
}): Promise<Metadata> {
  const { volumeId, partId, chapterId } = await params;
  const chapter = chapterById(volumeId, partId, chapterId);
  return {
    title: chapter?.title ?? "Chapter",
    description: chapter ? `${chapter.title} in The Coherence Thesis.` : undefined,
  };
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ volumeId: string; partId: string; chapterId: string }>;
}) {
  const { volumeId, partId, chapterId } = await params;
  const chapter = chapterById(volumeId, partId, chapterId);
  if (!chapter) notFound();
  const sections = sectionsForChapter(volumeId, partId, chapterId);

  return (
    <div className="page-frame reader-layout">
      <article className="reader-main">
        <header className="page-heading">
          <p className="eyebrow">Chapter {chapter.order || "0"}</p>
          <h1>{chapter.title}</h1>
          <p>{chapter.wordCount.toLocaleString()} words across {sections.length} sections.</p>
        </header>
        <div className="section-index">
          {sections.map((section) => (
            <Link key={section.sectionId} href={section.href}>
              {section.title}
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
