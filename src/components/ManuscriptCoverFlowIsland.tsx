"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
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
  advanceCoverFlowScroll,
  getCoverFlowLayers,
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
const COVER_FLOW_TOUCH_AXIS_THRESHOLD = 6;

type CoverFlowLayoutMetrics = {
  firstCardCenter: number;
  maxScrollLeft: number;
  scrollStepWidth: number;
  viewportWidth: number;
};

type CoverFlowTouchGesture = {
  axis: "pending" | "horizontal" | "vertical";
  identifier: number;
  previousScrollSnapType: string;
  startScrollLeft: number;
  startX: number;
  startY: number;
};

function setStylePropertyIfChanged(
  style: CSSStyleDeclaration,
  property: string,
  value: string,
) {
  if (style.getPropertyValue(property) === value) return;
  style.setProperty(property, value);
}

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
  const cardShellRefs = useRef<Array<HTMLDivElement | null>>([]);
  const layoutMetricsRef = useRef<CoverFlowLayoutMetrics | null>(null);
  const panelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const snapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const targetScrollLeftRef = useRef(0);
  const touchGestureRef = useRef<CoverFlowTouchGesture | null>(null);
  const visualScrollLeftRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const panelHeightFrameRef = useRef<number | null>(null);
  const pendingPanelHeightAnimationsRef = useRef(new Set<string>());

  const initialLayers = useMemo(
    () => getCoverFlowLayers(volumes.map((_, index) => index)),
    [volumes],
  );

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

  const measureCoverFlowLayout = useCallback(() => {
    const scroller = scrollRef.current;
    const firstSnap = snapRefs.current[0];
    if (!scroller || !firstSnap) return null;

    const scrollStepWidth = firstSnap.offsetWidth;
    if (scrollStepWidth <= 0) return null;

    const metrics = {
      firstCardCenter: firstSnap.offsetLeft + scrollStepWidth / 2,
      maxScrollLeft: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
      scrollStepWidth,
      viewportWidth: scroller.clientWidth,
    };
    layoutMetricsRef.current = metrics;
    return metrics;
  }, []);

  const updateCardPositions = useCallback(
    (visualScrollLeft?: number) => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const metrics = layoutMetricsRef.current ?? measureCoverFlowLayout();
      if (!metrics) return;

      const scrollLeft =
        visualScrollLeft ?? visualScrollLeftRef.current ?? scroller.scrollLeft;
      visualScrollLeftRef.current = scrollLeft;
      const center = scrollLeft + metrics.viewportWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      const positionedCards = cardRefs.current.flatMap((card, index) => {
        const shell = cardShellRefs.current[index];
        const snap = snapRefs.current[index];
        if (!card || !shell || !snap) return [];

        const cardCenter =
          metrics.firstCardCenter + index * metrics.scrollStepWidth;
        const offset = (cardCenter - center) / metrics.scrollStepWidth;
        const distance = Math.abs(offset);
        const transform = getCoverFlowTransform(offset);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }

        return [{ card, index, offset, shell, transform }];
      });
      const layers = getCoverFlowLayers(
        positionedCards.map(({ index }) => index - closestIndex),
      );

      positionedCards.forEach(({ card, index, shell, transform }, rank) => {
        // Shadows and wash require painting in WebKit. Update them only when the
        // closest card changes so fractional scrolling remains transform driven.
        const restingTransform = getCoverFlowTransform(index - closestIndex);

        setStylePropertyIfChanged(
          shell.style,
          "--cover-flow-shift",
          `${transform.visualX.toFixed(3)}px`,
        );
        if (card.style.getPropertyValue("--cover-flow-shift")) {
          card.style.removeProperty("--cover-flow-shift");
        }
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-rotate",
          `${transform.rotate}deg`,
        );
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-scale",
          transform.scale.toFixed(3),
        );
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-z",
          `${transform.z}px`,
        );
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-cover-wash-opacity",
          restingTransform.coverWashOpacity.toFixed(3),
        );
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-cover-shadow-strength",
          restingTransform.coverShadowStrength.toFixed(3),
        );
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-panel-opacity",
          String(restingTransform.panelOpacity),
        );
        setStylePropertyIfChanged(
          card.style,
          "--cover-flow-panel-visibility",
          restingTransform.panelVisibility,
        );
        if (card.style.zIndex) {
          card.style.removeProperty("z-index");
        }
        const layer = String(layers[rank]);
        setStylePropertyIfChanged(shell.style, "--cover-flow-layer", layer);
      });

      if (scrollLeft <= 2) {
        closestIndex = 0;
      } else if (metrics.maxScrollLeft - scrollLeft <= 2) {
        closestIndex = Math.max(volumes.length - 1, 0);
      }

      if (activeIndexRef.current !== closestIndex) {
        activeIndexRef.current = closestIndex;
        setActiveIndex(closestIndex);
      }
      scroller.dataset.coverFlowTargetScroll =
        targetScrollLeftRef.current.toFixed(3);
      scroller.dataset.coverFlowVisualScroll = scrollLeft.toFixed(3);
    },
    [measureCoverFlowLayout, volumes.length],
  );

  const schedulePositionUpdate = useCallback(() => {
    const initialScroller = scrollRef.current;
    if (!initialScroller) return;

    targetScrollLeftRef.current = initialScroller.scrollLeft;
    if (frameRef.current !== null) return;

    lastFrameTimeRef.current = performance.now();

    function advanceVisualPosition(timestamp: number) {
      const scroller = scrollRef.current;
      if (!scroller) {
        frameRef.current = null;
        lastFrameTimeRef.current = null;
        return;
      }

      const target = targetScrollLeftRef.current;
      const current = visualScrollLeftRef.current ?? target;
      const previousTimestamp =
        lastFrameTimeRef.current ?? timestamp - 1000 / 60;
      const motionDisabled =
        document.documentElement.dataset.readerAnimations === "none" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const next = advanceCoverFlowScroll(
        current,
        target,
        timestamp - previousTimestamp,
        motionDisabled,
      );

      lastFrameTimeRef.current = timestamp;
      updateCardPositions(next);

      if (next === target) {
        frameRef.current = null;
        lastFrameTimeRef.current = null;
        return;
      }

      frameRef.current = window.requestAnimationFrame(advanceVisualPosition);
    }

    frameRef.current = window.requestAnimationFrame(advanceVisualPosition);
  }, [updateCardPositions]);

  const syncPositionToScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastFrameTimeRef.current = null;
    targetScrollLeftRef.current = scroller.scrollLeft;
    visualScrollLeftRef.current = scroller.scrollLeft;
    updateCardPositions(scroller.scrollLeft);
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
    (index: number, behavior: ScrollBehavior = "auto") => {
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

  const coverIndexAtPoint = useCallback((clientX: number, clientY: number) => {
    const candidates = cardRefs.current.flatMap((card, index) => {
      if (!card) return [];

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
  }, []);

  const handleScrollSurfaceClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const eventTarget = event.target as HTMLElement | null;
      if (eventTarget?.closest("a, button, .cover-flow-card-panel")) return;

      const targetIndex = coverIndexAtPoint(event.clientX, event.clientY);
      if (targetIndex === null) return;

      event.preventDefault();
      event.stopPropagation();
      if (targetIndex === activeIndex) {
        window.location.href = volumes[targetIndex]!.firstSectionHref;
        return;
      }
      scrollToIndex(targetIndex);
    },
    [activeIndex, coverIndexAtPoint, scrollToIndex, volumes],
  );

  const handleCoverSurfaceMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const eventTarget = event.target as HTMLElement | null;
      if (eventTarget?.closest(".cover-flow-card-panel")) return;

      const targetIndex = coverIndexAtPoint(event.clientX, event.clientY);
      const nextVolumeId =
        targetIndex === activeIndex
          ? (volumes[targetIndex]?.volumeId ?? null)
          : null;
      setReadCueVolumeId((current) =>
        current === nextVolumeId ? current : nextVolumeId,
      );
    },
    [activeIndex, coverIndexAtPoint, volumes],
  );

  const handleCoverFlowWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const scroller = scrollRef.current;
      const target = event.target;
      if (!scroller || (target instanceof Node && scroller.contains(target))) {
        return;
      }

      const deltaScale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientWidth
            : 1;
      const deltaX = event.deltaX * deltaScale;
      const deltaY = event.deltaY * deltaScale;
      if (Math.abs(deltaX) < 0.5 || Math.abs(deltaX) <= Math.abs(deltaY)) {
        return;
      }

      const maxScrollLeft = Math.max(
        0,
        scroller.scrollWidth - scroller.clientWidth,
      );
      const nextScrollLeft = Math.max(
        0,
        Math.min(scroller.scrollLeft + deltaX, maxScrollLeft),
      );
      if (Math.abs(nextScrollLeft - scroller.scrollLeft) < 0.01) return;

      event.preventDefault();
      scroller.scrollLeft = nextScrollLeft;
    },
    [],
  );

  const handleCoverFlowTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const scroller = scrollRef.current;
      const target = event.target;
      const touch = event.touches.item(0);
      if (
        !scroller ||
        !touch ||
        (target instanceof Node && scroller.contains(target))
      ) {
        touchGestureRef.current = null;
        return;
      }

      touchGestureRef.current = {
        axis: "pending",
        identifier: touch.identifier,
        previousScrollSnapType: scroller.style.scrollSnapType,
        startScrollLeft: scroller.scrollLeft,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    },
    [],
  );

  const handleCoverFlowTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const gesture = touchGestureRef.current;
      const scroller = scrollRef.current;
      if (!gesture || !scroller) return;

      let touch: {
        clientX: number;
        clientY: number;
        identifier: number;
      } | null = null;
      for (let index = 0; index < event.touches.length; index += 1) {
        const candidate = event.touches.item(index);
        if (candidate?.identifier === gesture.identifier) {
          touch = candidate;
          break;
        }
      }
      if (!touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (gesture.axis === "pending") {
        if (
          Math.max(Math.abs(deltaX), Math.abs(deltaY)) <
          COVER_FLOW_TOUCH_AXIS_THRESHOLD
        ) {
          return;
        }

        gesture.axis =
          Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
        if (gesture.axis === "horizontal") {
          scroller.style.scrollSnapType = "none";
        }
      }
      if (gesture.axis !== "horizontal") return;

      event.preventDefault();
      const maxScrollLeft = Math.max(
        0,
        scroller.scrollWidth - scroller.clientWidth,
      );
      scroller.scrollLeft = Math.max(
        0,
        Math.min(gesture.startScrollLeft - deltaX, maxScrollLeft),
      );
      schedulePositionUpdate();
    },
    [schedulePositionUpdate],
  );

  const finishCoverFlowTouch = useCallback(() => {
    const gesture = touchGestureRef.current;
    const scroller = scrollRef.current;
    touchGestureRef.current = null;
    if (!gesture || !scroller || gesture.axis !== "horizontal") return;

    scroller.style.scrollSnapType = gesture.previousScrollSnapType;
    const metrics = layoutMetricsRef.current ?? measureCoverFlowLayout();
    if (!metrics) return;
    const centeredIndex = Math.round(
      (scroller.scrollLeft +
        metrics.viewportWidth / 2 -
        metrics.firstCardCenter) /
        metrics.scrollStepWidth,
    );
    scrollToIndex(centeredIndex);
  }, [measureCoverFlowLayout, scrollToIndex]);

  useLayoutEffect(() => {
    layoutMetricsRef.current = null;
    syncPositionToScroll();
  }, [syncPositionToScroll]);

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
    const handleResize = () => {
      const scroller = scrollRef.current;
      const metrics = layoutMetricsRef.current;
      if (
        scroller &&
        metrics &&
        Math.abs(metrics.viewportWidth - scroller.clientWidth) < 0.5
      ) {
        return;
      }
      layoutMetricsRef.current = null;
      syncPositionToScroll();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (panelHeightFrameRef.current !== null) {
        window.cancelAnimationFrame(panelHeightFrameRef.current);
      }
    };
  }, [syncPositionToScroll]);

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
        className="cover-flow-viewport"
        onClickCapture={handleScrollSurfaceClick}
        onMouseLeave={() => setReadCueVolumeId(null)}
        onMouseMove={handleCoverSurfaceMouseMove}
        onTouchCancel={finishCoverFlowTouch}
        onTouchEnd={finishCoverFlowTouch}
        onTouchMove={handleCoverFlowTouchMove}
        onTouchStart={handleCoverFlowTouchStart}
        onWheel={handleCoverFlowWheel}
      >
        <div className="cover-flow-card-stage">
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
            const initialTransform = getCoverFlowTransform(index);
            const initialShellStyle = {
              "--cover-flow-initial-layer": initialLayers[index],
              "--cover-flow-initial-shift":
                `${initialTransform.visualX.toFixed(3)}px`,
            } as CSSProperties;
            const initialCardStyle = {
              "--cover-flow-initial-cover-shadow-strength":
                initialTransform.coverShadowStrength.toFixed(3),
              "--cover-flow-initial-cover-wash-opacity":
                initialTransform.coverWashOpacity.toFixed(3),
              "--cover-flow-initial-panel-opacity": String(
                initialTransform.panelOpacity,
              ),
              "--cover-flow-initial-panel-visibility":
                initialTransform.panelVisibility,
              "--cover-flow-initial-rotate": `${initialTransform.rotate}deg`,
              "--cover-flow-initial-scale": initialTransform.scale.toFixed(3),
              "--cover-flow-initial-z": `${initialTransform.z}px`,
            } as CSSProperties;

            return (
              <div
                key={volume.volumeId}
                ref={(shell) => {
                  cardShellRefs.current[index] = shell;
                }}
                className="cover-flow-card-shell"
                style={initialShellStyle}
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
                  style={initialCardStyle}
                  onClick={(event) => {
                    const target = event.target as HTMLElement | null;
                    if (
                      target?.closest("a, button") ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) {
                      return;
                    }
                    if (active) {
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
                      if (
                        active ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      ) {
                        return;
                      }
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
        </div>
        <div
          ref={scrollRef}
          className="cover-flow-scroll"
          onScroll={schedulePositionUpdate}
        >
          <div className="cover-flow-track" aria-hidden="true">
            {volumes.map((volume, index) => (
              <div
                key={`${volume.volumeId}-snap`}
                ref={(snap) => {
                  snapRefs.current[index] = snap;
                }}
                className="cover-flow-snap"
              />
            ))}
            <span className="cover-flow-scroll-spacer" />
          </div>
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
