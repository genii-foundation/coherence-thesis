import type { Metadata } from "next";
import { UpdatesPageContent } from "@/components/UpdatesPageContent";
import {
  allUpdateDays,
  buildUpdatesMetadata,
  getUpdatesPageSlice,
  updatesSnapshot,
} from "@/lib/updates-pagination";

export const metadata: Metadata = buildUpdatesMetadata(1);

export default function UpdatesPage() {
  return (
    <UpdatesPageContent
      currentPage={1}
      days={getUpdatesPageSlice(1)}
      totalCommitCount={updatesSnapshot.commits.length}
      totalDayCount={allUpdateDays.length}
    />
  );
}
