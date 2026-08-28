import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createPublisherApplicationProof,
  type PublisherApplicationProof,
} from "./application-proof";

let proof: PublisherApplicationProof | undefined;

function currentProof(): PublisherApplicationProof {
  if (proof === undefined) {
    throw new TypeError("Publisher application proof was not assembled.");
  }
  return proof;
}

function segmentsForRoute(route: string): readonly string[] | undefined {
  if (route === "/") return undefined;
  return route
    .slice(1, route.endsWith("/") ? -1 : undefined)
    .split("/")
    .map(decodeURIComponent);
}

function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

function assertPublisherShell(html: string): void {
  expect(count(html, /<div class="publisher-root"/gu)).toBe(1);
  expect(count(html, /<header class="publisher-site-header"/gu)).toBe(1);
  expect(count(html, /<aside class="publisher-reader-rail"/gu)).toBe(1);
  expect(count(html, /<main id="publisher:main"/gu)).toBe(1);
  expect(
    count(html, /<footer class="publisher-attribution"/gu),
  ).toBe(1);
  expect(count(html, /data-publisher-attribution="required"/gu)).toBe(1);
  expect(html).not.toMatch(/class="site-shell"/u);
  expect(html).not.toMatch(/class="site-header"/u);
  expect(html).not.toMatch(/class="site-footer"/u);
  expect(html).not.toMatch(/id="main-content"/u);
  expect(html).not.toMatch(/data-reader-animations=/u);
  expect(html).not.toMatch(/data-reader-highlights=/u);
  expect(html).not.toMatch(/data-reader-focus=/u);
  expect(html).not.toMatch(/--reader-font-scale/u);
}

async function renderRoute(route: string): Promise<{
  html: string;
  kind: string;
}> {
  const { application } = currentProof();
  const resolution = application.resolveRoute(segmentsForRoute(route));
  if (resolution.status !== "resolved") {
    throw new TypeError(`Publisher route ${route} did not resolve.`);
  }
  const page = await application.renderPage(resolution.page);
  return {
    html: renderToStaticMarkup(application.RootLayout({ children: page })),
    kind: resolution.page.kind,
  };
}

beforeAll(async () => {
  proof = await createPublisherApplicationProof();
}, 30_000);

describe("Publisher application assembly proof", () => {
  it("assembles the exact checked in Reader without asserting content parity", () => {
    const { application, readerBuild, summary } = currentProof();
    const reader = readerBuild.built.reader;

    expect(summary).toEqual({
      proofScope: "application assembly",
      contentParity: "not asserted",
      publicationId: "coherence-thesis",
      readerBuildId:
        "sha256:0e60cce59afd291f141b34ca11f7e405099fb00f0752dafa308b22efba5f9da3",
      applicationBuildId:
        "sha256:32c4b31d2e8a2cb15bec9f1ff5ecd9eb31a33cd25fea5dc243b266c5944ff44a",
      workCount: 9,
      sectionCount: 525,
      blockCount: 3_485,
      wordCount: 206_196,
      routeCount: 535,
      staticParamCount: 534,
      slashPolicy: "trailing",
      themePackage: "@genii-foundation/publisher-next",
      readerStateBootstrapPackage: "coherence-thesis",
      integrations: {
        audio: false,
        extensions: false,
        sync: false,
        updates: false,
      },
    });
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.integrations)).toBe(true);
    expect(application.reader.buildId).toBe(reader.buildId);
    expect(application.manifest).toBe(application.artifact.manifest);
    expect(application.manifest).toMatchObject({
      publicationId: reader.publicationId,
      buildId: summary.applicationBuildId,
      source: {
        readerSchemaVersion: reader.schemaVersion,
        readerBuildId: reader.buildId,
        audience: "preview",
      },
      theme: {
        package: "@genii-foundation/publisher-next",
        version: "0.1.0-alpha.0",
      },
      readerStateBootstrap: {
        package: "coherence-thesis",
        version: "0.2.0",
        apiVersion: "1.1",
        projection: null,
      },
      extensions: null,
      sync: null,
      updates: null,
    });
    expect(JSON.parse(application.artifact.text)).toEqual(
      application.manifest,
    );
    expect(application.artifact.hash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(application.offlineCatalog).toMatchObject({
      publicationId: reader.publicationId,
      readerBuildId: reader.buildId,
      rendererBuildId: application.manifest.buildId,
    });
    expect(application.offlineCatalog.packages).toHaveLength(9);
    expect(
      application.offlineCatalog.packages.flatMap(({ resources }) =>
        resources.filter(({ kind }) => kind === "audio" || kind === "timing"),
      ),
    ).toEqual([]);
  });

  it("renders home, work, and section pages with one Publisher owned shell", async () => {
    const { application } = currentProof();
    const work = application.reader.works[0];
    const section = work?.sections[0];
    if (work === undefined || section === undefined) {
      throw new TypeError("The checked in Reader has no representative work.");
    }
    const sectionRoute = application.reader.routes.active.find(
      ({ target }) =>
        target.kind === "section" &&
        target.workId === work.id &&
        target.sectionId === section.id,
    )?.path;
    if (sectionRoute === undefined) {
      throw new TypeError("The representative section has no active route.");
    }

    const home = await renderRoute("/");
    const workPage = await renderRoute(work.route);
    const sectionPage = await renderRoute(sectionRoute);

    expect(home.kind).toBe("home");
    expect(workPage.kind).toBe("work");
    expect(sectionPage.kind).toBe("section");
    expect(home.html).toContain('data-publisher-page="home"');
    expect(workPage.html).toContain(`data-publisher-work="${work.id}"`);
    expect(sectionPage.html).toContain(
      `data-publisher-section="${section.id}"`,
    );
    for (const { html } of [home, workPage, sectionPage]) {
      assertPublisherShell(html);
    }
  });

  it("runs the Publisher state adapter before Publisher prepaint", async () => {
    const { html } = await renderRoute("/");
    const bootstrapIndex = html.indexOf(
      "data-publisher-reader-state-bootstrap",
    );
    const prepaintIndex = html.indexOf("data-publisher-reader-prepaint");
    const bodyIndex = html.indexOf("<body>");
    const head = html.match(/<head>([\s\S]*?)<\/head>/u)?.[1] ?? "";
    const body = html.match(/<body>([\s\S]*?)<\/body>/u)?.[1] ?? "";

    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(prepaintIndex).toBeGreaterThan(bootstrapIndex);
    expect(bodyIndex).toBeGreaterThan(prepaintIndex);
    expect(
      count(
        head,
        /<script[^>]*data-publisher-reader-state-bootstrap=""/gu,
      ),
    ).toBe(1);
    expect(
      count(head, /<script[^>]*data-publisher-reader-prepaint=""/gu),
    ).toBe(1);
    expect(head).toContain("coherence-reader-preferences-v1");
    expect(body).not.toContain("coherence-reader-preferences-v1");
    expect(body).not.toMatch(/<script[\s>]/u);
  });

  it("refuses every optional integration input in the first slice", async () => {
    for (const field of [
      "audioData",
      "syncData",
      "updates",
      "updatesData",
      "extensions",
      "extensionData",
    ]) {
      await expect(
        createPublisherApplicationProof({
          [field]: {},
        } as never),
      ).rejects.toThrow(`refuses unsupported integration option ${field}`);
    }
  });
});
