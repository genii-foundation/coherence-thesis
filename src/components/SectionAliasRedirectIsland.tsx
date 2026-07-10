"use client";

import { useEffect } from "react";
import { canonicalReaderDestination } from "@/lib/reader-fragments";
import type { ProgressSection } from "@/lib/manuscript-data";

export function SectionAliasRedirectIsland({
  readerHref,
  section,
}: {
  readerHref: string;
  section: Pick<
    ProgressSection,
    "sectionId" | "legacySectionIds" | "paragraphs"
  >;
}) {
  useEffect(() => {
    const destination = new URL(
      canonicalReaderDestination(readerHref, window.location.hash, section),
      window.location.href,
    );
    if (
      `${destination.pathname}${destination.hash}` !==
      `${window.location.pathname}${window.location.hash}`
    ) {
      window.location.replace(destination.href);
    }
  }, [readerHref, section]);

  return null;
}
