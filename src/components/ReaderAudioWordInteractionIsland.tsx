"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Volume2 } from "lucide-react";

type WordTarget = {
  id: string;
  sectionId: string;
  charIndex: number;
  rect: DOMRect;
};

type TooltipState = WordTarget & {
  focused: boolean;
};

type AudioProgressEventDetail = {
  sectionId: string;
  charIndex?: number;
};

export type AudioStartFromWordEventDetail = {
  sectionId: string;
  charIndex: number;
  wordId: string;
};

const progressEventName = "coherence:audio-progress";
const startFromWordEventName = "coherence:audio-start-word";

function closestAudioWord(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-audio-word='true']")
    : null;
}

function wordTargetFromElement(element: HTMLElement): WordTarget | null {
  const sectionId = element.dataset.audioSectionId;
  const charIndex = Number.parseInt(element.dataset.audioCharStart ?? "", 10);
  const id = element.dataset.audioWordId;
  if (!sectionId || !id || !Number.isFinite(charIndex)) return null;
  return { id, sectionId, charIndex, rect: element.getBoundingClientRect() };
}

function positionFor(rect: DOMRect): CSSProperties {
  return {
    left: `${rect.left + rect.width / 2}px`,
    top: `${Math.max(10, rect.top - 4)}px`,
  };
}

function visibleRectForWordId(wordId: string): DOMRect | null {
  const word = document.getElementById(wordId);
  if (!word) return null;
  const rect = word.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.bottom < 0 ||
    rect.top > window.innerHeight
  ) {
    return null;
  }
  return rect;
}

function queryWords(sectionId: string): HTMLElement[] {
  if (!("CSS" in window) || typeof CSS.escape !== "function") return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-audio-word='true'][data-audio-section-id='${CSS.escape(sectionId)}']`,
    ),
  );
}

function wordForCharIndex(sectionId: string, charIndex: number): HTMLElement | null {
  const words = queryWords(sectionId);
  if (words.length === 0) return null;
  return (
    words.find((word) => {
      const start = Number.parseInt(word.dataset.audioCharStart ?? "", 10);
      const end = Number.parseInt(word.dataset.audioCharEnd ?? "", 10);
      return Number.isFinite(start) && Number.isFinite(end) && charIndex >= start && charIndex <= end;
    }) ?? words.find((word) => {
      const start = Number.parseInt(word.dataset.audioCharStart ?? "", 10);
      return Number.isFinite(start) && start >= charIndex;
    }) ?? words[words.length - 1] ?? null
  );
}

export function dispatchAudioStartFromWord(detail: AudioStartFromWordEventDetail): void {
  window.dispatchEvent(new CustomEvent<AudioStartFromWordEventDetail>(startFromWordEventName, { detail }));
}

export function ReaderAudioWordInteractionIsland({
  sectionId,
}: {
  sectionId: string;
}) {
  const [hovered, setHovered] = useState<WordTarget | null>(null);
  const [focused, setFocused] = useState<WordTarget | null>(null);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [activeRect, setActiveRect] = useState<DOMRect | null>(null);

  const tooltip = useMemo<TooltipState | null>(() => {
    const target = focused ?? hovered;
    if (!target) return null;
    return { ...target, focused: Boolean(focused && focused.id === target.id) };
  }, [focused, hovered]);

  const startPlayback = useCallback((target: WordTarget) => {
    dispatchAudioStartFromWord({
      sectionId: target.sectionId,
      charIndex: target.charIndex,
      wordId: target.id,
    });
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const word = closestAudioWord(event.target);
      if (!word || word.dataset.audioSectionId !== sectionId) {
        setHovered(null);
        return;
      }
      const target = wordTargetFromElement(word);
      if (target) setHovered(target);
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".audio-word-tooltip")
      ) {
        return;
      }
      const word = closestAudioWord(event.target);
      if (!word || word.dataset.audioSectionId !== sectionId) {
        setFocused(null);
        setHovered(null);
        return;
      }
      const target = wordTargetFromElement(word);
      if (!target) return;
      event.preventDefault();
      setFocused(target);
      if (focused?.id === target.id) startPlayback(target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocused(null);
        setHovered(null);
      }
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [focused?.id, sectionId, startPlayback]);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<AudioProgressEventDetail>).detail;
      if (detail.sectionId !== sectionId || typeof detail.charIndex !== "number") {
        return;
      }
      const word = wordForCharIndex(detail.sectionId, detail.charIndex);
      if (!word) return;
      document
        .querySelectorAll(".audio-word.is-audio-current")
        .forEach((element) => element.classList.remove("is-audio-current"));
      word.classList.add("is-audio-current");
      setActiveWordId(word.dataset.audioWordId ?? null);
      setActiveRect(
        word.dataset.audioWordId
          ? visibleRectForWordId(word.dataset.audioWordId)
          : null,
      );
    };
    window.addEventListener(progressEventName, onProgress);
    return () => {
      window.removeEventListener(progressEventName, onProgress);
    };
  }, [sectionId]);

  useEffect(() => {
    if (!activeWordId) return;
    let frame = 0;
    const updateActiveRect = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setActiveRect(visibleRectForWordId(activeWordId));
      });
    };
    updateActiveRect();
    window.addEventListener("scroll", updateActiveRect, { passive: true });
    window.addEventListener("resize", updateActiveRect);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveRect);
      window.removeEventListener("resize", updateActiveRect);
    };
  }, [activeWordId]);

  useEffect(() => {
    document
      .querySelectorAll(".audio-word.is-audio-focused")
      .forEach((element) => element.classList.remove("is-audio-focused"));
    if (!focused) return;
    document.getElementById(focused.id)?.classList.add("is-audio-focused");
  }, [focused]);

  const overlay = (
    <>
      {tooltip ? (
        <button
          type="button"
          className={`audio-word-tooltip tooltip-surface${tooltip.focused ? " is-focused" : ""}`}
          style={positionFor(tooltip.rect)}
          onClick={() => startPlayback(tooltip)}
        >
          {tooltip.focused
            ? "Click Again to start playback"
            : "Click Here to Play"}
        </button>
      ) : null}
      {activeRect && activeWordId ? (
        <span
          className="audio-current-speaker"
          style={{
            left: `${activeRect.left - 18}px`,
            top: `${activeRect.top + activeRect.height / 2}px`,
          }}
          aria-hidden="true"
        >
          <Volume2 size={13} />
        </span>
      ) : null}
    </>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(overlay, document.body);
}
