import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCoherencePublisherApplication = vi.fn(async () => ({
  kind: "publisher-preview-application",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/publisher/application", () => ({
  loadCoherencePublisherApplication,
}));

import {
  coherencePublisherPreviewEnvironmentVariable,
  isCoherencePublisherPreviewEnabled,
  loadCoherencePublisherPreviewApplication,
} from "./preview-mode";

describe("Coherence Publisher preview mode", () => {
  beforeEach(() => {
    loadCoherencePublisherApplication.mockClear();
    vi.unstubAllEnvs();
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
    expect(loadCoherencePublisherApplication).not.toHaveBeenCalled();
  });

  it("loads Publisher once the explicit local preview is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    await expect(loadCoherencePublisherPreviewApplication()).resolves.toEqual({
      kind: "publisher-preview-application",
    });
    expect(loadCoherencePublisherApplication).toHaveBeenCalledOnce();
  });

  it("cannot activate Publisher in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COHERENCE_PUBLISHER_PREVIEW", "1");

    await expect(loadCoherencePublisherPreviewApplication()).resolves.toBeNull();
    expect(loadCoherencePublisherApplication).not.toHaveBeenCalled();
  });

  it("keeps the canonical Coherence route fallbacks in the same boundary", () => {
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
      expect(source).not.toContain("ReaderProviders");
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
    expect(sources.work).toContain("application.renderPage(resolution.page)");
    expect(sources.work).toContain('className="volume-hero volume-heading"');
    expect(sources.section).toContain("application.renderPage(resolution.page)");
    expect(sources.section).toContain("<SectionReader");
  });
});
