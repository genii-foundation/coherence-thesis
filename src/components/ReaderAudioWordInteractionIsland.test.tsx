import { afterEach, describe, expect, it, vi } from "vitest";
import { audioStartFromWordEventName } from "@/lib/audio-events";

type Dependencies = readonly unknown[] | undefined;
type Effect = () => void | (() => void);
type EffectKind = "effect" | "layout";
type HookSlot =
  | Readonly<{ kind: "memo"; dependencies: Dependencies; value: unknown }>
  | { kind: "ref"; current: unknown }
  | {
      kind: "state";
      value: unknown;
      setValue: (value: unknown) => void;
    }
  | {
      cleanup?: () => void;
      dependencies: Dependencies;
      kind: EffectKind;
    };

type EffectTask = Readonly<{
  dependencies: Dependencies;
  effect: Effect;
  index: number;
  kind: EffectKind;
}>;

function dependenciesMatch(
  left: Dependencies,
  right: Dependencies,
): boolean {
  return left !== undefined &&
    right !== undefined &&
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
}

class HookHarness<Props> {
  private component: (props: Props) => unknown;
  private cursor = 0;
  private dirty = false;
  private pendingEffects: EffectTask[] = [];
  private pendingLayouts: EffectTask[] = [];
  private props: Props;
  private readonly slots: HookSlot[] = [];
  output: unknown = null;

  constructor(component: (props: Props) => unknown, props: Props) {
    this.component = component;
    this.props = props;
  }

  render(props: Props = this.props): unknown {
    this.props = props;
    let passes = 0;
    do {
      if (passes++ > 20) throw new TypeError("Hook harness did not settle.");
      this.cursor = 0;
      this.dirty = false;
      this.pendingEffects = [];
      this.pendingLayouts = [];
      mocks.harness = this as HookHarness<unknown>;
      this.output = this.component(this.props);
      this.runTasks(this.pendingLayouts);
      this.runTasks(this.pendingEffects);
    } while (this.dirty);
    return this.output;
  }

  unmount(): void {
    for (const slot of [...this.slots].reverse()) {
      if (slot.kind === "effect" || slot.kind === "layout") slot.cleanup?.();
    }
    this.slots.length = 0;
  }

  useCallback<T>(callback: T, dependencies: Dependencies): T {
    return this.useMemo(() => callback, dependencies);
  }

  useEffect(kind: EffectKind, effect: Effect, dependencies: Dependencies): void {
    const index = this.cursor++;
    const slot = this.slots[index];
    if (
      slot !== undefined &&
      (slot.kind === "effect" || slot.kind === "layout") &&
      slot.kind === kind &&
      dependenciesMatch(slot.dependencies, dependencies)
    ) return;
    const task = { dependencies, effect, index, kind } satisfies EffectTask;
    if (kind === "layout") this.pendingLayouts.push(task);
    else this.pendingEffects.push(task);
  }

  useMemo<T>(factory: () => T, dependencies: Dependencies): T {
    const index = this.cursor++;
    const slot = this.slots[index];
    if (
      slot?.kind === "memo" &&
      dependenciesMatch(slot.dependencies, dependencies)
    ) return slot.value as T;
    const value = factory();
    this.slots[index] = { dependencies, kind: "memo", value };
    return value;
  }

  useRef<T>(initialValue: T): { current: T } {
    const index = this.cursor++;
    const slot = this.slots[index];
    if (slot?.kind === "ref") return slot as { current: T };
    const ref = { kind: "ref" as const, current: initialValue };
    this.slots[index] = ref;
    return ref;
  }

  useState<T>(
    initialValue: T | (() => T),
  ): [T, (value: T | ((current: T) => T)) => void] {
    const index = this.cursor++;
    const existing = this.slots[index];
    if (existing?.kind === "state") {
      return [
        existing.value as T,
        existing.setValue as unknown as (
          value: T | ((current: T) => T)
        ) => void,
      ];
    }
    const slot: Extract<HookSlot, { kind: "state" }> = {
      kind: "state",
      value: typeof initialValue === "function"
        ? (initialValue as () => T)()
        : initialValue,
      setValue: (value) => {
        const next = typeof value === "function"
          ? (value as (current: T) => T)(slot.value as T)
          : value;
        if (Object.is(slot.value, next)) return;
        slot.value = next;
        this.dirty = true;
      },
    };
    this.slots[index] = slot;
    return [
      slot.value as T,
      slot.setValue as unknown as (
        value: T | ((current: T) => T)
      ) => void,
    ];
  }

  private runTasks(tasks: readonly EffectTask[]): void {
    for (const task of tasks) {
      const prior = this.slots[task.index];
      if (prior?.kind === "effect" || prior?.kind === "layout") {
        prior.cleanup?.();
      }
      const cleanup = task.effect();
      this.slots[task.index] = {
        ...(typeof cleanup === "function" ? { cleanup } : {}),
        dependencies: task.dependencies,
        kind: task.kind,
      };
    }
  }
}

const mocks = vi.hoisted(() => ({
  harness: null as HookHarness<unknown> | null,
  selectionIsActive: vi.fn(() => false),
}));

vi.mock("react", () => ({
  useCallback<T>(callback: T, dependencies: Dependencies) {
    return mocks.harness!.useCallback(callback, dependencies);
  },
  useEffect(effect: Effect, dependencies: Dependencies) {
    mocks.harness!.useEffect("effect", effect, dependencies);
  },
  useLayoutEffect(effect: Effect, dependencies: Dependencies) {
    mocks.harness!.useEffect("layout", effect, dependencies);
  },
  useMemo<T>(factory: () => T, dependencies: Dependencies) {
    return mocks.harness!.useMemo(factory, dependencies);
  },
  useRef<T>(initialValue: T) {
    return mocks.harness!.useRef(initialValue);
  },
  useState<T>(initialValue: T | (() => T)) {
    return mocks.harness!.useState(initialValue);
  },
}));
vi.mock("react-dom", () => ({
  createPortal(children: unknown, container: unknown) {
    return Object.freeze({ children, container, kind: "portal" });
  },
}));
vi.mock("@/lib/reader-selection", () => ({
  selectionIsActive: mocks.selectionIsActive,
}));

import {
  ReaderAudioWordInteractionHostIsland,
  ReaderAudioWordInteractionIsland,
  type ReaderAudioWordInteractionSection,
} from "./ReaderAudioWordInteractionIsland";

class FakeClassList {
  readonly values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string | undefined> = {};
  parentElement: FakeElement | null = null;
  tagName = "SPAN";

  get className(): string {
    return [...this.classList.values].join(" ");
  }

  set className(value: string) {
    this.classList.values.clear();
    for (const token of value.split(/\s+/u).filter(Boolean)) {
      this.classList.add(token);
    }
  }

  append(child: FakeElement): void {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
  }

  closest<T>(selector: string): T | null {
    if (
      selector === "[data-audio-word='true']" &&
      this.dataset.audioWord === "true"
    ) return this as unknown as T;
    if (
      selector === ".audio-word-tooltip" &&
      this.classList.contains("audio-word-tooltip")
    ) return this as unknown as T;
    if (
      selector === "a[href]" &&
      this.tagName === "A" &&
      this.attributes.has("href")
    ) return this as unknown as T;
    return this.parentElement?.closest<T>(selector) ?? null;
  }

  remove(): void {
    const parent = this.parentElement;
    if (parent !== null) {
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    }
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

type Listener = (event: never) => void;

class FakeEventTarget {
  readonly added = new Map<string, Listener[]>();
  readonly dispatched: unknown[] = [];
  readonly removed = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.added.get(type) ?? [];
    listeners.push(listener);
    this.added.set(type, listeners);
  }

  dispatchEvent(event: { type: string }): boolean {
    this.dispatched.push(event);
    this.emit(event.type, event);
    return true;
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.added.get(type) ?? []) {
      if (!(this.removed.get(type) ?? []).includes(listener)) {
        listener(event as never);
      }
    }
  }

  removeEventListener(type: string, listener: Listener): void {
    const listeners = this.removed.get(type) ?? [];
    listeners.push(listener);
    this.removed.set(type, listeners);
  }
}

class FakeCustomEvent<T> {
  readonly detail: T;
  readonly type: string;

  constructor(type: string, init: { detail: T }) {
    this.detail = init.detail;
    this.type = type;
  }
}

type Browser = ReturnType<typeof installBrowser>;

function installBrowser(initialWords: readonly FakeElement[]) {
  let words = initialWords;
  let queryCount = 0;
  let frame = 0;
  const documentEvents = new FakeEventTarget();
  const windowEvents = new FakeEventTarget();
  const documentValue = {
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    createElement: vi.fn(() => new FakeElement()),
    querySelectorAll: vi.fn((selector: string) => {
      queryCount += 1;
      return selector === "[data-audio-word='true']" ? [...words] : [];
    }),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  };
  const windowValue = {
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    cancelAnimationFrame: vi.fn(),
    dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    requestAnimationFrame: vi.fn((callback: () => void) => {
      frame += 1;
      callback();
      return frame;
    }),
  };
  vi.stubGlobal("CustomEvent", FakeCustomEvent);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", documentValue);
  vi.stubGlobal("window", windowValue);
  return {
    documentEvents,
    get queryCount() {
      return queryCount;
    },
    replaceWords(nextWords: readonly FakeElement[]) {
      words = nextWords;
    },
    windowEvents,
  };
}

function audioWord(
  sectionId: string,
  index: number,
  charIndex: number,
  charEnd: number,
): FakeElement {
  const word = new FakeElement();
  word.dataset.audioWord = "true";
  word.dataset.audioWordId = `audio-word-${sectionId}-${index}`;
  word.dataset.audioSectionId = sectionId;
  word.dataset.audioCharStart = String(charIndex);
  word.dataset.audioCharEnd = String(charEnd);
  word.classList.add("audio-word");
  return word;
}

function section(
  sectionId: string,
  suffix = sectionId,
): ReaderAudioWordInteractionSection {
  return Object.freeze({
    queueIdentity: Object.freeze({
      audioVersionId: `audio-${suffix}`,
      contentHash: suffix.padEnd(16, "0").slice(0, 16),
    }),
    sectionId,
  });
}

function pointerEvent(target: FakeElement) {
  return { target };
}

function clickEvent(target: FakeElement) {
  return { preventDefault: vi.fn(), target };
}

function progressEvent(sectionId: string, charIndex: number) {
  return { detail: { charIndex, sectionId } };
}

function audioEvents(browser: Browser): FakeCustomEvent<unknown>[] {
  return browser.windowEvents.dispatched.filter(
    (event): event is FakeCustomEvent<unknown> =>
      event instanceof FakeCustomEvent &&
      event.type === audioStartFromWordEventName,
  );
}

function portalChildren(output: unknown): Array<{
  children: { props: Record<string, unknown> };
  container: FakeElement;
  kind: string;
}> {
  const children = (output as { props?: { children?: unknown } })?.props
    ?.children;
  return (Array.isArray(children) ? children : [children]).filter(
    (child): child is {
      children: { props: Record<string, unknown> };
      container: FakeElement;
      kind: string;
    } => Boolean(child && typeof child === "object" && child.kind === "portal"),
  );
}

const mounted: HookHarness<unknown>[] = [];

function mountHost(
  sections: readonly ReaderAudioWordInteractionSection[],
  words: readonly FakeElement[],
) {
  const browser = installBrowser(words);
  const harness = new HookHarness(
    ReaderAudioWordInteractionHostIsland,
    { sections },
  );
  mounted.push(harness as HookHarness<unknown>);
  harness.render();
  return { browser, harness };
}

afterEach(() => {
  for (const harness of mounted.splice(0).reverse()) harness.unmount();
  mocks.harness = null;
  mocks.selectionIsActive.mockReset();
  mocks.selectionIsActive.mockReturnValue(false);
  vi.unstubAllGlobals();
});

describe("Reader audio word interaction singleton host", () => {
  for (const sectionCount of [1, 3, 32]) {
    it(`installs one listener set for ${sectionCount} sections`, () => {
      const sections = Array.from(
        { length: sectionCount },
        (_, index) => section(`section-${index}`),
      );
      const words = sections.map(({ sectionId }, index) =>
        audioWord(sectionId, 0, index * 10, index * 10 + 4)
      );
      const { browser } = mountHost(sections, words);

      expect(browser.queryCount).toBe(1);
      for (const type of ["pointermove", "click", "keydown"]) {
        expect(browser.documentEvents.added.get(type)).toHaveLength(1);
      }
      expect(
        browser.windowEvents.added.get("coherence:audio-progress"),
      ).toHaveLength(1);
    });
  }

  it("rejects duplicate section identities without querying or listening", () => {
    const duplicate = section("section-a");
    const { browser } = mountHost(
      [duplicate, section("section-a", "other")],
      [audioWord("section-a", 0, 0, 4)],
    );

    expect(browser.queryCount).toBe(0);
    expect(browser.documentEvents.added.size).toBe(0);
    expect(browser.windowEvents.added.size).toBe(0);
  });

  it("uses the exact section queue identity for two click playback", () => {
    const first = audioWord("section-a", 0, 0, 4);
    const second = audioWord("section-b", 0, 10, 14);
    const { browser, harness } = mountHost(
      [section("section-a", "first"), section("section-b", "second")],
      [first, second],
    );

    const firstClick = clickEvent(second);
    browser.documentEvents.emit("click", firstClick);
    expect(firstClick.preventDefault).toHaveBeenCalledOnce();
    expect(audioEvents(browser)).toHaveLength(0);
    browser.documentEvents.emit("click", clickEvent(second));
    harness.render();

    expect(audioEvents(browser)).toHaveLength(1);
    expect(audioEvents(browser)[0]?.detail).toEqual({
      charIndex: 10,
      queueIdentity: {
        audioVersionId: "audio-second",
        contentHash: "second0000000000",
      },
      sectionId: "section-b",
      wordId: "audio-word-section-b-0",
    });
    expect(second.classList.contains("is-audio-focused")).toBe(true);
    expect(first.classList.contains("is-audio-focused")).toBe(false);
  });

  it("starts from the hover tooltip and keeps both tooltip labels", () => {
    const word = audioWord("section-a", 0, 5, 9);
    const { browser, harness } = mountHost([section("section-a")], [word]);

    browser.documentEvents.emit("pointermove", pointerEvent(word));
    harness.render();
    let portals = portalChildren(harness.output);
    expect(portals[0]?.children.props.children).toBe("Click Here to Play");
    (portals[0]?.children.props.onClick as () => void)();
    expect(audioEvents(browser)).toHaveLength(1);

    browser.documentEvents.emit("click", clickEvent(word));
    harness.render();
    portals = portalChildren(harness.output);
    expect(portals[0]?.children.props.children).toBe(
      "Click Again to start playback",
    );
  });

  it("suppresses links and selections and clears focus on Escape", () => {
    const word = audioWord("section-a", 0, 0, 4);
    const link = new FakeElement();
    link.tagName = "A";
    link.setAttribute("href", "/elsewhere/");
    link.append(word);
    const { browser, harness } = mountHost([section("section-a")], [word]);

    browser.documentEvents.emit("pointermove", pointerEvent(word));
    harness.render();
    expect(portalChildren(harness.output)).toHaveLength(0);
    browser.documentEvents.emit("click", clickEvent(word));
    expect(word.classList.contains("is-audio-focused")).toBe(false);

    word.remove();
    mocks.selectionIsActive.mockReturnValue(true);
    browser.documentEvents.emit("pointermove", pointerEvent(word));
    harness.render();
    expect(portalChildren(harness.output)).toHaveLength(0);
    mocks.selectionIsActive.mockReturnValue(false);
    browser.documentEvents.emit("click", clickEvent(word));
    expect(word.classList.contains("is-audio-focused")).toBe(true);
    browser.documentEvents.emit("keydown", { key: "Escape" });
    harness.render();
    expect(word.classList.contains("is-audio-focused")).toBe(false);
    expect(portalChildren(harness.output)).toHaveLength(0);
  });

  it("preserves inclusive ends, next word gaps, and edge fallbacks", () => {
    const words = [
      audioWord("section-a", 0, 10, 14),
      audioWord("section-a", 1, 20, 24),
      audioWord("section-a", 2, 30, 34),
    ];
    const { browser } = mountHost([section("section-a")], words);
    const expectCurrent = (charIndex: number, expected: number) => {
      browser.windowEvents.emit(
        "coherence:audio-progress",
        progressEvent("section-a", charIndex),
      );
      expect(
        words.map((word) => word.classList.contains("is-audio-current")),
      ).toEqual(words.map((_, index) => index === expected));
    };

    expectCurrent(0, 0);
    expectCurrent(10, 0);
    expectCurrent(14, 0);
    expectCurrent(15, 1);
    expectCurrent(20, 1);
    expectCurrent(24, 1);
    expectCurrent(25, 2);
    expectCurrent(99, 2);
  });

  it("selects the earlier word at a shared inclusive boundary", () => {
    const words = [
      audioWord("section-a", 0, 0, 4),
      audioWord("section-a", 1, 4, 8),
      audioWord("section-a", 2, 8, 12),
    ];
    const { browser } = mountHost([section("section-a")], words);

    browser.windowEvents.emit(
      "coherence:audio-progress",
      progressEvent("section-a", 4),
    );

    expect(
      words.map((word) => word.classList.contains("is-audio-current")),
    ).toEqual([true, false, false]);
  });

  it("transfers the current word across sections", () => {
    const first = audioWord("section-a", 0, 0, 4);
    const second = audioWord("section-b", 0, 10, 14);
    const { browser } = mountHost(
      [section("section-a"), section("section-b")],
      [first, second],
    );

    browser.windowEvents.emit(
      "coherence:audio-progress",
      progressEvent("section-a", 2),
    );
    expect(first.classList.contains("is-audio-current")).toBe(true);
    browser.windowEvents.emit(
      "coherence:audio-progress",
      progressEvent("section-b", 12),
    );
    expect(first.classList.contains("is-audio-current")).toBe(false);
    expect(second.classList.contains("is-audio-current")).toBe(true);
  });

  it("removes every owned listener, class, and portal anchor", () => {
    const word = audioWord("section-a", 0, 0, 4);
    const external = audioWord("section-a", 1, 10, 14);
    external.classList.add("is-audio-current");
    const { browser, harness } = mountHost(
      [section("section-a")],
      [word, external],
    );
    browser.documentEvents.emit("pointermove", pointerEvent(word));
    browser.documentEvents.emit("click", clickEvent(word));
    browser.windowEvents.emit(
      "coherence:audio-progress",
      progressEvent("section-a", 2),
    );
    harness.render();
    expect(word.children).toHaveLength(2);

    harness.unmount();
    mounted.splice(mounted.indexOf(harness as HookHarness<unknown>), 1);

    expect(word.classList.contains("is-audio-focused")).toBe(false);
    expect(word.classList.contains("is-audio-current")).toBe(false);
    expect(word.children).toHaveLength(0);
    expect(external.classList.contains("is-audio-current")).toBe(true);
    for (const type of ["pointermove", "click", "keydown"]) {
      expect(browser.documentEvents.removed.get(type)).toEqual(
        browser.documentEvents.added.get(type),
      );
    }
    expect(
      browser.windowEvents.removed.get("coherence:audio-progress"),
    ).toEqual(browser.windowEvents.added.get("coherence:audio-progress"));
  });

  it("replaces its cache without replacing stable listeners", () => {
    const oldWord = audioWord("section-a", 0, 0, 4);
    const newWord = audioWord("section-b", 0, 10, 14);
    const { browser, harness } = mountHost(
      [section("section-a")],
      [oldWord],
    );
    browser.replaceWords([newWord]);
    harness.render({ sections: [section("section-b")] });

    browser.documentEvents.emit("click", clickEvent(oldWord));
    browser.documentEvents.emit("click", clickEvent(oldWord));
    expect(audioEvents(browser)).toHaveLength(0);
    expect(browser.documentEvents.removed.get("click") ?? []).toHaveLength(0);
    browser.windowEvents.emit(
      "coherence:audio-progress",
      progressEvent("section-b", 12),
    );
    expect(newWord.classList.contains("is-audio-current")).toBe(true);
    browser.documentEvents.emit("click", clickEvent(newWord));
    expect(newWord.classList.contains("is-audio-focused")).toBe(true);
    browser.documentEvents.emit("click", clickEvent(newWord));
    expect(audioEvents(browser)).toHaveLength(1);

    expect(browser.queryCount).toBe(2);
    expect(browser.documentEvents.added.get("click")).toHaveLength(1);
    expect(browser.documentEvents.removed.get("click") ?? []).toHaveLength(0);
    expect(audioEvents(browser)[0]?.detail).toMatchObject({
      sectionId: "section-b",
      wordId: "audio-word-section-b-0",
    });
  });

  it("keeps the singular export as a one section compatibility wrapper", () => {
    const props = section("section-a");
    const harness = new HookHarness(ReaderAudioWordInteractionIsland, props);
    mounted.push(harness as HookHarness<unknown>);
    const output = harness.render() as {
      props: { sections: readonly ReaderAudioWordInteractionSection[] };
      type: unknown;
    };

    expect(output.type).toBe(ReaderAudioWordInteractionHostIsland);
    expect(output.props.sections).toEqual([props]);
  });
});
