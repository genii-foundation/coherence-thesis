"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BookOpen, Headphones, ListTree } from "lucide-react";
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
  const targetHref = useMemo(
    () =>
      sections.find((section) => !isSectionRead(progress, section))?.href ??
      fallbackHref,
    [fallbackHref, progress, sections],
  );

  return (
    <div className={className}>
      <Link className="primary-link" href={listenHref(targetHref)}>
        <Headphones aria-hidden="true" size={18} />
        <span>Listen</span>
      </Link>
      <Link className="secondary-link" href={targetHref}>
        <BookOpen aria-hidden="true" size={18} />
        <span>Read</span>
      </Link>
      <Link className="secondary-link" href="/overview/">
        <ListTree aria-hidden="true" size={18} />
        <span>Overview</span>
      </Link>
    </div>
  );
}
