import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  defaultReaderPreferences,
  parseReaderPreferences,
} from "@/lib/reader-preferences";

vi.mock("@/components/SiteShell", () => ({
  SiteShell: ({ children }: { children: ReactNode }) => (
    <div data-site-shell="">{children}</div>
  ),
}));

import {
  CoherenceReaderPrepaint,
  CoherenceSiteFrame,
} from "./CoherenceSiteFrame";

function executePrepaint(storedPreferences: string) {
  const markup = renderToStaticMarkup(<CoherenceReaderPrepaint />);
  const source = markup.match(/<script[^>]*>([\s\S]*)<\/script>/u)?.[1];
  if (source === undefined) {
    throw new TypeError("Coherence Reader prepaint source is absent.");
  }

  const dataset: Record<string, string> = {};
  const styles = new Map<string, string>();
  const themeMeta = { setAttribute: vi.fn() };
  const localStorage = {
    getItem: vi.fn(() => storedPreferences),
  };
  const document = {
    documentElement: {
      dataset,
      style: {
        setProperty(name: string, value: string) {
          styles.set(name, value);
        },
      },
    },
    querySelector: vi.fn(() => themeMeta),
  };

  const run = new Function("localStorage", "document", source) as (
    storage: typeof localStorage,
    documentValue: typeof document,
  ) => void;
  run(localStorage, document);

  return { dataset, localStorage, styles };
}

describe("Coherence site frame", () => {
  it("exposes the preferences bootstrap as one explicit head prepaint", () => {
    const markup = renderToStaticMarkup(<CoherenceReaderPrepaint />);

    expect(markup).toContain("data-coherence-reader-prepaint");
    expect(markup.match(/<script/gu)).toHaveLength(1);
    expect(markup).toContain("localStorage.getItem");
    expect(markup.match(/localStorage\.getItem/gu)).toHaveLength(1);
    expect(markup).toContain("publisherReaderScheme");
    expect(markup).toContain("--coherence-publisher-embedded-canvas");
    for (const value of [
      "#F4EAD7",
      "#f5f7f4",
      "#11191b",
      "#000000",
      'canvas":"#000"',
      'scheme":"system',
      'scheme":"light',
      'scheme":"dark',
      'scheme":"black',
    ]) {
      expect(markup).toContain(value);
    }
    expect(markup).not.toContain("genii.publisher.reader.preferences");
    expect(markup).not.toContain("localStorage.setItem");
    expect(markup).not.toContain("--publisher-reader-font-scale");
    expect(markup).not.toContain("publisherReaderFocus");
    expect(markup).not.toContain("publisherReaderMotion");
  });

  it("does not emit a body prepaint from the reusable site frame", () => {
    const markup = renderToStaticMarkup(
      <CoherenceSiteFrame>
        <p>Reader content</p>
      </CoherenceSiteFrame>,
    );

    expect(markup).not.toContain("data-coherence-reader-prepaint");
    expect(markup).not.toContain("localStorage.getItem");
    expect(markup).toContain("Reader content");
  });

  it("enforces the live parser font-size range and step before paint", () => {
    const invalid = JSON.stringify({
      ...defaultReaderPreferences,
      fontSize: 86,
      schemaVersion: 2,
      theme: "dark",
    });
    const invalidResult = executePrepaint(invalid);

    expect(parseReaderPreferences(invalid).fontSize).toBe(
      defaultReaderPreferences.fontSize,
    );
    expect(invalidResult.localStorage.getItem).toHaveBeenCalledOnce();
    expect(invalidResult.styles.has("--reader-font-scale")).toBe(false);
    expect(invalidResult.styles.has("--reader-font-scale-percent")).toBe(
      false,
    );
    expect(invalidResult.dataset.publisherReaderScheme).toBe("dark");
    expect(
      invalidResult.styles.get("--coherence-publisher-embedded-canvas"),
    ).toBe("#11191b");

    for (const fontSize of [85, 90, 125]) {
      const stored = JSON.stringify({
        ...defaultReaderPreferences,
        fontSize,
        schemaVersion: 2,
      });
      const result = executePrepaint(stored);

      expect(parseReaderPreferences(stored).fontSize).toBe(fontSize);
      expect(result.localStorage.getItem).toHaveBeenCalledOnce();
      expect(result.styles.get("--reader-font-scale")).toBe(
        String(fontSize / 100),
      );
      expect(result.styles.get("--reader-font-scale-percent")).toBe(
        `${fontSize}%`,
      );
      expect(result.dataset.publisherReaderScheme).toBe("system");
    }
  });
});
