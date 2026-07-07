"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { WheelEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  coverFlowTuning,
  getCoverFlowFlickTarget,
  getCoverFlowTransform,
} from "@/lib/cover-flow-motion";
import type { Volume } from "@/lib/manuscript-data";
import { formatReadingDurationForWords } from "@/lib/reading-time";

type CoverFlowVolume = Pick<
  Volume,
  | "coverAlt"
  | "coverImage"
  | "href"
  | "numberLabel"
  | "order"
  | "parts"
  | "planet"
  | "subtitle"
  | "title"
  | "volumeId"
  | "wordCount"
>;

type ManuscriptCoverFlowIslandProps = {
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
  volumes,
}: ManuscriptCoverFlowIslandProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.min(initialIndex, Math.max(volumes.length - 1, 0)),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const snapRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const frameRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const wheelGestureRef = useRef<WheelGesture>({
    distancePx: 0,
    peakDeltaPx: 0,
    timeoutId: null,
  });

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
    (event: WheelEvent<HTMLDivElement>) => {
      const horizontalDelta =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) || event.shiftKey
          ? event.deltaX || event.deltaY
          : 0;

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
    [scrollToIndex, volumes.length],
  );

  useLayoutEffect(() => {
    updateCardPositions();
  }, [updateCardPositions]);

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
        onWheel={handleWheel}
      >
        <div className="cover-flow-track">
          {volumes.map((volume, index) => {
            const tags = manuscriptTags[volume.volumeId] ?? [volume.planet];
            const planetSymbol = planetSymbols[volume.planet] ?? "";
            const active = index === activeIndex;

            return (
              <span
                key={volume.volumeId}
                ref={(snap) => {
                  snapRefs.current[index] = snap;
                }}
                className="cover-flow-card-shell"
              >
                <Link
                  ref={(card) => {
                    cardRefs.current[index] = card;
                  }}
                  href={volume.href}
                  className={`cover-flow-card manuscript-cover-card-${volume.order}${
                    active ? " is-active" : ""
                  }`}
                  aria-label={`Open ${volume.title}`}
                  aria-current={active ? "true" : undefined}
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
                  <span className="cover-flow-card-panel">
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
                  </span>
                </Link>
              </span>
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
