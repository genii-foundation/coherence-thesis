"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Volume } from "@/lib/manuscript-data";

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

const manuscriptTags: Record<string, string[]> = {
  "humanitys-most-viable-future": ["Post-extractive civilization", "Social substrate"],
  "wielding-intelligence": ["Humane technology", "AI coordination"],
  "providence-imperative": ["Coordination infrastructure", "Civilizational design"],
  "architecting-providence": ["Systems architecture", "Coherent governance"],
  purposeful: ["Builder discovery", "Human purpose"],
  "smallest-nest": ["Planetary containment", "Living scale"],
  "presencing-genius": ["Presence praxis", "Collective genius"],
  "misanthropic-artifice": ["Academic critique", "Saturnine inquiry"],
  "cardinal-scale": ["Iconic patterning", "Cardinal orientation"],
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
  const frameRef = useRef<number | null>(null);

  const updateCardPositions = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const center = scrollerRect.left + scrollerRect.width / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const offset = (cardCenter - center) / rect.width;
      const distance = Math.abs(offset);
      const clampedOffset = Math.max(-2.6, Math.min(2.6, offset));
      const rotate = Math.max(-58, Math.min(58, clampedOffset * -38));
      const scale = Math.max(0.84, 1 - distance * 0.075);
      const z = Math.max(-160, distance * -74);
      const opacity = Math.max(0.44, 1 - distance * 0.18);

      card.style.setProperty("--cover-flow-rotate", `${rotate}deg`);
      card.style.setProperty("--cover-flow-scale", scale.toFixed(3));
      card.style.setProperty("--cover-flow-z", `${z}px`);
      card.style.setProperty("--cover-flow-opacity", opacity.toFixed(3));
      card.style.setProperty("--cover-flow-panel-opacity", distance < 0.58 ? "1" : "0.62");

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveIndex((current) => (current === closestIndex ? current : closestIndex));
  }, []);

  const schedulePositionUpdate = useCallback(() => {
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateCardPositions();
    });
  }, [updateCardPositions]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(volumes.length - 1, index));
      cardRefs.current[nextIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    },
    [volumes.length],
  );

  useLayoutEffect(() => {
    updateCardPositions();
  }, [updateCardPositions]);

  useEffect(() => {
    window.addEventListener("resize", schedulePositionUpdate);

    return () => {
      window.removeEventListener("resize", schedulePositionUpdate);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [schedulePositionUpdate]);

  if (volumes.length === 0) {
    return null;
  }

  return (
    <section
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
            const chapterCount = volume.parts.reduce(
              (total, part) => total + part.chapters.length,
              0,
            );
            const tags = manuscriptTags[volume.volumeId] ?? [volume.planet];
            const active = index === activeIndex;

            return (
              <Link
                key={volume.volumeId}
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
                  <strong>{volume.title}</strong>
                  <span className="manuscript-card-description">
                    {volume.subtitle}
                  </span>
                  <span className="manuscript-card-stats">
                    <span>{volume.wordCount.toLocaleString()} words</span>
                    <span>{volume.parts.length.toLocaleString()} parts</span>
                    <span>{chapterCount.toLocaleString()} chapters</span>
                  </span>
                  <span className="manuscript-card-tags">
                    <span>{volume.planet}</span>
                    {tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </span>
                </span>
              </Link>
            );
          })}
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
