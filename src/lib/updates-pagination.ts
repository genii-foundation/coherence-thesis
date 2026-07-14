import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import checkedUpdatesSnapshotJson from "../../publishing/updates/snapshot.json";
import {
  buildUpdateDays,
  parseUpdatesSnapshot,
  type UpdateDay,
} from "@/lib/updates";

export type UpdatesMode = "all" | "literary";

export const updatesPageSize = 5;
const updatesSnapshotJson =
  process.env.COHERENCE_UPDATES_SOURCE === "generated"
    ? (JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "generated/updates/snapshot.json"),
          "utf8",
        ),
      ) as unknown)
    : checkedUpdatesSnapshotJson;
export const updatesSnapshot = parseUpdatesSnapshot(updatesSnapshotJson);
export const allUpdateDays = buildUpdateDays(updatesSnapshot);
export const literaryUpdateDays = buildUpdateDays({
  ...updatesSnapshot,
  commits: updatesSnapshot.commits.filter((commit) => commit.isLiterary),
});

export function getUpdateDays(mode: UpdatesMode = "all"): UpdateDay[] {
  return mode === "literary" ? literaryUpdateDays : allUpdateDays;
}

export function getUpdatesSummary(mode: UpdatesMode = "all"): {
  totalCommitCount: number;
  totalDayCount: number;
} {
  const days = getUpdateDays(mode);
  return {
    totalCommitCount: days.reduce(
      (commitCount, day) => commitCount + day.entries.length,
      0,
    ),
    totalDayCount: days.length,
  };
}

export function getUpdatesTotalPages(mode: UpdatesMode = "all"): number {
  return Math.max(1, Math.ceil(getUpdateDays(mode).length / updatesPageSize));
}

export function getUpdatesPageHref(
  page: number,
  mode: UpdatesMode = "all",
): string {
  const root = mode === "literary" ? "/updates/literary" : "/updates";
  return page <= 1
    ? root + "/"
    : root + "/" + page.toLocaleString("en-US", { useGrouping: false }) + "/";
}

export function parseUpdatesPage(
  value: string | undefined,
  mode: UpdatesMode = "all",
): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const page = Number.parseInt(value, 10);
  if (page < 1 || page > getUpdatesTotalPages(mode)) return null;
  return page;
}

export function getUpdatesPageSlice(
  page: number,
  mode: UpdatesMode = "all",
): UpdateDay[] {
  const start = (page - 1) * updatesPageSize;
  return getUpdateDays(mode).slice(start, start + updatesPageSize);
}

export function getUpdatesPaginationStaticParams(
  mode: UpdatesMode = "all",
): Array<{ page: string }> {
  return Array.from(
    { length: Math.max(0, getUpdatesTotalPages(mode) - 1) },
    (_, index) => ({
      page: (index + 2).toLocaleString("en-US", { useGrouping: false }),
    }),
  );
}

export function buildUpdatesMetadata(
  page: number,
  mode: UpdatesMode = "all",
): Metadata {
  const totalPages = getUpdatesTotalPages(mode);
  const pageSuffix =
    page > 1
      ? ", page " + page.toLocaleString() + " of " + totalPages.toLocaleString()
      : "";
  const sectionTitle = mode === "literary" ? "Literary updates" : "Updates";
  const title =
    page > 1 ? sectionTitle + ", page " + page.toLocaleString() : sectionTitle;
  const description =
    (mode === "literary"
      ? "Every manuscript change to The Coherence Thesis"
      : "Every commit to The Coherence Thesis and its reader") +
    ", compiled from the public repository" +
    pageSuffix +
    ".";
  const canonical = getUpdatesPageHref(page, mode);

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
