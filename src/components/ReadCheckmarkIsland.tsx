"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { useReaderProgress } from "@/lib/reader-progress-store";
import { isSectionRead, type ReaderProgressState } from "@/lib/reader-state";

function sectionsAreRead(
  progress: ReaderProgressState,
  sections: ProgressSection[],
): boolean {
  return (
    sections.length > 0 &&
    sections.every((section) => isSectionRead(progress, section))
  );
}

export function ReadCheckmarkIsland({
  sections,
  className,
}: {
  sections: ProgressSection[];
  className?: string;
}) {
  const progress = useReaderProgress();

  const isRead = useMemo(() => sectionsAreRead(progress, sections), [progress, sections]);

  if (!isRead) return null;

  return (
    <span
      className={["read-checkmark", className].filter(Boolean).join(" ")}
      role="img"
      aria-label="Read"
      data-read-checkmark="true"
      title="Read"
    >
      <Check aria-hidden="true" size={14} strokeWidth={2.4} />
    </span>
  );
}
