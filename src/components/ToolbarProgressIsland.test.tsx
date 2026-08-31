import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Effect = () => void | (() => void);

const testState = vi.hoisted(() => ({
  cursor: 0,
  effects: [] as Effect[],
  slots: [] as unknown[],
  authStateCallback: null as
    | ((user: { id: string; email?: string } | null) => void)
    | null,
  bookmarksFitRemoteBudget: vi.fn(),
  loadRemoteReaderState: vi.fn(),
  mergeRemoteBookmarks: vi.fn(),
  updateStoredBookmarks: vi.fn(),
  uploadRemoteEvents: vi.fn(),
  upsertRemoteConsent: vi.fn(),
  upsertRemoteProgress: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useCallback<T>(callback: T): T {
      testState.cursor += 1;
      return callback;
    },
    useEffect(effect: Effect) {
      testState.cursor += 1;
      testState.effects.push(effect);
    },
    useMemo<T>(factory: () => T): T {
      testState.cursor += 1;
      return factory();
    },
    useRef<T>(initialValue: T): { current: T } {
      const slot = testState.cursor;
      testState.cursor += 1;
      if (testState.slots[slot] === undefined) {
        testState.slots[slot] = { current: initialValue };
      }
      return testState.slots[slot] as { current: T };
    },
    useState<T>(initialValue: T | (() => T)) {
      const slot = testState.cursor;
      testState.cursor += 1;
      if (testState.slots[slot] === undefined) {
        testState.slots[slot] =
          typeof initialValue === "function"
            ? (initialValue as () => T)()
            : initialValue;
      }
      const setValue = (nextValue: T | ((current: T) => T)) => {
        const current = testState.slots[slot] as T;
        testState.slots[slot] =
          typeof nextValue === "function"
            ? (nextValue as (value: T) => T)(current)
            : nextValue;
      };
      return [testState.slots[slot] as T, setValue] as const;
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/manuscripts/volume/section/",
}));

vi.mock("@/components/ProgressCloudBadge", () => ({
  ProgressCloudBadge: () => null,
}));
vi.mock("@/components/ProgressReadAnimation", () => ({
  ProgressReadAnimation: () => null,
}));
vi.mock("@/lib/reader-export", () => ({
  buildReaderExport: vi.fn(() => ""),
  readerExportFileName: "reader-data.md",
}));
vi.mock("@/lib/reader-preferences", () => ({
  parseReaderPreferences: vi.fn(() => ({})),
  readerPreferencesStorageKey: "reader-preferences",
}));
vi.mock("@/lib/reader-active-section", () => ({
  readerActiveSectionEvent: "reader-active-section",
}));
vi.mock("@/lib/reader-data", () => ({
  loadBookmarkSections: vi.fn(async () => []),
  loadProgressSections: vi.fn(async () => []),
}));
vi.mock("@/lib/use-loaded-data", () => ({
  useLoadedData: () => [],
}));
vi.mock("@/lib/reader-engagement", () => ({
  createEngagementEvent: vi.fn(() => ({})),
  grantSyncConsent: vi.fn(() => ({
    version: 1,
    copyVersion: "consent-v1",
    granted: true,
    grantedAt: 1,
  })),
  markEventsSynced: vi.fn((events) => events),
  parseSyncConsent: vi.fn(() => ({
    version: 1,
    copyVersion: "consent-v1",
    granted: true,
    grantedAt: 1,
  })),
  unsyncedEvents: vi.fn(() => []),
}));
vi.mock("@/lib/reader-progress-store", () => ({
  appendStoredEvent: vi.fn(),
  readStoredBookmarks: vi.fn(() => ({ bookmarks: {} })),
  readStoredConsent: vi.fn(() => ({
    version: 1,
    copyVersion: "consent-v1",
    granted: true,
    grantedAt: 1,
  })),
  readStoredEvents: vi.fn(() => []),
  readStoredProgress: vi.fn(() => ({ sections: {} })),
  updateStoredBookmarks: testState.updateStoredBookmarks,
  updateStoredProgress: vi.fn(),
  useReaderBookmarks: vi.fn(() => ({ bookmarks: {} })),
  useReaderProgress: vi.fn(() => ({ sections: {} })),
  writeStoredConsent: vi.fn(),
  writeStoredEvents: vi.fn(),
}));
vi.mock("@/lib/reader-bookmarks", () => ({
  bookmarksFitRemoteBudget: testState.bookmarksFitRemoteBudget,
  pruneBookmarks: vi.fn((bookmarks) => bookmarks),
  readerBookmarksSchemaVersion: 2,
  reconcileRemoteBookmarks: vi.fn((current) => current),
}));
vi.mock("@/lib/use-toolbar-menu", () => ({
  useToolbarMenu: () => ({
    open: true,
    rendered: true,
    setOpen: vi.fn(),
    toggle: vi.fn(),
    containerRef: { current: null },
    triggerProps: {},
    popoverProps: {},
  }),
}));
vi.mock("@/lib/reader-sync", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "reader-1",
    email: "reader@example.com",
  })),
  isReaderSyncConfigured: vi.fn(() => true),
  loadRemoteReaderState: testState.loadRemoteReaderState,
  mergeRemoteBookmarks: testState.mergeRemoteBookmarks,
  onAuthStateChange: vi.fn(
    (callback: (user: { id: string; email?: string } | null) => void) => {
      testState.authStateCallback = callback;
      return { unsubscribe: vi.fn() };
    },
  ),
  sendMagicLink: vi.fn(),
  signOutReader: vi.fn(),
  uploadRemoteEvents: testState.uploadRemoteEvents,
  upsertRemoteConsent: testState.upsertRemoteConsent,
  upsertRemoteProgress: testState.upsertRemoteProgress,
  verifyEmailOtp: vi.fn(),
}));
vi.mock("@/lib/reader-state", () => ({
  isSectionRead: vi.fn(() => false),
  markRead: vi.fn((progress) => progress),
  readerProgressSchemaVersion: 2,
  readingProgressPercent: vi.fn(() => 0),
  reconcileRemoteProgress: vi.fn((current) => current),
  recentlyReadSections: vi.fn(() => []),
  recommendNextSections: vi.fn(() => []),
  updatedSinceRead: vi.fn(() => false),
}));
vi.mock("@/lib/progress-icon-preview", () => ({
  progressIconPreviewEventName: "progress-icon-preview",
}));

import { ToolbarProgressIsland } from "./ToolbarProgressIsland";

type ElementNode = {
  props?: Record<string, unknown>;
};

const localStorage = {
  getItem: vi.fn((key: string): string | null => {
    void key;
    return null;
  }),
  setItem: vi.fn(),
};
const lastSyncedStorageKey = "coherence-reader-last-synced-at-v1";

function renderIsland(): unknown {
  testState.cursor = 0;
  testState.effects = [];
  return ToolbarProgressIsland();
}

function findElement(
  node: unknown,
  predicate: (props: Record<string, unknown>) => boolean,
): ElementNode | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const props = (node as ElementNode).props;
  if (!props) return null;
  if (predicate(props)) return node as ElementNode;
  return findElement(props.children, predicate);
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!node || typeof node !== "object") return "";
  return textContent((node as ElementNode).props?.children);
}

function effectAt(index: number): Effect {
  const effect = testState.effects[index];
  if (!effect) throw new TypeError(`Missing effect ${index}.`);
  return effect;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderSignedInIsland(remoteBookmarksSchemaVersion: number) {
  testState.loadRemoteReaderState.mockResolvedValue({
    progress: null,
    progressSchemaVersion: null,
    bookmarks: { bookmarks: {} },
    bookmarksSchemaVersion: remoteBookmarksSchemaVersion,
    consent: null,
  });

  renderIsland();
  effectAt(2)();
  effectAt(4)();
  await flushPromises();

  renderIsland();
  effectAt(7)();
  effectAt(8)();
  await flushPromises();

  return renderIsland();
}

function syncNowButton(tree: unknown): ElementNode {
  const button = findElement(
    tree,
    (props) => props.type === "button" && textContent(props.children) === "Sync now",
  );
  if (!button) throw new TypeError("Missing Sync now button.");
  return button;
}

function syncStatus(tree: unknown): { state: unknown; message: string } {
  const status = findElement(tree, (props) => props.role === "status");
  if (!status?.props) throw new TypeError("Missing sync status.");
  return {
    state: status.props["data-sync-status"],
    message: textContent(status.props.children),
  };
}

async function clickSyncNow(tree: unknown): Promise<void> {
  const onClick = syncNowButton(tree).props?.onClick;
  if (typeof onClick !== "function") {
    throw new TypeError("Sync now has no click handler.");
  }
  await onClick();
}

describe("Toolbar progress sync status", () => {
  beforeEach(() => {
    testState.cursor = 0;
    testState.effects = [];
    testState.slots = [];
    testState.authStateCallback = null;
    testState.bookmarksFitRemoteBudget.mockReset();
    testState.loadRemoteReaderState.mockReset();
    testState.mergeRemoteBookmarks.mockReset();
    testState.updateStoredBookmarks.mockReset();
    testState.uploadRemoteEvents.mockReset();
    testState.upsertRemoteConsent.mockReset();
    testState.upsertRemoteProgress.mockReset();
    localStorage.getItem.mockReset();
    localStorage.getItem.mockReturnValue(null);
    localStorage.setItem.mockReset();
    testState.bookmarksFitRemoteBudget.mockReturnValue(true);
    testState.mergeRemoteBookmarks.mockResolvedValue({
      data: {
        bookmarks: { bookmarks: {} },
        schemaVersion: 2,
      },
      error: null,
    });
    testState.uploadRemoteEvents.mockResolvedValue({
      uploadedIds: [],
      error: null,
    });
    testState.upsertRemoteConsent.mockResolvedValue({ error: null });
    testState.upsertRemoteProgress.mockResolvedValue({ error: null });

    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      localStorage,
      location: {
        origin: "https://reader.example",
      },
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      setTimeout: vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    });
  });

  afterEach(() => {
    localStorage.getItem.mockClear();
    localStorage.setItem.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports progress-only sync when the remote bookmark schema is newer", async () => {
    vi.spyOn(Date, "now").mockReturnValue(61_000);
    localStorage.getItem.mockImplementation((key) =>
      key === lastSyncedStorageKey ? "1000" : null,
    );
    let tree = await renderSignedInIsland(3);
    expect(syncStatus(tree)).toEqual({
      state: "partial",
      message:
        "Bookmark sync is paused until you update this device. Reading progress can still sync.",
    });
    expect(textContent(tree)).toContain("(1 minute ago)");

    await clickSyncNow(tree);
    tree = renderIsland();

    expect(testState.upsertRemoteProgress).toHaveBeenCalledTimes(1);
    expect(testState.bookmarksFitRemoteBudget).not.toHaveBeenCalled();
    expect(testState.mergeRemoteBookmarks).not.toHaveBeenCalled();
    expect(testState.updateStoredBookmarks).not.toHaveBeenCalled();
    expect(testState.upsertRemoteConsent).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(textContent(tree)).toContain("(1 minute ago)");
    expect(textContent(tree)).not.toContain("(just now)");
    expect(syncStatus(tree)).toEqual({
      state: "partial",
      message:
        "Reading progress synced. Bookmark sync is paused until you update this device.",
    });
  });

  it("clears bookmark schema lockout when the signed-in account changes", async () => {
    let tree = await renderSignedInIsland(3);
    expect(syncStatus(tree).state).toBe("partial");

    testState.loadRemoteReaderState.mockResolvedValue({
      progress: null,
      progressSchemaVersion: null,
      bookmarks: { bookmarks: {} },
      bookmarksSchemaVersion: 2,
      consent: null,
    });
    const authStateCallback = testState.authStateCallback;
    if (!authStateCallback) throw new TypeError("Missing auth state callback.");
    authStateCallback({ id: "reader-2", email: "second@example.com" });

    renderIsland();
    effectAt(7)();
    effectAt(8)();
    await flushPromises();
    tree = renderIsland();
    await clickSyncNow(tree);
    tree = renderIsland();

    expect(testState.loadRemoteReaderState).toHaveBeenNthCalledWith(1, "reader-1");
    expect(testState.loadRemoteReaderState).toHaveBeenNthCalledWith(2, "reader-2");
    expect(testState.upsertRemoteProgress).toHaveBeenCalledWith(
      "reader-2",
      { sections: {} },
    );
    expect(testState.mergeRemoteBookmarks).toHaveBeenCalledTimes(1);
    expect(syncStatus(tree)).toEqual({
      state: "synced",
      message: "Synced across your devices.",
    });
  });

  it("does not let oversized locked bookmarks block progress-only sync", async () => {
    testState.bookmarksFitRemoteBudget.mockReturnValue(false);
    let tree = await renderSignedInIsland(3);

    await clickSyncNow(tree);
    tree = renderIsland();

    expect(testState.upsertRemoteProgress).toHaveBeenCalledTimes(1);
    expect(testState.bookmarksFitRemoteBudget).not.toHaveBeenCalled();
    expect(testState.mergeRemoteBookmarks).not.toHaveBeenCalled();
    expect(syncStatus(tree)).toEqual({
      state: "partial",
      message:
        "Reading progress synced. Bookmark sync is paused until you update this device.",
    });
  });

  it("keeps full-sync status when both remote schemas are supported", async () => {
    vi.spyOn(Date, "now").mockReturnValue(61_000);
    let tree = await renderSignedInIsland(2);

    await clickSyncNow(tree);
    tree = renderIsland();

    expect(testState.upsertRemoteProgress).toHaveBeenCalledTimes(1);
    expect(testState.bookmarksFitRemoteBudget).toHaveBeenCalledTimes(1);
    expect(testState.mergeRemoteBookmarks).toHaveBeenCalledTimes(1);
    expect(testState.updateStoredBookmarks).toHaveBeenCalledTimes(2);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      lastSyncedStorageKey,
      "61000",
    );
    expect(textContent(tree)).toContain("(just now)");
    expect(syncStatus(tree)).toEqual({
      state: "synced",
      message: "Synced across your devices.",
    });
  });

  it("locks bookmarks when their schema advances during merge", async () => {
    testState.mergeRemoteBookmarks.mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message:
          "Remote bookmark schema version 3 is newer than client version 2.",
      },
    });
    let tree = await renderSignedInIsland(2);

    await clickSyncNow(tree);
    tree = renderIsland();

    expect(testState.upsertRemoteProgress).toHaveBeenCalledTimes(1);
    expect(testState.mergeRemoteBookmarks).toHaveBeenCalledTimes(1);
    expect(testState.upsertRemoteConsent).toHaveBeenCalledTimes(1);
    expect(testState.uploadRemoteEvents).toHaveBeenCalledTimes(1);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(syncStatus(tree)).toEqual({
      state: "partial",
      message:
        "Reading progress synced. Bookmark sync is paused until you update this device.",
    });

    await clickSyncNow(tree);
    tree = renderIsland();

    expect(testState.upsertRemoteProgress).toHaveBeenCalledTimes(2);
    expect(testState.mergeRemoteBookmarks).toHaveBeenCalledTimes(1);
    expect(testState.upsertRemoteConsent).toHaveBeenCalledTimes(2);
    expect(testState.uploadRemoteEvents).toHaveBeenCalledTimes(2);
    expect(syncStatus(tree).state).toBe("partial");
  });

  it("reports both bookmark lockout and event retry after progress sync", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    testState.uploadRemoteEvents.mockResolvedValue({
      uploadedIds: [],
      error: new Error("events unavailable"),
    });
    let tree = await renderSignedInIsland(3);

    await clickSyncNow(tree);
    tree = renderIsland();

    expect(syncStatus(tree)).toEqual({
      state: "partial",
      message:
        "Reading progress synced. Bookmark sync is paused until you update this device. Reading history details will retry.",
    });
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(textContent(tree)).toContain("Not synced yet");
    expect(warning).toHaveBeenCalledWith(
      "Reader engagement event sync failed.",
      expect.any(Error),
    );
  });

  it("shows a progress failure and retries without touching locked bookmarks", async () => {
    testState.upsertRemoteProgress
      .mockResolvedValueOnce({ error: new Error("progress unavailable") })
      .mockResolvedValueOnce({ error: null });
    let tree = await renderSignedInIsland(3);

    await clickSyncNow(tree);
    tree = renderIsland();
    expect(syncStatus(tree)).toEqual({
      state: "error",
      message: "Sync failed: progress unavailable",
    });

    await clickSyncNow(tree);
    tree = renderIsland();
    expect(testState.upsertRemoteProgress).toHaveBeenCalledTimes(2);
    expect(testState.mergeRemoteBookmarks).not.toHaveBeenCalled();
    expect(syncStatus(tree)).toEqual({
      state: "partial",
      message:
        "Reading progress synced. Bookmark sync is paused until you update this device.",
    });
  });
});
