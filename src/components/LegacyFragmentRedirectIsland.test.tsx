import type { PublisherNextPage } from "@genii-foundation/publisher-next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCoherencePublisherLegacyFragmentModel,
  type CoherencePublisherLegacyFragmentModel,
} from "@/publisher/legacy-fragment-continuity";
import type { CoherenceReaderStateMigrationArtifact } from "@/publisher/reader-state-migration-schema";

const mocks = vi.hoisted(() => ({
  effect: null as null | (() => void | (() => void)),
  loadProgressSections: vi.fn(async () => []),
}));

vi.mock("react", () => ({
  useEffect(effect: () => void | (() => void)) {
    mocks.effect = effect;
  },
}));
vi.mock("@/lib/reader-data", () => ({
  loadProgressSections: mocks.loadProgressSections,
}));

import { LegacyFragmentRedirectIsland } from "./LegacyFragmentRedirectIsland";

const publisherFragmentModel = Object.freeze({
  sections: Object.freeze([
    Object.freeze({
      href: "/manuscripts/1/current-section/",
      legacySectionIds: Object.freeze(["current-section", "old-section"]),
      paragraphs: Object.freeze([
        Object.freeze({
          blockId: "target-block",
          legacyParagraphId: "p-h0123456789abcdef",
        }),
      ]),
      sectionId: "current-section",
    }),
  ]),
}) satisfies CoherencePublisherLegacyFragmentModel;

const sectionIndexFragmentModel =
  createCoherencePublisherLegacyFragmentModel(
    Object.freeze({
      kind: "section-index",
      path: "/manuscripts/1/contents/",
      publication: Object.freeze({ id: "publication" }),
    }) as unknown as PublisherNextPage,
    Object.freeze({}) as unknown as CoherenceReaderStateMigrationArtifact,
  );

function installBrowser(input: Readonly<{
  blockHookCount?: number;
  hash: string;
  pathname: string;
  sectionHookCount?: number;
}>) {
  const blockScrollIntoView = vi.fn();
  const blocks = Array.from(
    { length: input.blockHookCount ?? 1 },
    () => ({
      dataset: { publisherBlock: "target-block" },
      scrollIntoView: blockScrollIntoView,
    }),
  );
  const sectionScrollIntoView = vi.fn();
  const sections = Array.from(
    { length: input.sectionHookCount ?? 1 },
    () => ({
      dataset: { publisherSection: "current-section" },
      querySelectorAll: vi.fn(() => blocks),
      scrollIntoView: sectionScrollIntoView,
    }),
  );
  const replace = vi.fn();
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal("document", {
    getElementById: vi.fn(() => null),
    querySelectorAll: vi.fn(() => sections),
  });
  vi.stubGlobal("window", {
    addEventListener,
    location: {
      hash: input.hash,
      href: `https://publication.test${input.pathname}${input.hash}`,
      pathname: input.pathname,
      replace,
    },
    removeEventListener,
  });
  return {
    addEventListener,
    blockScrollIntoView,
    removeEventListener,
    replace,
    sectionScrollIntoView,
  };
}

function runIsland(
  model: CoherencePublisherLegacyFragmentModel = publisherFragmentModel,
) {
  LegacyFragmentRedirectIsland({ publisherFragmentModel: model });
  if (mocks.effect === null) {
    throw new TypeError("Legacy fragment effect was not registered.");
  }
  return mocks.effect();
}

function runNativeIsland() {
  LegacyFragmentRedirectIsland({});
  if (mocks.effect === null) {
    throw new TypeError("Legacy fragment effect was not registered.");
  }
  return mocks.effect();
}

describe("Legacy fragment redirect Island Publisher bridge", () => {
  afterEach(() => {
    mocks.effect = null;
    mocks.loadProgressSections.mockClear();
    vi.unstubAllGlobals();
  });

  it("scrolls the exact Publisher block hook on the mapped section route", () => {
    const browser = installBrowser({
      hash: "#old-section-p-h0123456789abcdef",
      pathname: "/manuscripts/1/current-section/",
    });

    const cleanup = runIsland();

    expect(browser.blockScrollIntoView).toHaveBeenCalledOnce();
    expect(browser.sectionScrollIntoView).not.toHaveBeenCalled();
    expect(browser.replace).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
    expect(browser.addEventListener).toHaveBeenCalledWith(
      "hashchange",
      expect.any(Function),
    );
    cleanup?.();
    expect(browser.removeEventListener).toHaveBeenCalledWith(
      "hashchange",
      expect.any(Function),
    );
  });

  it("preserves the exact fragment while routing a work page to its section", () => {
    const browser = installBrowser({
      hash: "#old-section-p-h0123456789abcdef",
      pathname: "/manuscripts/1/",
    });

    runIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/#old-section-p-h0123456789abcdef",
    );
    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("preserves the exact fragment when its Publisher hook is not rendered", () => {
    const browser = installBrowser({
      hash: "#old-section-p-h0123456789abcdef",
      pathname: "/manuscripts/1/other-section/",
      sectionHookCount: 0,
    });

    runIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/#old-section-p-h0123456789abcdef",
    );
    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("preserves a bare paragraph while routing a nested canonical section", () => {
    const browser = installBrowser({
      hash: "#p-h0123456789abcdef",
      pathname: "/manuscripts/1/current-section/nested/",
    });

    runIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/#p-h0123456789abcdef",
    );
    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("fails closed when an exact Publisher section hook is duplicated", () => {
    const browser = installBrowser({
      hash: "#old-section",
      pathname: "/manuscripts/1/current-section/",
      sectionHookCount: 2,
    });

    runIsland();

    expect(browser.sectionScrollIntoView).not.toHaveBeenCalled();
    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(browser.replace).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("fails closed when an exact Publisher block hook is duplicated", () => {
    const browser = installBrowser({
      blockHookCount: 2,
      hash: "#old-section-p-h0123456789abcdef",
      pathname: "/manuscripts/1/current-section/",
    });

    runIsland();

    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(browser.sectionScrollIntoView).not.toHaveBeenCalled();
    expect(browser.replace).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("does nothing for an unmapped Publisher fragment", () => {
    const browser = installBrowser({
      hash: "#old-section-p-hffffffffffffffff",
      pathname: "/manuscripts/1/current-section/",
    });

    runIsland();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(browser.sectionScrollIntoView).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("keeps an unsupported section-index page out of the native fallback", () => {
    const browser = installBrowser({
      hash: "#old-section",
      pathname: "/manuscripts/1/contents/",
    });

    expect(sectionIndexFragmentModel).toEqual({ sections: [] });
    runIsland(sectionIndexFragmentModel);

    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.blockScrollIntoView).not.toHaveBeenCalled();
    expect(browser.sectionScrollIntoView).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("retains the native fallback when no Publisher model is supplied", () => {
    installBrowser({
      hash: "#old-section",
      pathname: "/manuscripts/1/current-section/",
    });

    runNativeIsland();

    expect(mocks.loadProgressSections).toHaveBeenCalledOnce();
  });
});
