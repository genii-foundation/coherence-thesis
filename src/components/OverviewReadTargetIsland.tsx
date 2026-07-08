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
  const unreadSections = sections.filter(
    (section) => !isSectionRead(progress, section),
  );
  const recentUnread = unreadSections.reduce<{
    href: string;
    openedAt: number;
  } | null>((best, section) => {
    const state = progress.sections[section.sectionId];
    const openedAt = Math.max(
      state?.lastOpenedAt ?? 0,
      state?.firstOpenedAt ?? 0,
    );
    if (openedAt <= 0 || (best && best.openedAt >= openedAt)) return best;
    return { href: section.href, openedAt };
  }, null);

  return recentUnread?.href ?? unreadSections[0]?.href ?? fallbackHref;
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
