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
  recordReadingTime: vi.fn((
    value: unknown,
    section: { sectionId: string },
    timing: {
      activeSeconds: number;
      idleSeconds: number;
      totalVisibleSeconds: number;
    },
  ) => {
    void section;
    void timing;
    return value;
  }),
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
  rect: DOMRect = domRect();

  readonly getBoundingClientRect = vi.fn((): DOMRect => this.rect);

  querySelectorAll<T>(selector: string): T[] {
    return [...(this.selectorResults.get(selector) ?? [])] as unknown as T[];
  }
}

function domRect(
  values: Readonly<Partial<Pick<DOMRect, "bottom" | "height" | "top">>> = {},
): DOMRect {
  const top = values.top ?? 0;
  const height = values.height ?? 400;
  return {
    bottom: values.bottom ?? top + height,
    height,
    left: 0,
    right: 500,
    top,
    width: 500,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
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
  readonly selectorResults = new Map<string, FakeElement>();

  constructor(roots: readonly FakeElement[]) {
    this.roots = roots;
  }

  querySelector<T>(selector: string): T | null {
    return (this.selectorResults.get(selector) ?? null) as T | null;
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
  {
    hash = "",
    pathname = "/manuscripts/9/",
  }: { hash?: string; pathname?: string } = {},
) {
  const addEventListener = vi.fn();
  const cancelAnimationFrame = vi.fn();
  const clearInterval = vi.fn();
  const dispatchEvent = vi.fn();
  const removeEventListener = vi.fn();
  const requestAnimationFrame = vi.fn((callback: () => void) => {
    void callback;
    return 17;
  });
  const scrollTo = vi.fn();
  const setInterval = vi.fn((callback: () => void) => {
    void callback;
    return 23;
  });
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
    location: { hash, pathname },
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
    setInterval,
  };
}

function runPublisherIsland(
  sections: readonly ReaderEngagementSection[],
  initialFragmentPolicy: "inert" | "track" = "track",
) {
  ReaderEngagementIsland({
    domContract: "publisher-embedded",
    initialFragmentPolicy,
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

function runCoherenceIsland(sections: readonly ReaderEngagementSection[]) {
  ReaderEngagementIsland({ domContract: "coherence", sections });
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

  it("does not let a Publisher hash override positive visibility ownership", () => {
    const dom = publisherDom(["a", "b"]);
    dom.elements[1]!.rect = domRect({ bottom: 900, top: 600 });
    const browser = installBrowser(dom.document, {
      hash: "#b",
    });
    const cleanup = runPublisherIsland([section("a"), section("b")]);
    const hashListener = browser.addEventListener.mock.calls.find(
      ([name]) => name === "hashchange",
    )?.[1] as (() => void) | undefined;

    expect(browser.dispatchEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        detail: { path: "/manuscripts/9/", sectionId: "a" },
      }),
    );

    browser.dispatchEvent.mockClear();
    browser.requestAnimationFrame.mockClear();
    hashListener?.();

    expect(browser.dispatchEvent).not.toHaveBeenCalled();
    expect(dom.document.getElementById).not.toHaveBeenCalled();
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
    expect(browser.scrollTo).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("dispatches a native Coherence hash with the captured mount path", () => {
    const dom = publisherDom(["a", "b"]);
    dom.elements[1]!.rect = domRect({ bottom: 900, top: 600 });
    dom.document.selectorResults.set(
      '[data-reader-section-id="a"]',
      dom.elements[0]!,
    );
    dom.document.selectorResults.set(
      '[data-reader-section-id="b"]',
      dom.elements[1]!,
    );
    const browser = installBrowser(dom.document, {
      pathname: "/manuscripts/1/a/",
    });
    const cleanup = runCoherenceIsland([section("a"), section("b")]);
    const hashListener = browser.addEventListener.mock.calls.find(
      ([name]) => name === "hashchange",
    )?.[1] as (() => void) | undefined;

    browser.dispatchEvent.mockClear();
    browser.requestAnimationFrame.mockClear();
    window.location.pathname = "/manuscripts/2/";
    window.location.hash = "#b";
    hashListener?.();

    expect(browser.dispatchEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        detail: { path: "/manuscripts/1/a/", sectionId: "b" },
      }),
    );
    expect(browser.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(browser.dispatchEvent.mock.invocationCallOrder[0]).toBeLessThan(
      browser.requestAnimationFrame.mock.invocationCallOrder[0]!,
    );

    cleanup?.();
  });

  it.each([
    "#section-p-h0123456789abcdef",
    "#unmapped-fragment",
  ])("keeps an initial work fragment inert before every side effect for %s", (hash) => {
    const dom = publisherDom(["section"]);
    const browser = installBrowser(dom.document, { hash });

    expect(runPublisherIsland([section("section")], "inert")).toBeUndefined();

    expect(browser.addEventListener).not.toHaveBeenCalled();
    expect(browser.setInterval).not.toHaveBeenCalled();
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
    expect(browser.dispatchEvent).not.toHaveBeenCalled();
    expect(dom.document.addEventListener).not.toHaveBeenCalled();
    expect(mocks.updateStoredProgress).not.toHaveBeenCalled();
    expect(mocks.appendStoredEvent).not.toHaveBeenCalled();
  });

  it("uses the render-time fragment snapshot if redirect clears the hash before the effect", () => {
    const dom = publisherDom(["section"]);
    const querySelector = vi.spyOn(dom.document, "querySelector");
    const querySelectorAll = vi.spyOn(dom.document, "querySelectorAll");
    const browser = installBrowser(dom.document, {
      hash: "#section-p-h0123456789abcdef",
    });

    ReaderEngagementIsland({
      domContract: "publisher-embedded",
      initialFragmentPolicy: "inert",
      sections: [section("section")],
    });
    window.location.hash = "";
    const refEffect = mocks.effects[0];
    const runtimeEffect = mocks.effects[1];
    if (refEffect === undefined || runtimeEffect === undefined) {
      throw new TypeError("Reader engagement effects were not registered.");
    }
    refEffect();

    expect(runtimeEffect()).toBeUndefined();

    expect(querySelector).not.toHaveBeenCalled();
    expect(querySelectorAll).not.toHaveBeenCalled();
    expect(dom.document.getElementById).not.toHaveBeenCalled();
    expect(dom.elements[0]!.getBoundingClientRect).not.toHaveBeenCalled();
    expect(browser.addEventListener).not.toHaveBeenCalled();
    expect(dom.document.addEventListener).not.toHaveBeenCalled();
    expect(browser.setInterval).not.toHaveBeenCalled();
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
    expect(browser.dispatchEvent).not.toHaveBeenCalled();
    expect(mocks.readStoredProgress).not.toHaveBeenCalled();
    expect(mocks.updateStoredProgress).not.toHaveBeenCalled();
    expect(mocks.appendStoredEvent).not.toHaveBeenCalled();
  });

  it("tracks normally under the inert policy when no initial fragment exists", () => {
    const dom = publisherDom(["section"]);
    const browser = installBrowser(dom.document);

    const cleanup = runPublisherIsland([section("section")], "inert");

    expect(mocks.markSectionOpened).toHaveBeenCalledOnce();
    expect(browser.addEventListener).toHaveBeenCalledWith(
      "hashchange",
      expect.any(Function),
    );
    cleanup?.();
  });

  it("does not activate or open an offscreen first section", () => {
    const dom = publisherDom(["section"]);
    dom.elements[0]!.rect = domRect({ bottom: 900, top: 600 });
    const browser = installBrowser(dom.document);
    const cleanup = runPublisherIsland([section("section")]);

    expect(browser.dispatchEvent).not.toHaveBeenCalled();
    expect(mocks.markSectionOpened).not.toHaveBeenCalled();
    expect(mocks.updateStoredProgress).not.toHaveBeenCalled();
    expect(mocks.appendStoredEvent).not.toHaveBeenCalled();

    cleanup?.();
  });

  it("partitions timing from A to B and leaves a no-section gap uncredited", () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const dom = publisherDom(["a", "b"]);
    dom.elements[0]!.rect = domRect({ bottom: 400, top: 0 });
    dom.elements[1]!.rect = domRect({ bottom: 900, top: 600 });
    const browser = installBrowser(dom.document, {
      pathname: "/manuscripts/9/",
    });
    const cleanup = runPublisherIsland([section("a"), section("b")]);
    const scrollListener = browser.addEventListener.mock.calls.find(
      ([name]) => name === "scroll",
    )?.[1] as (() => void) | undefined;

    expect(browser.dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      detail: { path: "/manuscripts/9/", sectionId: "a" },
    });
    expect(dom.elements[0]!.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(dom.elements[1]!.getBoundingClientRect).toHaveBeenCalledOnce();

    now = 2_000;
    window.location.pathname = "/manuscripts/8/";
    dom.elements[0]!.rect = domRect({ bottom: -100, top: -500 });
    dom.elements[1]!.rect = domRect({ bottom: 400, top: 0 });
    scrollListener?.();
    const firstFrame = browser.requestAnimationFrame.mock.calls[0]?.[0] as
      | (() => void)
      | undefined;
    firstFrame?.();

    now = 5_000;
    dom.elements[0]!.rect = domRect({ bottom: -100, top: -500 });
    dom.elements[1]!.rect = domRect({ bottom: -100, top: -500 });
    scrollListener?.();
    const secondFrame = browser.requestAnimationFrame.mock.calls[1]?.[0] as
      | (() => void)
      | undefined;
    secondFrame?.();

    now = 10_000;
    const interval = browser.setInterval.mock.calls[0]?.[0] as
      | (() => void)
      | undefined;
    interval?.();
    now = 12_000;
    cleanup?.();

    expect(browser.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(browser.dispatchEvent.mock.calls[1]?.[0]).toMatchObject({
      detail: { path: "/manuscripts/9/", sectionId: "b" },
    });
    expect(
      mocks.appendStoredEvent.mock.calls.map(([event]) => event.route),
    ).toEqual(expect.arrayContaining(["/manuscripts/9/"]));
    expect(
      mocks.appendStoredEvent.mock.calls.every(
        ([event]) => event.route === "/manuscripts/9/",
      ),
    ).toBe(true);
    expect(mocks.recordReadingTime).toHaveBeenCalledTimes(2);
    expect(mocks.recordReadingTime.mock.calls.map((call) => [
      call[1]?.sectionId,
      call[2],
    ])).toEqual([
      [
        "a",
        { activeSeconds: 2, idleSeconds: 0, totalVisibleSeconds: 2 },
      ],
      [
        "b",
        { activeSeconds: 3, idleSeconds: 0, totalVisibleSeconds: 3 },
      ],
    ]);
    expect(dom.elements[0]!.getBoundingClientRect).toHaveBeenCalledTimes(3);
    expect(dom.elements[1]!.getBoundingClientRect).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["missing", ["first"], [section("first"), section("second")]],
    ["extra", ["first", "second"], [section("first")]],
    ["reordered", ["second", "first"], [section("first"), section("second")]],
  ])("registers no listeners or progress writes after a %s DOM mismatch", (
    _label,
    domSectionIds,
    sections,
  ) => {
    const dom = publisherDom(domSectionIds);
    const browser = installBrowser(dom.document);
    expect(runPublisherIsland(sections)).toBeUndefined();

    expect(browser.addEventListener).not.toHaveBeenCalled();
    expect(browser.setInterval).not.toHaveBeenCalled();
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
    expect(browser.dispatchEvent).not.toHaveBeenCalled();
    expect(dom.document.addEventListener).not.toHaveBeenCalled();
    expect(mocks.updateStoredProgress).not.toHaveBeenCalled();
    expect(mocks.appendStoredEvent).not.toHaveBeenCalled();
  });
});
