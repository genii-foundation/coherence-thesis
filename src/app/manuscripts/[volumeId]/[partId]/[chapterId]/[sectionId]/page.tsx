import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionReader } from "@/components/SectionReader";
import { routeParams, sectionByRouteOrAlias } from "@/lib/manuscript-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return routeParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{
    volumeId: string;
    partId: string;
    chapterId: string;
    sectionId: string;
  }>;
}): Promise<Metadata> {
  const { volumeId, partId, chapterId, sectionId } = await params;
  const resolved = sectionByRouteOrAlias(volumeId, partId, chapterId, sectionId);
  const section = resolved?.section;
  return {
    title: section?.title ?? "Section",
    description: section?.text.slice(0, 155),
    alternates: section ? { canonical: section.href } : undefined,
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{
    volumeId: string;
    partId: string;
    chapterId: string;
    sectionId: string;
  }>;
}) {
  const { volumeId, partId, chapterId, sectionId } = await params;
  const resolved = sectionByRouteOrAlias(volumeId, partId, chapterId, sectionId);
  if (!resolved) notFound();
  const { section, alias } = resolved;

  return (
    <div className="page-frame reader-layout">
      <SectionReader section={section} alias={alias} />
    </div>
  );
}
