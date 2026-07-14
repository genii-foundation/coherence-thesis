"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BookOpen, Headphones, ListTree } from "lucide-react";
import { requestAudioNavigation } from "@/lib/audio-events";
import { useReaderProgress } from "@/lib/reader-progress-store";
import { isSectionRead } from "@/lib/reader-state";
import type { Section } from "@/lib/manuscript-data";

type HeroReadTarget = Pick<Section, "sectionId" | "contentHash" | "href">;

type HeroActionsIslandProps = {
  className?: string;
  fallbackHref: string;
  sections: HeroReadTarget[];
};

function listenHref(href: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}listen=1`;
}

export function HeroActionsIsland({
  className = "hero-actions",
  fallbackHref,
  sections,
}: HeroActionsIslandProps) {
  const progress = useReaderProgress();
  const target = useMemo(
    () =>
      sections.find((section) => !isSectionRead(progress, section)) ??
      sections.find((section) => section.href === fallbackHref) ??
      sections[0],
    [fallbackHref, progress, sections],
  );
  const targetHref = target?.href ?? fallbackHref;

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
              href: target.href,
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
