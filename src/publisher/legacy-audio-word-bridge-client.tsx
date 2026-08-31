"use client";

import { useLayoutEffect, useState } from "react";
import { createReaderNarrationWordRanges } from "@genii-foundation/publisher-reader/narration";

import { ReaderAudioWordInteractionIsland } from "@/components/ReaderAudioWordInteractionIsland";
import { audioWordId } from "@/lib/audio-word-anchors";
import {
  COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION,
  coherencePublisherAudioWordRouteLimits,
  type CoherencePublisherAudioWordRouteModel,
  type CoherencePublisherAudioWordRouteSection,
} from "@/publisher/legacy-audio-word-bridge-contract";

const transitionRootSelector =
  "[data-coherence-publisher-transition-root='true']";
const publisherSectionSelector = "[data-publisher-section]";
const publisherNarrationWordSelector =
  "[data-publisher-narration-word='true']";
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const LEGACY_HASH = /^[0-9a-f]{16}$/u;
const STABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const audioAttributeNames = Object.freeze([
  "data-audio-word",
  "data-audio-word-id",
  "data-audio-section-id",
  "data-audio-char-start",
  "data-audio-char-end",
]);
const audioClassNames = Object.freeze([
  "audio-word",
  "is-audio-current",
  "is-audio-focused",
]);
const noActiveRouteSections = Object.freeze([]);

type PreparedAudioWord = Readonly<{
  element: HTMLElement;
  id: string;
  legacyCharEnd: number;
  legacyCharStart: number;
  sectionId: string;
}>;

type PreparedRouteSection = Readonly<{
  section: CoherencePublisherAudioWordRouteSection;
  words: readonly Readonly<{
    expectedText: string;
    legacyCharEnd: number;
    legacyCharStart: number;
  }>[];
}>;

function boundedInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximum;
}

function hasExactOwnKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.every((key): key is string => typeof key === "string") &&
    keys.sort().join("\u0000") ===
    [...expected].sort().join("\u0000");
}

function prepareRouteSection(
  section: CoherencePublisherAudioWordRouteSection,
): PreparedRouteSection | null {
  if (
    section === null ||
    typeof section !== "object" ||
    Array.isArray(section) ||
    !hasExactOwnKeys(section, [
      "bodyStartCharacter",
      "bodyWordCount",
      "profileText",
      "queueIdentity",
      "sectionId",
      "titleWordCount",
    ]) ||
    !STABLE_ID.test(section.sectionId) ||
    typeof section.profileText !== "string" ||
    section.profileText.length < 1 ||
    section.profileText.length > 32_768 ||
    !boundedInteger(section.titleWordCount, 100_000) ||
    !boundedInteger(section.bodyWordCount, 100_000) ||
    section.bodyWordCount < 1 ||
    !boundedInteger(
      section.bodyStartCharacter,
      section.profileText.length,
    ) ||
    section.bodyStartCharacter < 2 ||
    section.profileText.slice(
        section.bodyStartCharacter - 2,
        section.bodyStartCharacter,
      ) !== "\n\n" ||
    section.profileText.indexOf("\n\n") !==
      section.bodyStartCharacter - 2 ||
    section.profileText.slice(0, section.bodyStartCharacter - 2).trim() !==
      section.profileText.slice(0, section.bodyStartCharacter - 2) ||
    section.profileText.slice(section.bodyStartCharacter).trim() !==
      section.profileText.slice(section.bodyStartCharacter) ||
    section.queueIdentity === null ||
    typeof section.queueIdentity !== "object" ||
    Array.isArray(section.queueIdentity) ||
    !hasExactOwnKeys(section.queueIdentity, ["audioVersionId", "contentHash"]) ||
    typeof section.queueIdentity.audioVersionId !== "string" ||
    section.queueIdentity.audioVersionId.length < 1 ||
    section.queueIdentity.audioVersionId.length > 512 ||
    !LEGACY_HASH.test(section.queueIdentity.contentHash)
  ) return null;

  const profileRanges = createReaderNarrationWordRanges(section.profileText);
  if (
    profileRanges.length !==
      section.titleWordCount + section.bodyWordCount
  ) return null;
  const titleRanges = profileRanges.slice(0, section.titleWordCount);
  const bodyRanges = profileRanges.slice(section.titleWordCount);
  if (
    titleRanges.some(({ charEnd }) =>
      charEnd > section.bodyStartCharacter
    ) ||
    bodyRanges.some(({ charStart }) =>
      charStart < section.bodyStartCharacter
    )
  ) return null;

  let priorEnd = 0;
  const words = bodyRanges.map((range) => {
    const legacyCharStart = range.charStart - section.bodyStartCharacter;
    const legacyCharEnd = range.charEnd - section.bodyStartCharacter;
    const expectedText = section.profileText.slice(
      range.charStart,
      range.charEnd,
    );
    if (
      expectedText.length < 1 ||
      expectedText.length > 4_096 ||
      legacyCharStart < priorEnd ||
      legacyCharEnd <= legacyCharStart
    ) failClientPreflight();
    priorEnd = legacyCharEnd;
    return Object.freeze({
      expectedText,
      legacyCharEnd,
      legacyCharStart,
    });
  });
  return Object.freeze({ section, words: Object.freeze(words) });
}

function failClientPreflight(): never {
  throw new TypeError("Invalid Coherence Publisher audio word route model.");
}

function prepareRouteModel(
  model: CoherencePublisherAudioWordRouteModel,
): readonly PreparedRouteSection[] | null {
  if (
    model === null ||
    typeof model !== "object" ||
    Array.isArray(model) ||
    !hasExactOwnKeys(model, ["authorityBuildId", "schemaVersion", "sections"]) ||
    model.schemaVersion !==
      COHERENCE_PUBLISHER_AUDIO_WORD_ROUTE_MODEL_SCHEMA_VERSION ||
    typeof model.authorityBuildId !== "string" ||
    !SHA256.test(model.authorityBuildId) ||
    !Array.isArray(model.sections) ||
    model.sections.length < 1 ||
    model.sections.length >
      coherencePublisherAudioWordRouteLimits.maximumSections ||
    typeof TextEncoder !== "function" ||
    new TextEncoder().encode(JSON.stringify(model)).byteLength >
      coherencePublisherAudioWordRouteLimits.maximumBytes
  ) return null;
  const sectionIds = new Set<string>();
  let wordCount = 0;
  const prepared: PreparedRouteSection[] = [];
  for (const section of model.sections) {
    const preparedSection = prepareRouteSection(section);
    if (preparedSection === null || sectionIds.has(section.sectionId)) {
      return null;
    }
    sectionIds.add(section.sectionId);
    wordCount += section.bodyWordCount;
    prepared.push(preparedSection);
  }
  return wordCount <= coherencePublisherAudioWordRouteLimits.maximumWords
    ? Object.freeze(prepared)
    : null;
}

function exactSectionRoot(
  root: HTMLElement,
  sectionId: string,
): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(publisherSectionSelector),
  ).filter(({ dataset }) => dataset.publisherSection === sectionId);
  return candidates.length === 1 ? candidates[0]! : null;
}

function sectionProfileMatches(
  root: HTMLElement,
  section: CoherencePublisherAudioWordRouteSection,
): boolean {
  return root.dataset.publisherNarrationTitleWords ===
      String(section.titleWordCount) &&
    root.dataset.publisherNarrationBodyWords === String(section.bodyWordCount) &&
    root.dataset.publisherNarrationTextCharacters ===
      String(section.profileText.length);
}

function audioAttributesAreAbsent(element: HTMLElement): boolean {
  return audioAttributeNames.every((name) => !element.hasAttribute(name));
}

function audioClassesAreAbsent(element: HTMLElement): boolean {
  return audioClassNames.every((name) => !element.classList.contains(name));
}

function prepareSection(
  documentRoot: Document,
  transitionRoot: HTMLElement,
  route: PreparedRouteSection,
): readonly PreparedAudioWord[] | null {
  const { section } = route;
  const sectionRoot = exactSectionRoot(transitionRoot, section.sectionId);
  if (sectionRoot === null || !sectionProfileMatches(sectionRoot, section)) {
    return null;
  }
  const anchors = Array.from(
    sectionRoot.querySelectorAll<HTMLElement>(publisherNarrationWordSelector),
  ).filter(
    (anchor) => anchor.closest(publisherSectionSelector) === sectionRoot,
  );
  if (anchors.length !== route.words.length) return null;

  const prepared: PreparedAudioWord[] = [];
  for (const [index, anchor] of anchors.entries()) {
    const word = route.words[index]!;
    const id = audioWordId(section.sectionId, index);
    if (
      anchor.textContent !== word.expectedText ||
      anchor.id !== "" ||
      !audioClassesAreAbsent(anchor) ||
      !audioAttributesAreAbsent(anchor) ||
      documentRoot.getElementById(id) !== null
    ) return null;
    prepared.push(Object.freeze({
      element: anchor,
      id,
      legacyCharEnd: word.legacyCharEnd,
      legacyCharStart: word.legacyCharStart,
      sectionId: section.sectionId,
    }));
  }
  return Object.freeze(prepared);
}

function removeDecoration(word: PreparedAudioWord): void {
  word.element.classList.remove(...audioClassNames);
  for (const name of audioAttributeNames) word.element.removeAttribute(name);
  if (word.element.id === word.id) word.element.removeAttribute("id");
}

export function bindCoherencePublisherAudioWords(
  model: CoherencePublisherAudioWordRouteModel,
  documentRoot: Document = document,
): (() => void) | null {
  let routeSections: readonly PreparedRouteSection[] | null;
  try {
    routeSections = prepareRouteModel(model);
  } catch {
    return null;
  }
  if (routeSections === null) return null;
  const transitionRoots = Array.from(
    documentRoot.querySelectorAll<HTMLElement>(transitionRootSelector),
  );
  if (transitionRoots.length !== 1) return null;
  const transitionRoot = transitionRoots[0]!;
  const prepared: PreparedAudioWord[] = [];
  const preparedIds = new Set<string>();
  for (const section of routeSections) {
    const sectionWords = prepareSection(
      documentRoot,
      transitionRoot,
      section,
    );
    if (sectionWords === null) return null;
    for (const word of sectionWords) {
      if (preparedIds.has(word.id)) return null;
      preparedIds.add(word.id);
    }
    prepared.push(...sectionWords);
  }
  if (prepared.length === 0) return null;

  const applied: PreparedAudioWord[] = [];
  try {
    for (const word of prepared) {
      applied.push(word);
      word.element.id = word.id;
      word.element.classList.add("audio-word");
      word.element.setAttribute("data-audio-word", "true");
      word.element.setAttribute("data-audio-word-id", word.id);
      word.element.setAttribute("data-audio-section-id", word.sectionId);
      word.element.setAttribute(
        "data-audio-char-start",
        String(word.legacyCharStart),
      );
      word.element.setAttribute(
        "data-audio-char-end",
        String(word.legacyCharEnd),
      );
    }
  } catch {
    for (const word of applied.reverse()) removeDecoration(word);
    return null;
  }
  return () => {
    for (const word of [...applied].reverse()) removeDecoration(word);
  };
}

export function CoherencePublisherAudioWordBridgeClient({
  model,
}: {
  model: CoherencePublisherAudioWordRouteModel;
}) {
  const [activeSections, setActiveSections] = useState<
    readonly CoherencePublisherAudioWordRouteSection[]
  >(noActiveRouteSections);

  useLayoutEffect(() => {
    const cleanup = bindCoherencePublisherAudioWords(model);
    // The rendered islands must reflect the completed external DOM binding.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSections(
      cleanup === null ? noActiveRouteSections : model.sections,
    );
    return cleanup ?? undefined;
  }, [model]);

  return activeSections.map((section) => (
    <ReaderAudioWordInteractionIsland
      key={section.sectionId}
      queueIdentity={Object.freeze({
        audioVersionId: section.queueIdentity.audioVersionId,
        contentHash: section.queueIdentity.contentHash,
      })}
      sectionId={section.sectionId}
    />
  ));
}
