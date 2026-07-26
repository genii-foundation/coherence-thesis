import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addBookmark, readerBookmarksStorageKey } from "./reader-bookmarks";
import { readerProgressV2StorageKey, recordScrollProgress } from "./reader-state";
import type { ReaderStore } from "./reader-store";

// useValue() is a React hook and the node environment has no renderer, so the
// subscribe callback it hands to useSyncExternalStore is otherwise unreachable.
// Swapping that one hook for a pass-through records the real callback, which is
// what the tests below use to observe notifications and cross-tab events. The
// rest of react is untouched.
const hook = vi.hoisted(() => ({
  subscribers: [] as Array<(listener: () => void) => () => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: <T>(
      subscribe: (listener: () => void) => () => void,
      getSnapshot: () => T,
    ): T => {
      hook.subscribers.push(subscribe);
      return getSnapshot();
    },
  };
});

// The store reads window/localStorage lazily inside each call, so a minimal
// stub installed before importing the module is enough to exercise it in the
// node test environment.
function installWindowStub() {
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const windowStub = {
    localStorage,
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  (globalThis as { window?: unknown }).window = windowStub;
  return storage;
}

type WindowStub = {
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  addEventListener: (type: string, fn: (event: unknown) => void) => void;
  removeEventListener: (type: string, fn: (event: unknown) => void) => void;
  dispatchEvent: (event: { type: string }) => boolean;
};

function stubWindow(): WindowStub {
  // Same widening the stub install uses: the real lib.dom Window type does not
  // overlap with the stub, so the hop through unknown is the honest cast.
  return (globalThis as { window?: unknown }).window as WindowStub;
}

// node has no StorageEvent, and the cross-tab branch of the store tests
// `event instanceof StorageEvent`. The branch only reads `type` and `key`.
class StorageEventStub extends Event {
  readonly key: string | null;

  constructor(key: string | null) {
    super("storage");
    this.key = key;
  }
}

// Count the traffic the store puts through localStorage. The store reaches
// through window.localStorage on every call, so replacing the two methods in
// place is enough, and the stub above stays as written.
function instrumentLocalStorage(): { reads: () => number; writes: () => number } {
  const storage = stubWindow().localStorage;
  const getItem = storage.getItem;
  const setItem = storage.setItem;
  let reads = 0;
  let writes = 0;
  storage.getItem = (key: string) => {
    reads += 1;
    return getItem(key);
  };
  storage.setItem = (key: string, value: string) => {
    writes += 1;
    setItem(key, value);
  };
  return { reads: () => reads, writes: () => writes };
}

const storageKey = "coherence-test-store-v2";
const legacyStorageKey = "coherence-test-store-v1";
const updatedEvent = "coherence-test-store-updated";

type Counted = { n: number };

async function createTestStore(
  options: {
    storageKey?: string;
    legacyStorageKey?: string;
    updatedEvent?: string;
  } = {},
): Promise<ReaderStore<Counted>> {
  const { createReaderStore } = await import("./reader-store");
  return createReaderStore<Counted>({
    storageKey: options.storageKey ?? storageKey,
    ...(options.legacyStorageKey === undefined
      ? {}
      : { legacyStorageKey: options.legacyStorageKey }),
    updatedEvent: options.updatedEvent ?? updatedEvent,
    parse: (raw) => (raw ? (JSON.parse(raw) as Counted) : { n: 0 }),
    serialize: (value) => JSON.stringify(value),
    empty: () => ({ n: 0 }),
  });
}

// Take the subscribe callback the hook would install and register a counting
// listener with it. This is the same callback React passes to
// useSyncExternalStore, so the store cannot tell the difference.
function subscribeTo<T>(store: ReaderStore<T>): {
  notifications: () => number;
  unsubscribe: () => void;
} {
  hook.subscribers.length = 0;
  store.useValue();
  const subscribe = hook.subscribers.at(-1);
  if (!subscribe) throw new Error("useValue did not reach useSyncExternalStore");
  let notifications = 0;
  const unsubscribe = subscribe(() => {
    notifications += 1;
  });
  return { notifications: () => notifications, unsubscribe };
}

function counted(n: number): string {
  return JSON.stringify({ n });
}

describe("reader store factory", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    hook.subscribers.length = 0;
    storage = installWindowStub();
    (globalThis as { StorageEvent?: unknown }).StorageEvent = StorageEventStub;
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { StorageEvent?: unknown }).StorageEvent;
  });

  it("applies each update to the result of the previous one", async () => {
    const store = await createTestStore();

    const first = store.update((current) => ({ n: current.n + 1 }));
    const second = store.update((current) => ({ n: current.n + 1 }));

    expect(first.n).toBe(1);
    expect(second.n).toBe(2);
    expect(store.read().n).toBe(2);
    expect(storage.get(storageKey)).toBe(counted(2));
  });

  it("returns the same reference and writes nothing when the updater is a no-op", async () => {
    const store = await createTestStore();
    const first = store.update(() => ({ n: 1 }));

    const before = [...storage.entries()];
    const localStorage = instrumentLocalStorage();
    const second = store.update((current) => current);

    expect(second).toBe(first);
    expect([...storage.entries()]).toEqual(before);
    // The Map alone cannot tell a skipped write from a rewrite of the same
    // bytes, so count the calls too.
    expect(localStorage.writes()).toBe(0);
  });

  it("falls back to the legacy key only while the primary key is absent", async () => {
    storage.set(legacyStorageKey, counted(7));
    const store = await createTestStore({ legacyStorageKey });

    expect(store.read().n).toBe(7);

    storage.set(storageKey, counted(3));

    expect(store.read().n).toBe(3);
  });

  it("never writes a legacy read back to the legacy key", async () => {
    storage.set(legacyStorageKey, counted(7));
    const store = await createTestStore({ legacyStorageKey });

    store.update((current) => ({ n: current.n + 1 }));

    // The old blob is understood, not rewritten: the migration only ever moves
    // forward to the primary key.
    expect(storage.get(legacyStorageKey)).toBe(counted(7));
    expect(storage.get(storageKey)).toBe(counted(8));
  });

  it("treats an empty primary value as absent and reads the legacy key", async () => {
    storage.set(storageKey, "");
    storage.set(legacyStorageKey, counted(5));
    const store = await createTestStore({ legacyStorageKey });

    expect(store.read().n).toBe(5);
  });

  it("refreshes the snapshot when another tab writes the store key", async () => {
    const store = await createTestStore();
    const listener = subscribeTo(store);
    const before = store.useValue();

    storage.set(storageKey, counted(42));
    stubWindow().dispatchEvent(new StorageEventStub(storageKey));
    const after = store.useValue();

    expect(after).not.toBe(before);
    expect(after.n).toBe(42);
    expect(listener.notifications()).toBe(1);
    listener.unsubscribe();
  });

  it("ignores a storage event for an unrelated key", async () => {
    const store = await createTestStore();
    const listener = subscribeTo(store);
    const before = store.useValue();

    // The store key changed too. A store that re-read on every storage event
    // instead of filtering by key would pick this up.
    storage.set(storageKey, counted(42));
    stubWindow().dispatchEvent(new StorageEventStub("some-other-app-key"));
    const after = store.useValue();

    expect(after).toBe(before);
    expect(after.n).toBe(0);
    expect(listener.notifications()).toBe(0);
    listener.unsubscribe();
  });

  it("refreshes on a storage event with a null key", async () => {
    const store = await createTestStore();
    const listener = subscribeTo(store);
    const before = store.useValue();

    // A null key means the whole store was cleared or replaced, so there is no
    // key to filter on and the snapshot has to be re-read.
    storage.set(storageKey, counted(9));
    stubWindow().dispatchEvent(new StorageEventStub(null));
    const after = store.useValue();

    expect(after).not.toBe(before);
    expect(after.n).toBe(9);
    expect(listener.notifications()).toBe(1);
    listener.unsubscribe();
  });

  it("dispatches its own updated event without re-reading itself", async () => {
    const store = await createTestStore();
    const listener = subscribeTo(store);
    store.useValue();

    let observed = 0;
    stubWindow().addEventListener(updatedEvent, () => {
      observed += 1;
    });
    const localStorage = instrumentLocalStorage();
    store.update((current) => ({ n: current.n + 1 }));

    // The event is for everyone else in the tab.
    expect(observed).toBe(1);
    // writingInternally makes the store ignore its own event: it neither reads
    // storage back nor notifies a second time.
    expect(localStorage.reads()).toBe(0);
    expect(localStorage.writes()).toBe(1);
    expect(listener.notifications()).toBe(1);
    listener.unsubscribe();
  });

  it("keeps two stores with different keys independent", async () => {
    const first = await createTestStore({
      storageKey: "first-store",
      updatedEvent: "first-store-updated",
    });
    const second = await createTestStore({
      storageKey: "second-store",
      updatedEvent: "second-store-updated",
    });
    const firstListener = subscribeTo(first);
    const secondListener = subscribeTo(second);
    const secondBefore = second.useValue();

    first.update((current) => ({ n: current.n + 1 }));

    expect(firstListener.notifications()).toBe(1);
    expect(secondListener.notifications()).toBe(0);
    expect(second.useValue()).toBe(secondBefore);
    expect(storage.has("second-store")).toBe(false);
    firstListener.unsubscribe();
    secondListener.unsubscribe();
  });
});

describe("reader bookmarks store", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    hook.subscribers.length = 0;
    storage = installWindowStub();
    (globalThis as { StorageEvent?: unknown }).StorageEvent = StorageEventStub;
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { StorageEvent?: unknown }).StorageEvent;
  });

  const section = { sectionId: "s1", contentHash: "hash-1" };

  const input = {
    section,
    paragraphAnchor: "p-h0123456789abcdef",
    quote: "the quoted line",
    startOffset: 0,
    endOffset: 15,
  };

  it("round-trips a bookmark through storage", async () => {
    const { updateStoredBookmarks, readStoredBookmarks } = await import(
      "./reader-progress-store"
    );

    updateStoredBookmarks((current) =>
      addBookmark(current, input, 1_000, "bookmark-1"),
    );

    // readStoredBookmarks parses localStorage rather than returning the cached
    // snapshot, so this proves the write landed and survives a reparse.
    const stored = readStoredBookmarks().bookmarks["bookmark-1"];
    expect(stored?.quote).toBe("the quoted line");
    expect(stored?.progressKey).toBe("s1");
    expect(stored?.createdAt).toBe(1_000);
    expect(storage.get(readerBookmarksStorageKey)).toContain("bookmark-1");
  });

  it("keeps progress and bookmarks out of each other's way", async () => {
    const {
      readStoredBookmarks,
      readStoredProgress,
      updateStoredBookmarks,
      updateStoredProgress,
    } = await import("./reader-progress-store");

    updateStoredProgress((current) => recordScrollProgress(current, section, 65));
    updateStoredBookmarks((current) =>
      addBookmark(current, input, 1_000, "bookmark-1"),
    );
    updateStoredProgress((current) => recordScrollProgress(current, section, 80));

    expect(readStoredProgress().sections[section.sectionId]?.maxScrollPercent).toBe(
      80,
    );
    expect(Object.keys(readStoredBookmarks().bookmarks)).toEqual(["bookmark-1"]);
    // Separate keys, separate blobs. A shared cache would have let one
    // collection's serializer overwrite the other's.
    expect(storage.get(readerProgressV2StorageKey)).not.toContain("bookmark-1");
    expect(storage.get(readerBookmarksStorageKey)).not.toContain(
      "maxScrollPercent",
    );
  });
});
