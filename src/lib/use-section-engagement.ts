"use client";

import { useEffect, useRef } from "react";
import type { ProgressSection } from "@/lib/manuscript-data";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  readStoredProgress,
  updateStoredProgress,
} from "@/lib/reader-progress-store";
import {
  markRead,
  markSectionOpened,
  recordReadingTime,
  recordScrollProgress,
} from "@/lib/reader-state";

const idleThresholdMs = 45_000;
const scrollMilestones = [25, 50, 75, 100];
// Percent scrolled at which a section counts as read and the read event fires.
const readThresholdPercent = 100;
// How often the visibility timer samples active vs idle time.
const timingSampleIntervalMs = 5_000;

// Tracks reading engagement for the current section: opens/returns, scroll
// depth and milestones, the read threshold, and active/idle visible time. This
// was ~155 lines inside ToolbarProgressIsland (ARCH-02); it is pure side-effect
// tracking keyed on the section and route, so it lives on its own here.
export function useSectionEngagement(
  section: ProgressSection | undefined,
  pathname: string,
): void {
  const sectionRef = useRef<ProgressSection | undefined>(section);

  useEffect(() => {
    sectionRef.current = section;
  }, [section]);

  useEffect(() => {
    if (!section) return;
    const existingOpenCount =
      readStoredProgress().sections[section.sectionId]?.openCount ?? 0;
    const openTimer = window.setTimeout(() => {
      updateStoredProgress((current) =>
        markSectionOpened(current, section, Date.now(), "direct"),
      );
    }, 0);
    appendStoredEvent(
      createEngagementEvent(existingOpenCount > 0 ? "section_returned" : "section_opened", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: pathname,
      }),
    );
    appendStoredEvent(
      createEngagementEvent("navigation_source_used", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: pathname,
        payload: { source: "direct" },
      }),
    );

    const timing = {
      activeMs: 0,
      idleMs: 0,
      totalVisibleMs: 0,
      lastSampleAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    const reachedMilestones = new Set<number>();
    let readThresholdCaptured = false;

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
    const markActivity = () => {
      sampleTiming();
      timing.lastActivityAt = Date.now();
    };
    let scrollTicking = false;
    let lastScrollPercent = -1;
    const handleScrollFrame = () => {
      scrollTicking = false;
      markActivity();
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const percent = Math.round((window.scrollY / scrollable) * 100);
      // Only act when the rounded percent advances. recordScrollProgress then
      // returns the same reference when nothing changed, so updateStoredProgress
      // is a no-op and no localStorage write happens on idle scroll frames.
      if (percent === lastScrollPercent) return;
      lastScrollPercent = percent;
      const reached = scrollMilestones.filter(
        (milestone) => percent >= milestone && !reachedMilestones.has(milestone),
      );
      if (reached.length > 0) {
        reached.forEach((milestone) => {
          reachedMilestones.add(milestone);
          appendStoredEvent(
            createEngagementEvent("scroll_milestone", {
              sectionId: section.sectionId,
              contentHash: section.contentHash,
              route: pathname,
              payload: { percent: milestone },
            }),
          );
        });
      }
      updateStoredProgress((current) =>
        recordScrollProgress(current, section, percent),
      );
      if (percent < readThresholdPercent) return;
      if (!readThresholdCaptured) {
        readThresholdCaptured = true;
        appendStoredEvent(
          createEngagementEvent("read_threshold_crossed", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: pathname,
            payload: { percent },
          }),
        );
      }
      updateStoredProgress((current) => {
        const existing = current.sections[section.sectionId];
        if (existing?.contentHash === section.contentHash && existing.percent >= 100) {
          return current;
        }
        return markRead(current, section);
      });
    };
    const onScroll = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(handleScrollFrame);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markActivity);
    document.addEventListener("visibilitychange", sampleTiming);
    const interval = window.setInterval(sampleTiming, timingSampleIntervalMs);
    handleScrollFrame();
    return () => {
      window.clearTimeout(openTimer);
      sampleTiming();
      window.clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("focus", markActivity);
      document.removeEventListener("visibilitychange", sampleTiming);
      const activeSeconds = Math.round(timing.activeMs / 1000);
      const idleSeconds = Math.round(timing.idleMs / 1000);
      const totalVisibleSeconds = Math.round(timing.totalVisibleMs / 1000);
      if (activeSeconds > 0 || idleSeconds > 0 || totalVisibleSeconds > 0) {
        const currentSection = sectionRef.current ?? section;
        updateStoredProgress((current) =>
          recordReadingTime(current, currentSection, {
            activeSeconds,
            idleSeconds,
            totalVisibleSeconds,
          }),
        );
        appendStoredEvent(
          createEngagementEvent("section_visibility_ended", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: pathname,
            payload: {
              activeSeconds,
              idleSeconds,
              totalVisibleSeconds,
            },
          }),
        );
      }
    };
  }, [pathname, section]);
}
