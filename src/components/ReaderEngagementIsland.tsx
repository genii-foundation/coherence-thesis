"use client";

import { useEffect, useRef } from "react";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  readerActiveSectionEvent,
  type ReaderActiveSectionDetail,
} from "@/lib/reader-active-section";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  readStoredProgress,
  updateStoredProgress,
} from "@/lib/reader-progress-store";
import {
  markRead,
  markSectionOpened,
  isSectionRead,
  progressStateForSection,
  recordReadingTime,
  recordScrollProgress,
} from "@/lib/reader-state";
import { readerFragmentTarget } from "@/lib/reader-fragments";

const readerAnchorGap = 16;

function decodedHashTarget(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return hash.replace(/^#/, "");
  }
}

function scrollBelowFloatingToolbar(target: HTMLElement): void {
  const toolbar = document.querySelector<HTMLElement>(".site-header");
  const toolbarStyle = toolbar ? window.getComputedStyle(toolbar) : null;
  const toolbarFloats =
    toolbarStyle?.position === "fixed" || toolbarStyle?.position === "sticky";
  const toolbarBox = toolbar?.getBoundingClientRect();
  const toolbarBottom =
    toolbarFloats && toolbarBox && toolbarBox.bottom > 0
      ? toolbarBox.bottom
      : 0;
  const targetTop = target.getBoundingClientRect().top;
  const desiredTop = toolbarBottom + (toolbarBottom > 0 ? readerAnchorGap : 0);
  const nextTop = Math.max(0, window.scrollY + targetTop - desiredTop);

  if (Math.abs(window.scrollY - nextTop) <= 1) return;
  window.scrollTo({ behavior: "auto", top: nextTop });
}

const idleThresholdMs = 45_000;
const scrollMilestones = [25, 50, 75, 100];
const readThresholdPercent = 100;
const timingSampleIntervalMs = 5_000;

export type ReaderEngagementSection = Pick<
  ProgressSection,
  | "sectionId"
  | "continuityId"
  | "legacyContinuityIds"
  | "progressContinuityGroups"
  | "legacySectionIds"
  | "contentHash"
  | "paragraphs"
>;

export type ReaderEngagementDomContract =
  | "coherence"
  | "publisher-embedded";

export type ReaderEngagementInitialFragmentPolicy = "inert" | "track";

type ReaderSectionRuntime = {
  section: ReaderEngagementSection;
  element: HTMLElement;
};

const publisherTransitionRootSelector =
  "[data-coherence-publisher-transition-root='true']";
const publisherSectionSelector = "[data-publisher-section]";

export function resolvePublisherReaderEngagementElements(
  sections: readonly Pick<ReaderEngagementSection, "sectionId">[],
  ownerDocument: Document,
): readonly HTMLElement[] | null {
  const transitionRoots = Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(
      publisherTransitionRootSelector,
    ),
  );
  if (transitionRoots.length !== 1) return null;
  const elements = Array.from(
    transitionRoots[0]!.querySelectorAll<HTMLElement>(
      publisherSectionSelector,
    ),
  );
  if (
    elements.length !== sections.length ||
    elements.some(
      (element, index) =>
        element.dataset.publisherSection !== sections[index]?.sectionId,
    )
  ) {
    return null;
  }
  return Object.freeze(elements);
}

function readerSectionRuntimes(
  sections: readonly ReaderEngagementSection[],
  domContract: ReaderEngagementDomContract,
): ReaderSectionRuntime[] {
  if (domContract === "publisher-embedded") {
    const elements = resolvePublisherReaderEngagementElements(
      sections,
      document,
    );
    return elements === null
      ? []
      : sections.map((section, index) => ({
          section,
          element: elements[index]!,
        }));
  }
  return sections
    .map((section): ReaderSectionRuntime | null => {
      const element = document.querySelector<HTMLElement>(
        `[data-reader-section-id="${section.sectionId}"]`,
      );
      return element ? { section, element } : null;
    })
    .filter((runtime): runtime is ReaderSectionRuntime => Boolean(runtime));
}

function dispatchActiveSection(path: string, sectionId: string): void {
  window.dispatchEvent(
    new CustomEvent<ReaderActiveSectionDetail>(readerActiveSectionEvent, {
      detail: { path, sectionId },
    }),
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function sectionScrollPercent(rect: DOMRect, singleSection: boolean): number {
  if (singleSection) {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 100;
    return clampPercent(Math.round((window.scrollY / scrollable) * 100));
  }

  if (rect.top >= window.innerHeight) return 0;
  if (rect.bottom <= window.innerHeight * 0.92) return 100;
  const visibleTravel = window.innerHeight - rect.top;
  const totalTravel = Math.max(1, rect.height);
  return clampPercent(Math.round((visibleTravel / totalTravel) * 100));
}

function visibleScore(rect: DOMRect): number {
  const visibleTop = Math.max(0, rect.top);
  const visibleBottom = Math.min(window.innerHeight, rect.bottom);
  return Math.max(0, visibleBottom - visibleTop);
}

type ReaderSectionFrame = Readonly<{
  rect: DOMRect;
  runtime: ReaderSectionRuntime;
  visibleScore: number;
}>;

function sectionFrames(
  runtimes: readonly ReaderSectionRuntime[],
): readonly ReaderSectionFrame[] {
  return runtimes.map((runtime) => {
    const rect = runtime.element.getBoundingClientRect();
    return Object.freeze({
      rect,
      runtime,
      visibleScore: visibleScore(rect),
    });
  });
}

function visibleActiveFrame(
  frames: readonly ReaderSectionFrame[],
): ReaderSectionFrame | null {
  const first = frames[0];
  if (first === undefined) return null;
  const best = frames.slice(1).reduce(
    (current, candidate) =>
      candidate.visibleScore > current.visibleScore ? candidate : current,
    first,
  );
  return best.visibleScore > 0 ? best : null;
}

type ReaderSectionTiming = {
  activeMs: number;
  idleMs: number;
  totalVisibleMs: number;
};

export function ReaderEngagementIsland({
  domContract = "coherence",
  initialFragmentPolicy = "track",
  sections,
}: {
  domContract?: ReaderEngagementDomContract;
  initialFragmentPolicy?: ReaderEngagementInitialFragmentPolicy;
  sections: readonly ReaderEngagementSection[];
}) {
  const hadInitialFragmentRef = useRef(
    typeof window !== "undefined" && window.location.hash.length > 0,
  );
  const sectionsRef = useRef(sections);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    if (
      initialFragmentPolicy === "inert" &&
      hadInitialFragmentRef.current
    ) {
      return;
    }
    const runtimes = readerSectionRuntimes(
      sectionsRef.current,
      domContract,
    );
    if (runtimes.length === 0) return;
    const mountPath = window.location.pathname;

    const opened = new Set<string>();
    const read = new Set<string>();
    const reachedMilestones = new Map<string, Set<number>>();
    const lastPercent = new Map<string, number>();
    let activeSectionId = "";
    let hasObservedVisibleSection = false;
    let scrollFrame: number | null = null;
    const singleSection = runtimes.length === 1;
    const timingBySectionId = new Map<string, ReaderSectionTiming>();
    let timingOwnerSectionId: string | null = null;
    let lastSampleAt = Date.now();
    let lastActivityAt = lastSampleAt;

    const sampleTiming = (now = Date.now()) => {
      if (document.visibilityState !== "visible") {
        lastSampleAt = now;
        return;
      }
      const delta = Math.max(0, now - lastSampleAt);
      lastSampleAt = now;
      if (timingOwnerSectionId === null || delta === 0) return;
      const timing = timingBySectionId.get(timingOwnerSectionId) ?? {
        activeMs: 0,
        idleMs: 0,
        totalVisibleMs: 0,
      };
      timing.totalVisibleMs += delta;
      if (now - lastActivityAt > idleThresholdMs) {
        timing.idleMs += delta;
      } else {
        timing.activeMs += delta;
      }
      timingBySectionId.set(timingOwnerSectionId, timing);
    };

    const markActivity = () => {
      const now = Date.now();
      sampleTiming(now);
      lastActivityAt = now;
    };

    const handleFrame = () => {
      markActivity();
      const frames = sectionFrames(runtimes);
      const active = visibleActiveFrame(frames);
      timingOwnerSectionId = active?.runtime.section.sectionId ?? null;
      if (active !== null) {
        hasObservedVisibleSection = true;
        if (active.runtime.section.sectionId !== activeSectionId) {
          activeSectionId = active.runtime.section.sectionId;
          dispatchActiveSection(mountPath, activeSectionId);
        }
      }
      if (!hasObservedVisibleSection) return;

      for (const frame of frames) {
        const { section } = frame.runtime;
        const percent = sectionScrollPercent(frame.rect, singleSection);
        if (percent <= 0 && section.sectionId !== activeSectionId) continue;

        if (!opened.has(section.sectionId)) {
          opened.add(section.sectionId);
          const existingOpenCount =
            progressStateForSection(readStoredProgress(), section)?.openCount ?? 0;
          updateStoredProgress((current) =>
            markSectionOpened(current, section, Date.now(), "direct"),
          );
          appendStoredEvent(
            createEngagementEvent(
              existingOpenCount > 0 ? "section_returned" : "section_opened",
              {
                sectionId: section.sectionId,
                contentHash: section.contentHash,
                route: mountPath,
              },
            ),
          );
          appendStoredEvent(
            createEngagementEvent("navigation_source_used", {
              sectionId: section.sectionId,
              contentHash: section.contentHash,
              route: mountPath,
              payload: { source: "direct" },
            }),
          );
        }

        if (lastPercent.get(section.sectionId) !== percent) {
          lastPercent.set(section.sectionId, percent);
          updateStoredProgress((current) =>
            recordScrollProgress(current, section, percent),
          );
        }

        const milestones =
          reachedMilestones.get(section.sectionId) ?? new Set<number>();
        reachedMilestones.set(section.sectionId, milestones);
        scrollMilestones
          .filter((milestone) => percent >= milestone && !milestones.has(milestone))
          .forEach((milestone) => {
            milestones.add(milestone);
            appendStoredEvent(
              createEngagementEvent("scroll_milestone", {
                sectionId: section.sectionId,
                contentHash: section.contentHash,
                route: mountPath,
                payload: { percent: milestone },
              }),
            );
          });

        if (percent < readThresholdPercent || read.has(section.sectionId)) continue;
        read.add(section.sectionId);
        appendStoredEvent(
          createEngagementEvent("read_threshold_crossed", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: mountPath,
            payload: { percent },
          }),
        );
        updateStoredProgress((current) => {
          if (isSectionRead(current, section)) {
            return current;
          }
          return markRead(current, section);
        });
      }
    };

    const onScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        handleFrame();
      });
    };

    let hashFrame: number | null = null;
    const onHashChange = () => {
      const target = readerFragmentTarget(
        window.location.hash,
        [...sectionsRef.current],
      );
      if (!target) return;
      if (domContract === "publisher-embedded") return;
      dispatchActiveSection(mountPath, target.sectionId);
      const hashTarget = decodedHashTarget(window.location.hash);
      const anchor =
        document.getElementById(hashTarget) ??
        document.getElementById(target.anchorId);
      if (hashFrame !== null) window.cancelAnimationFrame(hashFrame);
      hashFrame = window.requestAnimationFrame(() => {
        hashFrame = window.requestAnimationFrame(() => {
          hashFrame = null;
          if (anchor) scrollBelowFloatingToolbar(anchor);
        });
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markActivity);
    window.addEventListener("hashchange", onHashChange);
    const onVisibilityChange = () => sampleTiming();
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(sampleTiming, timingSampleIntervalMs);
    handleFrame();
    onHashChange();

    return () => {
      sampleTiming();
      window.clearInterval(interval);
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("focus", markActivity);
      window.removeEventListener("hashchange", onHashChange);
      if (hashFrame !== null) window.cancelAnimationFrame(hashFrame);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      for (const runtime of runtimes) {
        const section = runtime.section;
        const timing = timingBySectionId.get(section.sectionId);
        if (!opened.has(section.sectionId) || timing === undefined) continue;
        const activeSeconds = Math.round(timing.activeMs / 1000);
        const idleSeconds = Math.round(timing.idleMs / 1000);
        const totalVisibleSeconds = Math.round(timing.totalVisibleMs / 1000);
        if (
          activeSeconds <= 0 &&
          idleSeconds <= 0 &&
          totalVisibleSeconds <= 0
        ) {
          continue;
        }
        appendStoredEvent(
          createEngagementEvent("section_visibility_ended", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: mountPath,
            payload: {
              activeSeconds,
              idleSeconds,
              totalVisibleSeconds,
            },
          }),
        );
        updateStoredProgress((current) =>
          recordReadingTime(current, section, {
            activeSeconds,
            idleSeconds,
            totalVisibleSeconds,
          }),
        );
      }
    };
  }, [domContract, initialFragmentPolicy]);

  return null;
}
