import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OfflineAudioRuntimeMode } from "@/lib/audio-offline-cache";
import {
  defaultReaderPreferences,
  parseReaderPreferences,
} from "@/lib/reader-preferences";

vi.mock("server-only", () => ({}));
vi.mock("@/components/SiteShell", () => ({
  SiteShell: ({
    children,
    offlineRuntimeMode,
  }: {
    children: ReactNode;
    offlineRuntimeMode: OfflineAudioRuntimeMode;
  }) => (
    <div
      data-site-shell=""
      data-offline-runtime-kind={offlineRuntimeMode.kind}
      data-offline-runtime-build-id={
        offlineRuntimeMode.kind === "publisher-embedded"
          ? offlineRuntimeMode.buildId
          : undefined
      }
    >
      {children}
    </div>
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the preferences bootstrap as one explicit head prepaint", () => {
    const markup = renderToStaticMarkup(<CoherenceReaderPrepaint />);

    expect(markup).toContain("data-coherence-reader-prepaint");
    expect(markup.match(/<script/gu)).toHaveLength(1);
    expect(markup).toContain("localStorage.getItem");
    expect(markup.match(/localStorage\.getItem/gu)).toHaveLength(1);
    expect(markup).toContain("publisherReaderScheme");
    expect(markup).toContain(
      'PA={"textured":"system","light":"light","dark":"dark","black":"black"}',
    );
    expect(markup).not.toContain("--coherence-publisher-embedded-canvas");
    expect(markup).not.toContain('"canvas"');
    expect(markup).not.toContain('"surface"');
    expect(markup).not.toContain('"mutedText"');
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
    expect(markup).toContain('data-offline-runtime-kind="coherence-reader"');
  });

  it("passes exact Publisher authority only to an opted-in manuscript frame", () => {
    const buildId =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const markup = renderToStaticMarkup(
      <CoherenceSiteFrame publisherOfflineAuthorityBuildId={buildId}>
        <p>Publisher manuscript</p>
      </CoherenceSiteFrame>,
    );

    expect(markup).toContain('data-offline-runtime-kind="publisher-embedded"');
    expect(markup).toContain(`data-offline-runtime-build-id="${buildId}"`);
  });

  it("fails closed on non-manuscript and malformed preview authority", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    for (const publisherOfflineAuthorityBuildId of [undefined, "sha256:bad"]) {
      const markup = renderToStaticMarkup(
        <CoherenceSiteFrame
          publisherOfflineAuthorityBuildId={
            publisherOfflineAuthorityBuildId
          }
        >
          <p>Unavailable offline authority</p>
        </CoherenceSiteFrame>,
      );

      expect(markup).toContain('data-offline-runtime-kind="unavailable"');
      expect(markup).not.toContain("data-offline-runtime-build-id");
    }
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
    expect(invalidResult.dataset.readerTheme).toBe("dark");
    expect(
      invalidResult.styles.has("--coherence-publisher-embedded-canvas"),
    ).toBe(false);

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

  it("leaves the server base appearance untouched without stored preferences", () => {
    const result = executePrepaint("");

    expect(result.localStorage.getItem).toHaveBeenCalledOnce();
    expect(result.dataset).toEqual({});
    expect(result.styles.size).toBe(0);
  });

  it("prepaints every valid Coherence and Publisher scheme pair together", () => {
    const pairByTheme = {
      textured: "system",
      light: "light",
      dark: "dark",
      black: "black",
    } as const;

    for (const [theme, publisherScheme] of Object.entries(pairByTheme)) {
      const result = executePrepaint(
        JSON.stringify({
          ...defaultReaderPreferences,
          schemaVersion: 2,
          theme,
        }),
      );

      expect(result.dataset.readerTheme).toBe(theme);
      expect(result.dataset.publisherReaderScheme).toBe(publisherScheme);
      expect(
        result.styles.has("--coherence-publisher-embedded-canvas"),
      ).toBe(false);
    }
  });
});
