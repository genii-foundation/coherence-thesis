"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  emptyProgress,
  parseProgress,
  readerProgressStorageKey,
  revisedSectionHref,
  updatedSinceRead,
  type ReaderProgressState,
} from "@/lib/reader-state";

function readStoredProgress(): ReaderProgressState {
  if (typeof window === "undefined") return emptyProgress();
  return parseProgress(window.localStorage.getItem(readerProgressStorageKey));
}

export function SectionRevisionNotice({ section }: { section: ProgressSection }) {
  const [progress, setProgress] = useState<ReaderProgressState>(() => emptyProgress());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProgress(readStoredProgress());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!updatedSinceRead(progress, section)) return null;

  return (
    <aside className="revision-notice" aria-label="Updated section notice">
      <RotateCcw aria-hidden="true" size={17} />
      <span>Revised since you read this.</span>
      <a href={revisedSectionHref(progress, section)}>Jump to the first changed passage</a>
    </aside>
  );
}
