import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpdatesPageContent } from "@/components/UpdatesPageContent";
import {
  buildUpdatesMetadata,
  getUpdatesPageSlice,
  getUpdatesPaginationStaticParams,
  getUpdatesSummary,
  parseUpdatesPage,
} from "@/lib/updates-pagination";

export const dynamicParams = false;

export function generateStaticParams() {
  return getUpdatesPaginationStaticParams("literary");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const page = parseUpdatesPage((await params).page, "literary");
  if (!page || page === 1) notFound();
  return buildUpdatesMetadata(page, "literary");
}

export default async function LiteraryUpdatesPaginationPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const page = parseUpdatesPage((await params).page, "literary");
  if (!page || page === 1) notFound();
  const summary = getUpdatesSummary("literary");

  return (
    <UpdatesPageContent
      currentPage={page}
      days={getUpdatesPageSlice(page, "literary")}
      mode="literary"
      totalCommitCount={summary.totalCommitCount}
      totalDayCount={summary.totalDayCount}
    />
  );
}
