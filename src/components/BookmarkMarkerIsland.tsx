"use client";

import { useMemo } from "react";
import { Bookmark } from "lucide-react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { useReaderBookmarks } from "@/lib/reader-progress-store";
import {
  bookmarkedProgressKeys,
  sectionHasBookmarks,
} from "@/lib/reader-bookmarks";

// The heatmap notch is a locator, not a statement about sections: 551 sections
// map onto 1,000 cells by word range, so one bookmarked section lights a run of
// cells and a short section shares one. This badge is where "this section holds
// a bookmark" is actually true, on surfaces whose unit is the section.
//
// Its own hook attribute rather than overloading data-read-checkmark or
// data-updated-marker, both of which existing specs select on.
export function BookmarkMarkerIsland({
  sections,
  className,
}: {
  sections: ProgressSection[];
  className?: string;
}) {
  const bookmarks = useReaderBookmarks();

  const marked = useMemo(() => {
    const keys = bookmarkedProgressKeys(bookmarks);
    if (keys.size === 0) return false;
    return sections.some((section) => sectionHasBookmarks(keys, section));
  }, [bookmarks, sections]);

  if (!marked) return null;

  return (
    <span
      className={["bookmark-marker", className].filter(Boolean).join(" ")}
      role="img"
      aria-label="Bookmarked"
      data-bookmark-marker="true"
      title="Bookmarked"
    >
      <Bookmark aria-hidden="true" size={13} strokeWidth={2.2} />
    </span>
  );
}
