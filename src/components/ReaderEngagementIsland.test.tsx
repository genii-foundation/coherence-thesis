import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  appendStoredEvent: vi.fn(),
  readStoredProgress: vi.fn(() => ({ sections: {} })),
  updateStoredProgress: vi.fn(
    (updater: (value: { sections: Record<string, unknown> }) => unknown) =>
      updater({ sections: {} }),
  ),
  markSectionOpened: vi.fn((value) => value),
  recordScrollProgress: vi.fn((value) => value),
  markRead: vi.fn((value) => value),
  recordReadingTime: vi.fn((value) => value),
}));

vi.mock("react", () => ({
  useEffect(effect: () => void | (() => void)) {
    mocks.effects.push(effect);
  },
  useRef<T>(value: T) {
    return { current: value };
  },
}));
vi.mock("@/lib/reader-progress-store", () => ({
  appendStoredEvent: mocks.appendStoredEvent,
  readStoredProgress: mocks.readStoredProgress,
  updateStoredProgress: mocks.updateStoredProgress,
}));
vi.mock("@/lib/reader-state", () => ({
  isSectionRead: vi.fn(() => false),
  markRead: mocks.markRead,
  markSectionOpened: mocks.markSectionOpened,
  progressStateForSection: vi.fn(() => undefined),
  recordReadingTime: mocks.recordReadingTime,
  recordScrollProgress: mocks.recordScrollProgress,
}));
vi.mock("@/lib/reader-engagement", () => ({
  createEngagementEvent: vi.fn((eventType, detail) => ({
    eventType,
    ...detail,
  })),
}));

import {
  ReaderEngagementIsland,
  resolvePublisherReaderEngagementElements,
  type ReaderEngagementSection,
} from "./ReaderEngagementIsland";

const transitionRootSelector =
  "[data-coherence-publisher-transition-root='true']";
const publisherSectionSelector = "[data-publisher-section]";

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly selectorResults = new Map<string, readonly FakeElement[]>();

  getBoundingClientRect(): DOMRect {
    return {
      bottom: 400,
      height: 400,
      left: 0,
      right: 500,
      top: 0,
      width: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }

  querySelectorAll<T>(selector: string): T[] {
    return [...(this.selectorResults.get(selector) ?? [])] as unknown as T[];
  }
}

class FakeDocument {
  readonly documentElement = { scrollHeight: 1_000 };
  readonly visibilityState = "visible";
  readonly addEventListener = vi.fn();
  readonly getElementById = vi.fn<(id: string) => HTMLElement | null>(
    () => null,
  );
  readonly removeEventListener = vi.fn();
  readonly roots: readonly FakeElement[];

  constructor(roots: readonly FakeElement[]) {
    this.roots = roots;
  }

  querySelector<T>(): T | null {
    return null;
  }

  querySelectorAll<T>(selector: string): T[] {
    return (
      selector === transitionRootSelector ? [...this.roots] : []
    ) as unknown as T[];
  }
}

function section(sectionId: string): ReaderEngagementSection {
  return {
    sectionId,
    continuityId: sectionId,
    legacyContinuityIds: [],
    progressContinuityGroups: [[sectionId]],
    legacySectionIds: [],
    contentHash: "0123456789abcdef",
    paragraphs: [],
  };
}

function publisherDom(sectionIds: readonly string[]): Readonly<{
  document: FakeDocument;
  elements: readonly FakeElement[];
}> {
  const root = new FakeElement();
  const elements = sectionIds.map((sectionId) => {
    const element = new FakeElement();
    element.dataset.publisherSection = sectionId;
    return element;
  });
  root.selectorResults.set(publisherSectionSelector, elements);
  return Object.freeze({
    document: new FakeDocument([root]),
    elements: Object.freeze(elements),
  });
}

function installBrowser(
  ownerDocument: FakeDocument,
  { hash = "" }: { hash?: string } = {},
) {
  const addEventListener = vi.fn();
  const cancelAnimationFrame = vi.fn();
  const clearInterval = vi.fn();
  const dispatchEvent = vi.fn();
  const removeEventListener = vi.fn();
  const requestAnimationFrame = vi.fn(() => 17);
  const scrollTo = vi.fn();
  const setInterval = vi.fn(() => 23);
  vi.stubGlobal("CustomEvent", class<T> {
    readonly detail: T;
    constructor(_name: string, init: { detail: T }) {
      this.detail = init.detail;
    }
  });
  vi.stubGlobal("document", ownerDocument);
  vi.stubGlobal("window", {
    addEventListener,
    cancelAnimationFrame,
    clearInterval,
    dispatchEvent,
    innerHeight: 500,
    location: { hash, pathname: "/manuscripts/1/section/" },
    removeEventListener,
    requestAnimationFrame,
    scrollTo,
    scrollY: 0,
    setInterval,
  });
  return {
    addEventListener,
    cancelAnimationFrame,
    clearInterval,
    dispatchEvent,
    removeEventListener,
    requestAnimationFrame,
    scrollTo,
  };
}

function runPublisherIsland(sections: readonly ReaderEngagementSection[]) {
  ReaderEngagementIsland({
    domContract: "publisher-embedded",
    sections,
  });
  const refEffect = mocks.effects[0];
  const runtimeEffect = mocks.effects[1];
  if (refEffect === undefined || runtimeEffect === undefined) {
    throw new TypeError("Reader engagement effects were not registered.");
  }
  refEffect();
  return runtimeEffect();
}

describe("Reader engagement Publisher DOM contract", () => {
  afterEach(() => {
    mocks.effects.length = 0;
    mocks.appendStoredEvent.mockClear();
    mocks.readStoredProgress.mockClear();
    mocks.updateStoredProgress.mockClear();
    mocks.markSectionOpened.mockClear();
    mocks.recordScrollProgress.mockClear();
    mocks.markRead.mockClear();
    mocks.recordReadingTime.mockClear();
    vi.unstubAllGlobals();
  });

  it("resolves one exact transition root and preserves Publisher section order", () => {
    const dom = publisherDom(["first", "second"]);
    expect(
      resolvePublisherReaderEngagementElements(
        [section("first"), section("second")],
        dom.document as unknown as Document,
      ),
    ).toEqual(dom.elements);
  });

  it.each([
    ["no transition root", new FakeDocument([]), [section("first")]],
    [
      "two transition roots",
      new FakeDocument([new FakeElement(), new FakeElement()]),
      [section("first")],
    ],
    [
      "missing section",
      publisherDom(["first"]).document,
      [section("first"), section("second")],
    ],
    [
      "unexpected section",
      publisherDom(["first", "second"]).document,
      [section("first")],
    ],
    [
      "reordered section",
      publisherDom(["second", "first"]).document,
      [section("first"), section("second")],
    ],
  ])("fails closed for %s", (_label, ownerDocument, sections) => {
    expect(
      resolvePublisherReaderEngagementElements(
        sections,
        ownerDocument as unknown as Document,
      ),
    ).toBeNull();
  });

  it("uses the existing Coherence tracker and cancels a pending scroll frame", () => {
    const dom = publisherDom(["section"]);
    const browser = installBrowser(dom.document);
    const cleanup = runPublisherIsland([section("section")]);

    expect(mocks.markSectionOpened).toHaveBeenCalledOnce();
    expect(mocks.recordScrollProgress).toHaveBeenCalledOnce();
    expect(browser.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      { passive: true },
    );
    const scrollListener = browser.addEventListener.mock.calls.find(
      ([name]) => name === "scroll",
    )?.[1] as (() => void) | undefined;
    scrollListener?.();
    expect(browser.requestAnimationFrame).toHaveBeenCalledOnce();

    cleanup?.();

    expect(browser.cancelAnimationFrame).toHaveBeenCalledExactlyOnceWith(17);
    expect(browser.clearInterval).toHaveBeenCalledExactlyOnceWith(23);
    expect(browser.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      scrollListener,
    );
  });

  it("dispatches a qualified Publisher paragraph hash without scheduling legacy scrolling", () => {
    const dom = publisherDom(["section"]);
    dom.document.getElementById.mockImplementation((id) =>
      id === "section"
        ? (dom.elements[0] as unknown as HTMLElement)
        : null,
    );
    const browser = installBrowser(dom.document, {
      hash: "#section-p-h0123456789abcdef",
    });
    const cleanup = runPublisherIsland([section("section")]);
    const hashListener = browser.addEventListener.mock.calls.find(
      ([name]) => name === "hashchange",
    )?.[1] as (() => void) | undefined;

    browser.dispatchEvent.mockClear();
    browser.requestAnimationFrame.mockClear();
    hashListener?.();

    expect(browser.dispatchEvent).toHaveBeenCalledOnce();
    expect(browser.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      detail: { sectionId: "section" },
    });
    expect(dom.document.getElementById).not.toHaveBeenCalled();
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
    expect(browser.scrollTo).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("registers no listeners or progress writes after a route-wide DOM mismatch", () => {
    const dom = publisherDom(["first"]);
    const browser = installBrowser(dom.document);
    expect(
      runPublisherIsland([section("first"), section("second")]),
    ).toBeUndefined();

    expect(browser.addEventListener).not.toHaveBeenCalled();
    expect(mocks.updateStoredProgress).not.toHaveBeenCalled();
    expect(mocks.appendStoredEvent).not.toHaveBeenCalled();
  });
});
