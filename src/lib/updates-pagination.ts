import type { Metadata } from "next";
import updatesSnapshotJson from "@/generated/updates.json";
import {
  buildUpdateDays,
  parseUpdatesSnapshot,
  type UpdateDay,
} from "@/lib/updates";

export const updatesPageSize = 5;
export const updatesSnapshot = parseUpdatesSnapshot(updatesSnapshotJson);
export const allUpdateDays = buildUpdateDays(updatesSnapshot);

export function getUpdatesTotalPages(): number {
  return Math.max(1, Math.ceil(allUpdateDays.length / updatesPageSize));
}

export function getUpdatesPageHref(page: number): string {
  return page <= 1 ? "/updates/" : "/updates/" + page.toLocaleString("en-US", {
    useGrouping: false,
  }) + "/";
}

export function parseUpdatesPage(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const page = Number.parseInt(value, 10);
  if (page < 1 || page > getUpdatesTotalPages()) return null;
  return page;
}

export function getUpdatesPageSlice(page: number): UpdateDay[] {
  const start = (page - 1) * updatesPageSize;
  return allUpdateDays.slice(start, start + updatesPageSize);
}

export function getUpdatesPaginationStaticParams(): Array<{ page: string }> {
  return Array.from(
    { length: Math.max(0, getUpdatesTotalPages() - 1) },
    (_, index) => ({
      page: (index + 2).toLocaleString("en-US", { useGrouping: false }),
    }),
  );
}

export function buildUpdatesMetadata(page: number): Metadata {
  const totalPages = getUpdatesTotalPages();
  const pageSuffix =
    page > 1
      ? ", page " + page.toLocaleString() + " of " + totalPages.toLocaleString()
      : "";
  const title = page > 1 ? "Updates, page " + page.toLocaleString() : "Updates";
  const description =
    "Every commit to The Coherence Thesis and its reader, compiled from the public repository" +
    pageSuffix +
    ".";
  const canonical = getUpdatesPageHref(page);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
    },
  };
}
