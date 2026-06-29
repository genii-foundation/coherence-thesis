"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  emptyProgress,
  parseProgress,
  readerProgressStorageKey,
  readerProgressUpdatedEvent,
  updatedSinceRead,
  type ReaderProgressState,
} from "@/lib/reader-state";

function readStoredProgress(): ReaderProgressState {
  if (typeof window === "undefined") return emptyProgress();
  return parseProgress(window.localStorage.getItem(readerProgressStorageKey));
}

export function UpdatedMarkerIsland({
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

  const hasUpdatedSection = useMemo(
    () => sections.some((section) => updatedSinceRead(progress, section)),
    [progress, sections],
  );

  if (!hasUpdatedSection) return null;

  return (
    <span
      className={["updated-marker", className].filter(Boolean).join(" ")}
      aria-label="Updated since read"
      data-updated-marker="true"
      title="Updated since read"
    >
      <RotateCcw aria-hidden="true" size={13} />
      <span>Updated</span>
    </span>
  );
}
