"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
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
  | "parts"
  | "subtitle"
  | "title"
  | "volumeId"
  | "wordCount"
>;

type CoverFlowStyle = CSSProperties & {
  "--cover-flow-opacity": number;
  "--cover-flow-rotate": string;
  "--cover-flow-scale": number;
  "--cover-flow-x": string;
  "--cover-flow-y": string;
  "--cover-flow-z": string;
};

type ManuscriptCoverFlowIslandProps = {
  volumes: CoverFlowVolume[];
};

const visibleRadius = 4;
const dragThreshold = 42;

export function ManuscriptCoverFlowIsland({
  volumes,
}: ManuscriptCoverFlowIslandProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.floor(volumes.length / 2),
  );
  const dragStartXRef = useRef<number | null>(null);

  const activeVolume = volumes[activeIndex] ?? volumes[0];

  const selectPrevious = useCallback(() => {
    setActiveIndex((current) => Math.max(0, current - 1));
  }, []);

  const selectNext = useCallback(() => {
    setActiveIndex((current) => Math.min(volumes.length - 1, current + 1));
  }, [volumes.length]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectPrevious();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectNext();
      }
    },
    [selectNext, selectPrevious],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      dragStartXRef.current = event.clientX;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragStartX = dragStartXRef.current;
      dragStartXRef.current = null;

      if (dragStartX === null) return;

      const deltaX = event.clientX - dragStartX;
      if (Math.abs(deltaX) < dragThreshold) return;

      if (deltaX > 0) {
        selectPrevious();
      } else {
        selectNext();
      }
    },
    [selectNext, selectPrevious],
  );

  const volumeStyles = useMemo(
    () =>
      volumes.map((volume, index) => {
        const offset = index - activeIndex;
        const distance = Math.abs(offset);
        const boundedDistance = Math.min(distance, visibleRadius);
        const direction = Math.sign(offset);
        const x =
          offset === 0
            ? "0px"
            : `calc(${direction} * (clamp(7.2rem, 15vw, 12.4rem) + ${
                boundedDistance - 1
              } * clamp(3.4rem, 5.8vw, 5.2rem)))`;
        const style: CoverFlowStyle = {
          "--cover-flow-opacity":
            distance > visibleRadius ? 0 : Math.max(0.28, 1 - distance * 0.16),
          "--cover-flow-rotate": offset === 0 ? "0deg" : `${direction * -64}deg`,
          "--cover-flow-scale": Number((1 - boundedDistance * 0.075).toFixed(3)),
          "--cover-flow-x": x,
          "--cover-flow-y": offset === 0 ? "0px" : `${boundedDistance * 0.32}rem`,
          "--cover-flow-z": `${boundedDistance * -8.5}rem`,
          zIndex: volumes.length - boundedDistance,
        };

        return {
          distance,
          offset,
          style,
          volume,
        };
      }),
    [activeIndex, volumes],
  );

  if (volumes.length === 0 || !activeVolume) {
    return null;
  }

  return (
    <section
      className="cover-flow"
      aria-label="Published manuscripts"
      onKeyDown={handleKeyDown}
    >
      <div className="cover-flow-toolbar" aria-label="Cover flow controls">
        <button
          type="button"
          className="cover-flow-button"
          onClick={selectPrevious}
          aria-label="Previous manuscript"
          disabled={activeIndex === 0}
        >
          <ChevronLeft aria-hidden="true" size={20} strokeWidth={1.7} />
        </button>
        <div className="cover-flow-caption" aria-live="polite">
          <span>Volume {activeVolume.numberLabel}</span>
          <strong>{activeVolume.title}</strong>
          <small>
            {activeVolume.wordCount.toLocaleString()} words,{" "}
            {activeVolume.parts.length.toLocaleString()} parts
          </small>
        </div>
        <button
          type="button"
          className="cover-flow-button"
          onClick={selectNext}
          aria-label="Next manuscript"
          disabled={activeIndex === volumes.length - 1}
        >
          <ChevronRight aria-hidden="true" size={20} strokeWidth={1.7} />
        </button>
      </div>

      <div
        className="cover-flow-viewport"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div className="cover-flow-stage">
          {volumeStyles.map(({ distance, offset, style, volume }, index) => (
            <Link
              key={volume.volumeId}
              href={volume.href}
              className={`cover-flow-card manuscript-cover-card-${index + 1}${
                offset === 0 ? " is-active" : ""
              }${distance > visibleRadius ? " is-outside-range" : ""}`}
              style={style}
              aria-label={`Open ${volume.title}`}
              aria-current={offset === 0 ? "true" : undefined}
              tabIndex={distance > 1 ? -1 : 0}
              onClick={(event) => {
                if (offset === 0) return;
                event.preventDefault();
                setActiveIndex(index);
              }}
            >
              <span className="cover-flow-image-frame">
                <Image
                  src={volume.coverImage}
                  alt={volume.coverAlt}
                  width={512}
                  height={768}
                  sizes="(max-width: 720px) 54vw, (max-width: 1100px) 32vw, 320px"
                  priority={index === activeIndex}
                />
              </span>
              <span
                className="cover-flow-reflection"
                aria-hidden="true"
                style={{ backgroundImage: `url(${volume.coverImage})` }}
              />
              <span className="sr-only">
                Volume {volume.numberLabel}. {volume.subtitle}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="cover-flow-dots" aria-label="Choose a manuscript">
        {volumes.map((volume, index) => (
          <button
            key={volume.volumeId}
            type="button"
            className="cover-flow-dot"
            aria-label={`Show ${volume.title}`}
            aria-current={index === activeIndex ? "true" : undefined}
            onClick={() => setActiveIndex(index)}
          />
        ))}
      </div>
    </section>
  );
}
