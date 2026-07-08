"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import {
  coverFlowTuning,
  getCoverFlowFlickTarget,
  getCoverFlowTransform,
  getCoverFlowWheelIntent,
} from "@/lib/cover-flow-motion";
import type { Volume } from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";
import { useReaderProgress } from "@/lib/reader-progress-store";
import {
  sectionGroupProgressStatus,
  type SectionProgressInput,
} from "@/lib/section-progress";
import { ProgressStateDot } from "@/components/ProgressStateDot";

type CoverFlowVolume = Pick<
  Volume,
  | "coverAlt"
  | "coverImage"
  | "href"
  | "numberLabel"
  | "order"
  | "parts"
  | "planet"
  | "sectionIds"
  | "subtitle"
  | "title"
  | "volumeId"
  | "wordCount"
> & {
  firstSectionHref: string;
};

type CoverFlowProgressSection = SectionProgressInput & { href: string };

type ManuscriptCoverFlowIslandProps = {
  progressSections: CoverFlowProgressSection[];
  volumes: CoverFlowVolume[];
};

type WheelGesture = {
  distancePx: number;
  peakDeltaPx: number;
  timeoutId: number | null;
};

const manuscriptTags: Record<string, string[]> = {
  "humanitys-most-viable-future": [
    "Post-extractive civilization",
    "Social substrate",
  ],
  "wielding-intelligence": ["Humane technology", "AI coordination"],
  "providence-imperative": [
    "Coordination infrastructure",
    "Civilizational design",
  ],
  "architecting-providence": ["Systems architecture", "Coherent governance"],
  purposeful: ["Builder discovery", "Human purpose"],
  "smallest-nest": ["Planetary containment", "Living scale"],
  "presencing-genius": ["Presence praxis", "Collective genius"],
  "misanthropic-artifice": ["Academic critique", "Saturnine inquiry"],
  "cardinal-scale": ["Iconic patterning", "Cardinal orientation"],
};

const planetSymbols: Record<string, string> = {
  Jupiter: "♃",
  Mars: "♂",
  Mercury: "☿",
  Moon: "☽",
  Neptune: "♆",
  Saturn: "♄",
  Sun: "☉",
  Uranus: "♅",
  Venus: "♀",
};

const initialIndex = 0;

export function ManuscriptCoverFlowIsland({
  progressSections,
  volumes,
}: ManuscriptCoverFlowIslandProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.min(initialIndex, Math.max(volumes.length - 1, 0)),
  );
  const [selectedPartByVolumeId, setSelectedPartByVolumeId] = useState<
    Record<string, string | null>
  >({});
  const [readCueVolumeId, setReadCueVolumeId] = useState<string | null>(null);
  const progress = useReaderProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const snapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const panelHeightFrameRef = useRef<number | null>(null);
  const pendingPanelHeightAnimationsRef = useRef(new Set<string>());
  const wheelGestureRef = useRef<WheelGesture>({
    distancePx: 0,
    peakDeltaPx: 0,
    timeoutId: null,
  });

  const progressSectionById = useMemo(
    () =>
      new Map(
        progressSections.map((section) => [section.sectionId, section]),
      ),
    [progressSections],
  );

  const sectionsForIds = useCallback(
    (sectionIds: string[]) => {
      const resolved: SectionProgressInput[] = [];
      sectionIds.forEach((sectionId) => {
        const section = progressSectionById.get(sectionId);
        if (section) resolved.push(section);
      });
      return resolved;
    },
    [progressSectionById],
  );

  const resetWheelGesture = useCallback(() => {
    const gesture = wheelGestureRef.current;
    gesture.distancePx = 0;
    gesture.peakDeltaPx = 0;
    if (gesture.timeoutId !== null) {
      window.clearTimeout(gesture.timeoutId);
      gesture.timeoutId = null;
    }
  }, []);

  const measuredPanelHeight = useCallback((panel: HTMLDivElement) => {
    const maxHeight = Number.parseFloat(window.getComputedStyle(panel).maxHeight);
    const contentHeight = panel.scrollHeight;
    if (!Number.isFinite(maxHeight) || maxHeight <= 0) return contentHeight;
    return Math.min(contentHeight, maxHeight);
  }, []);

  const preparePanelHeightAnimation = useCallback((volumeId: string) => {
    const panel = panelRefs.current[volumeId];
    if (!panel) return;

    pendingPanelHeightAnimationsRef.current.add(volumeId);
    panel.style.setProperty(
      "--cover-flow-panel-height",
      `${panel.getBoundingClientRect().height}px`,
    );
    panel.classList.add("is-height-locked");
  }, []);

  const animatePanelHeightToContent = useCallback(
    (volumeId: string) => {
      const panel = panelRefs.current[volumeId];
      if (!panel) return;

      const currentHeight = panel.getBoundingClientRect().height;
      panel.style.transition = "none";
      panel.classList.remove("is-height-locked");
      panel.style.removeProperty("--cover-flow-panel-height");
      const targetHeight = measuredPanelHeight(panel);
      panel.classList.add("is-height-locked");
      panel.style.setProperty(
        "--cover-flow-panel-height",
        `${currentHeight}px`,
      );
      void panel.offsetHeight;
      panel.style.removeProperty("transition");

      if (Math.abs(currentHeight - targetHeight) < 1) {
        panel.classList.remove("is-height-locked");
        panel.style.removeProperty("--cover-flow-panel-height");
        return;
      }

      let cleanupTimer: number | null = null;
      let targetFrame: number | null = null;
      const cleanup = (event?: TransitionEvent) => {
        if (event && event.propertyName !== "height") return;
        if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
        if (targetFrame !== null) window.cancelAnimationFrame(targetFrame);
        panel.removeEventListener("transitionend", cleanup);
        panel.classList.remove("is-height-locked");
        panel.style.removeProperty("--cover-flow-panel-height");
      };

      panel.addEventListener("transitionend", cleanup);
      cleanupTimer = window.setTimeout(cleanup, 360);
      targetFrame = window.requestAnimationFrame(() => {
        targetFrame = null;
        panel.style.setProperty(
          "--cover-flow-panel-height",
          `${targetHeight}px`,
        );
      });
    },
    [measuredPanelHeight],
  );

  const updateCardPositions = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const center = scrollerRect.left + scrollerRect.width / 2;
    const maxScrollLeft = Math.max(
      0,
      scroller.scrollWidth - scroller.clientWidth,
    );
    const scrollLeft = scroller.scrollLeft;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, index) => {
      const snap = snapRefs.current[index];
      if (!card || !snap) return;

      const cardWidth = snap.offsetWidth;
      const cardCenter =
        scrollerRect.left +
        snap.offsetLeft +
        cardWidth / 2 -
        scroller.scrollLeft;
      const offset = (cardCenter - center) / cardWidth;
      const distance = Math.abs(offset);
      const transform = getCoverFlowTransform(offset);

      card.style.setProperty(
        "--cover-flow-shift",
        `${transform.shift.toFixed(1)}px`,
      );
      card.style.setProperty("--cover-flow-rotate", `${transform.rotate}deg`);
      card.style.setProperty("--cover-flow-scale", transform.scale.toFixed(3));
      card.style.setProperty("--cover-flow-z", `${transform.z}px`);
      card.style.setProperty(
        "--cover-flow-cover-wash-opacity",
        transform.coverWashOpacity.toFixed(3),
      );
      card.style.setProperty(
        "--cover-flow-panel-opacity",
        String(transform.panelOpacity),
      );
      card.style.setProperty(
        "--cover-flow-panel-visibility",
        transform.panelVisibility,
      );
      card.style.zIndex = String(transform.layer);
      snap.style.zIndex = String(transform.layer);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (scrollLeft <= coverFlowTuning.scroll.endSnapTolerancePx) {
      closestIndex = 0;
    } else if (
      maxScrollLeft - scrollLeft <=
      coverFlowTuning.scroll.endSnapTolerancePx
    ) {
      closestIndex = Math.max(volumes.length - 1, 0);
    }

    setActiveIndex((current) =>
      current === closestIndex ? current : closestIndex,
    );
  }, [volumes.length]);

  const schedulePositionUpdate = useCallback(() => {
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateCardPositions();
    });
  }, [updateCardPositions]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const nextIndex = Math.max(0, Math.min(volumes.length - 1, index));
      const scroller = scrollRef.current;
      const snap = snapRefs.current[nextIndex];
      if (!scroller || !snap) return;

      const maxScrollLeft = Math.max(
        0,
        scroller.scrollWidth - scroller.clientWidth,
      );
      const targetScrollLeft =
        snap.offsetLeft + snap.offsetWidth / 2 - scroller.clientWidth / 2;

      scroller.scrollTo({
        left: Math.max(0, Math.min(targetScrollLeft, maxScrollLeft)),
        behavior,
      });
    },
    [volumes.length],
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const intent = getCoverFlowWheelIntent({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
      });

      if (intent === "vertical") {
        resetWheelGesture();
        const scroller = scrollRef.current;
        if (scroller) {
          scroller.scrollTo({ left: scroller.scrollLeft, behavior: "auto" });
        }

        const target = event.target as HTMLElement | null;
        const scrollPanel = target?.closest<HTMLElement>(
          ".cover-flow-card-panel-scroll",
        );
        if (scrollPanel) {
          const canScrollUp = scrollPanel.scrollTop > 0;
          const canScrollDown =
            scrollPanel.scrollTop + scrollPanel.clientHeight <
            scrollPanel.scrollHeight - 1;
          if (
            (event.deltaY < 0 && canScrollUp) ||
            (event.deltaY > 0 && canScrollDown)
          ) {
            return;
          }
        }

        event.preventDefault();
        window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
        return;
      }

      const horizontalDelta =
        intent === "horizontal" ? event.deltaX || event.deltaY : 0;

      if (horizontalDelta === 0) return;

      const gesture = wheelGestureRef.current;
      gesture.distancePx += horizontalDelta;

      if (Math.abs(horizontalDelta) > Math.abs(gesture.peakDeltaPx)) {
        gesture.peakDeltaPx = horizontalDelta;
      }

      if (gesture.timeoutId !== null) {
        window.clearTimeout(gesture.timeoutId);
      }

      gesture.timeoutId = window.setTimeout(() => {
        const targetIndex = getCoverFlowFlickTarget({
          activeIndex: activeIndexRef.current,
          distancePx: gesture.distancePx,
          peakDeltaPx: gesture.peakDeltaPx,
          volumeCount: volumes.length,
        });

        gesture.distancePx = 0;
        gesture.peakDeltaPx = 0;
        gesture.timeoutId = null;

        if (targetIndex !== null) {
          scrollToIndex(targetIndex);
        }
      }, coverFlowTuning.scroll.flickSettleMs);
    },
    [resetWheelGesture, scrollToIndex, volumes.length],
  );

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  useLayoutEffect(() => {
    updateCardPositions();
  }, [updateCardPositions]);

  useLayoutEffect(() => {
    const pending = Array.from(pendingPanelHeightAnimationsRef.current);
    if (pending.length === 0) return;
    pendingPanelHeightAnimationsRef.current.clear();

    if (panelHeightFrameRef.current !== null) {
      window.cancelAnimationFrame(panelHeightFrameRef.current);
    }

    panelHeightFrameRef.current = window.requestAnimationFrame(() => {
      panelHeightFrameRef.current = null;
      pending.forEach(animatePanelHeightToContent);
    });
  }, [animatePanelHeightToContent, selectedPartByVolumeId]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const wheelGesture = wheelGestureRef.current;

    window.addEventListener("resize", schedulePositionUpdate);

    return () => {
      window.removeEventListener("resize", schedulePositionUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (panelHeightFrameRef.current !== null) {
        window.cancelAnimationFrame(panelHeightFrameRef.current);
      }
      if (wheelGesture.timeoutId !== null) {
        window.clearTimeout(wheelGesture.timeoutId);
      }
    };
  }, [schedulePositionUpdate]);

  if (volumes.length === 0) {
    return null;
  }

  return (
    <section
      id="manuscripts"
      className="cover-flow"
      aria-label="Published manuscripts"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          scrollToIndex(activeIndex - 1);
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          scrollToIndex(activeIndex + 1);
        }
      }}
    >
      <button
        type="button"
        className="cover-flow-edge-button cover-flow-edge-button-previous"
        onClick={() => scrollToIndex(activeIndex - 1)}
        aria-label="Previous manuscript"
        disabled={activeIndex === 0}
      >
        <ChevronLeft aria-hidden="true" size={28} strokeWidth={1.45} />
      </button>

      <div
        ref={scrollRef}
        className="cover-flow-scroll"
        onScroll={schedulePositionUpdate}
      >
        <div className="cover-flow-track">
          {volumes.map((volume, index) => {
            const tags = manuscriptTags[volume.volumeId] ?? [volume.planet];
            const planetSymbol = planetSymbols[volume.planet] ?? "";
            const active = index === activeIndex;
            const selectedPartId =
              selectedPartByVolumeId[volume.volumeId] ?? null;
            const selectedPart =
              volume.parts.find((part) => part.partId === selectedPartId) ??
              null;
            const volumeStatus = sectionGroupProgressStatus(
              progress,
              sectionsForIds(volume.sectionIds),
            );

            return (
              <div
                key={volume.volumeId}
                ref={(snap) => {
                  snapRefs.current[index] = snap;
                }}
                className="cover-flow-card-shell"
              >
                <article
                  ref={(card) => {
                    cardRefs.current[index] = card;
                  }}
                  className={`cover-flow-card manuscript-cover-card-${volume.order}${
                    active ? " is-active" : ""
                  }`}
                  aria-label={`Open ${volume.title}`}
                  aria-current={active ? "true" : undefined}
                  data-volume-href={volume.href}
                  onClick={(event) => {
                    if (active) {
                      const target = event.target as HTMLElement | null;
                      if (target?.closest("a, button")) return;
                      window.location.href = volume.firstSectionHref;
                      return;
                    }
                    event.preventDefault();
                    scrollToIndex(index);
                  }}
                  onMouseLeave={() => setReadCueVolumeId(null)}
                  onMouseMove={(event) => {
                    if (!active) return;
                    const target = event.target as HTMLElement | null;
                    const specificTarget = target?.closest(
                      "button, a:not(.cover-flow-cover-link):not(.manuscript-card-outline-full)",
                    );
                    const nextVolumeId = specificTarget ? null : volume.volumeId;
                    setReadCueVolumeId((current) =>
                      current === nextVolumeId ? current : nextVolumeId,
                    );
                  }}
                >
                  <Link
                    href={volume.firstSectionHref}
                    className="cover-flow-cover-link"
                    aria-label={`Open ${volume.title}`}
                  >
                    <span className="cover-flow-image-frame">
                      <Image
                        src={volume.coverImage}
                        alt={volume.coverAlt}
                        width={512}
                        height={768}
                        sizes="(max-width: 720px) 78vw, (max-width: 1180px) 38vw, 420px"
                        priority={index === activeIndex}
                      />
                    </span>
                  </Link>
                  <div
                    ref={(panel) => {
                      panelRefs.current[volume.volumeId] = panel;
                    }}
                    className={`cover-flow-card-panel${
                      readCueVolumeId === volume.volumeId ? " is-read-cue" : ""
                    }`}
                  >
                    <div className="manuscript-card-panel-top">
                      <span className="manuscript-card-kicker">
                        Volume {volume.numberLabel}
                      </span>
                      {planetSymbol ? (
                        <span
                          className="manuscript-card-symbol"
                          aria-label={volume.planet}
                        >
                          {planetSymbol}
                        </span>
                      ) : null}
                      <strong>{volume.title}</strong>
                      <span className="manuscript-card-description">
                        {volume.subtitle}
                      </span>
                      <span className="manuscript-card-tags">
                        <span>
                          {formatReadingDurationForWords(volume.wordCount)}
                        </span>
                        {tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </span>
                    </div>
                    <nav
                      className="manuscript-card-outline"
                      aria-label={`${volume.title} sections`}
                    >
                      {selectedPart ? (
                        <>
                          <div className="manuscript-card-outline-fixed">
                            <button
                              type="button"
                              className="manuscript-card-outline-back"
                              onClick={() => {
                                preparePanelHeightAnimation(volume.volumeId);
                                setSelectedPartByVolumeId((current) => ({
                                  ...current,
                                  [volume.volumeId]: null,
                                }));
                              }}
                            >
                              <ArrowLeft aria-hidden="true" size={14} />
                              Back to parts
                            </button>
                          </div>
                          <div className="cover-flow-card-panel-scroll manuscript-card-outline-chapters">
                            <Link
                              className="manuscript-card-outline-part-overview"
                              href={selectedPart.href}
                            >
                              <span>Part Overview</span>
                              <span className="manuscript-card-outline-meta">
                                <small>
                                  {formatReadingDurationForWords(
                                    selectedPart.wordCount,
                                  )}
                                </small>
                                <ProgressStateDot
                                  status={sectionGroupProgressStatus(
                                    progress,
                                    sectionsForIds(selectedPart.sectionIds),
                                  )}
                                />
                              </span>
                            </Link>
                            {selectedPart.chapters.map((chapter) => (
                              <Link key={chapter.href} href={chapter.href}>
                                <span>{chapter.title}</span>
                                <span className="manuscript-card-outline-meta">
                                  <small>
                                    {formatReadingDurationForWords(
                                      chapter.wordCount,
                                    )}
                                  </small>
                                  <ProgressStateDot
                                    status={sectionGroupProgressStatus(
                                      progress,
                                      sectionsForIds(chapter.sectionIds),
                                    )}
                                  />
                                </span>
                              </Link>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="manuscript-card-outline-fixed">
                            <Link
                              className="manuscript-card-outline-full"
                              href={volume.firstSectionHref}
                            >
                              <span className="manuscript-card-outline-read-label">
                                <ChevronsRight aria-hidden="true" size={17} />
                                <span>Read Full Manuscript</span>
                              </span>
                              <span className="manuscript-card-outline-meta">
                                <small>
                                  {formatReadingDurationForWords(
                                    volume.wordCount,
                                  )}
                                </small>
                                <ProgressStateDot status={volumeStatus} />
                              </span>
                            </Link>
                          </div>
                          <div className="cover-flow-card-panel-scroll manuscript-card-outline-parts">
                            {volume.parts.map((part) => (
                              <button
                                key={part.href}
                                type="button"
                                className="manuscript-card-outline-part-button"
                                onClick={() => {
                                  if (!active) return;
                                  preparePanelHeightAnimation(volume.volumeId);
                                  setSelectedPartByVolumeId((current) => ({
                                    ...current,
                                    [volume.volumeId]: part.partId,
                                  }));
                                }}
                              >
                                <span className="manuscript-card-outline-title">
                                  <ChevronRight
                                    aria-hidden="true"
                                    size={15}
                                    className="manuscript-card-outline-chevron"
                                  />
                                  <span>Part: {part.title}</span>
                                </span>
                                <span className="manuscript-card-outline-meta">
                                  <small>
                                    {formatReadingDurationForWords(
                                      part.wordCount,
                                    )}
                                  </small>
                                  <ProgressStateDot
                                    status={sectionGroupProgressStatus(
                                      progress,
                                      sectionsForIds(part.sectionIds),
                                    )}
                                  />
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </nav>
                  </div>
                </article>
              </div>
            );
          })}
          <span className="cover-flow-scroll-spacer" aria-hidden="true" />
        </div>
      </div>

      <button
        type="button"
        className="cover-flow-edge-button cover-flow-edge-button-next"
        onClick={() => scrollToIndex(activeIndex + 1)}
        aria-label="Next manuscript"
        disabled={activeIndex === volumes.length - 1}
      >
        <ChevronRight aria-hidden="true" size={28} strokeWidth={1.45} />
      </button>
    </section>
  );
}
