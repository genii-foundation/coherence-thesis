import type { ReaderSection } from "@genii-foundation/publisher-schema/reader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publisherMocks = vi.hoisted(() => ({
  readSelection: vi.fn(),
  textContent: vi.fn(),
  textPoint: vi.fn(),
  textRange: vi.fn(),
  verticalBounds: vi.fn(),
}));
const signalMocks = vi.hoisted(() => ({
  offered: vi.fn(),
  saved: vi.fn(),
}));
const hookMocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  refs: [] as Array<{ current: unknown }>,
  stateIndex: 0,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  stateValues: [] as unknown[],
}));
const portalMocks = vi.hoisted(() => ({
  createPortal: vi.fn(),
}));
const storeMocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  bookmarks: null as unknown,
  updateBookmarks: vi.fn(),
  useBookmarks: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback(callback: unknown) {
      return callback;
    },
    useEffect(effect: () => void | (() => void)) {
      hookMocks.effects.push(effect);
    },
    useRef(initial: unknown) {
      const ref = { current: initial };
      hookMocks.refs.push(ref);
      return ref;
    },
    useState(initial: unknown) {
      const index = hookMocks.stateIndex;
      hookMocks.stateIndex += 1;
      const value = index < hookMocks.stateValues.length
        ? hookMocks.stateValues[index]
        : typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
      const setter = vi.fn();
      hookMocks.stateSetters[index] = setter;
      return [value, setter];
    },
  };
});
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, createPortal: portalMocks.createPortal };
});

vi.mock("@genii-foundation/publisher-next/client", () => ({
  publisherReaderTextContent: publisherMocks.textContent,
  publisherReaderTextPointForOffset: publisherMocks.textPoint,
  publisherReaderTextRange: publisherMocks.textRange,
  publisherReaderTextVerticalBounds: publisherMocks.verticalBounds,
  readPublisherReaderSelection: publisherMocks.readSelection,
}));
vi.mock("@/lib/reader-bookmark-events", () => ({
  announceBookmarkOffered: signalMocks.offered,
  announceBookmarkSaved: signalMocks.saved,
}));
vi.mock("@/lib/reader-progress-store", () => ({
  appendStoredEvent: storeMocks.appendEvent,
  updateStoredBookmarks: storeMocks.updateBookmarks,
  useReaderBookmarks: storeMocks.useBookmarks,
}));

import {
  bindCoherencePublisherBookmarkCapture,
  CoherencePublisherBookmarkBridgeClient,
  inspectCoherencePublisherBookmarkDom,
  measureCoherencePublisherBookmarkMarkers,
  observeCoherencePublisherBookmarkMarkers,
  readCoherencePublisherBookmarkSelection,
} from "@/publisher/legacy-reader-bookmark-bridge-client";
import type {
  CoherencePublisherBookmarkRouteModel,
  CoherencePublisherBookmarkRouteSection,
} from "@/publisher/legacy-reader-bookmark-bridge";
import {
  addBookmark,
  emptyBookmarks,
  liveBookmarks,
  type ReaderBookmarksState,
} from "@/lib/reader-bookmarks";
import { createReaderPassageRange } from "@/lib/reader-passage-range";

const transitionRootSelector =
  "[data-coherence-publisher-transition-root='true']";
const publisherSectionSelector = "[data-publisher-section]";
const publisherBlockSelector = "[data-publisher-block]";

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly selectorResults = new Map<string, readonly FakeElement[]>();
  box = { top: 0, bottom: 20, left: 100, width: 300, height: 20 };
  sectionRoot: FakeElement | null = null;
  textContent: string | null = null;
  transitionRoot: FakeElement | null = null;
  bridgeUi = false;

  closest(selector: string): FakeElement | null {
    if (selector === transitionRootSelector) return this.transitionRoot;
    if (selector === publisherSectionSelector) return this.sectionRoot;
    if (selector === "[data-coherence-publisher-bookmark-ui='true']") {
      return this.bridgeUi ? this : null;
    }
    return null;
  }

  getBoundingClientRect() {
    return this.box;
  }

  querySelectorAll<T>(selector: string): T[] {
    return [...(this.selectorResults.get(selector) ?? [])] as unknown as T[];
  }
}

class FakeFontSet {
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly ready: Promise<void>;
  resolveReady: () => void = () => {};

  constructor() {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
}

class FakeDocument {
  readonly body = new FakeElement();
  readonly documentElement = new FakeElement();
  readonly fonts = new FakeFontSet();
  readonly listeners = new Map<string, Set<EventListener>>();
  roots: readonly FakeElement[];
  visibilityState: DocumentVisibilityState = "visible";

  constructor(roots: readonly FakeElement[]) {
    this.roots = roots;
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: object): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Event);
    }
  }

  querySelectorAll<T>(selector: string): T[] {
    return (
      selector === transitionRootSelector ? [...this.roots] : []
    ) as unknown as T[];
  }
}

class FakeWindow {
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly frames = new Map<number, FrameRequestCallback>();
  frameId = 0;
  location = { pathname: "/manuscripts/1/section/" };
  selection: Selection | null = null;
  scrollX = 7;
  scrollY = 11;

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  cancelAnimationFrame(id: number): void {
    this.frames.delete(id);
  }

  clearTimeout(id: number): void {
    globalThis.clearTimeout(id);
  }

  getSelection(): Selection | null {
    return this.selection;
  }

  matchMedia(): MediaQueryList {
    return { matches: true } as MediaQueryList;
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    this.frameId += 1;
    this.frames.set(this.frameId, callback);
    return this.frameId;
  }

  setTimeout(handler: TimerHandler, delay?: number): number {
    return globalThis.setTimeout(handler, delay) as unknown as number;
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  disconnected = false;
  readonly observed: FakeElement[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  observe(element: Element): void {
    this.observed.push(element as unknown as FakeElement);
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  readonly callback: MutationCallback;
  disconnected = false;
  readonly observed: FakeElement[] = [];

  constructor(callback: MutationCallback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  observe(element: Node): void {
    this.observed.push(element as unknown as FakeElement);
  }
}

class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = [];
  static supportedEntryTypes = ["layout-shift"];
  readonly callback: PerformanceObserverCallback;
  disconnected = false;
  observed = false;

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback;
    FakePerformanceObserver.instances.push(this);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  observe(): void {
    this.observed = true;
  }
}

const publisherHash = (character: string) =>
  `sha256:${character.repeat(64)}`;

function routeSection(
  id = "section",
  text = "Alpha beta gamma",
): CoherencePublisherBookmarkRouteSection {
  const reader = Object.freeze({
    activeRouteNames: Object.freeze(["canonical"]),
    blocks: Object.freeze([
      Object.freeze({
        contentHash: publisherHash("b"),
        domId: `${id}-block-dom`,
        id: `${id}-block`,
        kind: "paragraph",
        markdown: text,
        readerAddress: Object.freeze({
          anchor: `${id}-block-dom`,
          path: `/manuscripts/1/${id}/`,
        }),
        text,
        wordCount: 3,
      }),
    ]),
    childIds: Object.freeze([]),
    contentHash: publisherHash("a"),
    continuity: Object.freeze({
      historicalSectionIds: Object.freeze([]),
      id: `${id}-continuity`,
      legacyIds: Object.freeze([]),
      progressGroups: Object.freeze([
        Object.freeze([`${id}-continuity`]),
      ]),
    }),
    depth: 0,
    domId: id,
    id,
    navigable: true,
    nextId: null,
    order: 1,
    parentId: null,
    previousId: null,
    readerAddress: Object.freeze({ path: `/manuscripts/1/${id}/` }),
    readingMinutes: 1,
    role: "section",
    routes: Object.freeze({
      canonical: Object.freeze({ path: `/manuscripts/1/${id}/` }),
    }),
    title: id,
    wordCount: 3,
  }) as unknown as ReaderSection;
  return Object.freeze({
    fallbackPath: `/manuscripts/1/${id}/`,
    legacySection: Object.freeze({
      sectionId: id,
      continuityId: `${id}-continuity`,
      legacyContinuityIds: [],
      progressContinuityGroups: [[`${id}-continuity`]],
      legacySectionIds: [],
      contentHash: "0123456789abcdef",
      title: id,
      href: "/manuscripts/1/",
      chapterHref: "/manuscripts/1/chapter/",
      readerHref: `/manuscripts/1/${id}/`,
      wordCount: 3,
      paragraphs: [
        {
          paragraphId: `p-h${id.padEnd(16, "0").slice(0, 16)}`,
          anchor: `p-h${id.padEnd(16, "0").slice(0, 16)}`,
          contentHash: id.padEnd(16, "0").slice(0, 16),
        },
      ],
    }),
    paragraphs: Object.freeze([
      Object.freeze({
        legacyParagraphId: `p-h${id.padEnd(16, "0").slice(0, 16)}`,
        legacyContentHash: id.padEnd(16, "0").slice(0, 16),
        blockId: `${id}-block`,
        blockContentHash: publisherHash("b"),
        offsetSegment: Object.freeze({
          legacyStart: 0,
          targetStart: 0,
          length: text.length,
        }),
      }),
    ]),
    publisherSection: reader,
    workId: "work",
  });
}

function identicalTwoParagraphRouteSection(
  text = "Same exact paragraph",
): CoherencePublisherBookmarkRouteSection {
  const section = routeSection("two", text);
  const firstBlock = section.publisherSection.blocks[0]!;
  const secondBlock = Object.freeze({
    ...firstBlock,
    domId: "two-block-2-dom",
    id: "two-block-2",
    readerAddress: Object.freeze({
      anchor: "two-block-2-dom",
      path: "/manuscripts/1/two/",
    }),
  });
  return Object.freeze({
    ...section,
    legacySection: Object.freeze({
      ...section.legacySection,
      paragraphs: [
        Object.freeze({
          paragraphId: "p-haaaaaaaaaaaaaaaa",
          anchor: "p-haaaaaaaaaaaaaaaa",
          contentHash: "aaaaaaaaaaaaaaaa",
        }),
        Object.freeze({
          paragraphId: "p-hbbbbbbbbbbbbbbbb",
          anchor: "p-hbbbbbbbbbbbbbbbb",
          contentHash: "bbbbbbbbbbbbbbbb",
        }),
      ],
      wordCount: 6,
    }),
    paragraphs: Object.freeze([
      Object.freeze({
        legacyParagraphId: "p-haaaaaaaaaaaaaaaa",
        legacyContentHash: "aaaaaaaaaaaaaaaa",
        blockId: firstBlock.id,
        blockContentHash: firstBlock.contentHash,
        offsetSegment: Object.freeze({
          legacyStart: 0,
          targetStart: 0,
          length: firstBlock.text.length,
        }),
      }),
      Object.freeze({
        legacyParagraphId: "p-hbbbbbbbbbbbbbbbb",
        legacyContentHash: "bbbbbbbbbbbbbbbb",
        blockId: secondBlock.id,
        blockContentHash: secondBlock.contentHash,
        offsetSegment: Object.freeze({
          legacyStart: 0,
          targetStart: 0,
          length: secondBlock.text.length,
        }),
      }),
    ]),
    publisherSection: Object.freeze({
      ...section.publisherSection,
      blocks: Object.freeze([firstBlock, secondBlock]),
      wordCount: 6,
    }) as unknown as ReaderSection,
  });
}

function revisedTwoParagraphRouteSection(
  separatorText = "",
): CoherencePublisherBookmarkRouteSection {
  const section = identicalTwoParagraphRouteSection();
  const firstSource = section.publisherSection.blocks[0]!;
  const secondSource = section.publisherSection.blocks[1]!;
  const firstText = "Earlier prose. The saved passage begins here";
  const secondText =
    "and continues after the paragraph break. Later prose.";
  const firstBlock = Object.freeze({
    ...firstSource,
    contentHash: publisherHash("d"),
    markdown: firstText,
    text: firstText,
    wordCount: 7,
  });
  const secondBlock = Object.freeze({
    ...secondSource,
    contentHash: publisherHash("e"),
    markdown: secondText,
    text: secondText,
    wordCount: 8,
  });
  const separator = separatorText
    ? Object.freeze({
        ...firstSource,
        contentHash: publisherHash("f"),
        domId: "two-separator-dom",
        id: "two-separator",
        markdown: separatorText,
        readerAddress: Object.freeze({
          anchor: "two-separator-dom",
          path: "/manuscripts/1/two/",
        }),
        text: separatorText,
        wordCount: 0,
      })
    : null;
  return Object.freeze({
    ...section,
    paragraphs: Object.freeze([
      Object.freeze({
        ...section.paragraphs[0]!,
        blockContentHash: firstBlock.contentHash,
        offsetSegment: Object.freeze({
          legacyStart: 0,
          targetStart: 0,
          length: firstText.length,
        }),
      }),
      Object.freeze({
        ...section.paragraphs[1]!,
        blockContentHash: secondBlock.contentHash,
        offsetSegment: Object.freeze({
          legacyStart: 0,
          targetStart: 0,
          length: secondText.length,
        }),
      }),
    ]),
    publisherSection: Object.freeze({
      ...section.publisherSection,
      blocks: Object.freeze(
        separator === null
          ? [firstBlock, secondBlock]
          : [firstBlock, separator, secondBlock],
      ),
      wordCount: 15,
    }) as unknown as ReaderSection,
  });
}

function routeSectionWithOwningHeading(): CoherencePublisherBookmarkRouteSection {
  const section = routeSection("heading", "Mapped paragraph text");
  const paragraph = section.publisherSection.blocks[0]!;
  const heading = Object.freeze({
    ...paragraph,
    contentHash: publisherHash("c"),
    domId: "heading-title-dom",
    id: "heading-title",
    kind: "heading",
    markdown: "heading",
    text: "heading",
    wordCount: 1,
  });
  return Object.freeze({
    ...section,
    paragraphs: Object.freeze([
      Object.freeze({
        ...section.paragraphs[0]!,
        blockId: paragraph.id,
        blockContentHash: paragraph.contentHash,
      }),
    ]),
    publisherSection: Object.freeze({
      ...section.publisherSection,
      blocks: Object.freeze([heading, paragraph]),
    }) as unknown as ReaderSection,
  });
}

function routeModel(
  sections: readonly CoherencePublisherBookmarkRouteSection[] = [routeSection()],
): CoherencePublisherBookmarkRouteModel {
  return Object.freeze({ sections: Object.freeze([...sections]) });
}

function routeDom(
  sections: readonly CoherencePublisherBookmarkRouteSection[] = [routeSection()],
) {
  const transition = new FakeElement();
  transition.transitionRoot = transition;
  const allBlocks: FakeElement[] = [];
  const sectionDoms = sections.map((section, sectionIndex) => {
    const root = new FakeElement();
    root.dataset.publisherSection = section.publisherSection.id;
    root.sectionRoot = root;
    root.transitionRoot = transition;
    const first = section.publisherSection.blocks[0];
    const hasOwningHeading =
      first?.kind === "heading" && first.text === section.publisherSection.title;
    const blocks = section.publisherSection.blocks.map((publisherBlock, blockIndex) => {
      const block = new FakeElement();
      block.dataset.publisherBlock = publisherBlock.id;
      block.textContent = publisherBlock.text;
      block.sectionRoot =
        sectionIndex === 0 && blockIndex === 0 && hasOwningHeading
          ? null
          : root;
      block.transitionRoot = transition;
      allBlocks.push(block);
      return block;
    });
    const insideBlocks = blocks.filter((block) => block.sectionRoot === root);
    root.textContent = `${sectionIndex > 0 && !hasOwningHeading
      ? section.publisherSection.title
      : ""}${insideBlocks.map((block) => block.textContent ?? "").join("")}`;
    root.selectorResults.set(publisherBlockSelector, insideBlocks);
    return { block: blocks[0]!, blocks, root };
  });
  transition.selectorResults.set(
    publisherSectionSelector,
    sectionDoms.map(({ root }) => root),
  );
  transition.selectorResults.set(publisherBlockSelector, allBlocks);
  const sourceDocument = new FakeDocument([transition]);
  const sourceWindow = new FakeWindow();
  return {
    sourceDocument,
    sourceWindow,
    transition,
    sectionDoms,
    environment: {
      document: sourceDocument as unknown as Document,
      window: sourceWindow as unknown as Window,
    },
  };
}

function publisherSelection(
  section: CoherencePublisherBookmarkRouteSection,
) {
  const block = section.publisherSection.blocks[0]!;
  return Object.freeze({
    input: Object.freeze({
      workId: section.workId,
      sectionContinuityId: section.publisherSection.continuity.id,
      href: section.fallbackPath,
      quote: block.text,
      prefix: "",
      suffix: "",
      range: Object.freeze({
        start: Object.freeze({
          workId: section.workId,
          sectionContinuityId: section.publisherSection.continuity.id,
          blockId: block.id,
          blockContentHash: block.contentHash,
          offset: 0,
        }),
        end: Object.freeze({
          workId: section.workId,
          sectionContinuityId: section.publisherSection.continuity.id,
          blockId: block.id,
          blockContentHash: block.contentHash,
          offset: block.text.length,
        }),
      }),
    }),
    top: 40,
    left: 80,
    width: 120,
    height: 20,
  });
}

function twoParagraphPublisherSelection(
  section: CoherencePublisherBookmarkRouteSection,
) {
  const start = section.publisherSection.blocks[0]!;
  const end = section.publisherSection.blocks[1]!;
  const startOffset = 5;
  const endOffset = 10;
  return Object.freeze({
    input: Object.freeze({
      workId: section.workId,
      sectionContinuityId: section.publisherSection.continuity.id,
      href: section.fallbackPath,
      quote: `${start.text.slice(startOffset)}\n${end.text.slice(0, endOffset)}`,
      prefix: start.text.slice(0, startOffset),
      suffix: end.text.slice(endOffset),
      range: Object.freeze({
        start: Object.freeze({
          workId: section.workId,
          sectionContinuityId: section.publisherSection.continuity.id,
          blockId: start.id,
          blockContentHash: start.contentHash,
          offset: startOffset,
        }),
        end: Object.freeze({
          workId: section.workId,
          sectionContinuityId: section.publisherSection.continuity.id,
          blockId: end.id,
          blockContentHash: end.contentHash,
          offset: endOffset,
        }),
      }),
    }),
    top: 40,
    left: 80,
    width: 120,
    height: 20,
  });
}

function bookmarkedState(
  section: CoherencePublisherBookmarkRouteSection,
): ReaderBookmarksState {
  const paragraph = section.legacySection.paragraphs[0]!;
  const text = section.publisherSection.blocks[0]!.text;
  return addBookmark(
    emptyBookmarks(),
    {
      section: section.legacySection,
      range: createReaderPassageRange(
        {
          paragraphAnchor: paragraph.anchor,
          paragraphContentHash: paragraph.contentHash,
          offset: 0,
        },
        {
          paragraphAnchor: paragraph.anchor,
          paragraphContentHash: paragraph.contentHash,
          offset: text.length,
        },
      ),
      quote: text,
    },
    1_000,
    "bookmark-1",
  );
}

function twoParagraphBookmarkedState(
  section: CoherencePublisherBookmarkRouteSection,
): ReaderBookmarksState {
  const start = section.legacySection.paragraphs[0]!;
  const end = section.legacySection.paragraphs[1]!;
  return addBookmark(
    emptyBookmarks(),
    {
      section: section.legacySection,
      range: createReaderPassageRange(
        {
          paragraphAnchor: start.anchor,
          paragraphContentHash: start.contentHash,
          offset: 5,
        },
        {
          paragraphAnchor: end.anchor,
          paragraphContentHash: end.contentHash,
          offset: 10,
        },
      ),
      quote: "exact paragraph\n\nSame exact",
      quoteOrdinal: 0,
      prefix: "Same ",
      suffix: " paragraph",
    },
    1_000,
    "bookmark-2",
  );
}

function retiredBookmarkedState(
  section: CoherencePublisherBookmarkRouteSection,
  {
    quote,
    prefix = "",
    suffix = "",
    startOffset = 40,
    endOffset = startOffset + quote.length,
    id = "retired-bookmark",
  }: Readonly<{
    quote: string;
    prefix?: string;
    suffix?: string;
    startOffset?: number;
    endOffset?: number;
    id?: string;
  }>,
): ReaderBookmarksState {
  const retiredHash = "00000000000000ff";
  return addBookmark(
    emptyBookmarks(),
    {
      section: section.legacySection,
      range: createReaderPassageRange(
        {
          paragraphAnchor: `p-h${retiredHash}`,
          paragraphContentHash: retiredHash,
          offset: startOffset,
        },
        {
          paragraphAnchor: `p-h${retiredHash}`,
          paragraphContentHash: retiredHash,
          offset: endOffset,
        },
      ),
      quote,
      quoteOrdinal: 0,
      prefix,
      suffix,
    },
    1_000,
    id,
  );
}

function configureComponentHooks(stateValues: readonly unknown[]): void {
  hookMocks.effects = [];
  hookMocks.refs = [];
  hookMocks.stateIndex = 0;
  hookMocks.stateSetters = [];
  hookMocks.stateValues = [...stateValues];
}

function runComponentEffects(): () => void {
  const cleanups: Array<() => void> = [];
  for (const effect of hookMocks.effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return () => {
    for (const cleanup of [...cleanups].reverse()) cleanup();
  };
}

function findPropsByClassName(
  value: unknown,
  className: string,
): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPropsByClassName(item, className);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const props = record.props;
  if (props !== null && typeof props === "object") {
    const propRecord = props as Record<string, unknown>;
    if (propRecord.className === className) return propRecord;
    const found = findPropsByClassName(propRecord.children, className);
    if (found !== null) return found;
  }
  return findPropsByClassName(record.children, className);
}

beforeEach(() => {
  publisherMocks.readSelection.mockReset();
  publisherMocks.textContent.mockReset();
  publisherMocks.textContent.mockImplementation(
    (element: FakeElement) => element.textContent ?? "",
  );
  publisherMocks.textPoint.mockReset();
  publisherMocks.textPoint.mockImplementation(
    (element: FakeElement, offset: number) => ({ node: element, offset }),
  );
  publisherMocks.textRange.mockReset();
  publisherMocks.textRange.mockReturnValue({ range: true });
  publisherMocks.verticalBounds.mockReset();
  publisherMocks.verticalBounds.mockReturnValue({ top: 50, bottom: 70 });
  signalMocks.offered.mockReset();
  signalMocks.saved.mockReset();
  configureComponentHooks([]);
  portalMocks.createPortal.mockReset();
  portalMocks.createPortal.mockImplementation((children: unknown) => ({
    children,
    testPortal: true,
  }));
  storeMocks.appendEvent.mockReset();
  storeMocks.bookmarks = emptyBookmarks();
  storeMocks.updateBookmarks.mockReset();
  storeMocks.updateBookmarks.mockImplementation(
    (updater: (current: ReaderBookmarksState) => ReaderBookmarksState) => {
      storeMocks.bookmarks = updater(
        storeMocks.bookmarks as ReaderBookmarksState,
      );
      return storeMocks.bookmarks;
    },
  );
  storeMocks.useBookmarks.mockReset();
  storeMocks.useBookmarks.mockImplementation(() => storeMocks.bookmarks);
  FakeResizeObserver.instances = [];
  FakeMutationObserver.instances = [];
  FakePerformanceObserver.instances = [];
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
  vi.stubGlobal("PerformanceObserver", FakePerformanceObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Coherence Publisher bookmark DOM preflight", () => {
  it("accepts the complete exact block surface without mutating Publisher nodes", () => {
    const section = routeSectionWithOwningHeading();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    const beforeRoot = structuredClone(dom.sectionDoms[0]!.root.dataset);
    const beforeBlocks = dom.sectionDoms[0]!.blocks.map((block) =>
      structuredClone(block.dataset)
    );

    const bound = inspectCoherencePublisherBookmarkDom(
      model,
      dom.environment.document,
    );

    expect(bound?.sections).toHaveLength(1);
    expect(bound?.sections[0]?.blockElements.get("heading-block")).toBe(
      dom.sectionDoms[0]!.blocks[1],
    );
    expect(dom.sectionDoms[0]!.blocks[0]?.sectionRoot).toBeNull();
    expect(dom.sectionDoms[0]!.blocks[1]?.sectionRoot).toBe(
      dom.sectionDoms[0]!.root,
    );
    expect(dom.sectionDoms[0]!.root.dataset).toEqual(beforeRoot);
    expect(dom.sectionDoms[0]!.blocks.map(({ dataset }) => dataset)).toEqual(
      beforeBlocks,
    );
  });

  it("accepts two identical paragraphs only in exact block order", () => {
    const section = identicalTwoParagraphRouteSection();
    const dom = routeDom([section]);
    expect(
      inspectCoherencePublisherBookmarkDom(
        routeModel([section]),
        dom.environment.document,
      )?.sections[0]?.blockElements.size,
    ).toBe(2);

    const swapped = structuredClone(section) as unknown as {
      paragraphs: Array<{ blockId: string }>;
    };
    swapped.paragraphs[0]!.blockId = "two-block-2";
    swapped.paragraphs[1]!.blockId = "two-block";
    expect(
      inspectCoherencePublisherBookmarkDom(
        routeModel([
          swapped as unknown as CoherencePublisherBookmarkRouteSection,
        ]),
        dom.environment.document,
      ),
    ).toBeNull();
  });

  it("fails the whole route on duplicate transition or section roots", () => {
    const section = routeSection();
    const model = routeModel([section]);
    const duplicateRoot = routeDom([section]);
    duplicateRoot.sourceDocument.roots = [
      duplicateRoot.transition,
      duplicateRoot.transition,
    ];
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        duplicateRoot.environment.document,
      ),
    ).toBeNull();

    const duplicateSection = routeDom([section]);
    duplicateSection.transition.selectorResults.set(
      publisherSectionSelector,
      [duplicateSection.sectionDoms[0]!.root, duplicateSection.sectionDoms[0]!.root],
    );
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        duplicateSection.environment.document,
      ),
    ).toBeNull();
  });

  it("fails on unknown, duplicate, missing, reordered, or text drift blocks", () => {
    const section = identicalTwoParagraphRouteSection();
    const model = routeModel([section]);

    const unknown = routeDom([section]);
    const unknownBlock = new FakeElement();
    unknownBlock.dataset.publisherBlock = "unknown-block";
    unknownBlock.textContent = "Unknown text";
    unknownBlock.sectionRoot = unknown.sectionDoms[0]!.root;
    unknownBlock.transitionRoot = unknown.transition;
    unknown.transition.selectorResults.set(
      publisherBlockSelector,
      [...unknown.sectionDoms[0]!.blocks, unknownBlock],
    );
    expect(
      inspectCoherencePublisherBookmarkDom(model, unknown.environment.document),
    ).toBeNull();

    const duplicate = routeDom([section]);
    duplicate.transition.selectorResults.set(
      publisherBlockSelector,
      [duplicate.sectionDoms[0]!.block, duplicate.sectionDoms[0]!.block],
    );
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        duplicate.environment.document,
      ),
    ).toBeNull();

    const missing = routeDom([section]);
    missing.transition.selectorResults.set(publisherBlockSelector, [
      missing.sectionDoms[0]!.blocks[0]!,
    ]);
    expect(
      inspectCoherencePublisherBookmarkDom(model, missing.environment.document),
    ).toBeNull();

    const reordered = routeDom([section]);
    reordered.transition.selectorResults.set(
      publisherBlockSelector,
      [...reordered.sectionDoms[0]!.blocks].reverse(),
    );
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        reordered.environment.document,
      ),
    ).toBeNull();

    const driftedText = routeDom([section]);
    driftedText.sectionDoms[0]!.block.textContent = "Alpha beta delta";
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        driftedText.environment.document,
      ),
    ).toBeNull();
  });

  it("fails on reordered sections, wrong block placement, or unmarked text", () => {
    const first = routeSection("first");
    const second = routeSection("second");
    const model = routeModel([first, second]);

    const reorderedSections = routeDom([first, second]);
    reorderedSections.transition.selectorResults.set(
      publisherSectionSelector,
      [...reorderedSections.sectionDoms].reverse().map(({ root }) => root),
    );
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        reorderedSections.environment.document,
      ),
    ).toBeNull();

    const wrongPlacement = routeDom([first, second]);
    wrongPlacement.sectionDoms[1]!.block.sectionRoot =
      wrongPlacement.sectionDoms[0]!.root;
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        wrongPlacement.environment.document,
      ),
    ).toBeNull();

    const unmarkedText = routeDom([first, second]);
    unmarkedText.sectionDoms[1]!.root.textContent += "Injected visible text";
    expect(
      inspectCoherencePublisherBookmarkDom(
        model,
        unmarkedText.environment.document,
      ),
    ).toBeNull();
  });
});

describe("Coherence Publisher bookmark selection translation", () => {
  it("uses the public Publisher selection and converts its exact range", () => {
    const section = routeSection();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    const sourceSelection = {
      isCollapsed: false,
      rangeCount: 1,
    } as Selection;
    publisherMocks.readSelection.mockReturnValue(publisherSelection(section));

    const captured = readCoherencePublisherBookmarkSelection(
      model,
      sourceSelection,
      dom.environment.document,
    );

    expect(publisherMocks.readSelection).toHaveBeenCalledExactlyOnceWith(
      sourceSelection,
      "work",
      section.publisherSection,
      "/manuscripts/1/section/",
    );
    expect(captured).toMatchObject({
      quote: "Alpha beta gamma",
      quoteOrdinal: 0,
      range: {
        start: {
          paragraphAnchor: "p-hsection000000000",
          paragraphContentHash: "section000000000",
          offset: 0,
        },
        end: {
          paragraphAnchor: "p-hsection000000000",
          paragraphContentHash: "section000000000",
          offset: 16,
        },
      },
      top: 40,
      left: 80,
    });
  });

  it("translates a genuine cross paragraph selection and newline contract", () => {
    const section = identicalTwoParagraphRouteSection();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    const sourceSelection = {
      isCollapsed: false,
      rangeCount: 1,
    } as Selection;
    publisherMocks.readSelection.mockReturnValue(
      twoParagraphPublisherSelection(section),
    );

    const captured = readCoherencePublisherBookmarkSelection(
      model,
      sourceSelection,
      dom.environment.document,
    );

    expect(captured).toMatchObject({
      quote: "exact paragraph\n\nSame exact",
      quoteOrdinal: 0,
      prefix: "Same ",
      suffix: " paragraph",
      range: {
        start: {
          paragraphAnchor: "p-haaaaaaaaaaaaaaaa",
          paragraphContentHash: "aaaaaaaaaaaaaaaa",
          offset: 5,
        },
        end: {
          paragraphAnchor: "p-hbbbbbbbbbbbbbbbb",
          paragraphContentHash: "bbbbbbbbbbbbbbbb",
          offset: 10,
        },
      },
    });
    expect(publisherMocks.readSelection).toHaveBeenCalledExactlyOnceWith(
      sourceSelection,
      "work",
      section.publisherSection,
      "/manuscripts/1/two/",
    );
  });

  it("fails closed on mapping drift, two owners, and Publisher exceptions", () => {
    const first = routeSection("first");
    const firstDom = routeDom([first]);
    const wrongHash = structuredClone(publisherSelection(first)) as unknown as {
      input: {
        range: {
          start: { blockContentHash: string };
        };
      };
    };
    wrongHash.input.range.start.blockContentHash = publisherHash("e");
    publisherMocks.readSelection.mockReturnValue(wrongHash);
    expect(
      readCoherencePublisherBookmarkSelection(
        routeModel([first]),
        {} as Selection,
        firstDom.environment.document,
      ),
    ).toBeNull();

    const second = routeSection("second");
    const twoDom = routeDom([first, second]);
    publisherMocks.readSelection
      .mockReturnValueOnce(publisherSelection(first))
      .mockReturnValueOnce(publisherSelection(second));
    expect(
      readCoherencePublisherBookmarkSelection(
        routeModel([first, second]),
        {} as Selection,
        twoDom.environment.document,
      ),
    ).toBeNull();

    publisherMocks.readSelection.mockReset();
    publisherMocks.readSelection.mockImplementation(() => {
      throw new TypeError("Selection failed");
    });
    expect(
      readCoherencePublisherBookmarkSelection(
        routeModel([first]),
        {} as Selection,
        firstDom.environment.document,
      ),
    ).toBeNull();
  });
});

describe("Coherence Publisher bookmark marker translation", () => {
  it("uses only public Publisher text coordinates for an exact bookmark", () => {
    const section = routeSection();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    const bookmarks = bookmarkedState(section);

    const markers = measureCoherencePublisherBookmarkMarkers(
      model,
      bookmarks,
      dom.environment,
    );

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      bookmark: { id: "bookmark-1" },
      startParagraphAnchor: "p-hsection000000000",
      endParagraphAnchor: "p-hsection000000000",
      startOffset: 0,
      endOffset: 16,
      paragraphCount: 1,
      height: 44,
      left: 53,
      top: 59,
    });
    expect(publisherMocks.textPoint.mock.calls).toEqual([
      [dom.sectionDoms[0]!.block, 0],
      [dom.sectionDoms[0]!.block, 16],
    ]);
    expect(publisherMocks.textRange).toHaveBeenCalledOnce();
    expect(publisherMocks.verticalBounds).toHaveBeenCalledOnce();
  });

  it("translates a genuine cross paragraph marker and its geometry", () => {
    const section = identicalTwoParagraphRouteSection();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    publisherMocks.verticalBounds.mockReturnValue({ top: 30, bottom: 100 });

    const markers = measureCoherencePublisherBookmarkMarkers(
      model,
      twoParagraphBookmarkedState(section),
      dom.environment,
    );

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      bookmark: {
        id: "bookmark-2",
        quote: "exact paragraph\n\nSame exact",
      },
      startParagraphAnchor: "p-haaaaaaaaaaaaaaaa",
      startOffset: 5,
      endParagraphAnchor: "p-hbbbbbbbbbbbbbbbb",
      endOffset: 10,
      paragraphCount: 2,
      height: 74,
      left: 53,
      top: 39,
    });
    expect(publisherMocks.textPoint.mock.calls).toEqual([
      [dom.sectionDoms[0]!.blocks[0], 5],
      [dom.sectionDoms[0]!.blocks[1], 10],
    ]);
    expect(publisherMocks.textRange).toHaveBeenCalledExactlyOnceWith(
      { node: dom.sectionDoms[0]!.blocks[0], offset: 5 },
      { node: dom.sectionDoms[0]!.blocks[1], offset: 10 },
    );
    expect(publisherMocks.verticalBounds).toHaveBeenCalledExactlyOnceWith({
      range: true,
    });
  });

  it("reanchors a retired exact passage at its current moved offsets", () => {
    const text =
      "Opening context. The saved words remain together in the revised paragraph. Closing context.";
    const quote = "The saved words remain together";
    const section = routeSection("revised", text);
    const dom = routeDom([section]);
    const bookmarks = retiredBookmarkedState(section, {
      quote,
      prefix: "Opening context. ",
      suffix: " in the revised paragraph.",
    });
    const expectedStart = text.indexOf(quote);
    const expectedEnd = expectedStart + quote.length;

    const markers = measureCoherencePublisherBookmarkMarkers(
      routeModel([section]),
      bookmarks,
      dom.environment,
    );

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      bookmark: {
        id: "retired-bookmark",
        range: {
          start: {
            paragraphAnchor: "p-h00000000000000ff",
            offset: 40,
          },
        },
      },
      startParagraphAnchor: section.legacySection.paragraphs[0]!.anchor,
      endParagraphAnchor: section.legacySection.paragraphs[0]!.anchor,
      startOffset: expectedStart,
      endOffset: expectedEnd,
      paragraphCount: 1,
    });
    expect(publisherMocks.textPoint.mock.calls).toEqual([
      [dom.sectionDoms[0]!.block, expectedStart],
      [dom.sectionDoms[0]!.block, expectedEnd],
    ]);
  });

  it("recovers changed words from exact surrounding context", () => {
    const prefix = "Opening context. ";
    const suffix = " Closing context.";
    const text =
      "Opening context. The saved words remain together in the revised paragraph. Closing context.";
    const section = routeSection("context", text);
    const dom = routeDom([section]);
    const bookmarks = retiredBookmarkedState(section, {
      quote: "The former sentence was completely different.",
      prefix,
      suffix,
    });
    const expectedEnd = text.indexOf(suffix);

    const markers = measureCoherencePublisherBookmarkMarkers(
      routeModel([section]),
      bookmarks,
      dom.environment,
    );

    expect(markers).toEqual([
      expect.objectContaining({
        startParagraphAnchor: section.legacySection.paragraphs[0]!.anchor,
        endParagraphAnchor: section.legacySection.paragraphs[0]!.anchor,
        startOffset: prefix.length,
        endOffset: expectedEnd,
        paragraphCount: 1,
      }),
    ]);
    expect(publisherMocks.textPoint.mock.calls).toEqual([
      [dom.sectionDoms[0]!.block, prefix.length],
      [dom.sectionDoms[0]!.block, expectedEnd],
    ]);
  });

  it("recovers a retired passage across current paragraph boundaries", () => {
    const section = revisedTwoParagraphRouteSection();
    const first = section.publisherSection.blocks[0]!;
    const second = section.publisherSection.blocks[1]!;
    const quote =
      "The saved passage begins here\n\nand continues after the paragraph break.";
    const dom = routeDom([section]);
    const bookmarks = retiredBookmarkedState(section, {
      quote,
      prefix: "Earlier prose. ",
      suffix: " Later prose.",
    });
    const expectedStart = first.text.indexOf("The saved");
    const expectedEnd = second.text.indexOf(" Later prose.");

    const markers = measureCoherencePublisherBookmarkMarkers(
      routeModel([section]),
      bookmarks,
      dom.environment,
    );

    expect(markers).toEqual([
      expect.objectContaining({
        startParagraphAnchor: "p-haaaaaaaaaaaaaaaa",
        endParagraphAnchor: "p-hbbbbbbbbbbbbbbbb",
        startOffset: expectedStart,
        endOffset: expectedEnd,
        paragraphCount: 2,
      }),
    ]);
    expect(publisherMocks.textPoint.mock.calls).toEqual([
      [dom.sectionDoms[0]!.blocks[0], expectedStart],
      [dom.sectionDoms[0]!.blocks[1], expectedEnd],
    ]);
  });

  it("withholds weak and ambiguous recoveries before coordinate lookup", () => {
    const ambiguousSection = identicalTwoParagraphRouteSection();
    const ambiguousDom = routeDom([ambiguousSection]);
    const duplicateQuote = "Same exact paragraph";
    expect(
      measureCoherencePublisherBookmarkMarkers(
        routeModel([ambiguousSection]),
        retiredBookmarkedState(ambiguousSection, { quote: duplicateQuote }),
        ambiguousDom.environment,
      ),
    ).toEqual([]);

    const weakSection = routeSection(
      "weak",
      "Opening context. Current prose follows a wholly separate thought.",
    );
    const weakDom = routeDom([weakSection]);
    expect(
      measureCoherencePublisherBookmarkMarkers(
        routeModel([weakSection]),
        retiredBookmarkedState(weakSection, {
          quote: "Nothing in this section resembles these saved and forgotten words.",
        }),
        weakDom.environment,
      ),
    ).toEqual([]);
    expect(publisherMocks.textPoint).not.toHaveBeenCalled();
    expect(publisherMocks.textRange).not.toHaveBeenCalled();
    expect(publisherMocks.verticalBounds).not.toHaveBeenCalled();
  });

  it("withholds equally revised approximate occurrences before coordinate lookup", () => {
    const current =
      "The same person becomes measurably more intelligent, more able to reason, imagine, and coordinate, while regulated and among trustworthy companions.";
    const section = identicalTwoParagraphRouteSection(current);
    const dom = routeDom([section]);
    const bookmarks = retiredBookmarkedState(section, {
      quote:
        "The same person is measurably more intelligent, more able to reason, imagine, and coordinate, when regulated and in trustworthy company.",
    });

    expect(
      measureCoherencePublisherBookmarkMarkers(
        routeModel([section]),
        bookmarks,
        dom.environment,
      ),
    ).toEqual([]);
    expect(publisherMocks.textPoint).not.toHaveBeenCalled();
    expect(publisherMocks.textRange).not.toHaveBeenCalled();
    expect(publisherMocks.verticalBounds).not.toHaveBeenCalled();
  });

  it("withholds punctuation-only context before coordinate lookup", () => {
    const prefix = ".  :  .";
    const suffix = "!? 🜁";
    const section = routeSection(
      "punctuation",
      `${prefix}current passage${suffix}`,
    );
    const dom = routeDom([section]);
    const bookmarks = retiredBookmarkedState(section, {
      quote: "former words",
      prefix,
      suffix,
    });

    expect(
      measureCoherencePublisherBookmarkMarkers(
        routeModel([section]),
        bookmarks,
        dom.environment,
      ),
    ).toEqual([]);
    expect(publisherMocks.textPoint).not.toHaveBeenCalled();
    expect(publisherMocks.textRange).not.toHaveBeenCalled();
    expect(publisherMocks.verticalBounds).not.toHaveBeenCalled();
  });

  it("withholds a recovered span across an unmapped separator", () => {
    const section = revisedTwoParagraphRouteSection(".  :  .");
    const dom = routeDom([section]);
    const bookmarks = retiredBookmarkedState(section, {
      quote:
        "The saved passage begins here\n\nand continues after the paragraph break.",
      prefix: "Earlier prose. ",
      suffix: " Later prose.",
    });

    expect(
      measureCoherencePublisherBookmarkMarkers(
        routeModel([section]),
        bookmarks,
        dom.environment,
      ),
    ).toEqual([]);
    expect(publisherMocks.textPoint).not.toHaveBeenCalled();
  });

  it("withholds a marker when a public coordinate cannot resolve", () => {
    const section = routeSection();
    const dom = routeDom([section]);
    publisherMocks.textPoint.mockReturnValue(null);
    expect(
      measureCoherencePublisherBookmarkMarkers(
        routeModel([section]),
        bookmarkedState(section),
        dom.environment,
      ),
    ).toEqual([]);
  });
});

describe("Coherence Publisher bookmark lifecycle cleanup", () => {
  it("cleans every capture listener and pending timer", () => {
    vi.useFakeTimers();
    const section = routeSection();
    const dom = routeDom([section]);
    dom.sourceWindow.selection = {
      isCollapsed: false,
      rangeCount: 1,
    } as Selection;
    publisherMocks.readSelection.mockReturnValue(publisherSelection(section));
    const onSelection = vi.fn();
    const onSave = vi.fn();

    const cleanup = bindCoherencePublisherBookmarkCapture(
      routeModel([section]),
      { onSelection, onSave },
      dom.environment,
    );
    expect([...dom.sourceDocument.listeners.keys()].sort()).toEqual([
      "keydown",
      "keyup",
      "pointerdown",
      "pointerup",
      "selectionchange",
    ]);
    vi.runOnlyPendingTimers();
    expect(onSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({ quote: "Alpha beta gamma" }),
    );
    expect(signalMocks.offered).toHaveBeenCalledOnce();

    const preventDefault = vi.fn();
    dom.sourceDocument.dispatch("keydown", {
      altKey: true,
      key: "b",
      preventDefault,
      target: dom.sectionDoms[0]!.block,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();

    dom.sourceDocument.dispatch("selectionchange", {
      target: dom.sectionDoms[0]!.block,
    });
    cleanup();
    expect(
      [...dom.sourceDocument.listeners.values()].every(
        (listeners) => listeners.size === 0,
      ),
    ).toBe(true);
    const selectionCallCount = onSelection.mock.calls.length;
    vi.runOnlyPendingTimers();
    expect(onSelection).toHaveBeenCalledTimes(selectionCallCount);
  });

  it("disconnects every marker observer, listener, frame, and late font task", async () => {
    const section = routeSection();
    const dom = routeDom([section]);
    const onMarkers = vi.fn();
    const cleanup = observeCoherencePublisherBookmarkMarkers(
      routeModel([section]),
      bookmarkedState(section),
      onMarkers,
      dom.environment,
    );

    expect(onMarkers).toHaveBeenCalledOnce();
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]?.observed).toEqual([
      dom.sectionDoms[0]!.root,
      dom.sectionDoms[0]!.block,
    ]);
    expect(FakeMutationObserver.instances).toHaveLength(2);
    expect(FakePerformanceObserver.instances).toHaveLength(1);
    expect(dom.sourceWindow.listeners.get("resize")?.size).toBe(1);
    expect(dom.sourceDocument.listeners.get("visibilitychange")?.size).toBe(1);
    expect(dom.sourceDocument.fonts.listeners.get("loadingdone")?.size).toBe(1);
    expect(dom.sourceDocument.fonts.listeners.get("loadingerror")?.size).toBe(1);

    cleanup();
    const frameCount = dom.sourceWindow.frames.size;
    dom.sourceDocument.fonts.resolveReady();
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true);
    expect(
      FakeMutationObserver.instances.every((observer) => observer.disconnected),
    ).toBe(true);
    expect(FakePerformanceObserver.instances[0]?.disconnected).toBe(true);
    expect(dom.sourceWindow.listeners.get("resize")?.size).toBe(0);
    expect(dom.sourceDocument.listeners.get("visibilitychange")?.size).toBe(0);
    expect(dom.sourceDocument.fonts.listeners.get("loadingdone")?.size).toBe(0);
    expect(dom.sourceDocument.fonts.listeners.get("loadingerror")?.size).toBe(0);
    expect(dom.sourceWindow.frames.size).toBe(frameCount);
  });
});

describe("mounted Coherence Publisher bookmark ownership", () => {
  it("captures and saves through the shared store with both announcements", () => {
    vi.useFakeTimers();
    const section = routeSection();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    const removeAllRanges = vi.fn();
    const sourceSelection = {
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges,
    } as unknown as Selection;
    dom.sourceWindow.selection = sourceSelection;
    publisherMocks.readSelection.mockReturnValue(publisherSelection(section));
    const captured = readCoherencePublisherBookmarkSelection(
      model,
      sourceSelection,
      dom.environment.document,
    );
    expect(captured).not.toBeNull();
    configureComponentHooks([false, captured, null, [], null, null, null]);
    vi.stubGlobal("document", dom.sourceDocument);
    vi.stubGlobal("window", dom.sourceWindow);

    const rendered = CoherencePublisherBookmarkBridgeClient({ model });
    const cleanup = runComponentEffects();
    dom.sourceDocument.dispatch("selectionchange", {
      target: dom.sectionDoms[0]!.block,
    });
    vi.advanceTimersByTime(250);
    expect(signalMocks.offered).toHaveBeenCalledOnce();

    const action = findPropsByClassName(
      rendered,
      "reader-selection-bubble-action",
    );
    expect(action).not.toBeNull();
    expect(action?.onClick).toBeTypeOf("function");
    (action?.onClick as () => void)();

    const stored = storeMocks.bookmarks as ReaderBookmarksState;
    expect(storeMocks.useBookmarks).toHaveBeenCalledOnce();
    expect(liveBookmarks(stored)).toHaveLength(1);
    expect(liveBookmarks(stored)[0]).toMatchObject({
      sectionId: "section",
      quote: "Alpha beta gamma",
    });
    expect(storeMocks.appendEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        eventType: "bookmark_added",
        route: "/manuscripts/1/section/",
        sectionId: "section",
      }),
    );
    expect(signalMocks.saved).toHaveBeenCalledOnce();
    expect(hookMocks.stateSetters[2]).toHaveBeenCalledWith("saved");
    expect(removeAllRanges).toHaveBeenCalledOnce();

    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    expect(
      [...dom.sourceDocument.listeners.values()].every(
        (listeners) => listeners.size === 0,
      ),
    ).toBe(true);
    expect(
      FakeMutationObserver.instances.every((observer) => observer.disconnected),
    ).toBe(true);
  });

  it("reactively measures and removes through the shared store", () => {
    const section = routeSection();
    const model = routeModel([section]);
    const dom = routeDom([section]);
    const initial = bookmarkedState(section);
    storeMocks.bookmarks = initial;
    const markers = measureCoherencePublisherBookmarkMarkers(
      model,
      initial,
      dom.environment,
    );
    expect(markers).toHaveLength(1);
    configureComponentHooks([
      true,
      null,
      null,
      markers,
      { bookmarkId: "bookmark-1", mode: "active" },
      null,
      "bookmark-1",
    ]);
    vi.stubGlobal("document", dom.sourceDocument);
    vi.stubGlobal("window", dom.sourceWindow);

    const rendered = CoherencePublisherBookmarkBridgeClient({ model });
    const cleanup = runComponentEffects();
    expect(storeMocks.useBookmarks).toHaveBeenCalledOnce();
    expect(hookMocks.stateSetters[3]).toHaveBeenCalledWith([
      expect.objectContaining({ bookmark: expect.objectContaining({ id: "bookmark-1" }) }),
    ]);

    const action = findPropsByClassName(
      rendered,
      "reader-bookmark-highlight-confirm-remove",
    );
    expect(action).not.toBeNull();
    expect(action?.onClick).toBeTypeOf("function");
    (action?.onClick as () => void)();

    const stored = storeMocks.bookmarks as ReaderBookmarksState;
    expect(liveBookmarks(stored)).toEqual([]);
    expect(stored.bookmarks["bookmark-1"]?.removedAt).toBeTypeOf("number");
    expect(storeMocks.appendEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        eventType: "bookmark_removed",
        route: "/manuscripts/1/section/",
        sectionId: "section",
      }),
    );

    cleanup();
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true);
    expect(
      FakeMutationObserver.instances.every((observer) => observer.disconnected),
    ).toBe(true);
    expect(FakePerformanceObserver.instances[0]?.disconnected).toBe(true);
    expect(dom.sourceWindow.frames.size).toBe(0);
    expect(
      [...dom.sourceDocument.listeners.values()].every(
        (listeners) => listeners.size === 0,
      ),
    ).toBe(true);
  });
});
