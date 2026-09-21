import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoherencePublisherLegacyFragmentModel } from "@/publisher/legacy-fragment-continuity";

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
      aliases: Object.freeze([
        Object.freeze({
          fragment: "b-target",
          href: "/manuscripts/1/current-section/#b-target",
        }),
        Object.freeze({
          fragment: "old-section",
          href: "/manuscripts/1/current-section/",
        }),
        Object.freeze({
          fragment: "old-section-p-h0123456789abcdef",
          href: "/manuscripts/1/current-section/#b-target",
        }),
      ]),
      bareParagraphAliases: Object.freeze([
        Object.freeze({
          fragment: "p-h0123456789abcdef",
          href: "/manuscripts/1/current-section/#b-target",
        }),
      ]),
      sectionId: "current-section",
    }),
  ]),
}) satisfies CoherencePublisherLegacyFragmentModel;

function installBrowser(input: Readonly<{
  hash: string;
  pathname: string;
}>) {
  let hashchange: (() => void) | null = null;
  const location = {
    hash: input.hash,
    href: `https://publication.test${input.pathname}${input.hash}`,
    pathname: input.pathname,
    replace: vi.fn(),
  };
  const addEventListener = vi.fn((name: string, listener: () => void) => {
    if (name === "hashchange") hashchange = listener;
  });
  const removeEventListener = vi.fn();
  const documentReads = {
    getElementById: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
  };
  vi.stubGlobal("document", documentReads);
  vi.stubGlobal("window", {
    addEventListener,
    location,
    removeEventListener,
  });
  return {
    addEventListener,
    documentReads,
    location,
    removeEventListener,
    replace: location.replace,
    runHashchange() {
      hashchange?.();
    },
  };
}

function mountPublisherIsland(
  model: CoherencePublisherLegacyFragmentModel = publisherFragmentModel,
) {
  const element = LegacyFragmentRedirectIsland({
    publisherFragmentModel: model,
  });
  if (element === null) {
    throw new TypeError("Publisher fragment island was not rendered.");
  }
  const component = (element as ReactElement).type as (properties: {
    model: CoherencePublisherLegacyFragmentModel;
  }) => null;
  component((element as ReactElement).props as {
    model: CoherencePublisherLegacyFragmentModel;
  });
  if (mocks.effect === null) {
    throw new TypeError("Publisher fragment effect was not registered.");
  }
  return mocks.effect();
}

function mountNativeIsland() {
  const element = LegacyFragmentRedirectIsland({});
  if (element === null) {
    throw new TypeError("Native fragment island was not rendered.");
  }
  const component = (element as ReactElement).type as (properties: {
    sections: [];
  }) => null;
  component((element as ReactElement).props as { sections: [] });
  if (mocks.effect === null) {
    throw new TypeError("Native fragment effect was not registered.");
  }
  return mocks.effect();
}

describe("Legacy fragment redirect Island Publisher bridge", () => {
  afterEach(() => {
    mocks.effect = null;
    mocks.loadProgressSections.mockClear();
    vi.unstubAllGlobals();
  });

  it("replaces a qualified legacy paragraph with its exact public block address", () => {
    const browser = installBrowser({
      hash: "#old-section-p-h0123456789abcdef",
      pathname: "/manuscripts/1/current-section/",
    });

    const cleanup = mountPublisherIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/#b-target",
    );
    expect(browser.documentReads.getElementById).not.toHaveBeenCalled();
    expect(browser.documentReads.querySelectorAll).not.toHaveBeenCalled();
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

  it("replaces a bare paragraph on a nested route with its exact public block address", () => {
    const browser = installBrowser({
      hash: "#p-h0123456789abcdef",
      pathname: "/manuscripts/1/current-section/nested/",
    });

    mountPublisherIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/#b-target",
    );
  });

  it("clears a legacy section hash when its public section address is unanchored", () => {
    const browser = installBrowser({
      hash: "#old-section",
      pathname: "/manuscripts/1/current-section/",
    });

    mountPublisherIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/",
    );
  });

  it("does not replace an already exact pathname and hash", () => {
    const browser = installBrowser({
      hash: "#b-target",
      pathname: "/manuscripts/1/current-section/",
    });

    mountPublisherIsland();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.addEventListener).toHaveBeenCalledOnce();
  });

  it("decodes the browser fragment once before exact authority lookup", () => {
    const browser = installBrowser({
      hash: "#old%2Dsection",
      pathname: "/manuscripts/1/current-section/",
    });

    mountPublisherIsland();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/",
    );
  });

  it.each([
    "#unmapped",
    "#old%ZZsection",
  ])("does nothing for an unsupported fragment %s", (hash) => {
    const browser = installBrowser({
      hash,
      pathname: "/manuscripts/1/current-section/",
    });

    mountPublisherIsland();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.documentReads.getElementById).not.toHaveBeenCalled();
    expect(browser.documentReads.querySelectorAll).not.toHaveBeenCalled();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("resolves later hash changes and removes its exact listener", () => {
    const browser = installBrowser({
      hash: "#unmapped",
      pathname: "/manuscripts/1/current-section/",
    });
    const cleanup = mountPublisherIsland();
    browser.location.hash = "#old-section-p-h0123456789abcdef";
    browser.location.href =
      "https://publication.test/manuscripts/1/current-section/#old-section-p-h0123456789abcdef";

    browser.runHashchange();

    expect(browser.replace).toHaveBeenCalledExactlyOnceWith(
      "https://publication.test/manuscripts/1/current-section/#b-target",
    );
    cleanup?.();
    expect(browser.removeEventListener).toHaveBeenCalledExactlyOnceWith(
      "hashchange",
      expect.any(Function),
    );
  });

  it.each([
    Object.freeze({ sections: Object.freeze([]) }),
    Object.freeze({
      sections: Object.freeze([
        Object.freeze({
          aliases: Object.freeze([]),
          bareParagraphAliases: Object.freeze([]),
          sectionId: "section",
        }),
      ]),
    }),
    Object.freeze({
      sections: Object.freeze([
        Object.freeze({
          aliases: Object.freeze([
            Object.freeze({ fragment: "same", href: "/first/" }),
            Object.freeze({ fragment: "same", href: "/second/" }),
          ]),
          bareParagraphAliases: Object.freeze([]),
          sectionId: "section",
        }),
      ]),
    }),
  ])("is hook free for an empty or invalid Publisher model", (model) => {
    installBrowser({
      hash: "#same",
      pathname: "/first/",
    });

    expect(LegacyFragmentRedirectIsland({
      publisherFragmentModel:
        model as CoherencePublisherLegacyFragmentModel,
    })).toBeNull();
    expect(mocks.effect).toBeNull();
    expect(mocks.loadProgressSections).not.toHaveBeenCalled();
  });

  it("retains the native fallback when no Publisher model is supplied", () => {
    installBrowser({
      hash: "#old-section",
      pathname: "/manuscripts/1/current-section/",
    });

    mountNativeIsland();

    expect(mocks.loadProgressSections).toHaveBeenCalledOnce();
  });
});
