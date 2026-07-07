"use client";

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { useReaderProgress } from "@/lib/reader-progress-store";
import { updatedSinceRead } from "@/lib/reader-state";

export function UpdatedMarkerIsland({
  sections,
  className,
}: {
  sections: ProgressSection[];
  className?: string;
}) {
  const progress = useReaderProgress();

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
