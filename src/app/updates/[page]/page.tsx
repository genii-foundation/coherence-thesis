import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpdatesPageContent } from "@/components/UpdatesPageContent";
import {
  allUpdateDays,
  buildUpdatesMetadata,
  getUpdatesPageSlice,
  getUpdatesPaginationStaticParams,
  parseUpdatesPage,
  updatesSnapshot,
} from "@/lib/updates-pagination";

export const dynamicParams = false;

export function generateStaticParams() {
  return getUpdatesPaginationStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const page = parseUpdatesPage((await params).page);
  if (!page || page === 1) notFound();
  return buildUpdatesMetadata(page);
}

export default async function UpdatesPaginationPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const page = parseUpdatesPage((await params).page);
  if (!page || page === 1) notFound();

  return (
    <UpdatesPageContent
      currentPage={page}
      days={getUpdatesPageSlice(page)}
      totalCommitCount={updatesSnapshot.commits.length}
      totalDayCount={allUpdateDays.length}
    />
  );
}
