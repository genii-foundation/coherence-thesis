"use client";

import { useEffect } from "react";
import { loadProgressSections } from "@/lib/reader-data";
import {
  readerFragmentTarget,
  type FragmentSection,
} from "@/lib/reader-fragments";
import {
  isCoherencePublisherLegacyFragmentModel,
  resolveCoherencePublisherLegacyFragment,
  type CoherencePublisherLegacyFragmentModel,
} from "@/publisher/legacy-fragment-continuity";

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

function PublisherLegacyFragmentRedirectIsland({
  model,
}: {
  model: CoherencePublisherLegacyFragmentModel;
}) {
  useEffect(() => {
    const resolveFragment = () => {
      const hash = window.location.hash;
      if (!hash) return;
      const target = resolveCoherencePublisherLegacyFragment(
        decodedFragment(hash),
        model,
      );
      if (target === null) return;
      const destination = new URL(target.href, window.location.href);
      if (
        `${destination.pathname}${destination.hash}` ===
        `${window.location.pathname}${window.location.hash}`
      ) {
        return;
      }
      window.location.replace(destination.href);
    };

    resolveFragment();
    window.addEventListener("hashchange", resolveFragment);
    return () => {
      window.removeEventListener("hashchange", resolveFragment);
    };
  }, [model]);

  return null;
}

function NativeLegacyFragmentRedirectIsland({
  sections,
}: {
  sections: RedirectSection[];
}) {
  useEffect(() => {
    let cancelled = false;
    const resolveFragment = () => {
      const hash = window.location.hash;
      if (!hash) return;
      const fragment = decodedFragment(hash);
      if (document.getElementById(fragment)) return;
      if (redirectFrom(hash, sections)) return;

      void loadProgressSections()
        .then((allSections) => {
          if (!cancelled && window.location.hash === hash) {
            redirectFrom(hash, allSections);
          }
        })
        .catch(() => undefined);
    };

    resolveFragment();
    window.addEventListener("hashchange", resolveFragment);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", resolveFragment);
    };
  }, [sections]);

  return null;
}

export function LegacyFragmentRedirectIsland({
  publisherFragmentModel,
  sections = [],
}: {
  publisherFragmentModel?: CoherencePublisherLegacyFragmentModel;
  sections?: RedirectSection[];
}) {
  if (publisherFragmentModel !== undefined) {
    return isCoherencePublisherLegacyFragmentModel(publisherFragmentModel)
      ? <PublisherLegacyFragmentRedirectIsland model={publisherFragmentModel} />
      : null;
  }
  return <NativeLegacyFragmentRedirectIsland sections={sections} />;
}
