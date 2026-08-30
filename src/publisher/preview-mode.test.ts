import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionPreviewApplication = Object.freeze({
  ReaderPrepaint: vi.fn(),
  RootPage: vi.fn(async () => null),
  renderPage: vi.fn(async () => null),
  resolveRoute: vi.fn(() => ({ status: "not-found" as const })),
});
const loadCoherencePublisherApplication = vi.fn(
  async () => transitionPreviewApplication,
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
    loadCoherencePublisherApplication,
    resolveCoherencePublisherApplicationRedirect,
  };
});

import {
  coherencePublisherPreviewRedirectDestination,
  coherencePublisherPreviewEnvironmentVariable,
  isCoherencePublisherPreviewEnabled,
  loadCoherencePublisherPreviewApplication,
  resolveCoherencePublisherPreviewRedirect,
} from "./preview-mode";

describe.sequential("Coherence Publisher preview mode", () => {
  beforeEach(() => {
    loadCoherencePublisherApplication.mockClear();
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

    await expect(loadCoherencePublisherPreviewApplication()).resolves.toBeNull();
    await expect(
      resolveCoherencePublisherPreviewRedirect("/manuscripts/1/old/"),
    ).resolves.toBeNull();
    expect(loadCoherencePublisherApplication).not.toHaveBeenCalled();
    expect(
      resolveCoherencePublisherApplicationRedirect,
    ).not.toHaveBeenCalled();
    expect(publisherApplicationModuleEvaluated).not.toHaveBeenCalled();
  });

  it("cannot import Publisher behavior in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    await expect(loadCoherencePublisherPreviewApplication()).resolves.toBeNull();
    await expect(
      resolveCoherencePublisherPreviewRedirect("/manuscripts/1/old/"),
    ).resolves.toBeNull();
    expect(loadCoherencePublisherApplication).not.toHaveBeenCalled();
    expect(
      resolveCoherencePublisherApplicationRedirect,
    ).not.toHaveBeenCalled();
    expect(publisherApplicationModuleEvaluated).not.toHaveBeenCalled();
  });

  it("loads Publisher once the explicit local preview is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    const application = await loadCoherencePublisherPreviewApplication();

    expect(application).toBe(transitionPreviewApplication);
    expect(Reflect.ownKeys(application ?? {})).toEqual([
      "ReaderPrepaint",
      "RootPage",
      "renderPage",
      "resolveRoute",
    ]);
    expect(application).not.toHaveProperty("ReaderProviders");
    expect(application).not.toHaveProperty("RootLayout");
    expect(loadCoherencePublisherApplication).toHaveBeenCalledOnce();
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
    const sources = {
      home: fs.readFileSync(path.join(srcRoot, "app", "page.tsx"), "utf8"),
      manuscriptLayout: fs.readFileSync(
        path.join(srcRoot, "app", "manuscripts", "[volumeId]", "layout.tsx"),
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
    };

    for (const source of Object.values(sources)) {
      expect(source).toContain("loadCoherencePublisherPreviewApplication");
      expect(source).not.toContain("loadCoherencePublisherApplication");
    }
    expect(sources.home).toContain("publisherApplication.RootPage()");
    expect(sources.home).toContain("<CoherenceSiteFrame>");
    expect(sources.manuscriptLayout).toContain(
      "if (publisherApplication) return children;",
    );
    expect(sources.manuscriptLayout).toContain(
      "<CoherenceSiteFrame>{children}</CoherenceSiteFrame>",
    );
    const transitionPageCall =
      /return renderCoherencePublisherTransitionPage\(\{\s+application,\s+page: resolution\.page,\s+\}\);/u;
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

    const previewStart = sources.section.indexOf("if (application) {");
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
