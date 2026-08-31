import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { brotliCompressSync } from "node:zlib";
import {
  canonicalizeJson,
  hashCanonicalJson,
} from "@genii-foundation/publisher-content";
import type {
  JSONValue,
  PublicationReaderEnvelope,
} from "@genii-foundation/publisher-schema";
import {
  PUBLISHER_NEXT_AUDIO_DATA_PATH,
  PUBLISHER_NEXT_SYNC_DATA_PATH,
  PUBLISHER_NEXT_UPDATES_DATA_PATH,
} from "@genii-foundation/publisher-next/host";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generatedPublisherRoot,
  generatedPublisherThemeHostProofRoot,
  repoRoot,
} from "../repository/paths";
import {
  PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
  PUBLISHER_THEME_READER_FONT_IDS,
  PUBLISHER_THEME_RUNTIME_ARTIFACT_PATHS,
  PUBLISHER_THEME_CURRENT_TRANSITION_SOURCE_PATHS,
  PUBLISHER_THEME_SOURCE_AUTHORITY_PATHS,
  assertReviewedPublisherThemeFontEvidence,
  assertPublisherThemeCurrentSourceAuthority,
  assertPublisherThemeCurrentTransitionBoundary,
  assertPublisherThemeHostPackageVersions,
  assertPublisherThemeHostProofBoundary,
  assertPublisherThemeHostSourcesCurrent,
  assertPublisherThemeProofRouteUnowned,
  assertPublisherThemeResponseMediaType,
  assertPublisherThemeRuntimeArtifactEvidence,
  assertPublisherThemeVerificationRoutePaths,
  createPublisherThemeResponseBudget,
  createPublisherThemeChildEnvironment,
  createPublisherThemeHostReaderProjection,
  createPublisherThemeHostScaffolding,
  createPublisherThemeHostTemplateEvidence,
  createPublisherThemeProofHostFiles,
  defaultPublisherThemeHostProofPaths,
  fetchPublisherThemeBuiltHost,
  materializePublisherThemeHostSources,
  parsePublisherThemeProofPage,
  readPublisherThemeBoundedResponse,
  runBoundedNodeCommand,
  runPublisherThemeHostProof,
  snapshotPublisherThemeHostSources,
  verifyPublisherThemeFontArtifacts,
  verifyPublisherThemeHostRuntime,
  verifyPublisherThemeLinkfulHostPages,
  withDisposablePublisherThemeHost,
} from "./theme-host-proof";
import {
  adaptCoherencePublisherContent,
  loadCoherencePublisherContentAuthorities,
  type CoherencePublisherContentProof,
} from "./content-adapter";
import { acquirePublisherRepositorySourceTestLock } from "./test-worktree-lock.mjs";

const createdRoots: string[] = [];

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function createIgnoredRoot(prefix: string): string {
  fs.mkdirSync(generatedPublisherThemeHostProofRoot, { recursive: true });
  const root = fs.mkdtempSync(
    path.join(generatedPublisherThemeHostProofRoot, `${prefix}-`),
  );
  createdRoots.push(root);
  return root;
}

function writeLoopbackHostFixture(root: string): string {
  const fixturePath = path.join(root, "loopback-host-fixture.mjs");
  const proofHtml =
    '<script id="publisher-theme-proof-data" type="application/json">{"fixture":"drifted"}</script>';
  const fixtureHomeHtml = homeHtml();
  fs.writeFileSync(
    fixturePath,
    [
      'import fs from "node:fs";',
      'import http from "node:http";',
      'import path from "node:path";',
      `const proofHtml = ${JSON.stringify(proofHtml)};`,
      `const homeHtml = ${JSON.stringify(fixtureHomeHtml)};`,
      "const server = http.createServer((request, response) => {",
      '  response.setHeader("content-type", "text/html; charset=utf-8");',
      '  const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;',
      '  if (requestPath === "/coherence-theme-proof") {',
      "    response.end(proofHtml);",
      "    return;",
      "  }",
      '  if (requestPath === "/publication-audio.json") {',
      "    response.statusCode = 404;",
      '    response.end("missing");',
      "    return;",
      "  }",
      '  if (requestPath.startsWith("/_next/")) {',
      '    const relativePath = requestPath.slice("/_next/".length).split("/");',
      '    const assetPath = path.join(process.cwd(), ".next", ...relativePath);',
      '    response.setHeader("content-type", requestPath.endsWith(".css") ? "text/css" : "font/woff2");',
      "    response.end(fs.readFileSync(assetPath));",
      "    return;",
      "  }",
      '  response.end(requestPath === "/observer-alive" ? "alive" : homeHtml);',
      "});",
      'server.listen(0, "127.0.0.1", () => {',
      "  const address = server.address();",
      '  if (address === null || typeof address === "string") process.exit(1);',
      '  console.log("http://127.0.0.1:" + String(address.port));',
      "});",
      "const stop = () => server.close(() => process.exit(0));",
      'process.once("SIGINT", stop);',
      'process.once("SIGTERM", stop);',
      "",
    ].join("\n"),
    "utf8",
  );
  return fixturePath;
}

async function assertLoopbackHostStopped(baseUrl: string): Promise<void> {
  await expect(
    fetch(new URL("/observer-alive", baseUrl), {
      signal: AbortSignal.timeout(1_000),
    }),
  ).rejects.toThrow();
}

function compiledThemeTokens() {
  const families = {
    literata: '"__Literata_test", "__Literata_test Fallback"',
    sourceSerif: '"__Source_Serif_4_test", "__Source_Serif_4_test Fallback"',
    newsreader: '"__Newsreader_test", "__Newsreader_test Fallback"',
    cormorant:
      '"__Cormorant_Garamond_test", "__Cormorant_Garamond_test Fallback"',
    fraunces: '"__Fraunces_test", "__Fraunces_test Fallback"',
  };
  return {
    color: {
      canvas: "#F4EAD7",
      surface: "#FBF6EB",
      text: "#13202A",
      mutedText: "#5A666C",
      accent: "#77542A",
      focus: "#60796D",
      border: "#E3D1AD",
    },
    typography: {
      bodyFamily: families.literata,
      headingFamily: families.literata,
      monoFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace",
      baseSize: "1.12rem",
      lineHeight: 1.78,
      defaultReaderFontFamilyId: "literata",
      readerFontFamilies: [
        { id: "literata", label: "Literata", family: families.literata },
        {
          id: "source-serif",
          label: "Source Serif 4",
          family: families.sourceSerif,
        },
        { id: "newsreader", label: "Newsreader", family: families.newsreader },
        {
          id: "cormorant",
          label: "Cormorant Garamond",
          family: families.cormorant,
        },
        { id: "fraunces", label: "Fraunces", family: families.fraunces },
        {
          id: "serif",
          label: "System serif",
          family: 'Georgia, "Times New Roman", serif',
        },
      ],
    },
    layout: {
      readingMeasure: "48rem",
      pageGutter: "1.5rem",
      sectionGap: "3rem",
      controlRadius: "8px",
    },
  };
}

function encodeWoff2Base128(value: number): Buffer {
  const octets = [value & 0x7f];
  let remaining = Math.floor(value / 128);
  while (remaining > 0) {
    octets.unshift((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  return Buffer.from(octets);
}

function woff2Fixture(
  label: string,
  options: Readonly<{
    payload?: Buffer;
    originalLength?: number;
    storedLength?: number;
    tagIndex?: number;
    totalCompressedSize?: number;
    totalSfntSize?: number;
    transformVersion?: number;
  }> = {},
): Buffer {
  const payload = options.payload ?? Buffer.from(`font:${label}`, "utf8");
  const compressed = brotliCompressSync(payload);
  const transformVersion = options.transformVersion ?? 0;
  const tagIndex = options.tagIndex ?? 5;
  const transformed =
    (tagIndex === 10 || tagIndex === 11) && transformVersion === 0
      ? true
      : tagIndex !== 10 && tagIndex !== 11 && transformVersion !== 0;
  const originalLength = encodeWoff2Base128(
    options.originalLength ?? payload.byteLength,
  );
  const storedLength = transformed
    ? encodeWoff2Base128(options.storedLength ?? payload.byteLength)
    : Buffer.alloc(0);
  const directory = Buffer.concat([
    Buffer.from([(transformVersion << 6) | tagIndex]),
    originalLength,
    storedLength,
  ]);
  const result = Buffer.alloc(48 + directory.byteLength + compressed.byteLength);
  result.write("wOF2", 0, "ascii");
  result.writeUInt32BE(0x0001_0000, 4);
  result.writeUInt32BE(result.byteLength, 8);
  result.writeUInt16BE(1, 12);
  result.writeUInt16BE(0, 14);
  result.writeUInt32BE(
    options.totalSfntSize ?? 28 + Math.ceil(payload.byteLength / 4) * 4,
    16,
  );
  result.writeUInt32BE(
    options.totalCompressedSize ?? compressed.byteLength,
    20,
  );
  directory.copy(result, 48);
  compressed.copy(result, 48 + directory.byteLength);
  return result;
}

function usableWoff2Fixture(label: string): Buffer {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
    ),
  );
  if (source.readUInt32BE(40) !== 0 || source.readUInt32BE(44) !== 0) {
    throw new TypeError("Reviewed WOFF2 fixture unexpectedly contains private data.");
  }
  const privateData = Buffer.from(`publisher-theme-fixture:${label}`, "utf8");
  const result = Buffer.concat([source, privateData]);
  result.writeUInt32BE(result.byteLength, 8);
  result.writeUInt32BE(source.byteLength, 40);
  result.writeUInt32BE(privateData.byteLength, 44);
  return result;
}

function writeFontFixture(nextRoot: string): Readonly<{
  stylesheets: readonly Readonly<{ path: string; text: string }>[];
  fonts: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}> {
  const cssRoot = path.join(nextRoot, "static/chunks");
  const mediaRoot = path.join(nextRoot, "static/media");
  const serverRoot = path.join(nextRoot, "server");
  fs.mkdirSync(cssRoot, { recursive: true });
  fs.mkdirSync(mediaRoot, { recursive: true });
  fs.mkdirSync(serverRoot, { recursive: true });
  const rows = [
    ["__Literata_test", "__Literata_test Fallback", "literata", "200 900"],
    [
      "__Source_Serif_4_test",
      "__Source_Serif_4_test Fallback",
      "source-serif",
      "200 900",
    ],
    ["__Newsreader_test", "__Newsreader_test Fallback", "newsreader", "200 800"],
    [
      "__Cormorant_Garamond_test",
      "__Cormorant_Garamond_test Fallback",
      "cormorant",
      "300 700",
    ],
    ["__Fraunces_test", "__Fraunces_test Fallback", "fraunces", "100 900"],
  ] as const;
  const css = rows
    .flatMap(([family, , file, weight]) =>
      ["normal", "italic"].map(
        (style) =>
          `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url(../media/${file}.woff2) format("woff2");unicode-range:U+20-7E}`,
      ),
    )
    .concat(
      rows.map(
        ([, fallback]) =>
          `@font-face{font-family:"${fallback}";src:local(Times New Roman);ascent-override:100%;descent-override:25%;line-gap-override:0.0%;size-adjust:100%}`,
      ),
    )
    .join("\n");
  fs.writeFileSync(path.join(cssRoot, "app.css"), css);
  const manifestAssets: string[] = [];
  for (const [, , file] of rows) {
    fs.writeFileSync(
      path.join(mediaRoot, `${file}.woff2`),
      usableWoff2Fixture(file),
    );
    manifestAssets.push(`static/media/${file}.woff2`);
  }
  const hostRoot = path
    .relative(repoRoot, path.dirname(nextRoot))
    .split(path.sep)
    .join("/");
  fs.writeFileSync(
    path.join(serverRoot, "next-font-manifest.json"),
    JSON.stringify({
      app: {
        [`[project]/${hostRoot}/app/page`]: manifestAssets,
        [`[project]/${hostRoot}/app/coherence-theme-proof/page`]: manifestAssets,
      },
    }),
  );
  return Object.freeze({
    stylesheets: Object.freeze([
      Object.freeze({ path: "static/chunks/app.css", text: css }),
    ]),
    fonts: Object.freeze(
      manifestAssets.map((fontPath) =>
        Object.freeze({
          path: fontPath,
          bytes: fs.readFileSync(path.join(nextRoot, ...fontPath.split("/"))),
        }),
      ),
    ),
  });
}

function currentFontResponses(
  nextRoot: string,
  fonts: readonly Readonly<{ path: string; bytes: Uint8Array }>[],
): readonly Readonly<{ path: string; bytes: Uint8Array }>[] {
  return Object.freeze(
    fonts.map(({ path: fontPath }) =>
      Object.freeze({
        path: fontPath,
        bytes: fs.readFileSync(path.join(nextRoot, ...fontPath.split("/"))),
      }),
    ),
  );
}

function homeHtml(
  tokens = compiledThemeTokens(),
  options: Readonly<{
    includeRootStyle?: boolean;
    extraRoot?: boolean;
    styleOverride?: string;
  }> = {},
): string {
  const color = tokens.color;
  const typography = tokens.typography;
  const layout = tokens.layout;
  const style = [
    `--publisher-color-canvas:${color.canvas}`,
    `--publisher-color-surface:${color.surface}`,
    `--publisher-color-text:${color.text}`,
    `--publisher-color-muted-text:${color.mutedText}`,
    `--publisher-color-accent:${color.accent}`,
    `--publisher-color-focus:${color.focus}`,
    `--publisher-color-border:${color.border}`,
    `--publisher-font-body:${typography.bodyFamily}`,
    `--publisher-font-heading:${typography.headingFamily}`,
    `--publisher-font-mono:${typography.monoFamily}`,
    `--publisher-reader-default-font-family:${typography.readerFontFamilies[0]!.family}`,
    `--publisher-font-size:${typography.baseSize}`,
    `--publisher-line-height:${String(typography.lineHeight)}`,
    `--publisher-reading-measure:${layout.readingMeasure}`,
    `--publisher-page-gutter:${layout.pageGutter}`,
    `--publisher-section-gap:${layout.sectionGap}`,
    `--publisher-control-radius:${layout.controlRadius}`,
  ]
    .join(";")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");
  const links = [
    ...[
      "literata",
      "source-serif",
      "newsreader",
      "cormorant",
      "fraunces",
    ].map(
      (file) =>
        `<link rel="preload" href="/_next/static/media/${file}.woff2" as="font" crossorigin="" type="font/woff2"/>`,
    ),
    '<link rel="stylesheet" href="/_next/static/chunks/app.css"/>',
  ].join("");
  const rootStyle =
    options.includeRootStyle === false
      ? ""
      : ` style="${
          options.styleOverride === undefined
            ? style
            : options.styleOverride
                .replaceAll("&", "&amp;")
                .replaceAll('"', "&quot;")
        }"`;
  return `${links}<div class="publisher-root" data-publisher-page="home"${rootStyle}>Reader home</div>${options.extraRoot ? '<div class="publisher-root" data-publisher-page="home" style=""></div>' : ""}`;
}

type ThemeReaderProjection = Parameters<
  typeof verifyPublisherThemeHostRuntime
>[0]["projection"];

function syntheticSectionIndexes(
  paths: readonly string[] = ["/index-a/", "/index-b/", "/index-c/"],
) {
  return paths.map((indexPath, index) => ({
    id: `synthetic-index-${index}`,
    title: `Synthetic index ${index}`,
    path: indexPath,
    workId: "source-work",
    sections: Array.from({ length: 19 }, (_, sectionIndex) => ({
      id: `synthetic-index-${index}-section-${sectionIndex}`,
      title: `Synthetic section ${index}.${sectionIndex}`,
      href: `/synthetic-index-${index}-section-${sectionIndex}/`,
    })),
  }));
}

function syntheticExtensionManifest() {
  const entries = Object.freeze([Object.freeze({
    id: "coherence-reader-state-migration",
    package: "coherence-reader-state-migration",
    version: "1.0.0",
    capabilities: Object.freeze(["content.project", "renderer.client"]),
    projectionHash: `sha256:${"8".repeat(64)}` as `sha256:${string}`,
    rendererApiVersion: "1.0" as const,
    rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
    hostApiVersion: null,
    hostCompatibility: null,
  })]);
  const basis = Object.freeze({ schemaVersion: "1.0" as const, entries });
  return Object.freeze({
    ...basis,
    buildId: hashCanonicalJson(
      basis as unknown as JSONValue,
    ) as `sha256:${string}`,
  });
}

function syntheticReader(): PublicationReaderEnvelope {
  const sectionIndexes = syntheticSectionIndexes();
  return {
    publicationId: "coherence-thesis",
    buildId: `sha256:${"1".repeat(64)}`,
    schemaVersion: "1.0",
    engineVersion: "0.1.0-alpha.0",
    audience: "preview",
    routes: {
      active: [
        { path: "/", target: { kind: "home" } },
        { path: "/source/", target: { kind: "work", workId: "source-work" } },
        {
          path: "/owner/",
          target: {
            kind: "section",
            workId: "source-work",
            sectionId: "owner-section",
          },
        },
        ...sectionIndexes.map(({ id, title, path: indexPath, sections }) => ({
          path: indexPath,
          target: {
            kind: "section-index" as const,
            id,
            title,
            workId: "source-work",
            sectionIds: sections.map(({ id: sectionId }) => sectionId),
          },
        })),
        ...Array.from({ length: 580 }, (_, index) => ({
          path: `/synthetic-${index}/`,
          target: { kind: "work" as const, workId: `synthetic-${index}` },
        })),
      ],
      redirects: Array.from({ length: 584 }, (_, index) => ({
        from: `/legacy-synthetic-${index}`,
        status: 308 as const,
        to: `/synthetic-${index % 580}/`,
      })),
    },
    links: [
      {
        id: "semantic-link-synthetic",
        href: "/target/",
        label: "Target",
        source: {
          kind: "block-markdown",
          workId: "source-work",
          sectionId: "source-section",
          blockId: "source-block",
          range: { start: 0, end: 6 },
        },
      },
    ],
    works: [
      {
        id: "source-work",
        sections: [
          {
            id: "owner-section",
            domId: "owner-anchor",
            readerAddress: { path: "/owner/", anchor: "owner-anchor" },
          },
          ...sectionIndexes.flatMap((index) =>
            index.sections.map((section) => ({
              id: section.id,
              title: section.title,
              readerAddress: { path: section.href },
            })),
          ),
        ],
      },
    ],
  } as unknown as PublicationReaderEnvelope;
}

function projectionForReader(
  reader = syntheticReader(),
  routePaths: readonly string[] = [
    "/source/",
    "/owner/",
    "/index-a/",
    "/index-b/",
    "/index-c/",
  ],
  isolatedExtensionManifest: ThemeReaderProjection["isolatedExtensionManifest"] =
    syntheticExtensionManifest(),
): ThemeReaderProjection {
  const sectionIndexPaths = routePaths.slice(-3);
  const liveRoutePaths = routePaths.slice(0, -3);
  const semanticLinks = reader.links.map((link) => {
    if (link.source.kind !== "block-markdown" || link.label === undefined) {
      throw new Error("synthetic Reader link is not block Markdown");
    }
    return {
      id: link.id,
      workId: link.source.workId,
      sectionId: link.source.sectionId,
      blockId: link.source.blockId,
      href: link.href,
      label: link.label,
      sourceStart: link.source.range.start,
    };
  });
  const fragmentOwners = liveRoutePaths.slice(1).map((ownerPath) => {
    const route = reader.routes.active.find(({ path }) => path === ownerPath);
    const work = reader.works.find(
      ({ id }) =>
        route?.target.kind === "section" && id === route.target.workId,
    );
    const section = work?.sections.find(
      ({ id }) =>
        route?.target.kind === "section" && id === route.target.sectionId,
    );
    if (section?.readerAddress?.anchor === undefined) {
      throw new Error(`synthetic owner missing for ${ownerPath}`);
    }
    const sectionChildIds = section.childIds ?? [];
    const childIds =
      sectionChildIds.length > 0
        ? [...sectionChildIds]
        : ownerPath === "/owner/"
          ? ["child-section-a", "child-section-b"]
          : [];
    return {
      workId: work!.id,
      sectionId: section.id,
      path: ownerPath,
      anchor: section.readerAddress.anchor,
      href: `${ownerPath}#${section.readerAddress.anchor}`,
      childIds,
      catalogSectionIds: [section.id, ...childIds],
    };
  });
  const fragmentOwnerChildIds = fragmentOwners.flatMap(({ childIds }) =>
    childIds,
  );
  const liveContentPaths = [...liveRoutePaths];
  const sectionIndexes = sectionIndexPaths.map((indexPath) => {
    const route = reader.routes.active.find(
      ({ path: routePath }) => routePath === indexPath,
    );
    if (route?.target.kind !== "section-index") {
      throw new Error(`synthetic section index missing for ${indexPath}`);
    }
    const target = route.target;
    const work = reader.works.find(({ id }) => id === target.workId);
    if (work === undefined) {
      throw new Error(`synthetic section index work missing for ${indexPath}`);
    }
    return {
      id: target.id,
      title: target.title,
      path: indexPath,
      workId: target.workId,
      sections: target.sectionIds.map((sectionId) => {
        const section = work.sections.find(({ id }) => id === sectionId);
        if (section?.readerAddress === null || section?.readerAddress === undefined) {
          throw new Error(
            `synthetic section index reference missing for ${sectionId}`,
          );
        }
        return {
          id: section.id,
          title: section.title,
          href: `${section.readerAddress.path}${
            section.readerAddress.anchor === undefined
              ? ""
              : `#${section.readerAddress.anchor}`
          }`,
        };
      }),
    };
  });
  return {
    reader,
    artifacts: [],
    extensionData: {} as never,
    isolatedExtensionManifest,
    stateMigrationArtifact: {} as never,
    stateMigrationProjection: {
      schemaVersion: "1.0",
      publicationId: reader.publicationId,
      artifact: {
        href: "/publisher/coherence-reader-state-migration.json",
        readerBuildId: reader.buildId,
        buildId: `sha256:${"4".repeat(64)}`,
        byteSize: 1,
        sha256: `sha256:${"5".repeat(64)}`,
      },
    },
    contentBuildId: `sha256:${"2".repeat(64)}`,
    adaptedApplicationBuildId: `sha256:${"3".repeat(64)}`,
    contentEvidenceHash:
      "sha256:4794f0799c3d8172573217881657382ad27800d8d991ad2c0f11d26c78fe47b0",
    activeRouteCount: 586,
    explicitRedirectCount: 584,
    canonicalSlashRedirectCount: 585,
    activePathsHash: hashCanonicalJson(
      reader.routes.active.map(({ path: routePath }) => routePath) as unknown as JSONValue,
    ),
    activeRoutesHash: hashCanonicalJson(
      reader.routes.active as unknown as JSONValue,
    ),
    routePlanStaticParamsHash: `sha256:${"9".repeat(64)}`,
    applicationStaticParamsHash: `sha256:${"a".repeat(64)}`,
    redirectTuplesHash: hashCanonicalJson(
      reader.routes.redirects as unknown as JSONValue,
    ),
    absentReaderBasePathCount: 0,
    missingReaderFragmentHrefCount: 0,
    currentCatalogFragmentCoverage: {
      proofScope: "adapted-reader-current-catalog-section-fragments",
      status: "verified",
      baselineMissingReaderFragmentHrefCount: 3,
      assignedCatalogFragmentAddressCount: 3,
      finalMissingReaderFragmentHrefCount: 0,
      chapterOwnerPageCount: 1,
      ownerSectionCount: 1,
      directDescendantSectionCount: 2,
      serverRenderedDomIdCount: 3,
      assignedCatalogFragmentAddressesSha256: `sha256:${"6".repeat(64)}`,
      serverRenderedCatalogFragmentAddressesSha256:
        `sha256:${"7".repeat(64)}`,
      excludedClaims: [
        "durable-continuity",
        "aggregate-index-routes",
        "current-host-wiring",
        "legacy-aliases-and-fragments",
        "browser-fragment-scroll",
        "offline-all-work-behavior",
        "ux-and-content-parity",
      ],
    },
    sourceWorkId: semanticLinks[0]?.workId ?? "source-work",
    sourceWorkPath: liveRoutePaths[0]!,
    semanticLinks,
    semanticLinkBlockGroupCount: new Set(
      semanticLinks.map(
        ({ workId, sectionId, blockId }) =>
          `${workId}\u0000${sectionId}\u0000${blockId}`,
      ),
    ).size,
    routePlanStaticParamCount: 586,
    applicationStaticParamCount: 585,
    sectionIndexes,
    sectionIndexCount: 3,
    sectionIndexReferenceCount: 57,
    sectionIndexesHash: hashCanonicalJson(
      sectionIndexes as unknown as JSONValue,
    ),
    sectionIndexPaths,
    sectionIndexPathsHash: hashCanonicalJson(
      sectionIndexPaths as unknown as JSONValue,
    ),
    fragmentOwners,
    fragmentOwnerChildIds,
    catalogChapterRootOwnerGroupsHash: hashCanonicalJson(
      fragmentOwners as unknown as JSONValue,
    ),
    catalogChapterRootOwnerIdsHash: hashCanonicalJson(
      fragmentOwners.map(({ sectionId }) => sectionId) as unknown as JSONValue,
    ),
    catalogChapterRootChildIdsHash: hashCanonicalJson(
      fragmentOwnerChildIds as unknown as JSONValue,
    ),
    catalogChapterRootOwnerPathsHash: hashCanonicalJson(
      fragmentOwners.map(({ path: ownerPath }) => ownerPath) as unknown as JSONValue,
    ),
    liveContentPaths,
    liveContentPathsHash: hashCanonicalJson(
      liveContentPaths as unknown as JSONValue,
    ),
    updatesDormancy: {
      catalogTextHash: `sha256:${"b".repeat(64)}`,
      updatesDataTextHash: `sha256:${"c".repeat(64)}`,
      adaptationReady: true,
      runtimeDormant: true,
      routesActivated: false,
      activationEligible: false,
      readerUpdatesTargetCount: 0,
      adapterRouteDeclarationCount: 2,
      dormantRoutePlanValid: true,
      activationAttemptRejected: true,
      activationDiagnostic: {
        code: "next.updates.view_undeclared",
        path: "/updatesData/views/0/id",
        keyword: "route",
        viewId: "all",
      },
      injectedIntoIsolatedHost: false,
    },
    baseRoutePresence: true,
    aggregateChapterPageParity: true,
    nestedFragmentParity: false,
    durableFragmentParity: false,
    fullReaderRouteParity: false,
  };
}

function syntheticRoutePages(
  projection: ThemeReaderProjection,
): readonly Readonly<{ path: string; html: string }>[] {
  const groups = new Map<string, typeof projection.semanticLinks>();
  for (const link of projection.semanticLinks) {
    const key = `${link.sectionId}\u0000${link.blockId}`;
    groups.set(key, [...(groups.get(key) ?? []), link]);
  }
  const blocks = [...groups.values()]
    .map((links) => {
      const first = links[0]!;
      return `<section data-publisher-section="${first.sectionId}"><div data-publisher-block="${first.blockId}">${[...links]
        .sort((left, right) => left.sourceStart - right.sourceStart)
        .map(({ href, label }) => `<a href="${href}">${label}</a>`)
        .join("")}</div></section>`;
    })
    .join("");
  return [
    {
      path: projection.sourceWorkPath,
      html: `<div class="publisher-root" data-publisher-page="work"><article data-publisher-work="${projection.sourceWorkId}">${blocks}</article></div>`,
    },
    ...projection.fragmentOwners.map(({
      workId,
      sectionId,
      path: ownerPath,
      anchor,
      childIds,
    }) => ({
      path: ownerPath,
      html: `<div class="publisher-root" data-publisher-page="section"><article data-publisher-work="${workId}"><section data-publisher-section="${sectionId}" id="${anchor}"></section>${childIds.map((childId) => `<section data-publisher-section="${childId}" id="${childId}"></section>`).join("")}</article></div>`,
    })),
    ...projection.sectionIndexes.map((index) => ({
      path: index.path,
      html: `<div class="publisher-root" data-publisher-page="section-index"><article data-publisher-section-index="${index.id}" data-publisher-work="${index.workId}"><header><h1>${index.title}</h1></header><ol class="publisher-catalog">${index.sections.map(({ href, title }) => `<li><h2><a href="${href}">${title}</a></h2></li>`).join("")}</ol></article></div>`,
    })),
  ];
}

function syntheticProbe(
  projection = projectionForReader(),
  offlineResources: readonly Readonly<{ href: string; kind: string }>[] = [],
) {
  const { reader } = projection;
  const tokens = compiledThemeTokens();
  const theme = {
    package: "coherence-thesis",
    version: "0.1.0",
    rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
    apiVersion: "2.0",
    configHash: hashCanonicalJson({}),
    tokensHash: hashCanonicalJson(tokens as unknown as JSONValue),
  };
  const basis = {
    schemaVersion: "1.2",
    publicationId: reader.publicationId,
    engineVersion: "0.1.0-alpha.0",
    rendererVersion: "0.1.0-alpha.0",
    artifact: {
      kind: "publisher-next-application",
      mediaType: "application/vnd.genii.publisher.next-application+json",
      relativePath: "renderers/next/application.json",
    },
    source: {
      readerSchemaVersion: reader.schemaVersion,
      readerBuildId: reader.buildId,
      audience: reader.audience,
    },
    theme,
    updates: null,
    readerStateBootstrap: null,
    extensions: projection.isolatedExtensionManifest,
    sync: null,
    continuity: {
      mode: "proxy",
      explicitRedirectCount: projection.explicitRedirectCount,
      canonicalSlashRedirectCount: projection.canonicalSlashRedirectCount,
    },
  };
  const applicationManifest = {
    $schema:
      "https://publisher.genii.foundation/schemas/next-application-manifest.schema.json",
    ...basis,
    buildId: hashCanonicalJson(basis as unknown as JSONValue),
  };
  const applicationArtifactText = `${canonicalizeJson(
    applicationManifest as unknown as JSONValue,
  )}\n`;
  return {
    proofSchemaVersion: "2.0",
    proofScope: "isolated Next linkful theme compiler host",
    contentParity: "not asserted",
    baseRoutePresence: true,
    aggregateChapterPageParity: true,
    nestedFragmentParity: false,
    durableFragmentParity: false,
    fullReaderRouteParity: false,
    adaptedReaderHostVerified: true,
    currentPublicRoutes: "untouched",
    publicationId: reader.publicationId,
    readerBuildId: reader.buildId,
    readerActiveRouteCount: projection.routePlanStaticParamCount,
    readerExplicitRedirectCount: projection.explicitRedirectCount,
    semanticLinkIds: projection.semanticLinks.map(({ id }) => id).sort(),
    applicationStaticParamCount: projection.applicationStaticParamCount,
    offlineAudioClipCount: 0,
    offlineAudioEnvelopeResourceCount: offlineResources.filter(
      ({ href, kind }) =>
        kind === "data" && href === "/publication-audio.json",
    ).length,
    offlineAudioResourceCount: 0,
    offlineTimingResourceCount: 0,
    offlineNarrationCatalogCount: 0,
    homePath: "/",
    selectedTheme: {
      package: "coherence-thesis",
      version: "0.1.0",
      config: {},
    },
    applicationManifest,
    applicationArtifact: {
      hash: sha256(applicationArtifactText),
      text: applicationArtifactText,
    },
    applicationTokens: tokens,
    configuredTokens: tokens,
    errorIdentityTokens: tokens,
  };
}

afterEach(() => {
  for (const root of createdRoots.splice(0).reverse()) {
    if (fs.existsSync(root)) fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("Publisher Coherence theme compiler host", () => {
  it("closes the current transition facade without borrowing isolated host evidence", () => {
    const renderEmbeddedPage = async () => null;
    const resolveRoute = () => ({ status: "not-found" as const });
    const application = Object.defineProperties(Object.create(null), {
      ReaderPrepaint: {
        enumerable: true,
        get(): never {
          throw new TypeError("ReaderPrepaint must remain outside the facade");
        },
      },
      ReaderProviders: {
        enumerable: true,
        get(): never {
          throw new TypeError("ReaderProviders must remain outside the facade");
        },
      },
      RootLayout: {
        enumerable: true,
        get(): never {
          throw new TypeError("RootLayout must remain outside the facade");
        },
      },
      RootPage: {
        enumerable: true,
        get(): never {
          throw new TypeError("RootPage must remain outside the facade");
        },
      },
      renderPage: {
        enumerable: true,
        get(): never {
          throw new TypeError("renderPage must remain outside the facade");
        },
      },
      renderEmbeddedPage: { enumerable: true, value: renderEmbeddedPage },
      resolveRoute: { enumerable: true, value: resolveRoute },
    }) as unknown as CoherencePublisherContentProof["application"];

    const boundary = assertPublisherThemeCurrentTransitionBoundary(application);

    expect(boundary).toEqual({
      proofScope: "current Coherence Publisher transition preview facade",
      exposedApplicationKeys: ["renderEmbeddedPage", "resolveRoute"],
      facadeFrozen: true,
      readerProvidersExposed: false,
      rootLayoutExposed: false,
      providerComposition: "excluded-by-transition-facade",
      isolatedHostEvidenceUsed: false,
    });
    expect(Object.isFrozen(boundary)).toBe(true);
    expect(Object.keys(boundary).sort()).toEqual([
      "exposedApplicationKeys",
      "facadeFrozen",
      "isolatedHostEvidenceUsed",
      "proofScope",
      "providerComposition",
      "readerProvidersExposed",
      "rootLayoutExposed",
    ]);
  });

  it("validates the exact bounded seven-artifact durable projection", () => {
    const absent = PUBLISHER_THEME_RUNTIME_ARTIFACT_PATHS.map(
      (artifactPath) => ({ path: artifactPath, state: "absent" as const }),
    );
    const mixed = absent.map((row, index) =>
      index === 0
        ? {
            path: row.path,
            state: "present" as const,
            bytes: 1,
            hash: `sha256:${"1".repeat(64)}`,
          }
        : row,
    );

    expect(() => assertPublisherThemeRuntimeArtifactEvidence(absent)).not.toThrow();
    expect(() => assertPublisherThemeRuntimeArtifactEvidence(mixed)).not.toThrow();
    expect(absent.map(({ path: artifactPath }) => artifactPath)).toEqual([
      "public/publisher/coherence-reader-state-migration.json",
      "public/publication-reader-search.json",
      "public/publication-reader-progress.json",
      "generated/publisher/host/publication-public-identity.json",
      "generated/publisher/host/publication-extensions.json",
      "generated/publisher/host/publication-updates.json",
      "generated/publisher/host/publication-reader.json",
    ]);
    expect(() =>
      assertPublisherThemeRuntimeArtifactEvidence([...absent].reverse()),
    ).toThrow(/drifted/u);
    expect(() =>
      assertPublisherThemeRuntimeArtifactEvidence([
        { ...absent[0]!, extra: true },
        ...absent.slice(1),
      ]),
    ).toThrow(/field set/u);
    expect(() =>
      assertPublisherThemeRuntimeArtifactEvidence([
        {
          path: absent[0]!.path,
          state: "present",
          bytes: 32 * 1024 * 1024 + 1,
          hash: `sha256:${"2".repeat(64)}`,
        },
        ...absent.slice(1),
      ]),
    ).toThrow(/drifted/u);
    expect(() =>
      assertPublisherThemeRuntimeArtifactEvidence(
        absent.map((row, index) => ({
          path: row.path,
          state: "present",
          bytes: index < 3 ? 22 * 1024 * 1024 : 0,
          hash: `sha256:${"3".repeat(64)}`,
        })),
      ),
    ).toThrow(/aggregate/u);
  });

  it("binds the proof to the exact current host source authority", () => {
    expect(PUBLISHER_THEME_SOURCE_AUTHORITY_PATHS).toEqual([
      "generated/manuscripts/catalog.json",
      "next.config.ts",
      "publication.json",
      "public/offline-sw.js",
      "publishing/audio/manifest.json",
      "src/app",
      "src/components/AudioPlayerIsland.tsx",
      "src/components/ChapterReader.tsx",
      "src/components/ReaderAudioWordInteractionIsland.tsx",
      "src/components/ReaderEngagementIsland.tsx",
      "src/components/SiteShell.tsx",
      "src/components/ToolbarProgressIsland.tsx",
      "src/lib/audio-offline-cache.ts",
      "src/lib/audio-events.ts",
      "src/lib/audio-text.ts",
      "src/lib/audio-word-anchors.ts",
      "src/lib/reader-preferences.ts",
      "src/lib/reader-selection.ts",
      "src/publisher/application-config.ts",
      "src/publisher/application.ts",
      "src/publisher/coherence-theme.ts",
      "src/publisher/coherence-theme-contract.ts",
      "src/publisher/embedded-offline-authority.ts",
      "src/publisher/embedded-offline-candidate.json",
      "src/publisher/embedded-offline-host-identity.ts",
      "src/publisher/embedded-reader-appearance.ts",
      "src/publisher/legacy-audio-word-bridge.ts",
      "src/publisher/legacy-audio-word-bridge-client.tsx",
      "src/publisher/legacy-audio-word-bridge-contract.ts",
      "src/publisher/legacy-fragment-continuity.ts",
      "src/publisher/legacy-reader-bookmark-bridge.ts",
      "src/publisher/legacy-reader-bookmark-bridge-client.tsx",
      "src/publisher/legacy-reader-progress-bridge.ts",
      "src/publisher/preview-mode.ts",
      "src/publisher/reader-state-bootstrap.ts",
      "src/publisher/reader-state-migration-extension.ts",
      "src/publisher/reader-state-migration-extension-client.tsx",
      "src/publisher/reader-state-migration-extension-contract.ts",
      "src/publisher/reader-state-migration.ts",
      "src/publisher/reader-state-migration-schema.ts",
      "src/publisher/transition-page.tsx",
      "src/publisher/transition-preview-application.ts",
      "src/components/CoherenceSiteFrame.tsx",
      "src/components/LegacyFragmentRedirectIsland.tsx",
    ]);
    expect(Object.isFrozen(PUBLISHER_THEME_SOURCE_AUTHORITY_PATHS)).toBe(true);
  });

  it("binds the current browser-free transition authority separately from historical receipts", () => {
    expect(PUBLISHER_THEME_CURRENT_TRANSITION_SOURCE_PATHS).toEqual([
      "public/offline-sw.js",
      "src/components/ChapterReader.tsx",
      "src/components/ReaderEngagementIsland.tsx",
      "src/components/SiteShell.tsx",
      "src/components/ToolbarProgressIsland.tsx",
      "src/lib/audio-offline-cache.ts",
      "src/publisher/embedded-offline-authority.ts",
      "src/publisher/embedded-offline-candidate.json",
      "src/publisher/embedded-offline-host-identity.ts",
      "src/publisher/legacy-reader-bookmark-bridge-client.tsx",
      "src/publisher/legacy-reader-bookmark-bridge.ts",
      "src/publisher/legacy-reader-progress-bridge.ts",
    ]);
    expect(Object.isFrozen(PUBLISHER_THEME_CURRENT_TRANSITION_SOURCE_PATHS))
      .toBe(true);
    const authority = assertPublisherThemeCurrentSourceAuthority();
    expect(authority).toEqual({
      proofScope:
        "current browser-free Coherence Publisher transition source authority",
      publisherCommit: "ab4c5733764ee3a24ad9bcbe9bf2d85b61c032ba",
      candidateBuildId:
        "sha256:520f8850edf46a0e83f326f9eb04b80467461310822781d5dba7f27ee912c2cc",
      candidateArchiveCount: 5,
      hostSourcesBuildId:
        "sha256:c6b066bedba2e2b10fdd300157fc25299d4fd2b61ad926b3a6cec19f6d94c2ac",
      hostSourceCount: 124,
      hostSourceBytes: 1_574_625,
      browserDerivedReceipts: "historical-not-refreshed",
    });
    expect(Object.isFrozen(authority)).toBe(true);
  });

  it("pins the exact official host contract and package graph", () => {
    const evidence = createPublisherThemeHostTemplateEvidence();

    expect(evidence.template).toMatchObject({
      contractVersion: "0.18.0",
      renderer: "@genii-foundation/publisher-next",
      rendererVersion: "0.1.0-alpha.0",
    });
    expect(evidence.template.files).toHaveLength(33);
    expect(evidence.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(evidence.filesHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(
      JSON.parse(
        evidence.template.files.find(({ path: filePath }) => filePath === "package.json")!
          .contents,
      ),
    ).toMatchObject({
      dependencies: {
        "@genii-foundation/publisher-content": "0.1.0-alpha.0",
        "@genii-foundation/publisher-next": "0.1.0-alpha.0",
        "@genii-foundation/publisher-reader": "0.1.0-alpha.0",
        "@genii-foundation/publisher-schema": "0.1.0-alpha.0",
        next: "16.3.1",
        react: "19.2.8",
        "react-dom": "19.2.8",
      },
      devDependencies: { typescript: "5.9.3" },
      overrides: {
        "next@16.3.1": {
          nanoid: "3.3.18",
          postcss: "8.5.24",
          sharp: "0.35.3",
        },
      },
    });

    expect(() =>
      assertPublisherThemeHostPackageVersions({
        "@genii-foundation/publisher-content": "0.1.0-alpha.0",
        "@genii-foundation/publisher-next": "0.1.0-alpha.0",
        "@genii-foundation/publisher-reader": "0.1.0-alpha.1",
        "@genii-foundation/publisher-schema": "0.1.0-alpha.0",
      }),
    ).toThrow(/unreviewed @genii-foundation\/publisher-reader/u);
  });

  it("copies exact theme bytes and adds only the alias and closed proof route", () => {
    const source = "export const coherencePublisherTheme = Object.freeze({});\n";
    const sourcePaths = [
      "reader-state-migration-extension.ts",
      "reader-state-migration-extension-client.tsx",
      "reader-state-migration-extension-contract.ts",
      "reader-state-migration.ts",
      "reader-state-migration-schema.ts",
    ];
    const files = createPublisherThemeHostScaffolding({
      themeSourceText: source,
      stateMigrationProjection: projectionForReader().stateMigrationProjection,
      stateMigrationSourceFiles: sourcePaths.map((filePath) => ({
        path: filePath,
        contents: `export const fixture = ${JSON.stringify(filePath)};\n`,
      })),
    });

    expect(files.map(({ path: filePath }) => filePath)).toEqual([
      "coherence-theme.ts",
      "publisher.theme.mjs",
      ...sourcePaths,
      "publisher.extensions.mjs",
      "app/coherence-theme-proof/page.tsx",
    ]);
    expect(files[0]!.contents).toBe(source);
    expect(files[1]!.contents).toContain('from "./coherence-theme.ts"');
    expect(files[7]!.contents).toContain(
      "createCoherenceReaderStateMigrationExtensionRegistration",
    );
    expect(files[8]!.contents).toContain("application.manifest.theme.package");
    expect(files[8]!.contents).toContain("publisherErrorIdentity.theme.tokens");
    expect(files[8]!.contents).toContain('currentPublicRoutes: "untouched"');

    const official = createPublisherThemeHostTemplateEvidence();
    const proofFiles = createPublisherThemeProofHostFiles(official.template);
    const officialConfig = official.template.files.find(
      ({ path: filePath }) => filePath === "next.config.mjs",
    )!;
    const proofConfig = proofFiles.find(
      ({ path: filePath }) => filePath === "next.config.mjs",
    )!;
    expect(proofConfig.contents).not.toBe(officialConfig.contents);
    expect(proofConfig.contents).toContain(
      'root: new URL("../../../../../", import.meta.url).pathname',
    );
    expect(
      proofFiles
        .filter(({ path: filePath }) => filePath !== "next.config.mjs")
        .map(({ contents }) => contents),
    ).toEqual(
      official.template.files
        .filter(({ path: filePath }) => filePath !== "next.config.mjs")
        .map(({ contents }) => contents),
    );
  });

  it("sanitizes the child environment and binds it to the active Node", () => {
    const env = createPublisherThemeChildEnvironment({
      HOME: "/safe-home",
      HTTPS_PROXY: "PRIVATE PROXY",
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: "PRIVATE MOCK",
      NEXT_PRIVATE_TEST: "PRIVATE NEXT",
      NODE_ENV: "development",
      NODE_OPTIONS: "--inspect",
      VERCEL_TOKEN: "PRIVATE TOKEN",
    });

    expect(env).toMatchObject({
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
      NO_COLOR: "1",
    });
    expect(env.PATH?.split(path.delimiter)[0]).toBe(path.dirname(process.execPath));
    expect(env).not.toHaveProperty("HTTPS_PROXY");
    expect(env).not.toHaveProperty("NEXT_FONT_GOOGLE_MOCKED_RESPONSES");
    expect(env).not.toHaveProperty("NEXT_PRIVATE_TEST");
    expect(env).not.toHaveProperty("NODE_OPTIONS");
    expect(env).not.toHaveProperty("HOME");
    expect(env).not.toHaveProperty("VERCEL_TOKEN");
  });

  it("accepts one live inert proof payload and rejects raw or inert lookalikes", () => {
    expect(
      parsePublisherThemeProofPage(
        '<script id="publisher-theme-proof-data" type="application/json">{"ok":true}</script>',
      ),
    ).toEqual({ ok: true });
    for (const html of [
      '<!-- <script id="publisher-theme-proof-data" type="application/json">{"ok":true}</script> -->',
      '<script>"<script id=\\"publisher-theme-proof-data\\" type=\\"application/json\\">{}<\\/script>"</script>',
      '<template><script id="publisher-theme-proof-data" type="application/json">{}</script></template>',
      '<noscript><script id="publisher-theme-proof-data" type="application/json">{}</script></noscript>',
    ]) {
      expect(() => parsePublisherThemeProofPage(html)).toThrow(/live inert/u);
    }
    expect(() =>
      parsePublisherThemeProofPage(
        '<script id="publisher-theme-proof-data" type="application/json">{}</script><script id="publisher-theme-proof-data" type="application/json">{}</script>',
      ),
    ).toThrow(/one live/u);
  });

  it("keeps arbitrary CLI failure input out of process output", () => {
    const sentinel = "PRIVATE_CLI_SENTINEL_741";
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(repoRoot, "scripts/publisher/theme-host-proof.ts"),
        sentinel,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: createPublisherThemeChildEnvironment(),
        maxBuffer: 1024 * 1024,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Publisher theme compiler proof failed");
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
    expect(`${result.stdout}${result.stderr}`).not.toContain(repoRoot);
  });

  it("refuses traversal, duplicate paths, symbolic ancestors, and source mutation", () => {
    const root = createIgnoredRoot("sources");
    const hostRoot = path.join(root, "host");
    fs.mkdirSync(hostRoot);

    expect(() =>
      materializePublisherThemeHostSources({
        hostRoot,
        files: [{ path: "../escape.ts", contents: "private" }],
      }),
    ).toThrow(/unsafe host path/u);
    expect(() =>
      materializePublisherThemeHostSources({
        hostRoot,
        files: [
          { path: "same.ts", contents: "one" },
          { path: "SAME.ts", contents: "two" },
        ],
      }),
    ).toThrow(/duplicated/u);

    const target = path.join(root, "target");
    const linked = path.join(hostRoot, "linked");
    fs.mkdirSync(target);
    fs.symlinkSync(target, linked, "dir");
    expect(() =>
      materializePublisherThemeHostSources({
        hostRoot,
        files: [{ path: "linked/file.ts", contents: "private" }],
      }),
    ).toThrow(/symbolic link/u);
    fs.unlinkSync(linked);

    fs.writeFileSync(path.join(hostRoot, "source.ts"), "one");
    const snapshot = snapshotPublisherThemeHostSources(hostRoot);
    fs.writeFileSync(path.join(hostRoot, "source.ts"), "two");
    expect(() =>
      assertPublisherThemeHostSourcesCurrent({
        expected: snapshot,
        actual: snapshotPublisherThemeHostSources(hostRoot),
      }),
    ).toThrow(/changed/u);
  });

  it("creates mode 0700 runs and cleans them after success and failure", async () => {
    const proofRoot = createIgnoredRoot("disposable");
    const boundary = {
      publicationRoot: repoRoot,
      generatedRoot: generatedPublisherRoot,
      proofRoot,
      protectedRoots: [path.join(repoRoot, "src")],
    };
    let successfulRun = "";
    const value = await withDisposablePublisherThemeHost({
      boundary,
      operation({ runRoot, runtimeRoot }) {
        successfulRun = runRoot;
        expect(fs.statSync(runRoot).mode & 0o777).toBe(0o700);
        expect(
          createPublisherThemeChildEnvironment(
            { NODE_ENV: "test" },
            runtimeRoot,
          ),
        ).toMatchObject({
          HOME: path.join(runtimeRoot, "home"),
          TMPDIR: path.join(runtimeRoot, "tmp"),
          TMP: path.join(runtimeRoot, "tmp"),
          TEMP: path.join(runtimeRoot, "tmp"),
          XDG_CACHE_HOME: path.join(runtimeRoot, "cache"),
        });
        return "complete";
      },
    });
    expect(value).toBe("complete");
    expect(fs.existsSync(successfulRun)).toBe(false);

    let failedRun = "";
    await expect(
      withDisposablePublisherThemeHost({
        boundary,
        operation({ runRoot }) {
          failedRun = runRoot;
          throw new Error("expected failure");
        },
      }),
    ).rejects.toThrow("expected failure");
    expect(fs.existsSync(failedRun)).toBe(false);
  });

  it("invokes one detached observer while the loopback host is alive", async () => {
    const container = createIgnoredRoot("live-observer");
    const nextCliPath = writeLoopbackHostFixture(container);
    const proofRoot = path.join(container, "runs");
    let observedBaseUrl = "";
    let observedCount = 0;
    let runRoot = "";
    const controller = new AbortController();
    const originalProjection = projectionForReader();
    const originalHomePath =
      originalProjection.reader.routes.active[0]!.path;

    const fetched = await withDisposablePublisherThemeHost({
      boundary: {
        publicationRoot: repoRoot,
        generatedRoot: generatedPublisherRoot,
        proofRoot,
        protectedRoots: [path.join(repoRoot, "src")],
      },
      operation: async (roots) => {
        runRoot = roots.runRoot;
        writeFontFixture(path.join(roots.hostRoot, ".next"));
        return await fetchPublisherThemeBuiltHost({
          homePath: "/",
          hostRoot: roots.hostRoot,
          liveHostObserver: async (input) => {
            observedCount += 1;
            observedBaseUrl = input.baseUrl;
            expect(Object.keys(input).sort()).toEqual([
              "baseUrl",
              "probe",
              "projection",
              "signal",
            ]);
            expect(input.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
            expect(input.signal).not.toBe(controller.signal);
            expect(input.signal.aborted).toBe(false);
            expect(Object.isFrozen(input.signal)).toBe(false);
            expect(Object.isFrozen(input)).toBe(true);
            expect(Object.isFrozen(input.probe)).toBe(true);
            expect(Object.isFrozen(input.projection)).toBe(true);
            expect(Object.isFrozen(input.projection.reader.routes.active)).toBe(
              true,
            );
            expect(() => {
              (input.probe as { fixture: string }).fixture = "expected";
            }).toThrow();
            expect(() => {
              (
                input.projection.reader.routes.active[0] as {
                  path: string;
                }
              ).path = "/mutated/";
            }).toThrow();
            const response = await fetch(
              new URL("/observer-alive", input.baseUrl),
              { signal: AbortSignal.timeout(1_000) },
            );
            expect(response.status).toBe(200);
            expect(await response.text()).toBe("alive");
            expect(
              JSON.stringify({
                baseUrl: input.baseUrl,
                probe: input.probe,
                projection: input.projection,
              }),
            ).not.toContain(repoRoot);
          },
          liveHostObserverProjection: originalProjection,
          nextCliPath,
          routePaths: [],
          runtimeRoot: roots.runtimeRoot,
          signal: controller.signal,
        });
      },
    });

    expect(observedCount).toBe(1);
    expect(fetched.probe).toEqual({ fixture: "drifted" });
    expect(originalProjection.reader.routes.active[0]!.path).toBe(
      originalHomePath,
    );
    expect(fs.existsSync(runRoot)).toBe(false);
    await assertLoopbackHostStopped(observedBaseUrl);
  }, 15_000);

  it("stops the host and cleans the exact run after observer failure", async () => {
    const container = createIgnoredRoot("live-observer-failure");
    const nextCliPath = writeLoopbackHostFixture(container);
    const proofRoot = path.join(container, "runs");
    const themeSourceBefore = fs.readFileSync(
      defaultPublisherThemeHostProofPaths.themeSourcePath,
    );
    const gitStateBefore = spawnSync(
      "/usr/bin/git",
      ["status", "--short", "--untracked-files=all"],
      { cwd: repoRoot, encoding: "utf8" },
    ).stdout;
    let observedBaseUrl = "";
    let observerSignal: AbortSignal | undefined;
    let runRoot = "";
    const controller = new AbortController();

    await expect(
      withDisposablePublisherThemeHost({
        boundary: {
          publicationRoot: repoRoot,
          generatedRoot: generatedPublisherRoot,
          proofRoot,
          protectedRoots: [path.join(repoRoot, "src")],
        },
        operation: async (roots) => {
          runRoot = roots.runRoot;
          writeFontFixture(path.join(roots.hostRoot, ".next"));
          return await fetchPublisherThemeBuiltHost({
            homePath: "/",
            hostRoot: roots.hostRoot,
            liveHostObserver: async ({ baseUrl, signal }) => {
              observedBaseUrl = baseUrl;
              observerSignal = signal;
              Object.defineProperty(signal, "throwIfAborted", {
                configurable: true,
                value: () => undefined,
              });
              Object.defineProperty(signal, "removeEventListener", {
                configurable: true,
                value: () => undefined,
              });
              controller.abort(
                new Error("synthetic original observer cancellation"),
              );
              expect(signal.aborted).toBe(true);
              expect(() => signal.throwIfAborted()).not.toThrow();
            },
            liveHostObserverProjection: projectionForReader(),
            nextCliPath,
            routePaths: [],
            runtimeRoot: roots.runtimeRoot,
            signal: controller.signal,
          });
        },
      }),
    ).rejects.toThrow("synthetic original observer cancellation");

    expect(observerSignal).toBeDefined();
    expect(observerSignal).not.toBe(controller.signal);
    expect(Object.hasOwn(observerSignal!, "throwIfAborted")).toBe(true);
    expect(Object.hasOwn(observerSignal!, "removeEventListener")).toBe(true);
    expect(Object.hasOwn(controller.signal, "throwIfAborted")).toBe(false);
    expect(Object.hasOwn(controller.signal, "removeEventListener")).toBe(false);
    expect(() => controller.signal.throwIfAborted()).toThrow(
      "synthetic original observer cancellation",
    );
    expect(fs.existsSync(runRoot)).toBe(false);
    await assertLoopbackHostStopped(observedBaseUrl);
    expect(
      fs.readFileSync(defaultPublisherThemeHostProofPaths.themeSourcePath),
    ).toEqual(themeSourceBefore);
    expect(
      spawnSync(
        "/usr/bin/git",
        ["status", "--short", "--untracked-files=all"],
        { cwd: repoRoot, encoding: "utf8" },
      ).stdout,
    ).toBe(gitStateBefore);
  }, 15_000);

  it("checks the exact randomized run path against Git ignore rules", async () => {
    const container = createIgnoredRoot("prospective-ignore");
    const publicationRoot = path.join(container, "repository");
    const generatedRoot = path.join(publicationRoot, "generated");
    const proofRoot = path.join(generatedRoot, "proof");
    fs.mkdirSync(generatedRoot, { recursive: true });
    expect(
      spawnSync("/usr/bin/git", ["init", "--quiet", publicationRoot], {
        encoding: "utf8",
      }).status,
    ).toBe(0);
    fs.writeFileSync(
      path.join(publicationRoot, ".gitignore"),
      "/generated/proof/run-proof/host\n",
    );
    expect(
      spawnSync(
        "/usr/bin/git",
        [
          "-C",
          publicationRoot,
          "check-ignore",
          "--quiet",
          "--",
          "generated/proof/run-proof/host",
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);

    let operationRan = false;
    await expect(
      withDisposablePublisherThemeHost({
        boundary: {
          publicationRoot,
          generatedRoot,
          proofRoot,
          protectedRoots: [path.join(publicationRoot, "src")],
        },
        operation() {
          operationRan = true;
        },
      }),
    ).rejects.toThrow(/prospective run must be ignored/u);
    expect(operationRan).toBe(false);
    expect(fs.existsSync(proofRoot)).toBe(false);
  });

  it("cleans a run when isolated host setup fails after identity capture", async () => {
    const proofRoot = createIgnoredRoot("setup-failure");
    const boundary = {
      publicationRoot: repoRoot,
      generatedRoot: generatedPublisherRoot,
      proofRoot,
      protectedRoots: [path.join(repoRoot, "src")],
    };
    const original = fs.mkdirSync.bind(fs);
    let refused = false;
    const spy = vi.spyOn(fs, "mkdirSync").mockImplementation((target, options) => {
      if (!refused && path.basename(String(target)) === "host") {
        refused = true;
        throw new Error("synthetic host setup failure");
      }
      return original(target, options as never);
    });
    try {
      await expect(
        withDisposablePublisherThemeHost({
          boundary,
          operation() {
            throw new Error("operation must not run");
          },
        }),
      ).rejects.toThrow("synthetic host setup failure");
    } finally {
      spy.mockRestore();
    }
    expect(
      fs.readdirSync(proofRoot).filter((entry) => entry.startsWith("run-")),
    ).toEqual([]);
  });

  it("refuses cleanup when the proof root identity is replaced", async () => {
    const proofRoot = createIgnoredRoot("cleanup-identity");
    const externalRoot = createIgnoredRoot("cleanup-external");
    const movedRoot = `${proofRoot}-moved`;
    let runName = "";
    try {
      await expect(
        withDisposablePublisherThemeHost({
          boundary: {
            publicationRoot: repoRoot,
            generatedRoot: generatedPublisherRoot,
            proofRoot,
            protectedRoots: [path.join(repoRoot, "src")],
          },
          operation({ runRoot }) {
            runName = path.basename(runRoot);
            fs.mkdirSync(path.join(externalRoot, runName));
            fs.writeFileSync(
              path.join(externalRoot, runName, "canary.txt"),
              "must survive",
            );
            fs.renameSync(proofRoot, movedRoot);
            fs.symlinkSync(externalRoot, proofRoot, "dir");
          },
        }),
      ).rejects.toThrow(/must remain one real directory|changed identity/u);
      expect(
        fs.readFileSync(path.join(externalRoot, runName, "canary.txt"), "utf8"),
      ).toBe("must survive");
    } finally {
      if (fs.lstatSync(proofRoot).isSymbolicLink()) fs.unlinkSync(proofRoot);
      fs.renameSync(movedRoot, proofRoot);
      if (runName !== "") {
        fs.rmSync(path.join(proofRoot, runName), { force: true, recursive: true });
      }
    }
  });

  it("refuses a symbolic proof root before creating a run", () => {
    const container = createIgnoredRoot("boundary");
    const target = path.join(container, "target");
    const linked = path.join(container, "linked");
    fs.mkdirSync(target);
    fs.symlinkSync(target, linked, "dir");

    expect(() =>
      assertPublisherThemeHostProofBoundary({
        publicationRoot: repoRoot,
        generatedRoot: generatedPublisherRoot,
        proofRoot: linked,
        protectedRoots: [path.join(repoRoot, "src")],
      }),
    ).toThrow(/symbolic link/u);
  });

  it("refuses alternate runtime roots and executables", async () => {
    await expect(
      runPublisherThemeHostProof({
        paths: {
          ...defaultPublisherThemeHostProofPaths,
          proofRoot: createIgnoredRoot("alternate"),
        },
      }),
    ).rejects.toThrow(/fixed checked-in publication/u);
  });

  it("refuses a live observer with either custom runner before mutation", async () => {
    const runRootsBefore = fs.existsSync(generatedPublisherThemeHostProofRoot)
      ? fs
          .readdirSync(generatedPublisherThemeHostProofRoot)
          .filter((entry) => entry.startsWith("run-"))
          .sort()
      : [];
    const themeSourceBefore = fs.readFileSync(
      defaultPublisherThemeHostProofPaths.themeSourcePath,
    );
    const liveHostObserver = vi.fn(async () => undefined);
    const customBuildRunner = vi.fn(async () => {
      throw new Error("custom build runner must not execute");
    });
    const customFetchRunner = vi.fn(async () => {
      throw new Error("custom fetch runner must not execute");
    });

    await expect(
      runPublisherThemeHostProof({
        buildRunner: customBuildRunner,
        liveHostObserver,
      }),
    ).rejects.toThrow(/requires the exact reviewed build and fetch runners/u);
    await expect(
      runPublisherThemeHostProof({
        fetchRunner: customFetchRunner,
        liveHostObserver,
      }),
    ).rejects.toThrow(/requires the exact reviewed build and fetch runners/u);

    expect(customBuildRunner).not.toHaveBeenCalled();
    expect(customFetchRunner).not.toHaveBeenCalled();
    expect(liveHostObserver).not.toHaveBeenCalled();
    expect(
      fs.existsSync(generatedPublisherThemeHostProofRoot)
        ? fs
            .readdirSync(generatedPublisherThemeHostProofRoot)
            .filter((entry) => entry.startsWith("run-"))
            .sort()
        : [],
    ).toEqual(runRootsBefore);
    expect(
      fs.readFileSync(defaultPublisherThemeHostProofPaths.themeSourcePath),
    ).toEqual(themeSourceBefore);
  });

  it("refuses to shadow a publication-owned proof path", () => {
    const reader = {
      routes: {
        active: [
          { path: "/coherence-theme-proof/", target: { kind: "section" } },
        ],
        redirects: [],
      },
    } as unknown as PublicationReaderEnvelope;

    expect(() => assertPublisherThemeProofRouteUnowned(reader)).toThrow(
      /collides/u,
    );
  });

  it("binds catalog owner evidence back to the exact Reader hierarchy and route names", async () => {
    const proof = await adaptCoherencePublisherContent(
      await loadCoherencePublisherContentAuthorities(),
    );
    const frozenProjection = createPublisherThemeHostReaderProjection(proof);
    expect(proof.application.manifest.buildId).not.toBe(
      frozenProjection.adaptedApplicationBuildId,
    );
    expect(proof.evidence.evidenceSha256).not.toBe(
      frozenProjection.contentEvidenceHash,
    );
    expect(frozenProjection).toMatchObject({
      adaptedApplicationBuildId:
        "sha256:69f40109916aa544325935c52f46a1f8a47dd590eb0ebcc6d163c3c5ee15b5bc",
      contentEvidenceHash:
        "sha256:4794f0799c3d8172573217881657382ad27800d8d991ad2c0f11d26c78fe47b0",
    });

    const firstGroup = proof.evidence.routes.catalogChapterRootOwnerGroups[0]!;
    const hierarchyReader = structuredClone(proof.reader);
    const hierarchyWork = hierarchyReader.works.find(
      ({ id }) => id === firstGroup.workId,
    )!;
    const hierarchyOwner = hierarchyWork.sections.find(
      ({ id }) => id === firstGroup.sectionId,
    )!;
    Object.assign(hierarchyOwner, { depth: 1 });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        reader: hierarchyReader,
      } as CoherencePublisherContentProof),
    ).toThrow(/exact active route/u);

    const routeReader = structuredClone(proof.reader);
    const changedRoute = routeReader.routes.active.find(
      ({ path: routePath }) => routePath === firstGroup.path,
    )!;
    Object.assign(changedRoute.target, { routeName: "semantic-target" });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        reader: routeReader,
      } as CoherencePublisherContentProof),
    ).toThrow(/adapted route evidence/u);

    const uncheckedEvidence = structuredClone(proof.evidence);
    Object.assign(uncheckedEvidence.integration, { reason: "forged reason" });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        evidence: uncheckedEvidence,
      } as CoherencePublisherContentProof),
    ).toThrow(/standalone content evidence/u);

    const forgedEvidence = structuredClone(proof.evidence);
    const forgedReader = structuredClone(proof.reader);
    const forgedAddress = forgedEvidence.routes.ownedCatalogFragmentAddresses.find(
      ({ sectionId }) => sectionId === firstGroup.sectionId,
    )!;
    const forgedRoute = forgedReader.routes.active.find(
      ({ path: routePath }) => routePath === firstGroup.path,
    )!;
    Object.assign(forgedAddress, { activeRouteName: "semantic-target" });
    Object.assign(forgedRoute.target, { routeName: "semantic-target" });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        evidence: forgedEvidence,
        reader: forgedReader,
      } as CoherencePublisherContentProof),
    ).toThrow(/standalone content evidence/u);

    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        stateMigrationArtifact: {
          ...proof.stateMigrationArtifact,
          text: `${proof.stateMigrationArtifact.text} `,
        },
      }),
    ).toThrow(/state migration extension evidence/u);

    const driftedExtensionData = structuredClone(proof.extensionData);
    const driftedClientData = driftedExtensionData.extensions[0]!
      .clientData as { artifact: { sha256: string } };
    driftedClientData.artifact.sha256 = `sha256:${"f".repeat(64)}`;
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        extensionData: driftedExtensionData,
      }),
    ).toThrow(/state migration extension evidence/u);

    const missingRedirectReader = structuredClone(proof.reader);
    Object.assign(missingRedirectReader.routes, {
      redirects: missingRedirectReader.routes.redirects.slice(0, -1),
    });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        reader: missingRedirectReader,
      } as CoherencePublisherContentProof),
    ).toThrow(/adapted route evidence/u);

    const zeroRedirectApplication = {
      ...proof.application,
      manifest: {
        ...proof.application.manifest,
        continuity: {
          ...proof.application.manifest.continuity,
          explicitRedirectCount: 0,
        },
      },
    } as CoherencePublisherContentProof["application"];
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        application: zeroRedirectApplication,
      }),
    ).toThrow(/adapted route evidence/u);

    const sectionIndexReader = structuredClone(proof.reader);
    const firstSectionIndex = proof.evidence.routes.sectionIndexes[0]!;
    const sectionIndexRoute = sectionIndexReader.routes.active.find(
      ({ path: routePath }) => routePath === firstSectionIndex.path,
    )!;
    Object.assign(sectionIndexRoute.target, { title: "Forged index title" });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        reader: sectionIndexReader,
      } as CoherencePublisherContentProof),
    ).toThrow(/adapted route evidence/u);

    const unselectedReader = structuredClone(proof.reader);
    const selectedPaths = new Set([
      proof.evidence.semanticOverlay.sourceWorkPagePath,
      ...proof.evidence.routes.catalogChapterRootOwnerGroups.map(
        ({ path: ownerPath }) => ownerPath,
      ),
      ...proof.evidence.routes.sectionIndexes.map(
        ({ path: indexPath }) => indexPath,
      ),
    ]);
    const unselectedRoute = unselectedReader.routes.active.find(
      ({ path: routePath }) => routePath !== "/" && !selectedPaths.has(routePath),
    )!;
    Object.assign(unselectedRoute, {
      target: { kind: "work", workId: "forged-unselected-work" },
    });
    expect(() =>
      createPublisherThemeHostReaderProjection({
        ...proof,
        reader: unselectedReader,
      } as CoherencePublisherContentProof),
    ).toThrow(/adapted route evidence/u);
  }, 30_000);

  it("terminates a child that exceeds its time limit", async () => {
    await expect(
      runBoundedNodeCommand({
        args: ["-e", "setInterval(() => undefined, 1000)"],
        cwd: repoRoot,
        label: "bounded test child",
        timeoutMs: 25,
      }),
    ).rejects.toThrow("exceeded its time limit");

    await expect(
      runBoundedNodeCommand({
        args: ["-e", 'process.stdout.write("x".repeat(64))'],
        cwd: repoRoot,
        label: "bounded output child",
        maximumOutputBytes: 16,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("exceeded its output limit");
  });

  it("enforces Content-Length, streaming, and cumulative response limits", async () => {
    expect(createPublisherThemeResponseBudget()).toEqual({
      maximumBytes: 64 * 1024 * 1024,
      usedBytes: 0,
    });
    const budget = createPublisherThemeResponseBudget(5);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response("abc", { headers: { "content-length": "3" } }),
        "bounded response",
        4,
        budget,
      ),
    ).resolves.toEqual(Buffer.from("abc"));
    await expect(
      readPublisherThemeBoundedResponse(
        new Response("def", { headers: { "content-length": "3" } }),
        "cumulative response",
        4,
        budget,
      ),
    ).rejects.toThrow(/response limit/u);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response("abc", { headers: { "content-length": "3.5" } }),
        "invalid length response",
        4,
        createPublisherThemeResponseBudget(8),
      ),
    ).rejects.toThrow(/invalid Content-Length/u);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response("abc", { headers: { "content-length": "4" } }),
        "mismatched response",
        4,
        createPublisherThemeResponseBudget(8),
      ),
    ).rejects.toThrow(/match its Content-Length/u);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response("abc", { headers: { "content-encoding": "gzip" } }),
        "encoded response",
        4,
        createPublisherThemeResponseBudget(8),
      ),
    ).rejects.toThrow(/content encoding/u);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3, 4]));
              controller.close();
            },
          }),
        ),
        "streamed response",
        3,
        createPublisherThemeResponseBudget(8),
      ),
    ).rejects.toThrow(/response limit/u);

    const retainedBacking = new Uint8Array(1024 * 1024);
    retainedBacking[17] = 7;
    let pulls = 0;
    const copied = await readPublisherThemeBoundedResponse(
      new Response(
        new ReadableStream({
          async pull(controller) {
            pulls += 1;
            if (pulls === 1) {
              controller.enqueue(retainedBacking.subarray(17, 18));
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
            retainedBacking[17] = 9;
            controller.close();
          },
        }),
      ),
      "owned streamed response",
      1,
      createPublisherThemeResponseBudget(1),
    );
    expect(copied).toEqual(Buffer.from([7]));

    const currentWorkPageWindow = Buffer.alloc(4 * 1024 * 1024 + 1);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response(currentWorkPageWindow, {
          headers: { "content-length": String(currentWorkPageWindow.byteLength) },
        }),
        "current work page response",
        PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
        createPublisherThemeResponseBudget(
          PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
        ),
      ),
    ).resolves.toHaveLength(currentWorkPageWindow.byteLength);
    await expect(
      readPublisherThemeBoundedResponse(
        new Response("x", {
          headers: {
            "content-length": String(
              PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES + 1,
            ),
          },
        }),
        "oversized work page response",
        PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
        createPublisherThemeResponseBudget(64 * 1024 * 1024),
      ),
    ).rejects.toThrow(/response limit/u);
  });

  it("accepts only the exact live asset response media types", () => {
    expect(() =>
      assertPublisherThemeResponseMediaType("font/woff2", "font"),
    ).not.toThrow();
    expect(() =>
      assertPublisherThemeResponseMediaType("font/woff2; charset=binary", "font"),
    ).not.toThrow();
    for (const contentType of [
      null,
      "application/octet-stream",
      "application/font-woff2",
      "font/woff",
      "font/woff2;text/html",
      "font/woff2; charset=binary; charset=utf-8",
      "font/woff2; garbage",
      'font/woff2; note="valid""also-valid"',
      "text/plain",
    ]) {
      expect(() =>
        assertPublisherThemeResponseMediaType(contentType, "font"),
      ).toThrow(/invalid media type/u);
    }
    expect(() =>
      assertPublisherThemeResponseMediaType("text/css;garbage", "stylesheet"),
    ).toThrow(/invalid media type/u);
    expect(() =>
      assertPublisherThemeResponseMediaType(
        'text/html; charset="utf-8"',
        "html",
      ),
    ).not.toThrow();
  });

  it("rejects duplicate, external, fragment, and dot-normalized route probes", () => {
    expect(() =>
      assertPublisherThemeVerificationRoutePaths([
        "/manuscripts/1/",
        "/manuscripts/1/owner/",
      ]),
    ).not.toThrow();
    for (const routes of [
      ["/same/", "/same/"],
      ["//external.invalid/path/"],
      ["/path/#fragment"],
      ["/path/../owner/"],
      ["/path/%2E%2E/owner/"],
    ]) {
      expect(() => assertPublisherThemeVerificationRoutePaths(routes)).toThrow(
        /unsafe route verification/u,
      );
    }
  });

  it("binds five compiled families to regular WOFF2 files in the font manifest", () => {
    const root = createIgnoredRoot("fonts");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const html = homeHtml();

    const evidence = verifyPublisherThemeFontArtifacts({
      homeHtml: html,
      homeStylesheets: fixture.stylesheets,
      homeFonts: fixture.fonts,
      nextRoot,
      readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
    });
    expect(evidence).toMatchObject({ familyCount: 5, assetCount: 5 });
    expect(evidence.cssHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(evidence.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(evidence.familyCensus).toEqual([
      { id: "literata", faceCount: 2, assetCount: 1 },
      { id: "source-serif", faceCount: 2, assetCount: 1 },
      { id: "newsreader", faceCount: 2, assetCount: 1 },
      { id: "cormorant", faceCount: 2, assetCount: 1 },
      { id: "fraunces", faceCount: 2, assetCount: 1 },
    ]);
    expect(() => assertReviewedPublisherThemeFontEvidence(evidence)).toThrow(
      /exact reviewed CSS and WOFF2 census/u,
    );

    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: html,
        homeStylesheets: fixture.stylesheets,
        homeFonts: fixture.fonts.slice(1),
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/every WOFF2 asset/u);
    const tamperedResponses = fixture.fonts.map((font, index) => {
      if (index !== 0) return font;
      const bytes = Buffer.from(font.bytes);
      bytes[bytes.byteLength - 1] = bytes[bytes.byteLength - 1]! ^ 1;
      return { ...font, bytes };
    });
    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: html,
        homeStylesheets: fixture.stylesheets,
        homeFonts: tamperedResponses,
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/font bytes differ/u);

    fs.rmSync(path.join(nextRoot, "static/media/newsreader.woff2"));
    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: html,
        homeStylesheets: fixture.stylesheets,
        homeFonts: fixture.fonts,
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/newsreader/u);

    const newsreaderPath = path.join(nextRoot, "static/media/newsreader.woff2");
    fs.writeFileSync(newsreaderPath, usableWoff2Fixture("newsreader"));
    const corrupt = usableWoff2Fixture("newsreader-corrupt");
    corrupt.fill(0xff, Math.floor(corrupt.byteLength / 2), Math.floor(corrupt.byteLength / 2) + 32);
    fs.writeFileSync(newsreaderPath, corrupt);
    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: html,
        homeStylesheets: fixture.stylesheets,
        homeFonts: currentFontResponses(nextRoot, fixture.fonts),
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/Brotli|usable WOFF2/u);

    fs.writeFileSync(newsreaderPath, usableWoff2Fixture("newsreader"));
    fs.copyFileSync(
      path.join(nextRoot, "static/media/literata.woff2"),
      path.join(nextRoot, "static/media/source-serif.woff2"),
    );
    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: html,
        homeStylesheets: fixture.stylesheets,
        homeFonts: currentFontResponses(nextRoot, fixture.fonts),
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/share one WOFF2/u);
  });

  it("checks stylesheet and font file sizes before reading", () => {
    const root = createIgnoredRoot("font-file-limits");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const verify = (): unknown =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: homeHtml(),
        homeStylesheets: fixture.stylesheets,
        homeFonts: fixture.fonts,
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      });

    fs.truncateSync(path.join(nextRoot, "static/chunks/app.css"), 8 * 1024 * 1024 + 1);
    expect(verify).toThrow(/stylesheet artifact exceeded its file limit/u);
    fs.writeFileSync(
      path.join(nextRoot, "static/chunks/app.css"),
      fixture.stylesheets[0]!.text,
    );
    fs.truncateSync(
      path.join(nextRoot, "static/media/newsreader.woff2"),
      8 * 1024 * 1024 + 1,
    );
    expect(verify).toThrow(/font artifact exceeded its file limit/u);
  });

  it("bounds WOFF2 resources and rejects structurally forged fonts", () => {
    const root = createIgnoredRoot("font-resources");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const html = homeHtml();
    const newsreaderPath = path.join(nextRoot, "static/media/newsreader.woff2");
    const verify = (): unknown =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: html,
        homeStylesheets: fixture.stylesheets,
        homeFonts: currentFontResponses(nextRoot, fixture.fonts),
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      });

    fs.writeFileSync(
      newsreaderPath,
      woff2Fixture("hmtx-transform", {
        payload: Buffer.from([1, 2, 3, 4]),
        tagIndex: 3,
        transformVersion: 1,
      }),
    );
    expect(verify).toThrow(/usable WOFF2/u);

    fs.writeFileSync(
      newsreaderPath,
      woff2Fixture("name-transform", {
        tagIndex: 5,
        transformVersion: 1,
      }),
    );
    expect(verify).toThrow(/unsupported WOFF2 table transform/u);

    fs.writeFileSync(
      newsreaderPath,
      woff2Fixture("compressed-limit", {
        totalCompressedSize: 8 * 1024 * 1024 + 1,
      }),
    );
    expect(verify).toThrow(/WOFF2 resource limit/u);

    fs.writeFileSync(
      newsreaderPath,
      woff2Fixture("sfnt-limit", {
        totalSfntSize: 16 * 1024 * 1024 + 1,
      }),
    );
    expect(verify).toThrow(/WOFF2 resource limit/u);

    fs.writeFileSync(
      newsreaderPath,
      woff2Fixture("declared-expansion", {
        originalLength: 16 * 1024 * 1024 + 1,
      }),
    );
    expect(verify).toThrow(/WOFF2 decompression limit/u);

    fs.writeFileSync(
      newsreaderPath,
      woff2Fixture("expansion-bomb", {
        originalLength: 16 * 1024 * 1024,
        payload: Buffer.alloc(16 * 1024 * 1024 + 1),
        totalSfntSize: 16 * 1024 * 1024,
      }),
    );
    expect(verify).toThrow(/WOFF2 decompression limit/u);
  });

  it("rejects font evidence not delivered by the exact home response", () => {
    const root = createIgnoredRoot("font-route");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const extraPath = "static/media/extra.woff2";
    fs.writeFileSync(path.join(nextRoot, extraPath), woff2Fixture("extra"));
    const manifestPath = path.join(nextRoot, "server/next-font-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const value of Object.values(manifest.app) as string[][]) {
      value.push(extraPath);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const extraPreload =
      '<link rel="preload" href="/_next/static/media/extra.woff2" as="font" crossorigin="" type="font/woff2"/>';
    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: `${extraPreload}${homeHtml()}`,
        homeStylesheets: fixture.stylesheets,
        homeFonts: fixture.fonts,
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/absent from its delivered CSS/u);

    for (const value of Object.values(manifest.app) as string[][]) value.pop();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const deadCss = "body{color:black}";
    fs.writeFileSync(path.join(nextRoot, "static/chunks/dead.css"), deadCss);
    expect(() =>
      verifyPublisherThemeFontArtifacts({
        homeHtml: homeHtml().replace("app.css", "dead.css"),
        homeStylesheets: [{ path: "static/chunks/dead.css", text: deadCss }],
        homeFonts: [],
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      }),
    ).toThrow(/unexpected compiled font family/u);
  });

  it("accepts fonts only from active top-level CSS and local asset URLs", () => {
    const root = createIgnoredRoot("font-css-structure");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const cssPath = path.join(nextRoot, "static/chunks/app.css");
    const originalCss = fixture.stylesheets[0]!.text;
    const verify = (home: string, css: string): unknown => {
      fs.writeFileSync(cssPath, css);
      return verifyPublisherThemeFontArtifacts({
        homeHtml: home,
        homeStylesheets: [{ path: "static/chunks/app.css", text: css }],
        homeFonts: fixture.fonts,
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      });
    };

    expect(() => verify(homeHtml(), `/*${originalCss}*/`)).toThrow(
      /unexpected compiled font family/u,
    );
    expect(() => verify(homeHtml(), `@media not all{${originalCss}}`)).toThrow(
      /unsupported nested/u,
    );
    expect(() =>
      verify(
        homeHtml(),
        `${originalCss}\n@media all{${originalCss.split("\n")[0]}}`,
      ),
    ).toThrow(/unsupported nested/u);
    expect(() =>
      verify(homeHtml(), `@import url(extra.css);\n${originalCss}`),
    ).toThrow(/unsupported @import/u);
    expect(() =>
      verify(
        homeHtml(),
        `${originalCss}\n.reader{background:url(../media/extra.woff2)}`,
      ),
    ).toThrow(/non-face WOFF2 source/u);
    expect(() =>
      verify(
        homeHtml().replace(
          "/_next/static/chunks/app.css",
          "https://publisher-theme-proof.invalid/_next/static/chunks/app.css",
        ),
        originalCss,
      ),
    ).toThrow(/unsafe asset URL/u);
    expect(() =>
      verify(
        '<base href="https://publisher-theme-proof.invalid/">' + homeHtml(),
        originalCss,
      ),
    ).toThrow(/live base element/u);
    expect(() =>
      verify(
        homeHtml(),
        originalCss.replace(
          "../media/literata.woff2",
          "https://publisher-theme-proof.invalid/_next/static/media/literata.woff2",
        ),
      ),
    ).toThrow(/unsafe asset URL/u);
    expect(() =>
      verify(
        homeHtml().replace('rel="stylesheet"', 'rel="alternate stylesheet"'),
        originalCss,
      ),
    ).toThrow(/inactive or unsupported/u);
    expect(() =>
      verify(
        homeHtml().replace('rel="stylesheet"', 'rel="stylesheet" disabled'),
        originalCss,
      ),
    ).toThrow(/inactive or unsupported/u);
    expect(() =>
      verify(
        homeHtml().replace('rel="stylesheet"', 'rel="stylesheet" media="print"'),
        originalCss,
      ),
    ).toThrow(/conditional media/u);
    expect(() =>
      verify(
        homeHtml().replace('rel="stylesheet"', 'rel="stylesheet" integrity="sha256-test"'),
        originalCss,
      ),
    ).toThrow(/inactive or unsupported/u);
    expect(() =>
      verify(
        homeHtml().replace('rel="stylesheet"', 'rel="stylesheet" crossorigin="anonymous"'),
        originalCss,
      ),
    ).toThrow(/inactive or unsupported/u);
    expect(() =>
      verify(
        homeHtml().replace(
          'rel="stylesheet"',
          'rel="stylesheet" onload="this.disabled=true"',
        ),
        originalCss,
      ),
    ).toThrow(/inactive or unsupported/u);
    expect(() =>
      verify(
        homeHtml().replace('rel="stylesheet"', 'rel="stylesheet" media="all"'),
        originalCss,
      ),
    ).not.toThrow();
  });

  it("requires exact usable Next font face contracts", () => {
    const root = createIgnoredRoot("font-css-contract");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const cssPath = path.join(nextRoot, "static/chunks/app.css");
    const originalCss = fixture.stylesheets[0]!.text;
    const verify = (css: string): unknown => {
      fs.writeFileSync(cssPath, css);
      return verifyPublisherThemeFontArtifacts({
        homeHtml: homeHtml(),
        homeStylesheets: [{ path: "static/chunks/app.css", text: css }],
        homeFonts: fixture.fonts,
        nextRoot,
        readerFontFamilies: compiledThemeTokens().typography.readerFontFamilies,
      });
    };

    expect(() =>
      verify(originalCss.replace(";unicode-range:U+20-7E", "")),
    ).toThrow(/descriptor set/u);
    expect(() =>
      verify(
        originalCss.replace(
          "src:url(../media/literata.woff2)",
          "src:local(Times New Roman),url(../media/literata.woff2)",
        ),
      ),
    ).toThrow(/compiled @font-face contract/u);
    expect(() =>
      verify(originalCss.replace('format("woff2")', 'format("woff")')),
    ).toThrow(/compiled @font-face contract/u);
    expect(() =>
      verify(originalCss.replace("font-weight:200 900", "font-weight:400")),
    ).toThrow(/reviewed style and weight/u);
    expect(() =>
      verify(
        originalCss
          .split("\n")
          .filter(
            (line) =>
              !(line.includes('__Literata_test"') && line.includes("font-style:italic")),
          )
          .join("\n"),
      ),
    ).toThrow(/reviewed style and weight/u);
    expect(() =>
      verify(originalCss.replace("unicode-range:U+20-7E", "unicode-range:U+110000")),
    ).toThrow(/unusable unicode-range/u);
    expect(() =>
      verify(originalCss.replace("src:local(Times New Roman)", "src:local(Arial)")),
    ).toThrow(/fallback font rule/u);
    expect(() =>
      verify(originalCss.replace("size-adjust:100%", "size-adjust:0%")),
    ).toThrow(/fallback font rule/u);
  });

  it("binds every live semantic link to its exact article, section, block, label, and href", () => {
    const projection = projectionForReader();
    const routePages = syntheticRoutePages(projection);
    const fetched = (pages: typeof routePages) => ({
      probe: {},
      homeHtml: "",
      audioArtifactStatus: 404,
      routePages: pages,
      homeStylesheets: [],
      homeFonts: [],
    });
    const withRouteChanges = (
      sourcePage = routePages[0]!,
      ownerPage = routePages[1]!,
    ): typeof routePages => Object.freeze([
      sourcePage,
      ownerPage,
      ...routePages.slice(2),
    ]);

    expect(
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(routePages),
        projection,
      }),
    ).toMatchObject({
      projectionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      verifiedPaths: [
        "/source/",
        "/owner/",
        "/index-a/",
        "/index-b/",
        "/index-c/",
      ],
      pageEvidence: routePages.map(({ path: routePath, html }) => ({
        path: routePath,
        bytes: Buffer.byteLength(html, "utf8"),
      })),
    });
    const nestedLabelPages = withRouteChanges(
      {
        ...routePages[0]!,
        html: routePages[0]!.html.replace(
          ">Target</a>",
          "><span>T</span>arget</a>",
        ),
      },
      routePages[1]!,
    );
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(nestedLabelPages),
        projection,
      }),
    ).not.toThrow();
    for (const changed of [
      routePages[0]!.html.replace(">Target</a>", ">Wrong</a>"),
      routePages[0]!.html.replace('href="/target/"', 'href="/wrong/"'),
      routePages[0]!.html.replace(
        '<section data-publisher-section="source-section">',
        '<div data-publisher-section="source-section">',
      ),
      routePages[0]!.html.replace(
        '<a href="/target/">Target</a>',
        '<div data-publisher-block="wrong-block"><a href="/target/">Target</a></div>',
      ),
      routePages[0]!.html.replace(
        '<a href="/target/">Target</a>',
        '<a hidden href="/target/">Target</a>',
      ),
    ]) {
      expect(() =>
        verifyPublisherThemeLinkfulHostPages({
          fetched: fetched(withRouteChanges(
            { ...routePages[0]!, html: changed },
            routePages[1]!,
          )),
          projection,
        }),
      ).toThrow();
    }
    const inner = routePages[0]!.html.match(
      /<article[^>]*>([\s\S]*)<\/article>/u,
    )?.[1];
    expect(inner).toBeDefined();
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(withRouteChanges(
          {
            ...routePages[0]!,
            html: `<div class="publisher-root" data-publisher-page="work"><article data-publisher-work="source-work"></article><div data-publisher-work="source-work">${inner}</div></div>`,
          },
          routePages[1]!,
        )),
        projection,
      }),
    ).toThrow(/unique live owner/u);
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(withRouteChanges(
          {
            ...routePages[0]!,
            html: routePages[0]!.html.replace(
              'data-publisher-page="work"',
              'data-publisher-page="section"',
            ),
          },
          routePages[1]!,
        )),
        projection,
      }),
    ).toThrow(/work page root/u);
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(withRouteChanges(
          routePages[0]!,
          {
            ...routePages[1]!,
            html: routePages[1]!.html.replace(
              'id="owner-anchor"',
              'id="wrong-owner"',
            ),
          },
        )),
        projection,
      }),
    ).toThrow(/exact live section ownership/u);
    const duplicateOwner =
      '<section data-publisher-section="owner-section" id="owner-anchor"></section>';
    for (const duplicateOwnerHtml of [
      routePages[1]!.html.replace(
        "</article>",
        `<div hidden>${duplicateOwner}</div></article>`,
      ),
      routePages[1]!.html.replace(
        "</article>",
        `<div inert>${duplicateOwner}</div></article>`,
      ),
      `${routePages[1]!.html}${duplicateOwner}`,
    ]) {
      expect(() =>
        verifyPublisherThemeLinkfulHostPages({
          fetched: fetched(withRouteChanges(
            routePages[0]!,
            { ...routePages[1]!, html: duplicateOwnerHtml },
          )),
          projection,
        }),
      ).toThrow(/exact (?:live )?section ownership/u);
    }
    for (const injectedChildOwnership of [
      '<span id="child-section-a"></span>',
      '<span data-publisher-section="child-section-a"></span>',
    ]) {
      expect(() =>
        verifyPublisherThemeLinkfulHostPages({
          fetched: fetched(withRouteChanges(
            routePages[0]!,
            {
              ...routePages[1]!,
              html: routePages[1]!.html.replace(
                "</article>",
                `${injectedChildOwnership}</article>`,
              ),
            },
          )),
          projection,
        }),
      ).toThrow(/omitted nested section|exact section ownership census/u);
    }
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(withRouteChanges(
          routePages[0]!,
          {
            ...routePages[1]!,
            html: routePages[1]!.html.replace(
              "</article>",
              '<section data-publisher-section="unexpected-extra" id="unexpected-extra"></section></article>',
            ),
          },
        )),
        projection,
      })
    ).toThrow(/exact section ownership census/u);
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(withRouteChanges(
          routePages[0]!,
          {
            ...routePages[1]!,
            html: routePages[1]!.html.replace(
              '<section data-publisher-section="owner-section" id="owner-anchor"></section>',
              '<article data-publisher-work="wrong-work"><section data-publisher-section="owner-section" id="owner-anchor"></section></article>',
            ),
          },
        )),
        projection,
      }),
    ).toThrow(/live section ownership/u);
    expect(() =>
      verifyPublisherThemeLinkfulHostPages({
        fetched: fetched(withRouteChanges(
          routePages[0]!,
          {
            ...routePages[1]!,
            html: routePages[1]!.html.replace(
              'data-publisher-page="section"',
              'data-publisher-page="work"',
            ),
          },
        )),
        projection,
      }),
    ).toThrow(/section page root/u);
    const firstIndexPage = routePages[2]!;
    const withFirstIndexHtml = (html: string): typeof routePages =>
      Object.freeze([
        routePages[0]!,
        routePages[1]!,
        { ...firstIndexPage, html },
        ...routePages.slice(3),
      ]);
    for (const [changed, diagnostic] of [
      [
        firstIndexPage.html.replace(
          'data-publisher-page="section-index"',
          'data-publisher-page="section"',
        ),
        /page root/u,
      ],
      [
        firstIndexPage.html.replace(
          'data-publisher-section-index="synthetic-index-0"',
          'data-publisher-section-index="wrong"',
        ),
        /article owner/u,
      ],
      [
        firstIndexPage.html.replace(
          "<h1>Synthetic index 0</h1>",
          "<h1>Wrong index</h1>",
        ),
        /wrong title/u,
      ],
      [
        firstIndexPage.html.replace(
          'href="/synthetic-index-0-section-0/"',
          'href="/wrong/"',
        ),
        /wrong section sequence/u,
      ],
      [
        firstIndexPage.html.replace("<article ", "<article hidden "),
        /article owner/u,
      ],
    ] as const) {
      expect(() =>
        verifyPublisherThemeLinkfulHostPages({
          fetched: fetched(withFirstIndexHtml(changed)),
          projection,
        }),
      ).toThrow(diagnostic);
    }
  });

  it("links the served application, error identity, hashes, HTML, and font artifacts", () => {
    const root = createIgnoredRoot("runtime");
    const nextRoot = path.join(root, ".next");
    const fixture = writeFontFixture(nextRoot);
    const projection = projectionForReader();
    const probe = syntheticProbe(projection);
    const fetched = (nextProbe: unknown, nextHomeHtml: string) => ({
      probe: nextProbe,
      homeHtml: nextHomeHtml,
      audioArtifactStatus: 404,
      routePages: syntheticRoutePages(projection),
      homeStylesheets: fixture.stylesheets,
      homeFonts: fixture.fonts,
    });

    const result = verifyPublisherThemeHostRuntime({
      fetched: fetched(probe, homeHtml()),
      nextRoot,
      projection,
    });
    expect(result).toMatchObject({
      applicationBuildId: probe.applicationManifest.buildId,
      applicationArtifactHash: probe.applicationArtifact.hash,
      configHash: hashCanonicalJson({}),
      tokensHash: hashCanonicalJson(compiledThemeTokens() as unknown as JSONValue),
      fontEvidence: { familyCount: 5, assetCount: 5 },
    });

    const assertRuntime = (nextProbe: unknown, nextHomeHtml: string): void => {
      verifyPublisherThemeHostRuntime({
        fetched: fetched(nextProbe, nextHomeHtml),
        nextRoot,
        projection,
      });
    };
    const validHtml = homeHtml();
    const encodedStyle = validHtml.match(/\sstyle="([^"]+)"/u)?.[1];
    expect(encodedStyle).toBeDefined();
    const rawStyle = encodedStyle!
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&");
    expect(() =>
      assertRuntime(
        probe,
        `${homeHtml(undefined, { includeRootStyle: false })}<span style="${encodedStyle}"></span>`,
      ),
    ).toThrow(/home root has an invalid/u);
    expect(() =>
      assertRuntime(
        probe,
        homeHtml(undefined, {
          styleOverride: rawStyle.replace(
            /--publisher-color-canvas:[^;]+;?/u,
            "",
          ),
        }),
      ),
    ).toThrow(/exact configured theme style/u);
    expect(() =>
      assertRuntime(
        probe,
        homeHtml(undefined, {
          styleOverride: rawStyle.replace(
            /--publisher-reading-measure:[^;]+;?/u,
            "",
          ),
        }),
      ),
    ).toThrow(/exact configured theme style/u);
    expect(() =>
      assertRuntime(probe, homeHtml(undefined, { extraRoot: true })),
    ).toThrow(/exactly one Reader home root/u);
    for (const inertHtml of [
      `<!-- ${validHtml} -->`,
      `<script>const fake = ${JSON.stringify(validHtml)};</script>`,
      `<template>${validHtml}</template>`,
      `<noscript>${validHtml}</noscript>`,
    ]) {
      expect(() => assertRuntime(probe, inertHtml)).toThrow();
    }
    for (const hiddenHtml of [
      validHtml.replace("<div class=", "<div hidden class="),
      validHtml.replace("<div class=", "<div inert class="),
      validHtml.replace("<div class=", '<div aria-hidden="true" class='),
      `<section hidden>${validHtml}</section>`,
      `<section inert>${validHtml}</section>`,
      `<section style="display:none">${validHtml}</section>`,
      `<section style="opacity:0">${validHtml}</section>`,
      `<details>${validHtml}</details>`,
      `<section popover>${validHtml}</section>`,
    ]) {
      expect(() => assertRuntime(probe, hiddenHtml)).toThrow(/invalid element contract/u);
    }

    const wrongHome = structuredClone(probe);
    wrongHome.homePath = "/wrong/";
    expect(() => assertRuntime(wrongHome, validHtml)).toThrow(/identity drifted/u);

    const wrongCompatibility = structuredClone(probe);
    wrongCompatibility.applicationManifest.theme.rendererCompatibility = ">=0.0.0";
    expect(() => assertRuntime(wrongCompatibility, validHtml)).toThrow(
      /theme manifest drifted/u,
    );

    const wrongArtifact = structuredClone(probe);
    wrongArtifact.applicationArtifact.text += " ";
    expect(() => assertRuntime(wrongArtifact, validHtml)).toThrow(
      /hash does not match/u,
    );

    for (const [mutate, diagnostic] of [
      [
        (value: typeof probe) => {
          Object.assign(value.applicationManifest.continuity, {
            explicitRedirectCount: 0,
          });
        },
        /continuity manifest drifted/u,
      ],
      [
        (value: typeof probe) => {
          Object.assign(value.applicationManifest.continuity, {
            canonicalSlashRedirectCount: 0,
          });
        },
        /continuity manifest drifted/u,
      ],
      [
        (value: typeof probe) => {
          value.applicationManifest.updates = {} as never;
        },
        /injected bootstrap, Updates, or sync/u,
      ],
      [
        (value: typeof probe) => {
          value.applicationManifest.sync = {} as never;
        },
        /injected bootstrap, Updates, or sync/u,
      ],
      [
        (value: typeof probe) => {
          value.applicationManifest.readerStateBootstrap = {} as never;
        },
        /injected bootstrap, Updates, or sync/u,
      ],
      [
        (value: typeof probe) => {
          Object.assign(value.applicationManifest, { extensions: null });
        },
        /migration extension manifest drifted/u,
      ],
      [
        (value: typeof probe) => {
          value.applicationManifest.extensions = {
            ...value.applicationManifest.extensions,
            buildId: `sha256:${"f".repeat(64)}`,
          };
        },
        /migration extension manifest drifted/u,
      ],
    ] as const) {
      const drifted = structuredClone(probe);
      mutate(drifted);
      expect(() => assertRuntime(drifted, validHtml)).toThrow(diagnostic);
    }

    const tampered = structuredClone(probe);
    tampered.errorIdentityTokens = structuredClone(tampered.errorIdentityTokens);
    tampered.errorIdentityTokens.typography.defaultReaderFontFamilyId = "serif";
    expect(() =>
      verifyPublisherThemeHostRuntime({
        fetched: fetched(tampered, homeHtml()),
        nextRoot,
        projection,
      }),
    ).toThrow(/diverged/u);

    expect(() =>
      verifyPublisherThemeHostRuntime({
        fetched: {
          ...fetched(probe, homeHtml()),
          audioArtifactStatus: 200,
        },
        nextRoot,
        projection,
      }),
    ).toThrow(/identity drifted/u);

    for (const field of [
      "offlineAudioClipCount",
      "offlineAudioEnvelopeResourceCount",
      "offlineAudioResourceCount",
      "offlineTimingResourceCount",
      "offlineNarrationCatalogCount",
    ] as const) {
      const audioCatalogDrift = structuredClone(probe);
      audioCatalogDrift[field] = 1;
      expect(() => assertRuntime(audioCatalogDrift, validHtml)).toThrow(
        /identity drifted/u,
      );
    }
    const injectedAudioEnvelope = syntheticProbe(projection, [
      { href: "/publication-audio.json", kind: "data" },
    ]);
    expect(() => assertRuntime(injectedAudioEnvelope, validHtml)).toThrow(
      /identity drifted/u,
    );
  });

  it("runs the complete isolated lifecycle with synthetic Next evidence", async () => {
    const tokens = compiledThemeTokens();
    let ordinaryFetchReceivedObserver = false;
    let isolatedExtensionManifest:
      | ThemeReaderProjection["isolatedExtensionManifest"]
      | undefined;
    let summary: Awaited<ReturnType<typeof runPublisherThemeHostProof>>;
    const releaseLock = acquirePublisherRepositorySourceTestLock();
    try {
      if (fs.existsSync(generatedPublisherThemeHostProofRoot)) {
        const entries = fs.readdirSync(generatedPublisherThemeHostProofRoot);
        if (entries.length !== 0) {
          throw new TypeError(
            "Publisher theme proof root must be empty before its absent-root lifecycle test.",
          );
        }
        fs.rmdirSync(generatedPublisherThemeHostProofRoot);
      }
      summary = await runPublisherThemeHostProof({
        buildRunner: async ({ hostRoot }) => {
        const extensionDataText = fs.readFileSync(
          path.join(hostRoot, "publication-extensions.json"),
          "utf8",
        );
        const extensionData = JSON.parse(extensionDataText) as {
          buildId: `sha256:${string}`;
          extensions: Array<{
            id: string;
            package: string;
            version: string;
            capabilities: string[];
            [key: string]: unknown;
          }>;
        };
        isolatedExtensionManifest = {
          schemaVersion: "1.0",
          buildId: extensionData.buildId,
          entries: extensionData.extensions.map((entry) => ({
            id: entry.id,
            package: entry.package,
            version: entry.version,
            capabilities: entry.capabilities,
            projectionHash: hashCanonicalJson(entry as unknown as JSONValue),
            rendererApiVersion: "1.0",
            rendererCompatibility: ">=0.1.0-alpha.0 <0.2.0",
            hostApiVersion: null,
            hostCompatibility: null,
          })),
        };
        const migrationText = fs.readFileSync(
          path.join(
            hostRoot,
            "public",
            "publisher",
            "coherence-reader-state-migration.json",
          ),
          "utf8",
        );
        expect(sha256(extensionDataText)).toBe(
          "sha256:4bdb15d6271545a78ad9ae8b8d9f2a6ceb0c96f0f6435218df992ae09478c4de",
        );
        expect(Buffer.byteLength(migrationText, "utf8")).toBe(1_322_065);
        expect(sha256(migrationText)).toBe(
          "sha256:3e4c476028b4c8b5c13f58757ee9ae52117d5862c6302187be0caa164b4e2238",
        );
        expect(
          fs.readFileSync(path.join(hostRoot, "publisher.extensions.mjs"), "utf8"),
        ).toContain("createCoherenceReaderStateMigrationExtensionRegistration");
        writeFontFixture(path.join(hostRoot, ".next"));
        return { outputBytes: 0 };
        },
        fetchRunner: async (input) => {
        ordinaryFetchReceivedObserver = Object.hasOwn(
          input,
          "liveHostObserver",
        );
        const { homePath, hostRoot, routePaths } = input;
        const fixture = writeFontFixture(path.join(hostRoot, ".next"));
        const reader = JSON.parse(
          fs.readFileSync(path.join(hostRoot, "publication-reader.json"), "utf8"),
        ) as PublicationReaderEnvelope;
        if (isolatedExtensionManifest === undefined) {
          throw new TypeError("Synthetic build omitted its extension manifest.");
        }
        const projection = projectionForReader(
          reader,
          routePaths,
          isolatedExtensionManifest,
        );
        const probe = syntheticProbe(projection);
        probe.homePath = homePath;
        return {
          probe,
          homeHtml: homeHtml(tokens),
          audioArtifactStatus: 404,
          routePages: syntheticRoutePages(projection),
          homeStylesheets: fixture.stylesheets,
          homeFonts: fixture.fonts,
        };
        },
      });
    } finally {
      releaseLock();
    }

    expect(ordinaryFetchReceivedObserver).toBe(false);

    expect(summary.currentTransition).toEqual({
      proofScope: "current Coherence Publisher transition preview facade",
      exposedApplicationKeys: ["renderEmbeddedPage", "resolveRoute"],
      facadeFrozen: true,
      readerProvidersExposed: false,
      rootLayoutExposed: false,
      providerComposition: "excluded-by-transition-facade",
      isolatedHostEvidenceUsed: false,
    });
    expect(Object.isFrozen(summary.currentTransition)).toBe(true);
    expect(
      Object.isFrozen(summary.currentTransition.exposedApplicationKeys),
    ).toBe(true);

    expect(summary).toMatchObject({
      proofScope: "isolated Next linkful theme compiler host",
      contentParity: "not asserted",
      adaptedReaderHostVerified: true,
      currentPublicRoutes: "untouched",
      publicationId: "coherence-thesis",
      contentEvidenceHash:
        "sha256:4794f0799c3d8172573217881657382ad27800d8d991ad2c0f11d26c78fe47b0",
      absentReaderBasePathCount: 0,
      missingReaderFragmentHrefCount: 0,
      currentCatalogFragmentCoverage: {
        proofScope: "adapted-reader-current-catalog-section-fragments",
        status: "verified",
        baselineMissingReaderFragmentHrefCount: 153,
        assignedCatalogFragmentAddressCount: 153,
        finalMissingReaderFragmentHrefCount: 0,
        chapterOwnerPageCount: 46,
        ownerSectionCount: 46,
        directDescendantSectionCount: 107,
        serverRenderedDomIdCount: 153,
        assignedCatalogFragmentAddressesSha256:
          "sha256:276f0d71904e0a394e12db1222ebfb12b739c1951a7d6d13b654f41c957dd5b0",
        serverRenderedCatalogFragmentAddressesSha256:
          "sha256:438370bb39c3e66f67f8f63a4849bf08e958ae1a365bda98b8e016e33ee341ba",
        excludedClaims: [
          "durable-continuity",
          "aggregate-index-routes",
          "current-host-wiring",
          "legacy-aliases-and-fragments",
          "browser-fragment-scroll",
          "offline-all-work-behavior",
          "ux-and-content-parity",
        ],
      },
      baseRoutePresence: true,
      aggregateChapterPageParity: true,
      nestedFragmentParity: false,
      durableFragmentParity: false,
      fullReaderRouteParity: false,
      readerArtifactCount: 4,
      extensionDataArtifact: {
        path: "publication-extensions.json",
        bytes: 982,
        hash:
          "sha256:4bdb15d6271545a78ad9ae8b8d9f2a6ceb0c96f0f6435218df992ae09478c4de",
      },
      stateMigrationArtifact: {
        path: "public/publisher/coherence-reader-state-migration.json",
        bytes: 1_322_065,
        hash:
          "sha256:3e4c476028b4c8b5c13f58757ee9ae52117d5862c6302187be0caa164b4e2238",
        buildId:
          "sha256:36966a6aba2967e7fbfdc66a537a3a8d10adae528dbb511cf5a8c87c696c922c",
      },
      semanticLinkCount: 21,
      semanticLinkBlockGroupCount: 17,
      routePlanStaticParamCount: 586,
      applicationStaticParamCount: 585,
      activeRouteCount: 586,
      explicitRedirectCount: 584,
      canonicalSlashRedirectCount: 585,
      activePathsHash:
        "sha256:62d07fd9d597dd4f86ca53dedaff583efd155aabc421caef578cefa38a648991",
      activeRoutesHash:
        "sha256:fdc059c5da46c87261211eb30cda835f01e5b9d719615984e05b7420a430fe94",
      routePlanStaticParamsHash:
        "sha256:7268c8b6dfdd6436088d8aa7a900c3d951d1cff8c22d6f6de084c5de1ffeb146",
      applicationStaticParamsHash:
        "sha256:dcf4d19e4173927dc88c43b4908d146537ca820d660e4af30a5f2d134a6e067e",
      redirectTuplesHash:
        "sha256:8193048bfc8ece56bf2d2349d7e6468d07ec7e9a663961aedffb77ff40be3948",
      sectionIndexCount: 3,
      sectionIndexReferenceCount: 57,
      sectionIndexesHash:
        "sha256:1bbe96438b6c2b4f772b5c2bde098108f9cd7a82ad58b7307ee70a1bc365e25c",
      sectionIndexPaths: [
        "/manuscripts/3/governance/",
        "/manuscripts/3/the-design/",
        "/manuscripts/6/the-whole-in-the-fewest-words/",
      ],
      sectionIndexPathsHash:
        "sha256:6cc441c431d1236763bcb310ada0b766bfeeb4e4d3bc1e8aa087e3651ca4692d",
      catalogChapterRootOwnerCount: 46,
      catalogChapterRootChildCount: 107,
      catalogChapterRootOwnerGroupsHash:
        "sha256:6e4b2ffb9b6c1b130659a96be104d5e174b02e56286c16bc182fcadf64baacb2",
      catalogChapterRootOwnerIdsHash:
        "sha256:8f586a30ae231f85a1103613bce6fa08baec55f510175015605d70a106857cbb",
      catalogChapterRootChildIdsHash:
        "sha256:1c493c167d85bfdc507f1a0f061efbc7843a2af81bc185733440a7a32e9a3879",
      catalogChapterRootOwnerPathsHash:
        "sha256:aa33821c6b83a0ce25b176762b8bb6c0b24081a79fde993cee17e4dcb270b652",
      liveContentPathCount: 47,
      liveContentPathsHash:
        "sha256:eb3555af3ccc6ab49f5ac500ceed751f7eacaf199f56538442037af7e3c13916",
      audioDeclaration: "absent",
      audioArtifact: "absent",
      isolatedUpdates: "absent",
      isolatedSync: "absent",
      isolatedMigrationExtension: "mounted",
      migrationExecution: "not-exercised",
      updatesDormancy: {
        catalogTextHash:
          "sha256:f57afe7238fb47d84c4acbce0488c8190026d4944706bc8997bccca3ba53be46",
        updatesDataTextHash:
          "sha256:b5f0f4acf0a7eeddaa1b076c97ce42240bdc0652c26a880005726ae911837e0d",
        adaptationReady: true,
        runtimeDormant: true,
        routesActivated: false,
        activationEligible: false,
        readerUpdatesTargetCount: 0,
        adapterRouteDeclarationCount: 2,
        dormantRoutePlanValid: true,
        activationAttemptRejected: true,
        activationDiagnostic: {
          code: "next.updates.view_undeclared",
          path: "/updatesData/views/0/id",
          keyword: "route",
          viewId: "all",
        },
        injectedIntoIsolatedHost: false,
      },
      offlineAudioEnvelopeResourceCount: 0,
      readerArtifactsHash:
        "sha256:2a7a3c52546052ebdd1bc37634c15bbceae7bc49dc4918537bbdf598a71c8659",
      readerArtifactEvidence: [
        {
          path: "public/publication-reader-progress.json",
          bytes: 295_305,
          hash:
            "sha256:94aa897b597a2cdc5363d17f7f902ee5e3a06e0cd96ea048d8e8fdb6f0f9d5b3",
        },
        {
          path: "public/publication-reader-search.json",
          bytes: 2_845_048,
          hash:
            "sha256:a0cc97c1e996a01859ecc3db7f6b6b84544468fb85cc8db922bd0a361a697721",
        },
        {
          path: "publication-public-identity.json",
          bytes: 736,
          hash:
            "sha256:40faa074ccd57b4ff5559577380e4e9d3ce0015f85706779c898dba8495392c9",
        },
        {
          path: "publication-reader.json",
          bytes: 5_053_224,
          hash:
            "sha256:12cb32ea39a97f30ec4c5ea6d7a1e9daf641b8ff214545ef12d6796458121ee8",
        },
      ],
      hostContractVersion: "0.18.0",
      publisherContentVersion: "0.1.0-alpha.0",
      publisherReaderVersion: "0.1.0-alpha.0",
      publisherSchemaVersion: "0.1.0-alpha.0",
      themePackage: "coherence-thesis",
      themeVersion: "0.1.0",
      defaultReaderFontFamilyId: "literata",
      readerFontFamilyCount: PUBLISHER_THEME_READER_FONT_IDS.length,
      compiledNextFontCount: 5,
      compiledFontAssetCount: 5,
      nodeVersion: "22.12.0",
      npmVersion: "10.9.0",
      nextVersion: "16.3.1",
      reactVersion: "19.2.8",
      reactDomVersion: "19.2.8",
      typescriptVersion: "5.9.3",
      generatedHostCleanup: "completed",
    });
    expect(summary.fragmentOwnerSectionIds).toHaveLength(46);
    expect(summary.runtimeArtifactEvidence.map(({ path: artifactPath }) =>
      artifactPath
    )).toEqual(PUBLISHER_THEME_RUNTIME_ARTIFACT_PATHS);
    expect(summary.runtimeArtifactStateHash).toBe(
      hashCanonicalJson(
        summary.runtimeArtifactEvidence as unknown as JSONValue,
      ),
    );
    expect(summary.runtimeArtifactsUnchanged).toBe(true);
    for (const row of summary.runtimeArtifactEvidence) {
      expect(path.isAbsolute(row.path)).toBe(false);
      expect(Object.keys(row).sort()).toEqual(
        row.state === "absent"
          ? ["path", "state"]
          : ["bytes", "hash", "path", "state"],
      );
    }
    expect(summary.fragmentOwnerChildSectionIds).toHaveLength(107);
    expect(summary.fragmentOwnerSectionIds.slice(0, 4)).toEqual([
      "v01-the-limits-of-the-claim",
      "v01-how-coherence-becomes-structure",
      "v01-the-human-being-reconsidered",
      "v01-the-currency-of-presence",
    ]);
    expect(summary.fragmentOwnerAddresses.map(({ sectionId }) => sectionId)).toEqual(
      summary.fragmentOwnerSectionIds,
    );
    expect(
      summary.fragmentOwnerAddresses.flatMap(({ childIds }) => childIds),
    ).toEqual(summary.fragmentOwnerChildSectionIds);
    const ownerIds = new Set(summary.fragmentOwnerSectionIds);
    const childIds = new Set(summary.fragmentOwnerChildSectionIds);
    expect(ownerIds.size).toBe(46);
    expect(childIds.size).toBe(107);
    expect([...childIds].some((sectionId) => ownerIds.has(sectionId))).toBe(
      false,
    );
    expect(summary.verifiedHostPaths).toEqual([
      "/manuscripts/1/",
      ...summary.fragmentOwnerAddresses.map(({ path: ownerPath }) => ownerPath),
      ...summary.sectionIndexPaths,
    ]);
    expect(summary.verifiedHostPaths).toHaveLength(50);
    expect(
      hashCanonicalJson(
        summary.verifiedHostPaths.slice(0, 47) as unknown as JSONValue,
      ),
    ).toBe(
      "sha256:eb3555af3ccc6ab49f5ac500ceed751f7eacaf199f56538442037af7e3c13916",
    );
    expect(
      hashCanonicalJson(
        summary.verifiedHostPaths.slice(47) as unknown as JSONValue,
      ),
    ).toBe(
      "sha256:6cc441c431d1236763bcb310ada0b766bfeeb4e4d3bc1e8aa087e3651ca4692d",
    );
    expect(summary.verifiedHostPageEvidence).toHaveLength(50);
    expect(
      summary.verifiedHostPageEvidence.map(({ path: routePath }) => routePath),
    ).toEqual(summary.verifiedHostPaths);
    for (const page of summary.verifiedHostPageEvidence) {
      expect(Object.keys(page).sort()).toEqual(["bytes", "path"]);
      expect(page.bytes).toBeLessThanOrEqual(
        PUBLISHER_THEME_MAXIMUM_HTML_RESPONSE_BYTES,
      );
    }
    expect(
      summary.verifiedHostPageEvidence.reduce(
        (total, { bytes }) => total + bytes,
        0,
      ),
    ).toBeLessThanOrEqual(64 * 1024 * 1024);
    for (const value of Object.entries(summary)
      .filter(([key]) => key.endsWith("Hash"))
      .map(([, value]) => value)) {
      expect(value).toMatch(/^sha256:[a-f0-9]{64}$/u);
    }
    expect(
      fs.readdirSync(generatedPublisherThemeHostProofRoot).some((entry) =>
        entry.startsWith("run-"),
      ),
    ).toBe(false);
    expect(summary.themeSourceHash).toBe(
      sha256(fs.readFileSync(defaultPublisherThemeHostProofPaths.themeSourcePath)),
    );
  }, 330_000);

  it.each([
    PUBLISHER_NEXT_AUDIO_DATA_PATH,
    PUBLISHER_NEXT_SYNC_DATA_PATH,
    PUBLISHER_NEXT_UPDATES_DATA_PATH,
  ])(
    "rejects and cleans an injected inactive host artifact at %s",
    async (hostRelativePath) => {
      const runRootsBefore = fs.existsSync(generatedPublisherThemeHostProofRoot)
        ? fs
            .readdirSync(generatedPublisherThemeHostProofRoot)
            .filter((entry) => entry.startsWith("run-"))
            .sort()
        : [];
      await expect(
        runPublisherThemeHostProof({
          buildRunner: async ({ hostRoot }) => {
            const artifactPath = path.join(
              hostRoot,
              ...hostRelativePath.split("/"),
            );
            fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
            fs.writeFileSync(artifactPath, "forged inactive state\n", "utf8");
            return { outputBytes: 0 };
          },
        }),
      ).rejects.toThrow(/must not receive inactive artifact/u);
      expect(
        fs.existsSync(generatedPublisherThemeHostProofRoot)
          ? fs
              .readdirSync(generatedPublisherThemeHostProofRoot)
              .filter((entry) => entry.startsWith("run-"))
              .sort()
          : [],
      ).toEqual(runRootsBefore);
    },
    330_000,
  );

  it("detects byte changes hidden behind an already untracked status", async () => {
    const sentinelPath = path.join(
      repoRoot,
      "scripts",
      "publisher",
      `.theme-proof-source-state-test-${process.pid}-${randomUUID()}`,
    );
    const releaseLock = acquirePublisherRepositorySourceTestLock();
    try {
      expect(fs.existsSync(sentinelPath)).toBe(false);
      fs.writeFileSync(sentinelPath, "before");
      await expect(
        runPublisherThemeHostProof({
          buildRunner: async ({ hostRoot }) => {
            fs.writeFileSync(sentinelPath, "after");
            writeFontFixture(path.join(hostRoot, ".next"));
            return { outputBytes: 0 };
          },
          fetchRunner: async ({ homePath, hostRoot, routePaths }) => {
            const fixture = writeFontFixture(path.join(hostRoot, ".next"));
            const reader = JSON.parse(
              fs.readFileSync(
                path.join(hostRoot, "publication-reader.json"),
                "utf8",
              ),
            ) as PublicationReaderEnvelope;
            const projection = projectionForReader(reader, routePaths);
            const probe = syntheticProbe(projection);
            probe.homePath = homePath;
            return {
              probe,
              homeHtml: homeHtml(),
              audioArtifactStatus: 404,
              routePages: syntheticRoutePages(projection),
              homeStylesheets: fixture.stylesheets,
              homeFonts: fixture.fonts,
            };
          },
        }),
      ).rejects.toThrow(/changed (?:repository )?source state/u);
    } finally {
      try {
        fs.rmSync(sentinelPath, { force: true });
      } finally {
        releaseLock();
      }
    }
  }, 330_000);

  it("aggregates operation failure with exact runtime artifact parent drift", async () => {
    const originalLstatSync = fs.lstatSync.bind(fs);
    let driftParentIdentity = false;
    const lstatSpy = vi.spyOn(fs, "lstatSync").mockImplementation((
      (filePath, options) => {
        const result = originalLstatSync(filePath, options as never);
        const bigint =
          typeof options === "object" &&
          options !== null &&
          "bigint" in options &&
          options.bigint === true;
        if (
          !driftParentIdentity ||
          !bigint ||
          path.resolve(String(filePath)) !== repoRoot ||
          !("ino" in result) ||
          typeof result.ino !== "bigint"
        ) {
          return result;
        }
        return new Proxy(result, {
          get(target, property) {
            if (property === "ino") return target.ino + BigInt(1);
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      }
    ) as typeof fs.lstatSync);
    let caught: unknown;
    try {
      await runPublisherThemeHostProof({
        buildRunner: async () => {
          driftParentIdentity = true;
          throw new TypeError("synthetic build failure");
        },
      });
    } catch (error) {
      caught = error;
    } finally {
      lstatSpy.mockRestore();
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toMatchObject({
      message: "synthetic build failure",
    });
    expect(aggregate.errors[1]).toMatchObject({
      message: "Publisher theme compiler proof changed repository source state.",
    });
    expect(
      fs.readdirSync(generatedPublisherThemeHostProofRoot).some((entry) =>
        entry.startsWith("run-"),
      ),
    ).toBe(false);
  }, 330_000);
});
