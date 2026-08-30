"use client";

import { useEffect } from "react";
import { loadProgressSections } from "@/lib/reader-data";
import {
  readerFragmentTarget,
  type FragmentSection,
} from "@/lib/reader-fragments";
import {
  resolveCoherencePublisherLegacyFragment,
  type CoherencePublisherLegacyFragmentModel,
  type CoherencePublisherLegacyFragmentTarget,
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

type PublisherTargetElement =
  | Readonly<{ kind: "ambiguous" | "missing" }>
  | Readonly<{ element: HTMLElement; kind: "resolved" }>;

function publisherTargetElement(
  target: CoherencePublisherLegacyFragmentTarget,
): PublisherTargetElement {
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-publisher-section]"),
  ).filter(
    (candidate) => candidate.dataset.publisherSection === target.sectionId,
  );
  if (sections.length === 0) return Object.freeze({ kind: "missing" });
  if (sections.length !== 1) return Object.freeze({ kind: "ambiguous" });
  const section = sections[0]!;
  if (target.blockId === undefined) {
    return Object.freeze({ element: section, kind: "resolved" });
  }
  const blocks = Array.from(
    section.querySelectorAll<HTMLElement>("[data-publisher-block]"),
  ).filter(
    (candidate) => candidate.dataset.publisherBlock === target.blockId,
  );
  if (blocks.length === 0) return Object.freeze({ kind: "missing" });
  if (blocks.length !== 1) return Object.freeze({ kind: "ambiguous" });
  return Object.freeze({ element: blocks[0]!, kind: "resolved" });
}

function resolvePublisherFragment(
  hash: string,
  model: CoherencePublisherLegacyFragmentModel,
): void {
  const target = resolveCoherencePublisherLegacyFragment(
    decodedFragment(hash),
    model,
  );
  if (target === null) return;
  const destination = new URL(target.href, window.location.href);
  if (destination.pathname !== window.location.pathname) {
    destination.hash = hash;
    window.location.replace(destination.href);
    return;
  }
  const targetElement = publisherTargetElement(target);
  if (targetElement.kind === "resolved") {
    targetElement.element.scrollIntoView();
    return;
  }
}

export function LegacyFragmentRedirectIsland({
  publisherFragmentModel,
  sections = [],
}: {
  publisherFragmentModel?: CoherencePublisherLegacyFragmentModel;
  sections?: RedirectSection[];
}) {
  useEffect(() => {
    let cancelled = false;
    const resolveFragment = () => {
      const hash = window.location.hash;
      if (!hash) return;
      if (publisherFragmentModel !== undefined) {
        resolvePublisherFragment(hash, publisherFragmentModel);
        return;
      }
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
  }, [publisherFragmentModel, sections]);

  return null;
}
