"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  useReaderProgress,
} from "@/lib/reader-progress-store";
import { revisedSectionHref, updatedSinceRead } from "@/lib/reader-state";

export function SectionRevisionNotice({ section }: { section: ProgressSection }) {
  // Subscribing to the shared store means the notice reacts when the reader
  // marks the section read from the toolbar, instead of showing a stale
  // "Revised since you read this" until a full reload.
  const progress = useReaderProgress();

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
