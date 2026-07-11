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

const idleThresholdMs = 45_000;
const scrollMilestones = [25, 50, 75, 100];
const readThresholdPercent = 100;
const timingSampleIntervalMs = 5_000;

type ReaderSectionRuntime = {
  section: ProgressSection;
  element: HTMLElement;
};

function dispatchActiveSection(sectionId: string): void {
  window.dispatchEvent(
    new CustomEvent<ReaderActiveSectionDetail>(readerActiveSectionEvent, {
      detail: { sectionId },
    }),
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function sectionScrollPercent(element: HTMLElement, singleSection: boolean): number {
  if (singleSection) {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 100;
    return clampPercent(Math.round((window.scrollY / scrollable) * 100));
  }

  const rect = element.getBoundingClientRect();
  if (rect.top >= window.innerHeight) return 0;
  if (rect.bottom <= window.innerHeight * 0.92) return 100;
  const visibleTravel = window.innerHeight - rect.top;
  const totalTravel = Math.max(1, rect.height);
  return clampPercent(Math.round((visibleTravel / totalTravel) * 100));
}

function visibleScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const visibleTop = Math.max(0, rect.top);
  const visibleBottom = Math.min(window.innerHeight, rect.bottom);
  return Math.max(0, visibleBottom - visibleTop);
}

export function ReaderEngagementIsland({
  sections,
}: {
  sections: ProgressSection[];
}) {
  const sectionsRef = useRef(sections);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    const runtimes = sectionsRef.current
      .map((section): ReaderSectionRuntime | null => {
        const element = document.querySelector<HTMLElement>(
          `[data-reader-section-id="${section.sectionId}"]`,
        );
        return element ? { section, element } : null;
      })
      .filter((runtime): runtime is ReaderSectionRuntime => Boolean(runtime));
    if (runtimes.length === 0) return;

    const opened = new Set<string>();
    const read = new Set<string>();
    const reachedMilestones = new Map<string, Set<number>>();
    const lastPercent = new Map<string, number>();
    let activeSectionId = "";
    let scrollTicking = false;
    const singleSection = runtimes.length === 1;
    const timing = {
      activeMs: 0,
      idleMs: 0,
      totalVisibleMs: 0,
      lastSampleAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    const sampleTiming = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible") {
        timing.lastSampleAt = now;
        return;
      }
      const delta = Math.max(0, now - timing.lastSampleAt);
      timing.totalVisibleMs += delta;
      if (now - timing.lastActivityAt > idleThresholdMs) {
        timing.idleMs += delta;
      } else {
        timing.activeMs += delta;
      }
      timing.lastSampleAt = now;
    };

    const activeRuntime = () =>
      runtimes.reduce((best, runtime) =>
        visibleScore(runtime.element) > visibleScore(best.element) ? runtime : best,
      );

    const markActivity = () => {
      sampleTiming();
      timing.lastActivityAt = Date.now();
    };

    const handleFrame = () => {
      scrollTicking = false;
      markActivity();
      const active = activeRuntime();
      if (active.section.sectionId !== activeSectionId) {
        activeSectionId = active.section.sectionId;
        dispatchActiveSection(activeSectionId);
      }

      for (const runtime of runtimes) {
        const { section, element } = runtime;
        const percent = sectionScrollPercent(element, singleSection);
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
                route: window.location.pathname,
              },
            ),
          );
          appendStoredEvent(
            createEngagementEvent("navigation_source_used", {
              sectionId: section.sectionId,
              contentHash: section.contentHash,
              route: window.location.pathname,
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
                route: window.location.pathname,
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
            route: window.location.pathname,
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
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(handleFrame);
    };

    const onHashChange = () => {
      const target = readerFragmentTarget(window.location.hash, sectionsRef.current);
      if (!target) return;
      const hashTarget = window.location.hash.replace(/^#/, "");
      if (!document.getElementById(hashTarget)) {
        const anchor = document.getElementById(target.anchorId);
        anchor?.scrollIntoView({ block: "start" });
      }
      dispatchActiveSection(target.sectionId);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markActivity);
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("visibilitychange", sampleTiming);
    const interval = window.setInterval(sampleTiming, timingSampleIntervalMs);
    handleFrame();
    onHashChange();

    return () => {
      sampleTiming();
      window.clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("focus", markActivity);
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("visibilitychange", sampleTiming);
      const activeSeconds = Math.round(timing.activeMs / 1000);
      const idleSeconds = Math.round(timing.idleMs / 1000);
      const totalVisibleSeconds = Math.round(timing.totalVisibleMs / 1000);
      if (activeSeconds <= 0 && idleSeconds <= 0 && totalVisibleSeconds <= 0) {
        return;
      }

      for (const section of sectionsRef.current) {
        if (!opened.has(section.sectionId)) continue;
        appendStoredEvent(
          createEngagementEvent("section_visibility_ended", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: window.location.pathname,
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
  }, []);

  return null;
}
