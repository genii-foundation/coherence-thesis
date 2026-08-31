import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionPreviewApplication = Object.freeze({
  renderEmbeddedPage: vi.fn(async () => null),
  resolveRoute: vi.fn(() => ({ status: "not-found" as const })),
});
const migrationArtifact = Object.freeze({ buildId: "migration-build" });
const themeAppearance = Object.freeze({
  base: Object.freeze({ canvas: "#F4EAD7" }),
  light: Object.freeze({ canvas: "#FFFFFF" }),
  dark: Object.freeze({ canvas: "#11100E" }),
  black: Object.freeze({ canvas: "#000000" }),
});
const transitionPreviewRuntime = Object.freeze({
  application: transitionPreviewApplication,
  migrationArtifact,
  themeAppearance,
});
const loadCoherencePublisherApplicationRuntime = vi.fn(
  async () => transitionPreviewRuntime,
);
const resolveCoherencePublisherApplicationRedirect = vi.fn(
  async (sourceHref: string) =>
    sourceHref === "/manuscripts/1/old/"
      ? Object.freeze({
          status: 308 as const,
          targetHref: "/manuscripts/1/current/",
        })
      : null,
);
const publisherApplicationModuleEvaluated = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/publisher/application", () => {
  publisherApplicationModuleEvaluated();
  return {
    loadCoherencePublisherApplicationRuntime,
    resolveCoherencePublisherApplicationRedirect,
  };
});

import {
  coherencePublisherPreviewRedirectDestination,
  coherencePublisherPreviewEnvironmentVariable,
  isCoherencePublisherPreviewEnabled,
  loadCoherencePublisherPreviewRuntime,
  resolveCoherencePublisherPreviewRedirect,
} from "./preview-mode";

const require = createRequire(import.meta.url);

describe.sequential("Coherence Publisher preview mode", () => {
  beforeEach(() => {
    loadCoherencePublisherApplicationRuntime.mockClear();
    resolveCoherencePublisherApplicationRedirect.mockClear();
    vi.unstubAllEnvs();
  });

  it("does not evaluate Publisher while the guarded preview module loads", () => {
    expect(publisherApplicationModuleEvaluated).not.toHaveBeenCalled();
  });

  it("accepts only the explicit development preview authority", () => {
    expect(coherencePublisherPreviewEnvironmentVariable).toBe(
      "COHERENCE_PUBLISHER_PREVIEW",
    );
    expect(
      isCoherencePublisherPreviewEnabled({
        COHERENCE_PUBLISHER_PREVIEW: "1",
        NODE_ENV: "development",
      }),
    ).toBe(true);

    for (const environment of [
      { COHERENCE_PUBLISHER_PREVIEW: undefined, NODE_ENV: "development" },
      { COHERENCE_PUBLISHER_PREVIEW: "0", NODE_ENV: "development" },
      { COHERENCE_PUBLISHER_PREVIEW: "true", NODE_ENV: "development" },
      { COHERENCE_PUBLISHER_PREVIEW: "1", NODE_ENV: "test" },
      { COHERENCE_PUBLISHER_PREVIEW: "1", NODE_ENV: "production" },
    ]) {
      expect(isCoherencePublisherPreviewEnabled(environment)).toBe(false);
    }
  });

  it("does not load Publisher in the default application path", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "");

    await expect(loadCoherencePublisherPreviewRuntime()).resolves.toBeNull();
    await expect(
      resolveCoherencePublisherPreviewRedirect("/manuscripts/1/old/"),
    ).resolves.toBeNull();
    expect(loadCoherencePublisherApplicationRuntime).not.toHaveBeenCalled();
    expect(
      resolveCoherencePublisherApplicationRedirect,
    ).not.toHaveBeenCalled();
    expect(publisherApplicationModuleEvaluated).not.toHaveBeenCalled();
  });

  it("cannot import Publisher behavior in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    await expect(loadCoherencePublisherPreviewRuntime()).resolves.toBeNull();
    await expect(
      resolveCoherencePublisherPreviewRedirect("/manuscripts/1/old/"),
    ).resolves.toBeNull();
    expect(loadCoherencePublisherApplicationRuntime).not.toHaveBeenCalled();
    expect(
      resolveCoherencePublisherApplicationRedirect,
    ).not.toHaveBeenCalled();
    expect(publisherApplicationModuleEvaluated).not.toHaveBeenCalled();
  });

  it("loads Publisher once the explicit local preview is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    const runtime = await loadCoherencePublisherPreviewRuntime();
    const application = runtime?.application;

    expect(runtime).toBe(transitionPreviewRuntime);
    expect(runtime?.migrationArtifact).toBe(migrationArtifact);
    expect(runtime?.themeAppearance).toBe(themeAppearance);
    expect(application).toBe(transitionPreviewApplication);
    expect(Reflect.ownKeys(application ?? {})).toEqual([
      "renderEmbeddedPage",
      "resolveRoute",
    ]);
    expect(application).not.toHaveProperty("ReaderPrepaint");
    expect(application).not.toHaveProperty("ReaderProviders");
    expect(application).not.toHaveProperty("RootLayout");
    expect(application).not.toHaveProperty("RootPage");
    expect(application).not.toHaveProperty("renderPage");
    expect(loadCoherencePublisherApplicationRuntime).toHaveBeenCalledOnce();
    expect(publisherApplicationModuleEvaluated).toHaveBeenCalledOnce();
  });

  it("resolves only exact Publisher redirect sources in preview mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    await expect(
      resolveCoherencePublisherPreviewRedirect("/manuscripts/1/old/"),
    ).resolves.toEqual({
      status: 308,
      targetHref: "/manuscripts/1/current/",
    });
    await expect(
      resolveCoherencePublisherPreviewRedirect("/manuscripts/1/old"),
    ).resolves.toBeNull();
    expect(
      resolveCoherencePublisherApplicationRedirect,
    ).toHaveBeenNthCalledWith(1, "/manuscripts/1/old/");
    expect(
      resolveCoherencePublisherApplicationRedirect,
    ).toHaveBeenNthCalledWith(2, "/manuscripts/1/old");
  });

  it("preserves scalar, repeated, empty, and encoded query values", () => {
    expect(
      coherencePublisherPreviewRedirectDestination(
        "/manuscripts/1/current/",
        {
          empty: "",
          omitted: undefined,
          query: "meaning & form",
          tag: ["first", "second"],
        },
      ),
    ).toBe(
      "/manuscripts/1/current/?empty=&query=meaning+%26+form&tag=first&tag=second",
    );
    expect(
      coherencePublisherPreviewRedirectDestination(
        "/manuscripts/1/current/",
        {},
      ),
    ).toBe("/manuscripts/1/current/");

    for (const target of [
      "https://example.com/",
      "//example.com/",
      "/\\evil.example/",
      "/manuscripts/1/\tcurrent/",
      "/manuscripts/1/\ncurrent/",
      "/manuscripts/1/../current/",
      "/%2E%2E/admin/",
      "/manuscripts//current/",
      "/manuscripts/%c3%a9/",
      "/manuscripts/%41/",
      "/manuscripts/é/",
      "/manuscripts/1/current/?query=forged",
      "/manuscripts/1/current/#forged",
      `/${"a".repeat(2_048)}`,
    ]) {
      expect(() =>
        coherencePublisherPreviewRedirectDestination(target, {}),
      ).toThrow("must be an internal path without a query or fragment");
    }
  });

  it("keeps Publisher redirects ahead of resolution and Coherence aliases outside preview", () => {
    const publisherRoot = path.dirname(fileURLToPath(import.meta.url));
    const srcRoot = path.resolve(publisherRoot, "..");
    const publisherNextRoot = path.dirname(
      require.resolve("@genii-foundation/publisher-next/styles.css"),
    );
    const sources = {
      home: fs.readFileSync(path.join(srcRoot, "app", "page.tsx"), "utf8"),
      globals: fs.readFileSync(
        path.join(srcRoot, "app", "globals.css"),
        "utf8",
      ),
      layout: fs.readFileSync(path.join(srcRoot, "app", "layout.tsx"), "utf8"),
      manuscriptLayout: fs.readFileSync(
        path.join(srcRoot, "app", "manuscripts", "[volumeId]", "layout.tsx"),
        "utf8",
      ),
      publisherThemeStyle: fs.readFileSync(
        path.join(publisherNextRoot, "dist", "theme", "style.js"),
        "utf8",
      ),
      section: fs.readFileSync(
        path.join(
          srcRoot,
          "app",
          "manuscripts",
          "[volumeId]",
          "[...route]",
          "page.tsx",
        ),
        "utf8",
      ),
      work: fs.readFileSync(
        path.join(srcRoot, "app", "manuscripts", "[volumeId]", "page.tsx"),
        "utf8",
      ),
      transitionPage: fs.readFileSync(
        path.join(srcRoot, "publisher", "transition-page.tsx"),
        "utf8",
      ),
    };

    for (const source of [sources.work, sources.section]) {
      expect(source).toContain("loadCoherencePublisherPreviewRuntime");
      expect(source).not.toContain("loadCoherencePublisherApplicationRuntime");
    }
    expect(sources.home).not.toContain(
      "loadCoherencePublisherPreviewRuntime",
    );
    expect(sources.home).not.toContain("RootPage");
    expect(sources.home).toContain("<CoherenceSiteFrame>");
    expect(sources.layout).toContain("<CoherenceReaderPrepaint />");
    expect(sources.layout).not.toContain(
      "loadCoherencePublisherPreviewRuntime",
    );
    expect(sources.layout).not.toContain("publisherApplication.ReaderPrepaint");
    expect(sources.manuscriptLayout).not.toContain(
      "loadCoherencePublisherPreviewRuntime",
    );
    expect(sources.manuscriptLayout).toContain(
      "<CoherenceSiteFrame>{children}</CoherenceSiteFrame>",
    );
    expect(sources.transitionPage).toContain(
      "input.application.renderEmbeddedPage(input.page)",
    );
    expect(sources.transitionPage).not.toContain(".renderPage(");
    expect(sources.transitionPage).toMatch(
      /<div className="page-frame reader-layout">\s+<div\s+className="reader-main coherence-publisher-transition-canvas"\s+style=\{canvasStyle\}\s*>\s+<LegacyFragmentRedirectIsland\s+publisherFragmentModel=\{publisherFragmentModel\}\s+\/>\s+\{renderedPage\}/u,
    );
    expect(sources.transitionPage).toContain(
      "input.themeAppearance.base.canvas",
    );
    expect(sources.transitionPage).toContain(
      "input.themeAppearance.light.canvas",
    );
    expect(sources.transitionPage).toContain(
      "input.themeAppearance.dark.canvas",
    );
    expect(sources.transitionPage).toContain(
      "input.themeAppearance.black.canvas",
    );
    expect(sources.transitionPage).not.toContain('colorScheme: "light"');
    expect(sources.publisherThemeStyle).toContain(
      '"--publisher-font-heading": typography.headingFamily',
    );
    expect(sources.globals).toMatch(
      /\.publisher-root\.publisher-root-embedded \{\s+--publisher-font-heading: var\(--font-body\) !important;\s+--publisher-reader-font-family: var\(--font-body\);\s+--publisher-reader-font-scale: 1;\s+\}/u,
    );
    expect(sources.globals).toContain(
      'html[data-reader-focus="strong"]\n  .publisher-root-embedded\n  .publisher-focus-emphasis-strong',
    );
    expect(sources.globals).toContain(
      'html[data-reader-animations="none"] *',
    );
    expect(sources.globals).not.toContain(
      "data-publisher-reader-focus",
    );
    expect(sources.globals).not.toContain(
      "data-publisher-reader-motion",
    );
    expect(sources.globals).not.toContain(".publisher-attribution");
    const canvasSelectionByTheme = {
      textured: {
        publisherScheme: "system",
        property: "--coherence-publisher-embedded-base-canvas",
      },
      light: {
        publisherScheme: "light",
        property: "--coherence-publisher-embedded-light-canvas",
      },
      dark: {
        publisherScheme: "dark",
        property: "--coherence-publisher-embedded-dark-canvas",
      },
      black: {
        publisherScheme: "black",
        property: "--coherence-publisher-embedded-black-canvas",
      },
    } as const;
    expect(sources.globals).toMatch(
      /\.coherence-publisher-transition-canvas \{\s+--coherence-publisher-embedded-canvas: var\(\s+--coherence-publisher-embedded-base-canvas\s+\);\s+\}/u,
    );
    for (const [theme, selection] of Object.entries(
      canvasSelectionByTheme,
    )) {
      const selector = `html[data-reader-theme="${theme}"][data-publisher-reader-scheme="${selection.publisherScheme}"]`;
      const selectorIndex = sources.globals.indexOf(selector);
      const blockEnd = sources.globals.indexOf("}", selectorIndex);
      expect(selectorIndex).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(selectorIndex);
      expect(sources.globals.slice(selectorIndex, blockEnd)).toContain(
        selection.property,
      );
    }
    const transitionPageCall =
      /return renderCoherencePublisherTransitionPage\(\{\s+application,\s+migrationArtifact,\s+page: resolution\.page,\s+themeAppearance,\s+\}\);/u;
    expect(sources.work).toMatch(transitionPageCall);
    expect(sources.work).not.toContain(
      "return application.renderPage(resolution.page)",
    );
    expect(sources.work).toContain('className="volume-hero volume-heading"');
    expect(sources.section).toMatch(transitionPageCall);
    expect(sources.section).not.toContain(
      "return application.renderPage(resolution.page)",
    );
    expect(sources.section).toContain("<SectionReader");
    expect(sources.section).toContain("export const dynamicParams = false;");
    expect(sources.section).toMatch(
      /export function generateStaticParams\(\) \{\s+return manuscriptPathParams\(\);\s+\}/u,
    );

    const previewStart = sources.section.indexOf("if (publisherRuntime) {");
    const publisherRedirect = sources.section.indexOf(
      "resolveCoherencePublisherPreviewRedirect(href)",
      previewStart,
    );
    const publisherResolution = sources.section.indexOf(
      "application.resolveRoute(",
      previewStart,
    );
    const permanentPublisherRedirect = sources.section.indexOf(
      "permanentRedirect(",
      publisherRedirect,
    );
    const coherenceAlias = sources.section.indexOf(
      "const routeAlias = routeAliasByHref(href);",
      previewStart,
    );
    expect(previewStart).toBeGreaterThan(-1);
    expect(publisherRedirect).toBeGreaterThan(previewStart);
    expect(permanentPublisherRedirect).toBeGreaterThan(publisherRedirect);
    expect(publisherResolution).toBeGreaterThan(permanentPublisherRedirect);
    expect(coherenceAlias).toBeGreaterThan(publisherResolution);
    expect(sources.section).toMatch(
      /if \(publisherRedirect\) \{\s+permanentRedirect\(\s+coherencePublisherPreviewRedirectDestination\(\s+publisherRedirect\.targetHref,\s+await searchParams,\s+\),\s+\);\s+\}\s+const resolution = application\.resolveRoute\(/u,
    );
    expect(
      sources.section.slice(previewStart, coherenceAlias),
    ).not.toContain("routeAliasByHref");
    expect(sources.section.slice(coherenceAlias)).toContain(
      "if (routeAlias) redirect(routeAlias.targetHref);",
    );
  });
});
