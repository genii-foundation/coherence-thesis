"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { createEngagementEvent } from "@/lib/reader-engagement";
import { appendStoredEvent, readStoredProgress } from "@/lib/reader-progress-store";
import {
  emptyProgress,
  revisedSectionHref,
  updatedSinceRead,
  type ReaderProgressState,
} from "@/lib/reader-state";

export function SectionRevisionNotice({ section }: { section: ProgressSection }) {
  const [progress, setProgress] = useState<ReaderProgressState>(() => emptyProgress());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProgress(readStoredProgress());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const isUpdated = updatedSinceRead(progress, section);

  useEffect(() => {
    if (!isUpdated) return;
    appendStoredEvent(
      createEngagementEvent("updated_notice_shown", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: section.href,
      }),
    );
  }, [isUpdated, section.contentHash, section.href, section.sectionId]);

  if (!isUpdated) return null;
  const revisedHref = revisedSectionHref(progress, section);

  function trackUpdatedNoticeClick(): void {
    appendStoredEvent(
      createEngagementEvent("updated_notice_clicked", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: revisedHref,
      }),
    );
  }

  return (
    <aside className="revision-notice" aria-label="Updated section notice">
      <RotateCcw aria-hidden="true" size={17} />
      <span>Revised since you read this.</span>
      <a href={revisedHref} onClick={trackUpdatedNoticeClick}>
        Jump to the first changed passage
      </a>
    </aside>
  );
}
