import type { Metadata } from "next";
import { UpdatesPageContent } from "@/components/UpdatesPageContent";
import {
  buildUpdatesMetadata,
  getUpdatesPageSlice,
  getUpdatesSummary,
} from "@/lib/updates-pagination";

export const metadata: Metadata = buildUpdatesMetadata(1, "literary");

export default function LiteraryUpdatesPage() {
  const summary = getUpdatesSummary("literary");

  return (
    <UpdatesPageContent
      currentPage={1}
      days={getUpdatesPageSlice(1, "literary")}
      mode="literary"
      totalCommitCount={summary.totalCommitCount}
      totalDayCount={summary.totalDayCount}
    />
  );
}
