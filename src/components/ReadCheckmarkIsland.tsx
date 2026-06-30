"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { readStoredProgress } from "@/lib/reader-progress-store";
import {
  emptyProgress,
  readerProgressUpdatedEvent,
  type ReaderProgressState,
} from "@/lib/reader-state";

function sectionsAreRead(
  progress: ReaderProgressState,
  sections: ProgressSection[],
): boolean {
  return (
    sections.length > 0 &&
    sections.every(
      (section) =>
        progress.sections[section.sectionId]?.contentHash === section.contentHash,
    )
  );
}

export function ReadCheckmarkIsland({
  sections,
  className,
}: {
  sections: ProgressSection[];
  className?: string;
}) {
  const [progress, setProgress] = useState<ReaderProgressState>(() => emptyProgress());

  useEffect(() => {
    const updateProgress = () => setProgress(readStoredProgress());
    const hydrationTimer = window.setTimeout(updateProgress, 0);

    window.addEventListener("storage", updateProgress);
    window.addEventListener(readerProgressUpdatedEvent, updateProgress);

    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", updateProgress);
      window.removeEventListener(readerProgressUpdatedEvent, updateProgress);
    };
  }, []);

  const isRead = useMemo(() => sectionsAreRead(progress, sections), [progress, sections]);

  if (!isRead) return null;

  return (
    <span
      className={["read-checkmark", className].filter(Boolean).join(" ")}
      aria-label="Read"
      data-read-checkmark="true"
      title="Read"
    >
      <Check aria-hidden="true" size={14} strokeWidth={2.4} />
    </span>
  );
}
