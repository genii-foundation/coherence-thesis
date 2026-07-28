"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BookOpen, Headphones, ListTree } from "lucide-react";
import { requestAudioNavigation } from "@/lib/audio-events";
import { useReaderProgress } from "@/lib/reader-progress-store";
import { isSectionRead } from "@/lib/reader-state";
import {
  loadProgressSections,
  type ProgressSectionData,
} from "@/lib/reader-data";
import { useLoadedData } from "@/lib/use-loaded-data";

type HeroActionsIslandProps = {
  className?: string;
  fallbackHref: string;
};

const emptySections: ProgressSectionData[] = [];

function listenHref(href: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}listen=1`;
}

export function HeroActionsIsland({
  className = "hero-actions",
  fallbackHref,
}: HeroActionsIslandProps) {
  const progress = useReaderProgress();
  const sections = useLoadedData(loadProgressSections, emptySections);
  const target = useMemo(
    () =>
      sections.find((section) => !isSectionRead(progress, section)) ??
      sections.find((section) => section.readerHref === fallbackHref) ??
      sections[0],
    [fallbackHref, progress, sections],
  );
  const targetHref = target?.readerHref ?? fallbackHref;

  return (
    <div className={className}>
      <Link
        className="primary-link"
        href={listenHref(targetHref)}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            !target
          ) {
            return;
          }
          if (
            requestAudioNavigation({
              sectionId: target.sectionId,
              href: target.readerHref,
            })
          ) {
            event.preventDefault();
          }
        }}
      >
        <Headphones aria-hidden="true" size={18} />
        <span className="hero-action-label">Listen</span>
      </Link>
      <Link className="secondary-link" href={targetHref}>
        <BookOpen aria-hidden="true" size={18} />
        <span className="hero-action-label">Read</span>
      </Link>
      <Link className="secondary-link" href="/overview/">
        <ListTree aria-hidden="true" size={18} />
        <span className="hero-action-label">Overview</span>
      </Link>
    </div>
  );
}
