"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Volume2 } from "lucide-react";
import {
  audioStartFromWordEventName,
  type AudioStartFromWordEventDetail,
  type AudioWordPlaybackIdentity,
} from "@/lib/audio-events";
import { selectionIsActive } from "@/lib/reader-selection";

type WordTarget = Readonly<{
  charEnd: number;
  charIndex: number;
  element: HTMLElement;
  id: string;
  sectionId: string;
}>;

type TooltipState = Readonly<{
  focused: boolean;
  target: WordTarget;
}>;

type AudioProgressEventDetail = {
  sectionId: string;
  charIndex?: number;
};

export type ReaderAudioWordInteractionSection = Readonly<{
  queueIdentity?: AudioWordPlaybackIdentity;
  sectionId: string;
}>;

type CachedSectionWords = Readonly<{
  maximumCharEnds: readonly number[];
  words: readonly WordTarget[];
}>;

type AudioWordBinding = Readonly<{
  queueIdentityBySection: ReadonlyMap<
    string,
    AudioWordPlaybackIdentity | undefined
  >;
  targetByElement: WeakMap<HTMLElement, WordTarget>;
  wordsBySection: ReadonlyMap<string, CachedSectionWords>;
}>;

const audioWordSelector = "[data-audio-word='true']";
const progressEventName = "coherence:audio-progress";

function closestAudioWord(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>(audioWordSelector)
    : null;
}

function sectionIdentityMap(
  sections: readonly ReaderAudioWordInteractionSection[],
): ReadonlyMap<string, AudioWordPlaybackIdentity | undefined> | null {
  if (sections.length === 0) return null;
  const identities = new Map<
    string,
    AudioWordPlaybackIdentity | undefined
  >();
  for (const section of sections) {
    if (
      typeof section.sectionId !== "string" ||
      section.sectionId.length === 0 ||
      identities.has(section.sectionId)
    ) return null;
    identities.set(section.sectionId, section.queueIdentity);
  }
  return identities;
}

function createAudioWordBinding(
  queueIdentityBySection: ReadonlyMap<
    string,
    AudioWordPlaybackIdentity | undefined
  >,
): AudioWordBinding {
  const targetByElement = new WeakMap<HTMLElement, WordTarget>();
  const mutableWordsBySection = new Map<string, WordTarget[]>();
  for (const sectionId of queueIdentityBySection.keys()) {
    mutableWordsBySection.set(sectionId, []);
  }

  for (const element of document.querySelectorAll<HTMLElement>(
    audioWordSelector,
  )) {
    const sectionId = element.dataset.audioSectionId;
    const id = element.dataset.audioWordId;
    const charIndex = Number.parseInt(
      element.dataset.audioCharStart ?? "",
      10,
    );
    const charEnd = Number.parseInt(
      element.dataset.audioCharEnd ?? "",
      10,
    );
    if (
      !sectionId ||
      !queueIdentityBySection.has(sectionId) ||
      !id ||
      !Number.isSafeInteger(charIndex) ||
      charIndex < 0 ||
      !Number.isSafeInteger(charEnd) ||
      charEnd < charIndex
    ) continue;
    const target = Object.freeze({
      charEnd,
      charIndex,
      element,
      id,
      sectionId,
    });
    targetByElement.set(element, target);
    mutableWordsBySection.get(sectionId)!.push(target);
  }

  const wordsBySection = new Map<string, CachedSectionWords>();
  for (const [sectionId, words] of mutableWordsBySection) {
    words.sort((left, right) =>
      left.charIndex - right.charIndex || left.charEnd - right.charEnd
    );
    let maximumCharEnd = Number.NEGATIVE_INFINITY;
    const maximumCharEnds = words.map(({ charEnd }) => {
      maximumCharEnd = Math.max(maximumCharEnd, charEnd);
      return maximumCharEnd;
    });
    wordsBySection.set(sectionId, Object.freeze({
      maximumCharEnds: Object.freeze(maximumCharEnds),
      words: Object.freeze(words),
    }));
  }
  return Object.freeze({
    queueIdentityBySection,
    targetByElement,
    wordsBySection,
  });
}

function wordForCharIndex(
  cache: CachedSectionWords,
  charIndex: number,
): WordTarget | null {
  const { maximumCharEnds, words } = cache;
  if (words.length === 0) return null;
  if (Number.isNaN(charIndex)) return words[words.length - 1] ?? null;

  let low = 0;
  let high = words.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (maximumCharEnds[middle]! >= charIndex) high = middle;
    else low = middle + 1;
  }
  return words[low] ?? words[words.length - 1] ?? null;
}

export function dispatchAudioStartFromWord(
  detail: AudioStartFromWordEventDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<AudioStartFromWordEventDetail>(
      audioStartFromWordEventName,
      { detail },
    ),
  );
}

export function ReaderAudioWordInteractionHostIsland({
  sections,
}: {
  sections: readonly ReaderAudioWordInteractionSection[];
}) {
  const queueIdentityBySection = useMemo(
    () => sectionIdentityMap(sections),
    [sections],
  );
  const bindingRef = useRef<AudioWordBinding | null>(null);
  const focusedRef = useRef<WordTarget | null>(null);
  const hoveredRef = useRef<WordTarget | null>(null);
  const ownedCurrentClassRef = useRef<HTMLElement | null>(null);
  const ownedFocusedClassRef = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState<WordTarget | null>(null);
  const [focused, setFocused] = useState<WordTarget | null>(null);
  const [activeWord, setActiveWord] = useState<WordTarget | null>(null);
  const [tooltipPortalTarget, setTooltipPortalTarget] =
    useState<HTMLElement | null>(null);
  const [speakerPortalTarget, setSpeakerPortalTarget] =
    useState<HTMLElement | null>(null);

  const replaceHovered = useCallback((target: WordTarget | null) => {
    if (hoveredRef.current === target) return;
    hoveredRef.current = target;
    setHovered(target);
  }, []);

  const replaceFocused = useCallback((target: WordTarget | null) => {
    const owned = ownedFocusedClassRef.current;
    if (owned !== null && owned !== target?.element) {
      owned.classList.remove("is-audio-focused");
      ownedFocusedClassRef.current = null;
    }
    if (
      target !== null &&
      ownedFocusedClassRef.current !== target.element &&
      !target.element.classList.contains("is-audio-focused")
    ) {
      target.element.classList.add("is-audio-focused");
      ownedFocusedClassRef.current = target.element;
    }
    if (focusedRef.current === target) return;
    focusedRef.current = target;
    setFocused(target);
  }, []);

  const replaceActiveWord = useCallback((target: WordTarget | null) => {
    const owned = ownedCurrentClassRef.current;
    if (owned !== null && owned !== target?.element) {
      owned.classList.remove("is-audio-current");
      ownedCurrentClassRef.current = null;
    }
    if (
      target !== null &&
      ownedCurrentClassRef.current !== target.element &&
      !target.element.classList.contains("is-audio-current")
    ) {
      target.element.classList.add("is-audio-current");
      ownedCurrentClassRef.current = target.element;
    }
    setActiveWord((current) => current === target ? current : target);
  }, []);

  const startPlayback = useCallback((target: WordTarget) => {
    const binding = bindingRef.current;
    if (
      binding === null ||
      binding.targetByElement.get(target.element) !== target ||
      !binding.queueIdentityBySection.has(target.sectionId)
    ) return;
    const queueIdentity = binding.queueIdentityBySection.get(target.sectionId);
    dispatchAudioStartFromWord({
      sectionId: target.sectionId,
      charIndex: target.charIndex,
      ...(queueIdentity === undefined ? {} : { queueIdentity }),
      wordId: target.id,
    });
  }, []);

  useLayoutEffect(() => {
    bindingRef.current = null;
    replaceHovered(null);
    replaceFocused(null);
    // A new external DOM binding invalidates the prior interaction snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    replaceActiveWord(null);
    if (queueIdentityBySection === null) return;
    const binding = createAudioWordBinding(queueIdentityBySection);
    bindingRef.current = binding;
    return () => {
      if (bindingRef.current === binding) bindingRef.current = null;
      const current = ownedCurrentClassRef.current;
      if (current !== null) current.classList.remove("is-audio-current");
      ownedCurrentClassRef.current = null;
      const focusedElement = ownedFocusedClassRef.current;
      if (focusedElement !== null) {
        focusedElement.classList.remove("is-audio-focused");
      }
      ownedFocusedClassRef.current = null;
    };
  }, [
    queueIdentityBySection,
    replaceActiveWord,
    replaceFocused,
    replaceHovered,
  ]);

  const enabled = queueIdentityBySection !== null;
  useEffect(() => {
    if (!enabled) return;
    const onPointerMove = (event: PointerEvent) => {
      if (selectionIsActive()) {
        replaceHovered(null);
        return;
      }
      const word = closestAudioWord(event.target);
      const target = word === null
        ? null
        : bindingRef.current?.targetByElement.get(word) ?? null;
      if (target === null || word?.closest("a[href]")) {
        replaceHovered(null);
        return;
      }
      replaceHovered(target);
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".audio-word-tooltip")
      ) return;
      const word = closestAudioWord(event.target);
      const target = word === null
        ? null
        : bindingRef.current?.targetByElement.get(word) ?? null;
      if (target === null || word?.closest("a[href]")) {
        replaceFocused(null);
        replaceHovered(null);
        return;
      }
      event.preventDefault();
      const wasFocused = focusedRef.current === target;
      replaceFocused(target);
      if (wasFocused) startPlayback(target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      replaceFocused(null);
      replaceHovered(null);
    };
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<AudioProgressEventDetail>).detail;
      if (
        detail === null ||
        typeof detail !== "object" ||
        typeof detail.sectionId !== "string" ||
        typeof detail.charIndex !== "number"
      ) return;
      const cache = bindingRef.current?.wordsBySection.get(detail.sectionId);
      if (cache === undefined) return;
      const target = wordForCharIndex(cache, detail.charIndex);
      if (target !== null) replaceActiveWord(target);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(progressEventName, onProgress);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(progressEventName, onProgress);
    };
  }, [
    enabled,
    replaceActiveWord,
    replaceFocused,
    replaceHovered,
    startPlayback,
  ]);

  const tooltip = useMemo<TooltipState | null>(() => {
    const target = focused ?? hovered;
    if (!target) return null;
    return { focused: focused === target, target };
  }, [focused, hovered]);
  const tooltipElement = tooltip?.target.element ?? null;

  useEffect(() => {
    if (!tooltipElement) return;
    const portalTarget = document.createElement("span");
    portalTarget.className = "audio-word-tooltip-anchor";
    portalTarget.dataset.readerTransientUi = "true";
    tooltipElement.append(portalTarget);
    const frame = window.requestAnimationFrame(() => {
      setTooltipPortalTarget(portalTarget);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      portalTarget.remove();
    };
  }, [tooltipElement]);

  useEffect(() => {
    if (!activeWord) return;
    const portalTarget = document.createElement("span");
    portalTarget.className = "audio-current-speaker-anchor";
    portalTarget.dataset.readerTransientUi = "true";
    portalTarget.setAttribute("aria-hidden", "true");
    activeWord.element.append(portalTarget);
    const frame = window.requestAnimationFrame(() => {
      setSpeakerPortalTarget(portalTarget);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      portalTarget.remove();
    };
  }, [activeWord]);

  if (typeof document === "undefined") return null;

  return (
    <>
      {tooltip &&
      tooltipPortalTarget?.parentElement === tooltip.target.element
        ? createPortal(
            <button
              type="button"
              className={`audio-word-tooltip tooltip-surface${tooltip.focused ? " is-focused" : ""}`}
              onClick={() => startPlayback(tooltip.target)}
            >
              {tooltip.focused
                ? "Click Again to start playback"
                : "Click Here to Play"}
            </button>,
            tooltipPortalTarget,
          )
        : null}
      {activeWord &&
      speakerPortalTarget?.parentElement === activeWord.element
        ? createPortal(
            <span className="audio-current-speaker" aria-hidden="true">
              <Volume2 size={13} />
            </span>,
            speakerPortalTarget,
          )
        : null}
    </>
  );
}

export function ReaderAudioWordInteractionIsland({
  queueIdentity,
  sectionId,
}: ReaderAudioWordInteractionSection) {
  const sections = useMemo(
    () => [Object.freeze({ queueIdentity, sectionId })],
    [queueIdentity, sectionId],
  );
  return <ReaderAudioWordInteractionHostIsland sections={sections} />;
}
