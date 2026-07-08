"use client";

import { useMemo } from "react";
import { useReaderProgress } from "@/lib/reader-progress-store";
import { isSectionRead } from "@/lib/reader-state";

type OverviewReadSection = {
  sectionId: string;
  contentHash: string;
  href: string;
};

function readTargetHref(
  sections: OverviewReadSection[],
  fallbackHref: string,
  progress: ReturnType<typeof useReaderProgress>,
): string {
  return (
    sections.find((section) => !isSectionRead(progress, section))?.href ??
    fallbackHref
  );
}

export function OverviewReadTargetIsland({
  fallbackHref,
  label,
  sections,
}: {
  fallbackHref: string;
  label: string;
  sections: OverviewReadSection[];
}) {
  const progress = useReaderProgress();
  const href = useMemo(
    () => readTargetHref(sections, fallbackHref, progress),
    [fallbackHref, progress, sections],
  );

  return (
    <>
      <a
        aria-label={`Read ${label}`}
        className="overview-node-card-link"
        href={href}
      >
        <span className="sr-only">Read {label}</span>
      </a>
      <a className="overview-read-link" href={href}>
        <span aria-hidden="true" className="overview-read-link-indicator">
          ››
        </span>
        <span>Read This Manuscript</span>
      </a>
    </>
  );
}
