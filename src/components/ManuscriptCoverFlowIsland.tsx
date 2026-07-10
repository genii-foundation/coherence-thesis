"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type UIEvent as ReactUIEvent,
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
import { AstrologyIcon } from "@/components/AstrologyIcon";
import {
  coverFlowTuning,
  getCoverFlowTransform,
} from "@/lib/cover-flow-motion";
import type { Volume } from "@/lib/manuscript-data";
import { displayPartTitle } from "@/lib/manuscript-labels";
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

const COVER_FLOW_BACKGROUND_HIT_MIN_WIDTH = 44;
const COVER_FLOW_BACKGROUND_HIT_Y_SLOP = 10;

type ManuscriptCardOutlineRowMeta = {
  status: ReturnType<typeof sectionGroupProgressStatus>;
  wordCount: number;
};

function ManuscriptCardOutlineRowContent({
  icon = "single",
  label,
  meta,
}: {
  icon?: "double" | "single";
  label: string;
  meta: ManuscriptCardOutlineRowMeta;
}) {
  return (
    <>
      <span className="manuscript-card-outline-title">
        {icon === "double" ? (
          <ChevronsRight
            aria-hidden="true"
            size={17}
            className="manuscript-card-outline-chevron"
          />
        ) : (
          <ChevronRight
            aria-hidden="true"
            size={15}
            className="manuscript-card-outline-chevron"
          />
        )}
        <span>{label}</span>
      </span>
      <span className="manuscript-card-outline-meta">
        <small>{formatReadingDurationForWords(meta.wordCount)}</small>
        <ProgressStateDot status={meta.status} />
      </span>
    </>
  );
}

type ManuscriptCardOutlineRowProps = {
  className?: string;
  label: string;
  meta: ManuscriptCardOutlineRowMeta;
} & (
  | {
      href: string;
      onClick?: never;
    }
  | {
      href?: never;
      onClick: () => void;
    }
);

function ManuscriptCardOutlineRow({
  className,
  label,
  meta,
  ...props
}: ManuscriptCardOutlineRowProps) {
  const rowClassName = ["manuscript-card-outline-part-button", className]
    .filter(Boolean)
    .join(" ");
  const content = (
    <ManuscriptCardOutlineRowContent label={label} meta={meta} />
  );

  if (props.href) {
    return (
      <Link className={rowClassName} href={props.href}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={rowClassName} onClick={props.onClick}>
      {content}
    </button>
  );
}

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
  const [outlineScrolledByVolumeId, setOutlineScrolledByVolumeId] = useState<
    Record<string, boolean>
  >({});
  const progress = useReaderProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const snapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const panelHeightFrameRef = useRef<number | null>(null);
  const pendingPanelHeightAnimationsRef = useRef(new Set<string>());

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

    const center = scroller.scrollLeft + scroller.clientWidth / 2;
    const maxScrollLeft = Math.max(
      0,
      scroller.scrollWidth - scroller.clientWidth,
    );
    const scrollLeft = scroller.scrollLeft;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    const referenceCoverHeight =
      cardRefs.current[0]?.querySelector<HTMLElement>(
        ".cover-flow-image-frame",
      )?.offsetHeight ?? 0;
    const positionedCards: HTMLElement[] = [];

    cardRefs.current.forEach((card, index) => {
      const snap = snapRefs.current[index];
      if (!card || !snap) return;

      const scrollStepWidth = snap.offsetWidth;
      const cardCenter = snap.offsetLeft + scrollStepWidth / 2;
      const offset = (cardCenter - center) / scrollStepWidth;
      const distance = Math.abs(offset);
      const transform = getCoverFlowTransform(offset, scrollStepWidth);
      const coverCenterY = referenceCoverHeight / 2;
      const verticalCenterShift =
        coverCenterY *
        (coverFlowTuning.scale.active - transform.scale) *
        coverFlowTuning.verticalAlignment.sideCoverCenterCompensation;

      card.style.setProperty(
        "--cover-flow-shift",
        `${transform.shift.toFixed(1)}px`,
      );
      card.style.setProperty(
        "--cover-flow-y",
        `${verticalCenterShift.toFixed(1)}px`,
      );
      card.style.setProperty("--cover-flow-rotate", `${transform.rotate}deg`);
      card.style.setProperty("--cover-flow-scale", transform.scale.toFixed(3));
      card.style.setProperty("--cover-flow-z", `${transform.z}px`);
      card.style.setProperty(
        "--cover-flow-cover-wash-opacity",
        transform.coverWashOpacity.toFixed(3),
      );
      card.style.setProperty(
        "--cover-flow-cover-shadow-strength",
        transform.coverShadowStrength.toFixed(3),
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
      positionedCards.push(card);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (scrollLeft <= 2) {
      closestIndex = 0;
    } else if (
      maxScrollLeft - scrollLeft <= 2
    ) {
      closestIndex = Math.max(volumes.length - 1, 0);
    }

    const track = scroller.querySelector<HTMLElement>(".cover-flow-track");
    const referenceCover =
      positionedCards[0]?.querySelector<HTMLElement>(
        ".cover-flow-image-frame",
      ) ?? null;
    const trackPaddingTop = track
      ? Number.parseFloat(window.getComputedStyle(track).paddingTop)
      : 0;
    const targetCoverCenterY =
      track && referenceCover
        ? scroller.getBoundingClientRect().top +
          trackPaddingTop +
          referenceCover.offsetTop +
          (referenceCover.offsetHeight * coverFlowTuning.scale.active) / 2
        : null;

    if (targetCoverCenterY !== null) {
      for (let pass = 0; pass < 2; pass += 1) {
        const corrections = positionedCards.flatMap((card) => {
          const coverFrame = card.querySelector<HTMLElement>(
            ".cover-flow-image-frame",
          );
          const coverBox = coverFrame?.getBoundingClientRect();
          if (!coverBox) return [];

          const currentY = Number.parseFloat(
            card.style.getPropertyValue("--cover-flow-y") || "0",
          );
          const coverCenterY = coverBox.top + coverBox.height / 2;

          return [
            {
              card,
              y: currentY + targetCoverCenterY - coverCenterY,
            },
          ];
        });

        corrections.forEach(({ card, y }) => {
          card.style.setProperty("--cover-flow-y", `${y.toFixed(1)}px`);
        });
      }
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

  const setOutlineScrolled = useCallback(
    (volumeId: string, scrollTop: number) => {
      const isScrolled = scrollTop > 1;
      setOutlineScrolledByVolumeId((current) =>
        current[volumeId] === isScrolled
          ? current
          : { ...current, [volumeId]: isScrolled },
      );
    },
    [],
  );

  const handleOutlineScroll = useCallback(
    (volumeId: string, event: ReactUIEvent<HTMLDivElement>) => {
      setOutlineScrolled(volumeId, event.currentTarget.scrollTop);
    },
    [setOutlineScrolled],
  );

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

  const backgroundCoverIndexAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const candidates = cardRefs.current.flatMap((card, index) => {
        if (!card || index === activeIndex) return [];

        const coverFrame = card.querySelector<HTMLElement>(
          ".cover-flow-image-frame",
        );
        const coverBox = coverFrame?.getBoundingClientRect();
        if (!coverBox || coverBox.width <= 0 || coverBox.height <= 0) {
          return [];
        }

        const horizontalSlop = Math.max(
          0,
          (COVER_FLOW_BACKGROUND_HIT_MIN_WIDTH - coverBox.width) / 2,
        );
        const left = coverBox.left - horizontalSlop;
        const right = coverBox.right + horizontalSlop;
        const top = coverBox.top - COVER_FLOW_BACKGROUND_HIT_Y_SLOP;
        const bottom = coverBox.bottom + COVER_FLOW_BACKGROUND_HIT_Y_SLOP;

        if (
          clientX < left ||
          clientX > right ||
          clientY < top ||
          clientY > bottom
        ) {
          return [];
        }

        const centerX = coverBox.left + coverBox.width / 2;
        const centerY = coverBox.top + coverBox.height / 2;

        return [
          {
            index,
            score:
              Math.abs(clientX - centerX) +
              Math.abs(clientY - centerY) * 0.12,
          },
        ];
      });

      candidates.sort((first, second) => first.score - second.score);

      return candidates[0]?.index ?? null;
    },
    [activeIndex],
  );

  const handleScrollSurfaceClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      const targetIndex = backgroundCoverIndexAtPoint(
        event.clientX,
        event.clientY,
      );
      if (targetIndex === null) return;

      event.preventDefault();
      event.stopPropagation();
      scrollToIndex(targetIndex);
    },
    [backgroundCoverIndexAtPoint, scrollToIndex],
  );

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
    window.addEventListener("resize", schedulePositionUpdate);

    return () => {
      window.removeEventListener("resize", schedulePositionUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (panelHeightFrameRef.current !== null) {
        window.cancelAnimationFrame(panelHeightFrameRef.current);
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
        onClickCapture={handleScrollSurfaceClick}
        onScroll={schedulePositionUpdate}
      >
        <div className="cover-flow-track">
          {volumes.map((volume, index) => {
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
            const outlineFixedClassName = `manuscript-card-outline-fixed${
              outlineScrolledByVolumeId[volume.volumeId] ? " is-scrolled" : ""
            }`;

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
                  }${
                    readCueVolumeId === volume.volumeId ? " is-read-cue" : ""
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
                    onClick={(event) => {
                      if (active) return;
                      event.preventDefault();
                      scrollToIndex(index);
                    }}
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
                      <AstrologyIcon
                        planet={volume.planet}
                        className="manuscript-card-symbol"
                      />
                      <strong>{volume.title}</strong>
                      <span className="manuscript-card-description">
                        {volume.subtitle}
                      </span>
                    </div>
                    <nav
                      className="manuscript-card-outline"
                      aria-label={`${volume.title} sections`}
                    >
                      {selectedPart ? (
                        <>
                          <div className={outlineFixedClassName}>
                            <button
                              type="button"
                              className="manuscript-card-outline-back"
                              onClick={() => {
                                preparePanelHeightAnimation(volume.volumeId);
                                setOutlineScrolled(volume.volumeId, 0);
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
                          <div
                            className="cover-flow-card-panel-scroll manuscript-card-outline-chapters"
                            onScroll={(event) =>
                              handleOutlineScroll(volume.volumeId, event)
                            }
                          >
                            <ManuscriptCardOutlineRow
                              className="manuscript-card-outline-part-overview"
                              href={selectedPart.href}
                              label="Overview"
                              meta={{
                                status: sectionGroupProgressStatus(
                                  progress,
                                  sectionsForIds(selectedPart.sectionIds),
                                ),
                                wordCount: selectedPart.wordCount,
                              }}
                            />
                            {selectedPart.chapters.map((chapter) => (
                              <ManuscriptCardOutlineRow
                                key={chapter.href}
                                href={chapter.href}
                                label={chapter.title}
                                meta={{
                                  status: sectionGroupProgressStatus(
                                    progress,
                                    sectionsForIds(chapter.sectionIds),
                                  ),
                                  wordCount: chapter.wordCount,
                                }}
                              />
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={outlineFixedClassName}>
                            <Link
                              className="manuscript-card-outline-full"
                              href={volume.firstSectionHref}
                            >
                              <ManuscriptCardOutlineRowContent
                                icon="double"
                                label="Read Full Manuscript"
                                meta={{
                                  status: volumeStatus,
                                  wordCount: volume.wordCount,
                                }}
                              />
                            </Link>
                          </div>
                          <div
                            className="cover-flow-card-panel-scroll manuscript-card-outline-parts"
                            onScroll={(event) =>
                              handleOutlineScroll(volume.volumeId, event)
                            }
                          >
                            {volume.parts.map((part) => (
                              <ManuscriptCardOutlineRow
                                key={part.href}
                                onClick={() => {
                                  if (!active) return;
                                  preparePanelHeightAnimation(volume.volumeId);
                                  setOutlineScrolled(volume.volumeId, 0);
                                  setSelectedPartByVolumeId((current) => ({
                                    ...current,
                                    [volume.volumeId]: part.partId,
                                  }));
                                }}
                                label={displayPartTitle(part, volume)}
                                meta={{
                                  status: sectionGroupProgressStatus(
                                    progress,
                                    sectionsForIds(part.sectionIds),
                                  ),
                                  wordCount: part.wordCount,
                                }}
                              />
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
