"use client";

import { useEffect } from "react";
import { loadProgressSections } from "@/lib/reader-data";
import {
  readerFragmentTarget,
  type FragmentSection,
} from "@/lib/reader-fragments";

type RedirectSection = FragmentSection & { readerHref: string };

function decodedFragment(hash: string): string {
  const value = hash.replace(/^#/, "");
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function redirectFrom(hash: string, sections: RedirectSection[]): boolean {
  const target = readerFragmentTarget(hash, sections);
  if (!target) return false;
  const section = sections.find(
    (candidate) => candidate.sectionId === target.sectionId,
  );
  if (!section) return false;
  const destination = new URL(section.readerHref, window.location.href);
  if (
    `${destination.pathname}${destination.hash}` ===
    `${window.location.pathname}${window.location.hash}`
  ) {
    return true;
  }
  window.location.replace(destination.href);
  return true;
}

export function LegacyFragmentRedirectIsland({
  sections = [],
}: {
  sections?: RedirectSection[];
}) {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const fragment = decodedFragment(hash);
    if (document.getElementById(fragment)) return;
    if (redirectFrom(hash, sections)) return;

    let cancelled = false;
    void loadProgressSections()
      .then((allSections) => {
        if (!cancelled) redirectFrom(hash, allSections);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sections]);

  return null;
}
