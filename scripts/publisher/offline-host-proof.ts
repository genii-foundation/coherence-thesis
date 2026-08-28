import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { canonicalizeJson } from "@genii-foundation/publisher-content";
import { validatePublicationReaderEnvelope } from "@genii-foundation/publisher-reader";
import type {
  ReaderBlockMarkdownLink,
} from "@genii-foundation/publisher-reader/markdown";
import {
  READER_OFFLINE_CATALOG_ARTIFACT_KIND,
  READER_OFFLINE_CATALOG_ARTIFACT_MEDIA_TYPE,
  READER_OFFLINE_CATALOG_ARTIFACT_RELATIVE_PATH,
  createReaderOfflineCatalog,
  parseReaderOfflineCatalog,
  serializeReaderOfflineCatalog,
  type ReaderOfflineCatalog,
  type ReaderOfflinePackage,
  type ReaderOfflineResourceKind,
} from "@genii-foundation/publisher-reader/offline";
import type {
  JSONValue,
  PublicationReaderEnvelope,
} from "@genii-foundation/publisher-schema";
import {
  inspectAbsoluteHttpUrl,
  inspectCanonicalUrlFragment,
} from "@genii-foundation/publisher-schema/reader";
import { inspectCanonicalRoutePath } from "@genii-foundation/publisher-schema/routes";
import type {
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";
import type {
  PublisherThemeHostLiveObserver,
  PublisherThemeHostProofSummary,
  PublisherThemeHostReaderProjection,
} from "./theme-host-proof";
import {
  COHERENCE_READER_STATE_MIGRATION_HREF,
} from "../../src/publisher/reader-state-migration-schema";

export const PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION = "1.61.1";
export const PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION = "149.0.7827.55";
export const PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_LOCK_HASH =
  "sha256:596298be58ff465e236f8a2a5806798292596929e6d9540cf7788613c093f6b7";
export const PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_COMBINED_LOCK_HASH =
  "sha256:d34b77642cb14ccb4c92b54c808227b96fc6ac91ff623c653d4f6b2b6ecf0adc";
export const PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_SOURCE_HASH =
  "sha256:15991a7a25c61eda87a44cfc2f6b1d70508fd4b151435153afe4648d49064f9a";
export const PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_CLOSURE_HASH =
  "sha256:77851c2eaad28013d9e4d415158ee1e98b15801be80a52f70a0d595d0e917560";
export const PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_CLOSURE_HASH =
  "sha256:29312e5ba8ab4be5c6d5d56a612447419d02b26abbda5e2985496b60b632085d";
export const PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_SOURCE_HASH =
  "sha256:0762e5f31e2748b023f503d763dd0852b406d63724e07ae5f8d53e3a9025edf2";
export const PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_SOURCE_CLOSURE_HASH =
  "sha256:78a079d2d2e692e9e669924b0cb6eaee3d8ee06607c2206f95d23df1fa760d57";
export const PUBLISHER_OFFLINE_EXPECTED_THEME_HOST_RUNNER_HASH =
  "sha256:6a8281d37ca12063e9c39d754e1132266c0c14da95ddd332b5c7383d3661a1cd";
export const PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID =
  "sha256:ef9c7e2c3d85483caf5b18085059984b8bd8c175a992c8766129d3779a0af01f";
export const PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID =
  "sha256:3264739aa08b6e4b5f8523fd4b516d7c2e8b54af15a457dce00727fd0d1312d3";
export const PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH =
  "sha256:df2dec74b06fae97cf325251cc3e8db42bedf24ded86cf95b303a8e05189d8f1";
export const PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES = 1_324_067;
export const PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_HASH =
  "sha256:469264c91ad4dfc850863c2b9fdfbb6b7f316cb88c91a8a85253cbba7c1d8518";
export const PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH =
  "sha256:a241690a22206464d9948bce0c6d3dd9de3cdfe0cb4f25a96e3fa953384a0845";
export const PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH =
  "sha256:2e29e06f5ef7fed1b8a9018d771735de9fc06f2324d0fc4ca9e5628101ead9f4";
export const PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH =
  "sha256:40aac74280221113b0ee7f402f2a662cfb3a8278a047666a8710e5e06277b49d";
export const PUBLISHER_OFFLINE_EXPECTED_READER_RAIL_HASH =
  "sha256:38a0454ee079e5b4a9fffe11365b3f6c4f16b67672460ec613be17cb2f4e65f0";
export const PUBLISHER_OFFLINE_EXPECTED_DORMANT_AUDIO_SHELL_HASH =
  "sha256:339a00ab8450a71225c876620e6ccfdf95bd116839a55136c77f32d8b79885f7";
export const PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS = Object.freeze([
  "/_next/static/chunks/080ejmdzsivw2.css",
  "/_next/static/chunks/3ghbvhw9w0d8l.css",
]);
export const PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH =
  "sha256:6f7bccc16f970ce77b025f054357bb758f95a7c3ce3ade2e66acea11e3732e1b";
export const PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE =
  "text/css; charset=UTF-8";
export const PUBLISHER_OFFLINE_CATALOG_HREF =
  "/publication-reader-offline.json?rendererBuildId=sha256%3A3264739aa08b6e4b5f8523fd4b516d7c2e8b54af15a457dce00727fd0d1312d3";
export const PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES = 64_659;
export const PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH =
  "sha256:b8808ba98b4c222b58548552000cf450baad80d706a4f0db37e5ebf935cf86e6";
export const PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH =
  "sha256:51085bb96c035134d677aa4246887dfab6d735f9b627da755b7805a762ce78e0";
export const PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH =
  "sha256:a4ad1967b798eb64d6db75c3fdf426ebc82428371e40c14b776323453de103a6";
export const PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH =
  "sha256:9fe4742414f1fe7c0eea1c2aceae5e30235bd7f3017f743a135b574953715bdf";
export const PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES = 3_972;
export const PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH =
  "sha256:c8f6742e55a67d48225de881a724b6bc857efb5f899d9e8ccdfccd1481884025";
export const PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE =
  "application/javascript; charset=UTF-8";
export const PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL =
  "public, max-age=0";
export const PUBLISHER_OFFLINE_EXPECTED_PROGRESS_BYTES = 294_877;
export const PUBLISHER_OFFLINE_EXPECTED_PROGRESS_HASH =
  "sha256:861d79fab357de5ab40d65b028a1987532e76f1312ed93ec47d4e987efd2805b";
export const PUBLISHER_OFFLINE_EXPECTED_SEARCH_BYTES = 2_841_377;
export const PUBLISHER_OFFLINE_EXPECTED_SEARCH_HASH =
  "sha256:fc398e00bc2c1cb44d26676066f0ed4113f094aa868de5f92534fbefc29d4ed8";
export const PUBLISHER_OFFLINE_MAXIMUM_ARTIFACT_RESPONSE_BYTES = 1_048_576;
export const PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES = 16_777_216;
export const PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES = 67_108_864;

const PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_NODES = 200_000;
const PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_DEPTH = 256;
const PUBLISHER_OFFLINE_MAXIMUM_HTML_ATTRIBUTES_PER_ELEMENT = 128;
const PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_ATTRIBUTE_CODE_UNITS = 16_777_216;
const PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_TEXT_CODE_UNITS = 33_554_432;
const PUBLISHER_OFFLINE_DOCUMENT_CONTENT_TYPE = "text/html; charset=utf-8";
const PUBLISHER_OFFLINE_MARKDOWN_PARSER_CHAIN_LABEL =
  "Publisher Next 0.1.0-alpha.0 > react-markdown 10.1.0 > remark-parse 11.0.0 > mdast-util-from-markdown 2.0.3";
const PUBLISHER_OFFLINE_MARKDOWN_PARSER_LOCK_PATHS = Object.freeze([
  "node_modules/@genii-foundation/publisher-next",
  "node_modules/react-markdown",
  "node_modules/remark-parse",
  "node_modules/mdast-util-from-markdown",
]);
const PUBLISHER_OFFLINE_MARKDOWN_PARSER_NODE_CENSUS = Object.freeze({
  root: 83,
  paragraph: 92,
  heading: 8,
  list: 5,
  listItem: 30,
  blockquote: 4,
  thematicBreak: 8,
  emphasis: 33,
  strong: 56,
  text: 217,
});
const PUBLISHER_OFFLINE_THEME_STYLE_PROPERTIES = Object.freeze([
  "--publisher-color-canvas",
  "--publisher-color-surface",
  "--publisher-color-text",
  "--publisher-color-muted-text",
  "--publisher-color-accent",
  "--publisher-color-focus",
  "--publisher-color-border",
  "--publisher-font-body",
  "--publisher-font-heading",
  "--publisher-font-mono",
  "--publisher-reader-default-font-family",
  "--publisher-font-size",
  "--publisher-line-height",
  "--publisher-reading-measure",
  "--publisher-page-gutter",
  "--publisher-section-gap",
  "--publisher-control-radius",
]);

const EXPECTED_PUBLICATION_ID = "coherence-thesis";
const CARDINAL_SCALE_WORK_ID = "cardinal-scale";
const PUBLISHER_METADATA_CACHE_NAME =
  "genii-publisher-offline-metadata-v1";
const PUBLISHER_PACKAGE_CACHE_PREFIX =
  "genii-publisher-offline-package-v1-";
const PUBLISHER_RUNTIME_CACHE_NAME = "genii-publisher-offline-runtime-v1";
const PUBLISHER_RUNTIME_CACHE_PREFIX = "genii-publisher-offline-runtime-v";
const PUBLISHER_RECORD_PREFIX =
  "https://publisher.invalid/__offline-package__/";
const PREVIOUS_WORK_CONTENT_HASH =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const CATALOG_CONTENT_TYPE =
  `${READER_OFFLINE_CATALOG_ARTIFACT_MEDIA_TYPE}; charset=utf-8`;
const CATALOG_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const OFFLINE_WORKER_PATH = "/offline-sw.js";
const INSTALL_TIMEOUT_MS = 180_000;
const READER_READY_TIMEOUT_MS = 30_000;
const COLD_STATE_DIAGNOSTIC_TIMEOUT_MS = 5_000;
const EXPECTED_DATA_HREFS = Object.freeze([
  PUBLISHER_OFFLINE_CATALOG_HREF,
  "/publication-reader-progress.json",
  "/publication-reader-search.json",
  COHERENCE_READER_STATE_MIGRATION_HREF,
]);
const SEEDED_COHERENCE_CACHE_NAMES = Object.freeze([
  "coherence-offline-metadata-v2",
  "coherence-offline-pack-v2-sentinel",
  "coherence-offline-runtime-v1",
  "coherence-offline-runtime-v2",
  "coherence-offline-v1",
]);
const SEEDED_STALE_PUBLISHER_RUNTIME_NAMES = Object.freeze([
  "genii-publisher-offline-runtime-v0",
  "genii-publisher-offline-runtime-v999",
]);

export type PublisherOfflineExpectedPackage = Readonly<{
  workId: string;
  sectionCount: number;
  documentCount: number;
  resourceCount: number;
}>;

export const PUBLISHER_OFFLINE_EXPECTED_PACKAGES = Object.freeze([
  Object.freeze({
    workId: "humanitys-most-viable-future",
    sectionCount: 37,
    documentCount: 45,
    resourceCount: 49,
  }),
  Object.freeze({
    workId: "wielding-intelligence",
    sectionCount: 81,
    documentCount: 89,
    resourceCount: 93,
  }),
  Object.freeze({
    workId: "providence-imperative",
    sectionCount: 121,
    documentCount: 125,
    resourceCount: 129,
  }),
  Object.freeze({
    workId: "architecting-providence",
    sectionCount: 151,
    documentCount: 181,
    resourceCount: 185,
  }),
  Object.freeze({
    workId: "purposeful",
    sectionCount: 24,
    documentCount: 26,
    resourceCount: 30,
  }),
  Object.freeze({
    workId: "smallest-nest",
    sectionCount: 24,
    documentCount: 26,
    resourceCount: 30,
  }),
  Object.freeze({
    workId: "presencing-genius",
    sectionCount: 46,
    documentCount: 49,
    resourceCount: 53,
  }),
  Object.freeze({
    workId: "misanthropic-artifice",
    sectionCount: 31,
    documentCount: 36,
    resourceCount: 40,
  }),
  Object.freeze({
    workId: CARDINAL_SCALE_WORK_ID,
    sectionCount: 10,
    documentCount: 14,
    resourceCount: 18,
  }),
] satisfies readonly PublisherOfflineExpectedPackage[]);

export type PublisherOfflineCatalogEvidence = Readonly<{
  href: typeof PUBLISHER_OFFLINE_CATALOG_HREF;
  mediaType: typeof READER_OFFLINE_CATALOG_ARTIFACT_MEDIA_TYPE;
  cacheControl: typeof CATALOG_CACHE_CONTROL;
  bytes: typeof PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES;
  hash: typeof PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH;
  structureHash: typeof PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH;
  cardinalResourcesHash:
    typeof PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH;
  cardinalHrefOrderHash:
    typeof PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH;
  packageCount: 9;
  resourceDeclarationCount: 627;
  uniqueResourceCount: 587;
  documentResourceCount: 583;
  dataResourceCount: 4;
  assetResourceCount: 0;
  audioResourceCount: 0;
  timingResourceCount: 0;
  audioClipCount: 0;
  cardinalScaleResourceCount: 18;
  packageEvidence: readonly PublisherOfflineExpectedPackage[];
}>;

export type PublisherOfflineWorkerEvidence = Readonly<{
  path: typeof OFFLINE_WORKER_PATH;
  bytes: typeof PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES;
  hash: typeof PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH;
  contentType: typeof PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE;
  cacheControl: typeof PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL;
  doesNotCache206: true;
  excludesRange: true;
  excludesApi: true;
  excludesAuth: true;
  excludesRsc: true;
  excludesPrefetch: true;
  excludesStateTree: true;
  excludesWorker: true;
}>;

export const PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE =
  Object.freeze({
    chainLabel: PUBLISHER_OFFLINE_MARKDOWN_PARSER_CHAIN_LABEL,
    publicationLockHash: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_LOCK_HASH,
    installedLockHash: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_LOCK_HASH,
    combinedLockHash:
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_COMBINED_LOCK_HASH,
    sourceHash: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_SOURCE_HASH,
    dependencyClosure: Object.freeze({
      packageCount: 34,
      fileCount: 475,
      totalBytes: 1_161_651,
      canonicalBytes: 71_633,
      hash: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_CLOSURE_HASH,
    }),
    readerLinkApplication: Object.freeze({
      path: "@genii-foundation/publisher-reader/dist/markdown.js",
      bytes: 18_323,
      hash: PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_SOURCE_HASH,
      sourceClosure: Object.freeze({
        fileCount: 3,
        totalBytes: 30_831,
        canonicalBytes: 480,
        hash: PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_SOURCE_CLOSURE_HASH,
        files: Object.freeze([
          Object.freeze({
            path: "@genii-foundation/publisher-reader/dist/markdown.js",
            bytes: 18_323,
            hash: PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_SOURCE_HASH,
          }),
          Object.freeze({
            path: "@genii-foundation/publisher-reader/dist/diagnostics.js",
            bytes: 6_816,
            hash:
              "sha256:87573c0a34ed343fcdfb04ae7a0a2af71486ec7354cd407011088b1eb8d6e1dc",
          }),
          Object.freeze({
            path: "@genii-foundation/publisher-reader/dist/immutability.js",
            bytes: 5_692,
            hash:
              "sha256:542e62139817b8973c52707139b0d71600f876c844cb68a8dff4baf6841681fd",
          }),
        ]),
      }),
      dependencyClosure: Object.freeze({
        packageCount: 34,
        fileCount: 475,
        totalBytes: 1_161_651,
        canonicalBytes: 96_065,
        hash: PUBLISHER_OFFLINE_EXPECTED_READER_MARKDOWN_CLOSURE_HASH,
      }),
    }),
    themeHostRunner: Object.freeze({
      path: "scripts/publisher/theme-host-proof.ts",
      bytes: 189_943,
      hash: PUBLISHER_OFFLINE_EXPECTED_THEME_HOST_RUNNER_HASH,
    }),
    packages: Object.freeze([
      Object.freeze({
        name: "@genii-foundation/publisher-next",
        version: "0.1.0-alpha.0",
        source:
          "vendor/genii-publisher/55efeee334848b714d52dbedce933de73aa7c6e1/genii-foundation-publisher-next-0.1.0-alpha.0.tgz",
        integrity:
          "sha512-5lK/+2pze3fLqyJswsDWUwWTt1+cuCFSQlSHO6zORqs0yxBYs/j3UOGmsgcX8T5v2DbOhkjtIU33VW/IsJ2sfA==",
        implementationPath:
          "@genii-foundation/publisher-next/dist/components/markdown.js",
        implementationBytes: 10_015,
        implementationHash:
          "sha256:cc67abd80e5d91fe3fbedc31bf23d9d74614f7de705d019c66fc30fb20739283",
      }),
      Object.freeze({
        name: "react-markdown",
        version: "10.1.0",
        source:
          "https://registry.npmjs.org/react-markdown/-/react-markdown-10.1.0.tgz",
        integrity:
          "sha512-qKxVopLT/TyA6BX3Ue5NwabOsAzm0Q7kAPwq6L+wWDwisYs7R8vZ0nRXqq6rkueboxpkjvLGU9fWifiX/ZZFxQ==",
        implementationPath: "react-markdown/lib/index.js",
        implementationBytes: 12_802,
        implementationHash:
          "sha256:1c8d95723a74051c354dd4470fb669ae5269baf0ac62aa9b52c4516960ace5ee",
      }),
      Object.freeze({
        name: "remark-parse",
        version: "11.0.0",
        source:
          "https://registry.npmjs.org/remark-parse/-/remark-parse-11.0.0.tgz",
        integrity:
          "sha512-FCxlKLNGknS5ba/1lmpYijMUzX2esxW5xQqjWxw2eHFfS2MSdaHVINFmhjo+qN1WhZhNimq0dZATN9pH0IDrpA==",
        implementationPath: "remark-parse/lib/index.js",
        implementationBytes: 1_200,
        implementationHash:
          "sha256:9d5a9a197d1d91a1abbf47b8cf67e1ee0decbfc9471d94c4a2ee712ff73b90c8",
      }),
      Object.freeze({
        name: "mdast-util-from-markdown",
        version: "2.0.3",
        source:
          "https://registry.npmjs.org/mdast-util-from-markdown/-/mdast-util-from-markdown-2.0.3.tgz",
        integrity:
          "sha512-W4mAWTvSlKvf8L6J+VN9yLSqQ9AOAAvHuoDAmPkz4dHf553m5gVj2ejadHJhoJmcmxEnOv6Pa8XJhpxE93kb8Q==",
        implementationPath: "mdast-util-from-markdown/lib/index.js",
        implementationBytes: 29_022,
        implementationHash:
          "sha256:2b19a9873232679ef08429e08c5836c865a54d8113ae5d58cb9409a60863727b",
      }),
    ]),
    mdastEntry: Object.freeze({
      path: "mdast-util-from-markdown/index.js",
      bytes: 89,
      hash:
        "sha256:b5ac1d75a898f7e28ae90ce26ab937b5f574bd5b4e8c17745bd15ba78a4a33f5",
    }),
    mdastLibrary: Object.freeze({
      path: "mdast-util-from-markdown/lib/index.js",
      bytes: 29_022,
      hash:
        "sha256:2b19a9873232679ef08429e08c5836c865a54d8113ae5d58cb9409a60863727b",
    }),
    mdastManifest: Object.freeze({
      path: "mdast-util-from-markdown/package.json",
      bytes: 2_839,
      hash:
        "sha256:4f7c4700c78d6781af46eb12b2f908b0503d8beefa8b2cea0fbfe9de8444e438",
    }),
    cardinalNodeCensus: PUBLISHER_OFFLINE_MARKDOWN_PARSER_NODE_CENSUS,
  });

export type PublisherOfflineMarkdownParserEvidence =
  typeof PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE;

export type PublisherOfflineInlineSemanticTextNode = Readonly<{
  type: "text";
  value: string;
}>;

export type PublisherOfflineInlineSemanticElementNode = Readonly<{
  type: "element";
  tagName:
    | "p"
    | "blockquote"
    | "ul"
    | "ol"
    | "li"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "hr"
    | "em"
    | "strong"
    | "code"
    | "br"
    | "a";
  attributes: readonly (readonly [string, string])[];
  children: readonly PublisherOfflineInlineSemanticNode[];
}>;

export type PublisherOfflineInlineSemanticNode =
  | PublisherOfflineInlineSemanticTextNode
  | PublisherOfflineInlineSemanticElementNode;

export type PublisherOfflineDocumentLinkProjection = Readonly<{
  href: string;
  label: string;
}>;

export type PublisherOfflineDirectChildProjection = Readonly<{
  tagName: string;
  className: string;
  ownedBlockIds: readonly string[];
}>;

export type PublisherOfflineHeadingWrapperProjection = Readonly<{
  tagName: "div";
  className: "publisher-linkable-heading";
  text: string;
  directChildren: readonly PublisherOfflineDirectChildProjection[];
  actions: readonly Readonly<{
    tagName: "button";
    className: "publisher-heading-action";
    hidden: true;
    transient: "true";
    href: string;
    ariaLabel: string;
    title: "Copy link";
    buttonType: "button";
    iconCount: 1;
    iconTagName: "svg";
  }>[];
}>;

export type PublisherOfflineBreadcrumbProjection = Readonly<{
  tagName: "nav";
  className: "publisher-breadcrumbs";
  ariaLabel: "Breadcrumb";
  listCount: 1;
  listTagName: "ol";
  items: readonly Readonly<{
    containerTagName: "li";
    childCount: 1;
    tagName: "a" | "span";
    href: string | null;
    ariaCurrent: "page" | null;
    text: string;
  }>[];
}>;

export type PublisherOfflineSectionNavigationProjection = Readonly<{
  tagName: "nav";
  className: "publisher-section-navigation";
  ariaLabel: "Section navigation";
  language: "en";
  slots: readonly Readonly<{
    tagName: "a" | "span";
    href: string | null;
    text: string;
    titleSpanCount: 0 | 1;
    titleLanguage: string | null;
    title: string | null;
  }>[];
}>;

export type PublisherOfflineDocumentBlockProjection = Readonly<{
  id: string;
  kind: string;
  tagName: string;
  className: string;
  domId: string | null;
  headingLevel: number | null;
  listTagName: "ul" | "ol" | null;
  workOwnerId: string | null;
  sectionOwnerId: string | null;
  text: string;
  textSegments: readonly string[];
  directChildTagNames: readonly string[];
  directChildClassNames: readonly string[];
  primarySemanticChildTagName: "p" | "blockquote" | null;
  primarySemanticChildClassName: "" | null;
  primarySemanticChildText: string | null;
  primarySemanticChildCount: 0 | 1;
  headingWrappers: readonly PublisherOfflineHeadingWrapperProjection[];
  prohibitedVisualElementCount: 0;
  unexpectedDescendantClassCount: 0;
  inlineSemantics: PublisherOfflineInlineSemanticElementNode;
  links: readonly PublisherOfflineDocumentLinkProjection[];
}>;

export type PublisherOfflineDocumentDomProjection = Readonly<{
  documentElementTagName: "html";
  documentLanguage: string;
  headCount: 1;
  headIsDirectDocumentElementChild: true;
  bodyCount: 1;
  bodyIsDirectDocumentElementChild: true;
  nextStreamingPlaceholderCount: 1;
  nextStreamingPlaceholderTagName: "div";
  nextStreamingPlaceholderIsDirectFirstBodyElement: true;
  nextStreamingPlaceholderAttributes: readonly (readonly [string, string])[];
  nextStreamingPlaceholderSerializedChildCount: 0;
  nextStreamingPlaceholderStructuralDriftCount: 0;
  bodyVisibleSiblingCount: 0;
  bodyDirectText: readonly string[];
  rootCount: 1;
  rootTagName: "div";
  rootClassName: "publisher-root";
  rootIsDirectBodyChild: true;
  rootDirectChildren: readonly PublisherOfflineDirectChildProjection[];
  mainCount: 1;
  mainId: "publisher:main";
  mainClassName: "";
  mainIsDirectRootChild: true;
  mainDirectChildren: readonly PublisherOfflineDirectChildProjection[];
  unownedDirectText: readonly string[];
  allOwnedByRoot: true;
  allOwnedByMain: true;
  pageKind: "home" | "work" | "section";
  titleCount: 1;
  title: string;
  titleWrapperCount: 0 | 1;
  titleWrappers: readonly PublisherOfflineHeadingWrapperProjection[];
  readerRailCount: 1;
  readerRailActionCount: 1;
  readerRailProgressAriaLabel: "Publication tools" | "0% read";
  readerRailProgressText: "§";
  readerRailStructuralDriftCount: 0;
  readerRailProjectionHash: typeof PUBLISHER_OFFLINE_EXPECTED_READER_RAIL_HASH;
  dormantNarrationAudioHostCount: 1;
  dormantNarrationAudioElementCount: 1;
  dormantNarrationAudioStructuralDriftCount: 0;
  dormantNarrationAudioHostStyleMatchesRoot: true;
  dormantNarrationAudioProjectionHash:
    typeof PUBLISHER_OFFLINE_EXPECTED_DORMANT_AUDIO_SHELL_HASH;
  unexpectedMediaElementCount: 0;
  declarativeShadowDomTemplateCount: 0;
  styleElementCount: 0;
  unsafeHeadElementCount: 0;
  nonLiveSemanticContainerCount: 0;
  semanticInlineStyleCount: 0;
  inlineEventHandlerAttributeCount: 0;
  explicitSemanticRoleCount: 0;
  unexpectedSemanticDirectionCount: 0;
  unexpectedSemanticLanguageAttributeCount: 0;
  unexpectedPresentationalHintCount: 0;
  unexpectedSemanticClassCount: 0;
  unexpectedInteractiveElementCount: 0;
  unexpectedSemanticAriaAttributeCount: 0;
  unexpectedMainAnchorAttributeCount: 0;
  plainSemanticInlineDriftCount: 0;
  fixedIdentityDriftCount: 0;
  publicationDescriptionCount: 0 | 1;
  publicationDescriptionTagName: "p" | null;
  publicationDescription: string | null;
  homeCollectionSectionCount: 0;
  homeCollectionCardCount: 0;
  homeWorksSectionCount: 0 | 1;
  homeWorksSections: readonly Readonly<{
    tagName: "section";
    ariaLabelledBy: "publisher-works-heading";
    headingCount: 1;
    heading: Readonly<{
      tagName: "h2";
      id: "publisher-works-heading";
      language: "en";
      text: "Works";
    }>;
    listCount: 1;
    listTagName: "ol";
    listClassName: "publisher-catalog";
    directChildren: readonly PublisherOfflineDirectChildProjection[];
    cards: readonly Readonly<{
      route: string;
      tagName: "li";
      language: string;
      headingCount: 1;
      headingTagName: "h3";
      headingText: string;
      headingDirectChildren: readonly PublisherOfflineDirectChildProjection[];
      routeLinkCount: 1;
      title: string;
      details: readonly string[];
      readingStatCount: 1;
      readingStatTagName: "p";
      readingStatLanguage: "en";
      wordCount: number;
      readingMinutes: number;
      readingStat: string;
      directChildren: readonly PublisherOfflineDirectChildProjection[];
    }>[];
  }>[];
  breadcrumbNavigationCount: 0 | 1;
  breadcrumbs: readonly PublisherOfflineBreadcrumbProjection[];
  sectionNavigationCount: 0 | 1;
  sectionNavigations: readonly PublisherOfflineSectionNavigationProjection[];
  workOwners: readonly Readonly<{
    id: string;
    tagName: "article";
    className: "";
    language: string;
    subtitleCount: 0 | 1;
    subtitle: string | null;
    summaryCount: 0 | 1;
    summary: string | null;
    headerDirectChildren: readonly PublisherOfflineDirectChildProjection[];
    articleDirectChildren: readonly PublisherOfflineDirectChildProjection[];
    manuscriptDirectChildren: readonly PublisherOfflineDirectChildProjection[];
  }>[];
  sectionOwners: readonly Readonly<{
    id: string;
    tagName: "section";
    className: "publisher-manuscript-section";
    domId: string | null;
    directChildren: readonly PublisherOfflineDirectChildProjection[];
    titleHeadingCount: 0 | 1;
    titleHeading: Readonly<{
      tagName: "h2" | "h3" | "h4" | "h5" | "h6";
      text: string;
      blockId: string | null;
      wrapped: boolean;
      wrappers: readonly PublisherOfflineHeadingWrapperProjection[];
    }> | null;
  }>[];
  blocks: readonly PublisherOfflineDocumentBlockProjection[];
  links: readonly PublisherOfflineDocumentLinkProjection[];
  ownedDomIdOccurrences: readonly string[];
}>;

export type PublisherOfflineHtmlTreeTextNode = Readonly<{
  type: "text";
  value: string;
}>;

export type PublisherOfflineHtmlTreeElementNode = Readonly<{
  type: "element";
  tagName: string;
  attributes: readonly (readonly [string, string])[];
  children: readonly PublisherOfflineHtmlTreeNode[];
}>;

export type PublisherOfflineHtmlTreeNode =
  | PublisherOfflineHtmlTreeTextNode
  | PublisherOfflineHtmlTreeElementNode;

export type PublisherOfflineHtmlDocumentTree = Readonly<{
  root: PublisherOfflineHtmlTreeElementNode;
  nodeCount: number;
  maximumDepth: number;
  attributeCount: number;
  attributeCodeUnits: number;
  textCodeUnits: number;
}>;

export type PublisherOfflineDocumentHostStyleProjection = Readonly<{
  rootThemeStyleDeclarations: readonly (readonly [string, string])[];
  rootThemeStyleHash: string;
  stylesheetHrefs: readonly string[];
  stylesheetHrefsHash: string;
}>;

export type PublisherOfflineDocumentSemanticAuthority = Readonly<{
  readerBuildId: typeof PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID;
  href: string;
  resolvedHref: string;
  routeTarget: Readonly<Record<string, string>>;
  readerBlockOwners: readonly Readonly<{
    blockId: string;
    sectionId: string;
    kind: string;
    text: string;
    textSegments: readonly string[];
    inlineSemantics: PublisherOfflineInlineSemanticElementNode;
  }>[];
  readerHomeWorkCards: readonly Readonly<{
    workId: string;
    route: string;
    subtitle: string | null;
    summary: string | null;
  }>[];
  expectedDom: PublisherOfflineDocumentDomProjection;
}>;

export type PublisherOfflineSemanticReceiptRow = Readonly<{
  href: string;
  kind: ReaderOfflineResourceKind | "discovered";
  bytes: number;
  status: number;
  contentType: string;
  responseHref: string;
  redirected: false;
  identity: "semantic-dom";
  resolvedHref: string;
  routeTargetKind: "home" | "work" | "section";
  workId: string | null;
  sectionId: string | null;
  blockCount: number;
  linkCount: number;
  semanticHash: string;
}>;

export type PublisherOfflineByteReceiptRow = Readonly<{
  href: string;
  kind: ReaderOfflineResourceKind | "discovered";
  bytes: number;
  status: number;
  contentType: string;
  responseHref: string;
  redirected: false;
  identity: "bytes";
  hash: string;
}>;

export type PublisherOfflineCacheReceiptRow =
  | PublisherOfflineSemanticReceiptRow
  | PublisherOfflineByteReceiptRow;

export type PublisherOfflineCacheReceipt = Readonly<{
  responseCount: number;
  declaredResourceCount: 18;
  discoveredResourceCount: number;
  declaredResourceHrefs: readonly string[];
  discoveredResourceHrefs: readonly string[];
  totalBytes: number;
  maximumResponseBytes: typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES;
  maximumTotalBytes: typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES;
  rawHtmlHashCount: 0;
  semanticDocumentCount: number;
  themeTokensHash: typeof PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH;
  rootThemeStyleHash: typeof PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH;
  stylesheetCount: number;
  stylesheetHrefs: readonly string[];
  stylesheetHrefsHash:
    typeof PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH;
  compiledCssHash: typeof PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH;
  hash: string;
  rows: readonly PublisherOfflineCacheReceiptRow[];
}>;

export type PublisherOfflineBrowserEvidence = Readonly<{
  proofSchemaVersion: "1.0";
  browserEngine: "chromium";
  playwrightVersion: typeof PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION;
  browserVersion: typeof PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION;
  browserSource: "bundled Playwright Chromium";
  serviceWorkers: "allow";
  persistentProfile: false;
  preRegistrationCount: 0;
  preInstallCleanBoundaryCount: 2;
  preInstallMetadataRequestCount: 0;
  preInstallPackageCacheCount: 0;
  preInstallCurrentRuntimeCacheCount: 0;
  preInstallSeededCoherenceCacheCount: 5;
  preInstallSeededStaleRuntimeCacheCount: 2;
  controlledRegistrationCount: 1;
  serviceWorkerScopeRoot: true;
  serviceWorkerActiveState: "activated";
  serviceWorkerControllerState: "activated";
  serviceWorkerInstallingState: "absent";
  serviceWorkerWaitingState: "absent";
  serviceWorkerControllerIsActiveWorker: true;
  publisherRegistrationCount: 0;
  publisherCacheCount: 0;
  contextClosed: true;
  browserClosed: true;
  catalog: PublisherOfflineCatalogEvidence;
  worker: PublisherOfflineWorkerEvidence;
  markdownParser: PublisherOfflineMarkdownParserEvidence;
  installedWorkId: typeof CARDINAL_SCALE_WORK_ID;
  installedRoute: string;
  declaredInstalledResourceCount: 18;
  failedReplacementPreservedPointer: true;
  failedReplacementPreservedCache: true;
  failedReplacementRemovedStagingCache: true;
  inFlightReplacementPreservedPointer: true;
  inFlightReplacementPreservedCache: true;
  inFlightStagingCacheCount: 1;
  replacementFailureHitCount: 1;
  replacementFailurePromiseReleased: true;
  replacementFailureFetchRestored: true;
  replacementFailureHref: string;
  successfulReplacementSwitchedPointer: true;
  successfulReplacementDeletedPriorCache: true;
  coherenceCacheNames: readonly string[];
  coherenceCacheSnapshotHash: string;
  coherenceCachesPreserved: true;
  coherenceCachesPreservedAfterCleanup: true;
  coherenceSnapshotBoundaryCount: 6;
  activePackageStateBoundaryCount: 3;
  packageStateMaximumResponseBytes:
    typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES;
  packageStateMaximumAggregateBytes:
    typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES;
  metadataSharesPackageStateAggregate: true;
  postBehaviorPackageStatePreserved: true;
  postColdPackageStatePreserved: true;
  stalePublisherRuntimeCachesDeleted: true;
  browserHttpCacheCleared: true;
  browserHttpCacheClearedBeforeOfflineCutoff: true;
  runtimeCacheEntryCountBeforeCold: 0;
  runtimeCacheEntryCountAfterCold: 0;
  coldOfflineFreshPage: true;
  offlineReaderTextPresent: true;
  coldTextVisibilityBoundaryCount: 2;
  allColdBlockTextNodesVisible: true;
  allColdBlockTextRunsPositiveGeometry: true;
  dormantAudioShellBoundaryCount: 2;
  dormantAudioShellVerified: true;
  unexpectedColdMediaElementCount: 0;
  offlineSearchResultCount: number;
  offlineSameOriginFullNavigation: true;
  excludedRequestCount: 8;
  excludedRequestsRejected: true;
  offlineRangeInstalledRequestRejected: true;
  rangeResponseStatus: 206;
  rangeResponseBytes: 32;
  rangeResponseNotRuntimeCached: true;
  cacheReceipt: PublisherOfflineCacheReceipt;
  publishedAudio: "absent";
  dormantAudioRuntime: "present-inert";
  audioActivation: "not exercised";
  nativeInstallability: "not asserted";
  currentPublicRoutes: "untouched";
}>;

export type PublisherOfflineBrowserRunnerInput = Readonly<{
  baseUrl: string;
  projection: PublisherThemeHostReaderProjection;
  probe: unknown;
  signal: AbortSignal;
}>;

export type PublisherOfflineBrowserRunner = (
  input: PublisherOfflineBrowserRunnerInput,
) => Promise<PublisherOfflineBrowserEvidence>;

export type PublisherOfflineHostProofSummary = Readonly<{
  proofScope: "isolated Publisher offline browser host";
  contentParity: "not asserted";
  nativeInstallability: "not asserted";
  publishedAudio: "absent";
  dormantAudioRuntime: "present-inert";
  audioActivation: "not exercised";
  currentPublicRoutes: "untouched";
  publicationId: typeof EXPECTED_PUBLICATION_ID;
  readerBuildId: typeof PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID;
  adaptedApplicationBuildId: string;
  rendererBuildId: typeof PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID;
  applicationArtifactHash:
    typeof PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH;
  contentBuildId: string;
  contentEvidenceHash: string;
  catalog: PublisherOfflineCatalogEvidence;
  worker: PublisherOfflineWorkerEvidence;
  markdownParser: PublisherOfflineMarkdownParserEvidence;
  browser: Readonly<{
    engine: "chromium";
    playwrightVersion: typeof PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION;
    version: typeof PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION;
    source: "bundled Playwright Chromium";
    serviceWorkers: "allow";
    persistentProfile: false;
    closed: true;
  }>;
  installedWorkId: typeof CARDINAL_SCALE_WORK_ID;
  replacementFailureHref: string;
  explicitInstallCausalityVerified: true;
  serviceWorkerLifecycleVerified: true;
  rollbackVerified: true;
  inFlightAtomicPointerVerified: true;
  atomicReplacementVerified: true;
  coherenceCachesPreserved: true;
  coldOfflineReaderVerified: true;
  coldOfflineTextVisibilityVerified: true;
  packageStateDurabilityVerified: true;
  offlineSearchVerified: true;
  offlineSameOriginNavigationVerified: true;
  excludedRequestsVerified: true;
  rangeAnd206CachingVerified: true;
  cacheReceipt: PublisherOfflineCacheReceipt;
  browserEvidenceHash: string;
  crossRunSemanticEvidenceHash: string;
  generatedHostCleanup: "completed";
}>;

type JsonRecord = Record<string, unknown>;

function sha256Bytes(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashJson(value: unknown): string {
  return sha256Bytes(canonicalizeJson(value as JSONValue));
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function assertExactKeys(
  value: JsonRecord,
  keys: readonly string[],
  label: string,
): void {
  if (!isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    throw new TypeError(`${label} fields drifted.`);
  }
}

function requiredString(
  value: JsonRecord,
  key: string,
  label: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new TypeError(`${label} ${key} must be a nonempty string.`);
  }
  return field;
}

function assertSha256(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} is not a SHA-256 identity.`);
  }
}

function publicHref(value: string, label: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("#") ||
    /(?:^|\/)\.{1,2}(?:\/|$)/u.test(value) ||
    /%2e/iu.test(value)
  ) {
    throw new TypeError(`${label} is not a safe publication href.`);
  }
  const parsed = new URL(value, "https://publisher.invalid");
  if (`${parsed.pathname}${parsed.search}` !== value) {
    throw new TypeError(`${label} is not a canonical publication href.`);
  }
  return value;
}

const PUBLISHER_OFFLINE_REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PUBLISHER_OFFLINE_NODE_MODULES_ROOT = path.join(
  PUBLISHER_OFFLINE_REPO_ROOT,
  "node_modules",
);

function isStrictlyInsidePath(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function readStableReviewedFile(
  filePath: string,
  containingRoot: string,
  label: string,
): Buffer {
  const absolute = path.resolve(filePath);
  const root = path.resolve(containingRoot);
  if (!isStrictlyInsidePath(absolute, root)) {
    throw new TypeError(`${label} escaped its authority root.`);
  }
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TypeError(`${label} authority root drifted.`);
  }
  let current = root;
  for (const segment of path.relative(root, absolute).split(path.sep)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new TypeError(`${label} crossed a symbolic link.`);
    }
  }
  const initial = fs.lstatSync(absolute);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1) {
    throw new TypeError(`${label} must be one regular nonlinked file.`);
  }
  const descriptor = fs.openSync(
    absolute,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fs.fstatSync(descriptor);
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.byteLength !== before.size
    ) {
      throw new TypeError(`${label} changed while it was read.`);
    }
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function readReviewedJsonRecord(
  filePath: string,
  containingRoot: string,
  label: string,
): JsonRecord {
  const value: unknown = JSON.parse(
    readStableReviewedFile(filePath, containingRoot, label).toString("utf8"),
  );
  return asRecord(value, label);
}

function markdownParserLockProjection(
  lock: JsonRecord,
  label: string,
): readonly JsonRecord[] {
  const packages = asRecord(lock.packages, `${label} packages`);
  return Object.freeze(PUBLISHER_OFFLINE_MARKDOWN_PARSER_LOCK_PATHS.map(
    (entryPath) => Object.freeze({
      path: entryPath,
      ...asRecord(packages[entryPath], `${label} ${entryPath}`),
    }),
  ));
}

function assertExactResolvedPath(
  actual: string,
  expectedRelativePath: string,
  label: string,
): string {
  const expected = path.join(PUBLISHER_OFFLINE_REPO_ROOT, expectedRelativePath);
  const actualReal = fs.realpathSync(actual);
  const expectedReal = fs.realpathSync(expected);
  if (
    actualReal !== expectedReal ||
    !isStrictlyInsidePath(actualReal, PUBLISHER_OFFLINE_NODE_MODULES_ROOT)
  ) {
    throw new TypeError(
      `${label} resolved outside its reviewed package: ` +
      `${path.relative(PUBLISHER_OFFLINE_REPO_ROOT, actualReal)} instead of ` +
      `${path.relative(PUBLISHER_OFFLINE_REPO_ROOT, expectedReal)}.`,
    );
  }
  return actualReal;
}

function assertReviewedMarkdownParserConditionalEntry(
  actual: string,
  label: string,
): string {
  const actualReal = fs.realpathSync(actual);
  const reviewedEntries = [
    "node_modules/mdast-util-from-markdown/index.js",
    "node_modules/mdast-util-from-markdown/dev/index.js",
  ].map((relativePath) => fs.realpathSync(path.join(
    PUBLISHER_OFFLINE_REPO_ROOT,
    relativePath,
  )));
  if (
    !reviewedEntries.includes(actualReal) ||
    !isStrictlyInsidePath(actualReal, PUBLISHER_OFFLINE_NODE_MODULES_ROOT)
  ) {
    throw new TypeError(
      `${label} did not resolve to the reviewed top-level parser package.`,
    );
  }
  return actualReal;
}

type PublisherOfflineFromMarkdown = (markdown: string) => unknown;
type PublisherOfflineApplyReaderLinksToMarkdown = (
  block: PublicationReaderEnvelope["works"][number]["sections"][number]["blocks"][number],
  links: readonly ReaderBlockMarkdownLink[],
) => Readonly<{
  valid: boolean;
  value?: string;
}>;

type InspectedMarkdownParserAuthority = Readonly<{
  evidence: PublisherOfflineMarkdownParserEvidence;
  entryPath: string;
  readerMarkdownEntryPath: string;
}>;

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveInstalledDependencyRoot(
  importerRoot: string,
  dependencyName: string,
): string {
  let current = path.resolve(importerRoot);
  while (true) {
    const candidate = path.join(
      current,
      "node_modules",
      ...dependencyName.split("/"),
    );
    const manifest = path.join(candidate, "package.json");
    if (fs.existsSync(manifest)) {
      const real = fs.realpathSync(candidate);
      if (!isStrictlyInsidePath(real, PUBLISHER_OFFLINE_NODE_MODULES_ROOT)) {
        throw new TypeError(
          `Publisher offline Markdown dependency ${dependencyName} escaped node_modules.`,
        );
      }
      return real;
    }
    const parent = path.dirname(current);
    if (parent === current || !isStrictlyInsidePath(
      current,
      PUBLISHER_OFFLINE_REPO_ROOT,
    )) {
      throw new TypeError(
        `Publisher offline Markdown dependency ${dependencyName} is unresolved.`,
      );
    }
    current = parent;
  }
}

function inspectMarkdownParserDependencyClosure(
  startRelativePath = "mdast-util-from-markdown",
): Readonly<{
  packageCount: number;
  fileCount: number;
  totalBytes: number;
  canonicalBytes: number;
  hash: string;
}> {
  const pending = [path.join(
    PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
    startRelativePath,
  )];
  const seen = new Set<string>();
  const packages: Array<Readonly<{
    name: string;
    version: string;
    path: string;
  }>> = [];
  const files: Array<Readonly<{
    path: string;
    bytes: number;
    hash: string;
  }>> = [];
  let totalBytes = 0;
  while (pending.length > 0) {
    const packageRoot = fs.realpathSync(pending.shift() as string);
    if (seen.has(packageRoot)) continue;
    seen.add(packageRoot);
    if (!isStrictlyInsidePath(packageRoot, PUBLISHER_OFFLINE_NODE_MODULES_ROOT)) {
      throw new TypeError(
        "Publisher offline Markdown dependency package escaped node_modules.",
      );
    }
    const packageStat = fs.lstatSync(packageRoot);
    if (!packageStat.isDirectory() || packageStat.isSymbolicLink()) {
      throw new TypeError(
        "Publisher offline Markdown dependency package is not a real directory.",
      );
    }
    const manifest = readReviewedJsonRecord(
      path.join(packageRoot, "package.json"),
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      "Publisher offline Markdown dependency manifest",
    );
    const name = requiredString(
      manifest,
      "name",
      "Publisher offline Markdown dependency manifest",
    );
    const version = requiredString(
      manifest,
      "version",
      "Publisher offline Markdown dependency manifest",
    );
    packages.push(Object.freeze({
      name,
      version,
      path: path.relative(PUBLISHER_OFFLINE_NODE_MODULES_ROOT, packageRoot),
    }));
    const dependenciesValue = manifest.dependencies;
    if (dependenciesValue !== undefined) {
      const dependencies = asRecord(
        dependenciesValue,
        `${name} runtime dependencies`,
      );
      for (const dependencyName of Object.keys(dependencies).sort(
        codePointCompare,
      )) {
        if (typeof dependencies[dependencyName] !== "string") {
          throw new TypeError(`${name} runtime dependency drifted.`);
        }
        pending.push(resolveInstalledDependencyRoot(packageRoot, dependencyName));
      }
    }
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" && entry.isDirectory()) continue;
        const entryPath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          throw new TypeError(
            "Publisher offline Markdown dependency closure contains a symbolic link.",
          );
        }
        if (entry.isDirectory()) {
          visit(entryPath);
          continue;
        }
        if (!entry.isFile()) {
          throw new TypeError(
            "Publisher offline Markdown dependency closure contains a special file.",
          );
        }
        const bytes = readStableReviewedFile(
          entryPath,
          PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
          "Publisher offline Markdown dependency source",
        );
        totalBytes += bytes.byteLength;
        if (!Number.isSafeInteger(totalBytes)) {
          throw new TypeError(
            "Publisher offline Markdown dependency source size overflowed.",
          );
        }
        files.push(Object.freeze({
          path: path.relative(PUBLISHER_OFFLINE_NODE_MODULES_ROOT, entryPath),
          bytes: bytes.byteLength,
          hash: sha256Bytes(bytes),
        }));
      }
    };
    visit(packageRoot);
  }
  packages.sort((left, right) => codePointCompare(left.path, right.path));
  files.sort((left, right) => codePointCompare(left.path, right.path));
  const basis = Object.freeze({
    packages: Object.freeze(packages),
    files: Object.freeze(files),
  });
  const canonicalBytes = Buffer.byteLength(canonicalizeJson(basis as JSONValue));
  return Object.freeze({
    packageCount: packages.length,
    fileCount: files.length,
    totalBytes,
    canonicalBytes,
    hash: hashJson(basis),
  });
}

function inspectPublisherOfflineMarkdownParserAuthority():
  InspectedMarkdownParserAuthority {
  const publicationLock = readReviewedJsonRecord(
    path.join(PUBLISHER_OFFLINE_REPO_ROOT, "package-lock.json"),
    PUBLISHER_OFFLINE_REPO_ROOT,
    "Publisher offline publication package lock",
  );
  const installedLock = readReviewedJsonRecord(
    path.join(PUBLISHER_OFFLINE_NODE_MODULES_ROOT, ".package-lock.json"),
    PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
    "Publisher offline installed package lock",
  );
  const publicationRows = markdownParserLockProjection(
    publicationLock,
    "Publisher offline publication package lock",
  );
  const installedRows = markdownParserLockProjection(
    installedLock,
    "Publisher offline installed package lock",
  );
  if (
    Buffer.byteLength(canonicalizeJson(publicationRows as JSONValue)) !==
      2_708 ||
    Buffer.byteLength(canonicalizeJson(installedRows as JSONValue)) !== 2_708 ||
    hashJson(publicationRows) !==
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_LOCK_HASH ||
    hashJson(installedRows) !==
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_LOCK_HASH ||
    !isDeepStrictEqual(publicationRows, installedRows) ||
    Buffer.byteLength(canonicalizeJson({
      installedLock: installedRows,
      publicationLock: publicationRows,
    } as JSONValue)) !== 5_453 ||
    hashJson({
      installedLock: installedRows,
      publicationLock: publicationRows,
    }) !== PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_COMBINED_LOCK_HASH
  ) {
    throw new TypeError("Publisher offline Markdown parser lock authority drifted.");
  }

  const packageRoots = [
    "node_modules/@genii-foundation/publisher-next",
    "node_modules/react-markdown",
    "node_modules/remark-parse",
    "node_modules/mdast-util-from-markdown",
  ] as const;
  const dependencyEdges = [
    ["react-markdown", "10.1.0"],
    ["remark-parse", "^11.0.0"],
    ["mdast-util-from-markdown", "^2.0.0"],
    [null, null],
  ] as const;
  const sourceRows: Array<Readonly<{
    path: string;
    bytes: number;
    hash: string;
  }>> = [];
  for (const [index, expectedPackage] of
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.packages.entries()) {
    const packageRoot = path.join(
      PUBLISHER_OFFLINE_REPO_ROOT,
      packageRoots[index] as string,
    );
    const manifestPath = path.join(packageRoot, "package.json");
    const manifestBytes = readStableReviewedFile(
      manifestPath,
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      `${expectedPackage.name} package manifest`,
    );
    const manifest = asRecord(
      JSON.parse(manifestBytes.toString("utf8")) as unknown,
      `${expectedPackage.name} package manifest`,
    );
    const lockRecord = publicationRows[index];
    const dependency = dependencyEdges[index];
    if (dependency === undefined) {
      throw new TypeError(
        "Publisher offline Markdown parser dependency authority drifted.",
      );
    }
    const dependencies = asRecord(
      manifest.dependencies,
      `${expectedPackage.name} package dependencies`,
    );
    const resolved = requiredString(
      lockRecord as JsonRecord,
      "resolved",
      `${expectedPackage.name} lock record`,
    );
    const normalizedSource = resolved.startsWith("file:")
      ? resolved.slice("file:".length)
      : resolved;
    if (
      manifest.name !== expectedPackage.name ||
      manifest.version !== expectedPackage.version ||
      normalizedSource !== expectedPackage.source ||
      lockRecord?.integrity !== expectedPackage.integrity ||
      (dependency[0] !== null &&
        dependencies[dependency[0]] !== dependency[1])
    ) {
      throw new TypeError(
        `Publisher offline Markdown parser package ${expectedPackage.name} drifted.`,
      );
    }
    const implementationPath = path.join(
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      expectedPackage.implementationPath,
    );
    const implementationBytes = readStableReviewedFile(
      implementationPath,
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      `${expectedPackage.name} renderer implementation`,
    );
    if (
      implementationBytes.byteLength !== expectedPackage.implementationBytes ||
      sha256Bytes(implementationBytes) !== expectedPackage.implementationHash
    ) {
      throw new TypeError(
        `Publisher offline Markdown parser source ${expectedPackage.name} drifted.`,
      );
    }
    sourceRows.push(Object.freeze({
      path: expectedPackage.implementationPath,
      bytes: implementationBytes.byteLength,
      hash: sha256Bytes(implementationBytes),
    }));
  }
  if (hashJson(sourceRows) !== PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_SOURCE_HASH) {
    throw new TypeError("Publisher offline Markdown parser source closure drifted.");
  }
  const dependencyClosure = inspectMarkdownParserDependencyClosure();
  if (!isDeepStrictEqual(
    dependencyClosure,
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.dependencyClosure,
  )) {
    throw new TypeError(
      "Publisher offline Markdown parser dependency closure drifted.",
    );
  }

  const nextEntry = assertExactResolvedPath(
    fileURLToPath(import.meta.resolve("@genii-foundation/publisher-next")),
    "node_modules/@genii-foundation/publisher-next/dist/index.js",
    "Publisher Next entry",
  );
  const nextMarkdownEntry = assertExactResolvedPath(
    path.join(path.dirname(nextEntry), "components/markdown.js"),
    "node_modules/@genii-foundation/publisher-next/dist/components/markdown.js",
    "Publisher Next Markdown renderer",
  );
  const reactMarkdownEntry = assertExactResolvedPath(
    createRequire(nextMarkdownEntry).resolve("react-markdown"),
    "node_modules/react-markdown/index.js",
    "react-markdown entry",
  );
  const remarkParseEntry = assertExactResolvedPath(
    createRequire(reactMarkdownEntry).resolve("remark-parse"),
    "node_modules/remark-parse/index.js",
    "remark-parse entry",
  );
  const mdastConditionalEntry = assertReviewedMarkdownParserConditionalEntry(
    createRequire(remarkParseEntry).resolve("mdast-util-from-markdown"),
    "mdast-util-from-markdown entry",
  );
  const proofMdastConditionalEntry = assertReviewedMarkdownParserConditionalEntry(
    createRequire(import.meta.url).resolve("mdast-util-from-markdown"),
    "Publisher offline proof Markdown parser entry",
  );
  const mdastEntry = assertExactResolvedPath(
    path.join(
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.mdastLibrary.path,
    ),
    `node_modules/${PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.mdastLibrary.path}`,
    "mdast-util-from-markdown reviewed implementation",
  );
  const readerMarkdownEntry = assertExactResolvedPath(
    path.join(
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      "@genii-foundation/publisher-reader/dist/markdown.js",
    ),
    "node_modules/@genii-foundation/publisher-reader/dist/markdown.js",
    "Publisher Reader Markdown entry",
  );
  const readerMarkdownBytes = readStableReviewedFile(
    readerMarkdownEntry,
    PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
    "Publisher Reader Markdown link application",
  );
  if (
    readerMarkdownBytes.byteLength !==
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE
        .readerLinkApplication.bytes ||
    sha256Bytes(readerMarkdownBytes) !==
      PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE
        .readerLinkApplication.hash
  ) {
    throw new TypeError(
      "Publisher Reader Markdown link application source drifted.",
    );
  }
  const readerSourceClosure =
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE
      .readerLinkApplication.sourceClosure;
  const readerSourceRows = readerSourceClosure.files.map((artifact) => {
    const bytes = readStableReviewedFile(
      path.join(PUBLISHER_OFFLINE_NODE_MODULES_ROOT, artifact.path),
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      `Publisher Reader Markdown source ${artifact.path}`,
    );
    if (
      bytes.byteLength !== artifact.bytes ||
      sha256Bytes(bytes) !== artifact.hash
    ) {
      throw new TypeError(
        `Publisher Reader Markdown source ${artifact.path} drifted.`,
      );
    }
    return Object.freeze({
      path: artifact.path,
      bytes: bytes.byteLength,
      hash: sha256Bytes(bytes),
    });
  });
  const readerSourceCanonical = canonicalizeJson(readerSourceRows as JSONValue);
  if (
    readerSourceRows.length !== readerSourceClosure.fileCount ||
    readerSourceRows.reduce((sum, row) => sum + row.bytes, 0) !==
      readerSourceClosure.totalBytes ||
    Buffer.byteLength(readerSourceCanonical) !==
      readerSourceClosure.canonicalBytes ||
    sha256Bytes(readerSourceCanonical) !== readerSourceClosure.hash
  ) {
    throw new TypeError(
      "Publisher Reader Markdown executable source closure drifted.",
    );
  }
  const readerDependencyClosure = inspectMarkdownParserDependencyClosure(
    "@genii-foundation/publisher-reader/node_modules/mdast-util-from-markdown",
  );
  if (!isDeepStrictEqual(
    readerDependencyClosure,
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE
      .readerLinkApplication.dependencyClosure,
  )) {
    throw new TypeError(
      "Publisher Reader Markdown link application dependency closure drifted.",
    );
  }
  const readerBundledMdastEntry = fs.realpathSync(
    createRequire(readerMarkdownEntry).resolve("mdast-util-from-markdown"),
  );
  const reviewedReaderBundledEntries = [
    "@genii-foundation/publisher-reader/node_modules/mdast-util-from-markdown/index.js",
    "@genii-foundation/publisher-reader/node_modules/mdast-util-from-markdown/dev/index.js",
  ].map((relativePath) => fs.realpathSync(path.join(
    PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
    relativePath,
  )));
  if (
    mdastConditionalEntry !== proofMdastConditionalEntry ||
    mdastConditionalEntry === mdastEntry ||
    proofMdastConditionalEntry === mdastEntry ||
    mdastConditionalEntry === readerBundledMdastEntry ||
    proofMdastConditionalEntry === readerBundledMdastEntry ||
    readerBundledMdastEntry === mdastEntry ||
    !reviewedReaderBundledEntries.includes(readerBundledMdastEntry)
  ) {
    throw new TypeError("Publisher offline Markdown parser resolution drifted.");
  }

  for (const artifact of [
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.mdastEntry,
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.mdastLibrary,
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.mdastManifest,
  ]) {
    const bytes = readStableReviewedFile(
      path.join(PUBLISHER_OFFLINE_NODE_MODULES_ROOT, artifact.path),
      PUBLISHER_OFFLINE_NODE_MODULES_ROOT,
      `Publisher offline Markdown parser ${artifact.path}`,
    );
    if (bytes.byteLength !== artifact.bytes || sha256Bytes(bytes) !== artifact.hash) {
      throw new TypeError(
        `Publisher offline Markdown parser artifact ${artifact.path} drifted.`,
      );
    }
  }
  const themeHostRunner =
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE.themeHostRunner;
  const themeHostRunnerBytes = readStableReviewedFile(
    path.join(PUBLISHER_OFFLINE_REPO_ROOT, themeHostRunner.path),
    PUBLISHER_OFFLINE_REPO_ROOT,
    "Publisher theme host runner",
  );
  if (
    themeHostRunnerBytes.byteLength !== themeHostRunner.bytes ||
    sha256Bytes(themeHostRunnerBytes) !== themeHostRunner.hash
  ) {
    throw new TypeError("Publisher theme host runner source drifted.");
  }

  return Object.freeze({
    evidence: PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
    entryPath: mdastEntry,
    readerMarkdownEntryPath: readerMarkdownEntry,
  });
}

export function assertPublisherOfflineMarkdownParserEvidence(
  value: unknown,
): asserts value is PublisherOfflineMarkdownParserEvidence {
  if (!isDeepStrictEqual(
    value,
    PUBLISHER_OFFLINE_EXPECTED_MARKDOWN_PARSER_EVIDENCE,
  )) {
    throw new TypeError("Publisher offline Markdown parser evidence drifted.");
  }
}

const initialMarkdownParserAuthority =
  inspectPublisherOfflineMarkdownParserAuthority();
const markdownParserModule: unknown = await import(
  pathToFileURL(initialMarkdownParserAuthority.entryPath).href
);
const markdownParserRecord = asRecord(
  markdownParserModule,
  "Publisher offline Markdown parser module",
);
assertExactKeys(
  markdownParserRecord,
  ["fromMarkdown"],
  "Publisher offline Markdown parser module",
);
if (typeof markdownParserRecord.fromMarkdown !== "function") {
  throw new TypeError("Publisher offline Markdown parser export drifted.");
}
const reviewedFromMarkdown =
  markdownParserRecord.fromMarkdown as PublisherOfflineFromMarkdown;
const readerMarkdownModule: unknown = await import(
  pathToFileURL(initialMarkdownParserAuthority.readerMarkdownEntryPath).href
);
const readerMarkdownRecord = asRecord(
  readerMarkdownModule,
  "Publisher Reader Markdown module",
);
assertExactKeys(
  readerMarkdownRecord,
  ["applyReaderLinksToMarkdown"],
  "Publisher Reader Markdown module",
);
if (typeof readerMarkdownRecord.applyReaderLinksToMarkdown !== "function") {
  throw new TypeError("Publisher Reader Markdown export drifted.");
}
const reviewedApplyReaderLinksToMarkdown =
  readerMarkdownRecord.applyReaderLinksToMarkdown as
    PublisherOfflineApplyReaderLinksToMarkdown;

export function assertPublisherOfflineMarkdownParserAuthority():
  PublisherOfflineMarkdownParserEvidence {
  const current = inspectPublisherOfflineMarkdownParserAuthority();
  if (
    current.entryPath !== initialMarkdownParserAuthority.entryPath ||
    current.readerMarkdownEntryPath !==
      initialMarkdownParserAuthority.readerMarkdownEntryPath ||
    !isDeepStrictEqual(current.evidence, initialMarkdownParserAuthority.evidence)
  ) {
    throw new TypeError("Publisher offline Markdown parser authority changed.");
  }
  return current.evidence;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function resourceCounts(
  resources: readonly Readonly<{ kind: ReaderOfflineResourceKind }>[],
): Record<ReaderOfflineResourceKind, number> {
  const counts: Record<ReaderOfflineResourceKind, number> = {
    document: 0,
    data: 0,
    asset: 0,
    audio: 0,
    timing: 0,
  };
  for (const resource of resources) counts[resource.kind] += 1;
  return counts;
}

function expectedPackage(
  offlinePackage: ReaderOfflinePackage,
): PublisherOfflineExpectedPackage {
  const expected = PUBLISHER_OFFLINE_EXPECTED_PACKAGES.find(
    ({ workId }) => workId === offlinePackage.workId,
  );
  if (expected === undefined) {
    throw new TypeError(
      `Offline catalog contains unexpected work ${offlinePackage.workId}.`,
    );
  }
  return expected;
}

export function assertPublisherOfflineReaderAuthority(
  value: unknown,
): PublicationReaderEnvelope {
  const validation = validatePublicationReaderEnvelope(value);
  if (!validation.valid) {
    throw new TypeError("Publisher offline Reader authority is invalid.");
  }
  const reader = validation.value;
  const cardinal = reader.works.find(({ id }) => id === CARDINAL_SCALE_WORK_ID);
  if (
    reader.publicationId !== EXPECTED_PUBLICATION_ID ||
    reader.buildId !== PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID ||
    reader.works.length !== 9 ||
    reader.routes.active.length !== 583 ||
    reader.routes.redirects.length !== 0 ||
    cardinal === undefined ||
    cardinal.sections.length !== 10 ||
    cardinal.sections.reduce(
      (count, section) => count + section.blocks.length,
      0,
    ) !== 83 ||
    reader.links.some(({ source }) => source.workId === CARDINAL_SCALE_WORK_ID)
  ) {
    throw new TypeError("Publisher offline Reader authority drifted.");
  }
  return reader;
}

export function assertPublisherOfflineCatalogStructure(
  catalog: ReaderOfflineCatalog,
  reader: PublicationReaderEnvelope,
  rendererBuildId: typeof PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID =
    PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
): Omit<
  PublisherOfflineCatalogEvidence,
  | "cacheControl"
  | "bytes"
  | "hash"
  | "mediaType"
  | "structureHash"
  | "cardinalResourcesHash"
  | "cardinalHrefOrderHash"
> {
  if (
    catalog.schemaVersion !== 1 ||
    catalog.kind !== READER_OFFLINE_CATALOG_ARTIFACT_KIND ||
    catalog.mediaType !== READER_OFFLINE_CATALOG_ARTIFACT_MEDIA_TYPE ||
    catalog.relativePath !== READER_OFFLINE_CATALOG_ARTIFACT_RELATIVE_PATH ||
    catalog.publicationId !== EXPECTED_PUBLICATION_ID ||
    catalog.readerBuildId !== PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID ||
    catalog.rendererBuildId !== rendererBuildId ||
    catalog.catalogHref !== PUBLISHER_OFFLINE_CATALOG_HREF ||
    reader.publicationId !== catalog.publicationId ||
    reader.buildId !== catalog.readerBuildId
  ) {
    throw new TypeError("Publisher offline catalog identity drifted.");
  }
  const officialCatalog = createReaderOfflineCatalog({
    reader,
    rendererBuildId,
    catalogHref: PUBLISHER_OFFLINE_CATALOG_HREF,
    sharedResources: Object.freeze([
      Object.freeze({
        href: "/publication-reader-search.json",
        kind: "data" as const,
      }),
      Object.freeze({
        href: "/publication-reader-progress.json",
        kind: "data" as const,
      }),
      Object.freeze({
        href: COHERENCE_READER_STATE_MIGRATION_HREF,
        kind: "data" as const,
        byteSize: PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES,
      }),
    ]),
  });
  if (!isDeepStrictEqual(catalog, officialCatalog)) {
    throw new TypeError(
      "Publisher offline catalog diverged from the official Reader projection.",
    );
  }
  if (
    reader.works.length !== PUBLISHER_OFFLINE_EXPECTED_PACKAGES.length ||
    !isDeepStrictEqual(
      reader.works.map(({ id }) => id),
      PUBLISHER_OFFLINE_EXPECTED_PACKAGES.map(({ workId }) => workId),
    ) ||
    !isDeepStrictEqual(
      catalog.packages.map(({ workId }) => workId),
      PUBLISHER_OFFLINE_EXPECTED_PACKAGES.map(({ workId }) => workId),
    )
  ) {
    throw new TypeError("Publisher offline package order drifted.");
  }
  const workById = new Map(reader.works.map((work) => [work.id, work]));
  const allResources = catalog.packages.flatMap(({ resources }) => resources);
  for (const offlinePackage of catalog.packages) {
    const work = workById.get(offlinePackage.workId);
    const expected = expectedPackage(offlinePackage);
    if (work === undefined) {
      throw new TypeError("Publisher offline package has no Reader work.");
    }
    const counts = resourceCounts(offlinePackage.resources);
    if (
      offlinePackage.title !== work.title ||
      offlinePackage.route !== work.route ||
      offlinePackage.sectionCount !== work.sections.length ||
      offlinePackage.sectionCount !== expected.sectionCount ||
      offlinePackage.resourceCount !== offlinePackage.resources.length ||
      offlinePackage.resourceCount !== expected.resourceCount ||
      counts.document !== expected.documentCount ||
      counts.data !== 4 ||
      counts.asset !== 0 ||
      counts.audio !== 0 ||
      counts.timing !== 0 ||
      offlinePackage.audioClipCount !== 0 ||
      offlinePackage.declaredByteSize !==
        PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES ||
      offlinePackage.unknownByteSizeCount !==
        offlinePackage.resourceCount - 1 ||
      offlinePackage.version.readerBuildId !== reader.buildId ||
      offlinePackage.version.rendererBuildId !== rendererBuildId ||
      offlinePackage.version.workContentHash !== work.contentHash ||
      offlinePackage.version.narrationCatalogHash !== null ||
      offlinePackage.resources.some(({ href, byteSize }) =>
        publicHref(href, "Publisher offline resource") !== href ||
        (href === COHERENCE_READER_STATE_MIGRATION_HREF
          ? byteSize !== PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES
          : byteSize !== undefined)
      ) ||
      !isDeepStrictEqual(
        sorted(
          offlinePackage.resources
            .filter(({ kind }) => kind === "data")
            .map(({ href }) => href),
        ),
        sorted(EXPECTED_DATA_HREFS),
      ) ||
      !offlinePackage.resources.some(
        ({ href, kind }) => kind === "document" && href === work.route,
      )
    ) {
      throw new TypeError(
        `Publisher offline package ${offlinePackage.workId} drifted.`,
      );
    }
  }
  const declarationCounts = resourceCounts(allResources);
  const uniqueByHref = new Map<string, ReaderOfflineResourceKind>();
  for (const resource of allResources) {
    const previous = uniqueByHref.get(resource.href);
    if (previous !== undefined && previous !== resource.kind) {
      throw new TypeError(
        `Publisher offline href ${resource.href} changes resource kind.`,
      );
    }
    uniqueByHref.set(resource.href, resource.kind);
  }
  const uniqueCounts = resourceCounts(
    [...uniqueByHref.entries()].map(([, kind]) => ({ kind })),
  );
  const uniqueDocumentHrefs = sorted(
    [...uniqueByHref.entries()]
      .filter(([, kind]) => kind === "document")
      .map(([href]) => href),
  );
  const activeRouteHrefs = sorted(reader.routes.active.map(({ path }) => path));
  if (
    allResources.length !== 627 ||
    uniqueByHref.size !== 587 ||
    declarationCounts.document !== 591 ||
    declarationCounts.data !== 36 ||
    declarationCounts.asset !== 0 ||
    declarationCounts.audio !== 0 ||
    declarationCounts.timing !== 0 ||
    uniqueCounts.document !== 583 ||
    uniqueCounts.data !== 4 ||
    uniqueCounts.asset !== 0 ||
    uniqueCounts.audio !== 0 ||
    uniqueCounts.timing !== 0 ||
    !isDeepStrictEqual(uniqueDocumentHrefs, activeRouteHrefs)
  ) {
    throw new TypeError("Publisher offline resource census drifted.");
  }
  return Object.freeze({
    href: PUBLISHER_OFFLINE_CATALOG_HREF,
    packageCount: 9 as const,
    resourceDeclarationCount: 627 as const,
    uniqueResourceCount: 587 as const,
    documentResourceCount: 583 as const,
    dataResourceCount: 4 as const,
    assetResourceCount: 0 as const,
    audioResourceCount: 0 as const,
    timingResourceCount: 0 as const,
    audioClipCount: 0 as const,
    cardinalScaleResourceCount: 18 as const,
    packageEvidence: PUBLISHER_OFFLINE_EXPECTED_PACKAGES,
  });
}

export function assertPublisherOfflineCatalogResponse(input: Readonly<{
  body: Uint8Array;
  cacheControl: string | null;
  contentType: string | null;
  reader: PublicationReaderEnvelope;
}>): Readonly<{
  catalog: ReaderOfflineCatalog;
  evidence: PublisherOfflineCatalogEvidence;
}> {
  const reader = assertPublisherOfflineReaderAuthority(input.reader);
  if (
    input.body.byteLength !== PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES ||
    sha256Bytes(input.body) !== PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH ||
    input.cacheControl !== CATALOG_CACHE_CONTROL ||
    input.contentType !== CATALOG_CONTENT_TYPE
  ) {
    throw new TypeError("Publisher offline catalog response identity drifted.");
  }
  const text = Buffer.from(input.body).toString("utf8");
  const catalog = parseReaderOfflineCatalog(text, {
    publicationId: EXPECTED_PUBLICATION_ID,
    readerBuildId: PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID,
    rendererBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
  });
  if (catalog === null || serializeReaderOfflineCatalog(catalog) !== text) {
    throw new TypeError("Publisher offline catalog is not exact canonical JSON.");
  }
  const cardinalPackage = catalog.packages.find(
    ({ workId }) => workId === CARDINAL_SCALE_WORK_ID,
  );
  if (
    cardinalPackage === undefined ||
    hashJson(catalog) !== PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH ||
    hashJson(cardinalPackage.resources) !==
      PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH ||
    hashJson(cardinalPackage.resources.map(({ href }) => href)) !==
      PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH
  ) {
    throw new TypeError("Publisher offline catalog exact structure drifted.");
  }
  const structure = assertPublisherOfflineCatalogStructure(
    catalog,
    reader,
  );
  return Object.freeze({
    catalog,
    evidence: Object.freeze({
      ...structure,
      mediaType: READER_OFFLINE_CATALOG_ARTIFACT_MEDIA_TYPE,
      cacheControl: CATALOG_CACHE_CONTROL,
      bytes: PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH,
      structureHash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH,
      cardinalResourcesHash: PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH,
      cardinalHrefOrderHash:
        PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH,
    }),
  });
}

export function assertPublisherOfflineProbe(
  probeValue: unknown,
  projection: PublisherThemeHostReaderProjection,
): Readonly<{
  rendererBuildId: typeof PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID;
  applicationArtifactHash:
    typeof PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH;
  themeTokensHash: typeof PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH;
  rootThemeStyleDeclarations: readonly (readonly [string, string])[];
}> {
  const probe = asRecord(probeValue, "Publisher offline live host probe");
  const manifest = asRecord(
    probe.applicationManifest,
    "Publisher offline application manifest",
  );
  const source = asRecord(
    manifest.source,
    "Publisher offline application source",
  );
  const artifact = asRecord(
    probe.applicationArtifact,
    "Publisher offline application artifact",
  );
  const artifactHash = requiredString(
    artifact,
    "hash",
    "Publisher offline application artifact",
  );
  const artifactText = requiredString(
    artifact,
    "text",
    "Publisher offline application artifact",
  );
  const applicationTokens = asRecord(
    probe.applicationTokens,
    "Publisher offline application theme tokens",
  );
  const color = asRecord(
    applicationTokens.color,
    "Publisher offline application color tokens",
  );
  const typography = asRecord(
    applicationTokens.typography,
    "Publisher offline application typography tokens",
  );
  const layout = asRecord(
    applicationTokens.layout,
    "Publisher offline application layout tokens",
  );
  const readerFontFamilies = typography.readerFontFamilies;
  const defaultReaderFontFamilyId = typography.defaultReaderFontFamilyId;
  if (
    !Array.isArray(readerFontFamilies) ||
    typeof defaultReaderFontFamilyId !== "string"
  ) {
    throw new TypeError("Publisher offline application theme tokens drifted.");
  }
  const defaultReaderFont = readerFontFamilies.map((value) =>
    asRecord(value, "Publisher offline Reader font family")
  ).find(({ id }) => id === defaultReaderFontFamilyId);
  if (defaultReaderFont === undefined) {
    throw new TypeError("Publisher offline default Reader font drifted.");
  }
  const styleValue = (
    record: JsonRecord,
    key: string,
    label: string,
  ): string => {
    const value = record[key];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`${label} must be a scalar CSS value.`);
    }
    const text = String(value);
    if (trimHtmlSpaceCharacters(text) === "" || text.includes(";")) {
      throw new TypeError(`${label} is not an exact CSS value.`);
    }
    return text;
  };
  const rootThemeStyleDeclarations = Object.freeze([
    ["--publisher-color-canvas", styleValue(color, "canvas", "canvas token")],
    ["--publisher-color-surface", styleValue(color, "surface", "surface token")],
    ["--publisher-color-text", styleValue(color, "text", "text token")],
    ["--publisher-color-muted-text", styleValue(color, "mutedText", "muted text token")],
    ["--publisher-color-accent", styleValue(color, "accent", "accent token")],
    ["--publisher-color-focus", styleValue(color, "focus", "focus token")],
    ["--publisher-color-border", styleValue(color, "border", "border token")],
    ["--publisher-font-body", styleValue(typography, "bodyFamily", "body font token")],
    ["--publisher-font-heading", styleValue(typography, "headingFamily", "heading font token")],
    ["--publisher-font-mono", styleValue(typography, "monoFamily", "mono font token")],
    ["--publisher-reader-default-font-family", styleValue(defaultReaderFont, "family", "default Reader font token")],
    ["--publisher-font-size", styleValue(typography, "baseSize", "font size token")],
    ["--publisher-line-height", styleValue(typography, "lineHeight", "line height token")],
    ["--publisher-reading-measure", styleValue(layout, "readingMeasure", "reading measure token")],
    ["--publisher-page-gutter", styleValue(layout, "pageGutter", "page gutter token")],
    ["--publisher-section-gap", styleValue(layout, "sectionGap", "section gap token")],
    ["--publisher-control-radius", styleValue(layout, "controlRadius", "control radius token")],
  ].map((row) => Object.freeze([row[0]!, row[1]!] as const)));
  if (
    projection.reader.publicationId !== EXPECTED_PUBLICATION_ID ||
    projection.reader.buildId !== PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID ||
    projection.reader.works.length !== 9 ||
    projection.routePlanStaticParamCount !== 583 ||
    projection.applicationStaticParamCount !== 582 ||
    probe.publicationId !== projection.reader.publicationId ||
    probe.readerBuildId !== projection.reader.buildId ||
    probe.currentPublicRoutes !== "untouched" ||
    probe.adaptedReaderHostVerified !== true ||
    probe.offlineAudioClipCount !== 0 ||
    probe.offlineAudioResourceCount !== 0 ||
    probe.offlineAudioEnvelopeResourceCount !== 0 ||
    probe.offlineTimingResourceCount !== 0 ||
    probe.offlineNarrationCatalogCount !== 0 ||
    manifest.buildId !== PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID ||
    manifest.publicationId !== projection.reader.publicationId ||
    source.readerBuildId !== projection.reader.buildId ||
    artifactHash !== PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH ||
    sha256Bytes(artifactText) !== artifactHash ||
    hashJson(applicationTokens as JSONValue) !==
      PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH ||
    !isDeepStrictEqual(
      rootThemeStyleDeclarations.map(([name]) => name),
      PUBLISHER_OFFLINE_THEME_STYLE_PROPERTIES,
    )
  ) {
    throw new TypeError("Publisher offline live host identity drifted.");
  }
  assertSha256(projection.contentBuildId, "Publisher content build identity");
  assertSha256(
    projection.adaptedApplicationBuildId,
    "Publisher adapted application identity",
  );
  assertSha256(
    projection.contentEvidenceHash,
    "Publisher content evidence identity",
  );
  return Object.freeze({
    rendererBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
    applicationArtifactHash:
      PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH,
    themeTokensHash: PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH,
    rootThemeStyleDeclarations,
  });
}

type ArtifactResponseBudget = {
  maximumBytes: number;
  usedBytes: number;
};

async function readBoundedArtifactResponse(
  response: Response,
  label: string,
  budget: ArtifactResponseBudget,
): Promise<Uint8Array> {
  if (response.body === null) {
    throw new TypeError(`${label} response has no body.`);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const value = Number(declared);
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > PUBLISHER_OFFLINE_MAXIMUM_ARTIFACT_RESPONSE_BYTES ||
      value > budget.maximumBytes - budget.usedBytes
    ) {
      throw new TypeError(`${label} declared byte size exceeds its proof cap.`);
    }
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let responseBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      responseBytes += next.value.byteLength;
      if (
        responseBytes > PUBLISHER_OFFLINE_MAXIMUM_ARTIFACT_RESPONSE_BYTES ||
        budget.usedBytes + responseBytes > budget.maximumBytes
      ) {
        await reader.cancel();
        throw new TypeError(`${label} response exceeds its proof cap.`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(responseBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  budget.usedBytes += output.byteLength;
  return output;
}

async function fetchBoundedArtifact(
  baseUrl: string,
  href: string,
  signal: AbortSignal,
  budget: ArtifactResponseBudget,
): Promise<Readonly<{
  body: Uint8Array;
  cacheControl: string | null;
  contentType: string | null;
}>> {
  signal.throwIfAborted();
  const base = new URL(baseUrl);
  if (
    base.protocol !== "http:" ||
    base.hostname !== "127.0.0.1" ||
    base.pathname !== "/" ||
    base.search !== "" ||
    base.hash !== ""
  ) {
    throw new TypeError("Publisher offline browser host URL is not private.");
  }
  const response = await fetch(new URL(publicHref(href, "artifact href"), base), {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (response.status !== 200) {
    throw new TypeError(`Publisher offline artifact ${href} returned ${response.status}.`);
  }
  return Object.freeze({
    body: await readBoundedArtifactResponse(response, href, budget),
    cacheControl: response.headers.get("cache-control"),
    contentType: response.headers.get("content-type"),
  });
}

export function assertPublisherOfflineWorkerResponse(input: Readonly<{
  body: Uint8Array;
  cacheControl: string | null;
  contentType: string | null;
}>): PublisherOfflineWorkerEvidence {
  if (
    input.body.byteLength !== PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES ||
    sha256Bytes(input.body) !== PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH ||
    input.contentType !== PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE ||
    input.cacheControl !== PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL
  ) {
    throw new TypeError("Publisher offline service worker identity drifted.");
  }
  const source = Buffer.from(input.body).toString("utf8");
  const requiredSource = [
    'const RUNTIME_CACHE_NAME = "genii-publisher-offline-runtime-v1";',
    'const METADATA_CACHE_NAME = "genii-publisher-offline-metadata-v1";',
    'const PACKAGE_CACHE_PREFIX = "genii-publisher-offline-package-v1-";',
    'if (request.headers.get("rsc") === "1" || url.searchParams.has("_rsc")) return false;',
    'if (request.headers.has("next-router-prefetch") || request.headers.has("next-router-state-tree")) return false;',
    'if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return false;',
    'if (url.pathname === "/offline-sw.js") return false;',
    'if (request.headers.has("range")) return false;',
    'if (response.ok && response.status !== 206 && !request.headers.has("range")) {',
  ];
  if (requiredSource.some((line) => !source.includes(line))) {
    throw new TypeError("Publisher offline service worker policy drifted.");
  }
  return Object.freeze({
    path: OFFLINE_WORKER_PATH,
    bytes: PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES,
    hash: PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH,
    contentType: PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE,
    cacheControl: PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL,
    doesNotCache206: true as const,
    excludesRange: true as const,
    excludesApi: true as const,
    excludesAuth: true as const,
    excludesRsc: true as const,
    excludesPrefetch: true as const,
    excludesStateTree: true as const,
    excludesWorker: true as const,
  });
}

export function assertPublisherOfflinePlaywrightAuthority(input: Readonly<{
  playwrightVersion: string;
  browserEngine: string;
  browserVersion: string;
}>): void {
  if (
    input.playwrightVersion !== PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION ||
    input.browserEngine !== "chromium" ||
    input.browserVersion !== PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION
  ) {
    throw new TypeError(
      "Publisher offline proof requires the exact bundled Playwright Chromium.",
    );
  }
}

export function publisherOfflineChromiumLaunchOptions(): Readonly<{
  headless: true;
}> {
  return Object.freeze({ headless: true as const });
}

function installedPlaywrightVersion(): string {
  const localRequire = createRequire(import.meta.url);
  const packagePath = localRequire.resolve("@playwright/test/package.json");
  const manifest: unknown = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const record = asRecord(manifest, "Playwright package manifest");
  return requiredString(record, "version", "Playwright package manifest");
}

export type PublisherOfflineCacheEntrySnapshot = Readonly<{
  cacheName: string;
  method: string;
  href: string;
  requestHeaders: readonly (readonly [string, string])[];
  status: number;
  statusText: string;
  responseHeaders: readonly (readonly [string, string])[];
  responseHref: string;
  responseRedirected: boolean;
  responseType: string;
  bytes: number;
  hash: string;
}>;

export type PublisherOfflineCacheSnapshot = Readonly<{
  names: readonly string[];
  hash: string;
  entries: readonly PublisherOfflineCacheEntrySnapshot[];
}>;

export function assertPublisherOfflineSerializableBrowserCallback<
  Argument,
  Result,
>(callback: (argument: Argument) => Result): (argument: Argument) => Result;
export function assertPublisherOfflineSerializableBrowserCallback<Result>(
  callback: () => Result,
): () => Result;
export function assertPublisherOfflineSerializableBrowserCallback(
  callback: CallableFunction,
): CallableFunction {
  if (typeof callback !== "function") {
    throw new TypeError("Publisher browser callback is not callable.");
  }
  const serialized = Function.prototype.toString.call(callback);
  if (/(?:^|[^\w$])__name(?:[^\w$]|$)/u.test(serialized)) {
    throw new TypeError(
      "Publisher browser callback contains an unresolved transform helper.",
    );
  }
  return callback;
}

async function snapshotBrowserCaches(
  page: Page,
  names: readonly string[],
): Promise<PublisherOfflineCacheSnapshot> {
  const snapshot = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const helpers = {
      async digest(bytes: ArrayBuffer | Uint8Array): Promise<string> {
        const source = bytes instanceof Uint8Array
          ? bytes
          : new Uint8Array(bytes);
        const stable = new Uint8Array(source.byteLength);
        stable.set(source);
        const value = await crypto.subtle.digest("SHA-256", stable.buffer);
        return `sha256:${[...new Uint8Array(value)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
      },
      async readBounded(
        response: Response,
        usedBytes: number,
      ): Promise<{ body: Uint8Array; usedBytes: number }> {
        const declared = response.headers.get("content-length");
        if (declared !== null) {
          const size = Number(declared);
          if (
            !Number.isSafeInteger(size) ||
            size < 0 ||
            size > input.maximumResponseBytes ||
            usedBytes + size > input.maximumTotalBytes
          ) throw new TypeError("Cache snapshot declared size exceeds its cap.");
        }
        const stream = response.clone().body;
        if (stream === null) return { body: new Uint8Array(), usedBytes };
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (
            size > input.maximumResponseBytes ||
            usedBytes + size > input.maximumTotalBytes
          ) {
            await reader.cancel();
            throw new TypeError("Cache snapshot exceeds its cap.");
          }
          chunks.push(next.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { body, usedBytes: usedBytes + size };
      },
    };
    const rows: Array<{
      cacheName: string;
      method: string;
      href: string;
      requestHeaders: Array<[string, string]>;
      status: number;
      statusText: string;
      responseHeaders: Array<[string, string]>;
      responseHref: string;
      responseRedirected: boolean;
      responseType: string;
      bytes: number;
      hash: string;
    }> = [];
    const existing = await caches.keys();
    let usedBytes = 0;
    for (const cacheName of [...input.expectedNames].sort()) {
      if (!existing.includes(cacheName)) continue;
      const cache = await caches.open(cacheName);
      const requests = [...await cache.keys()];
      for (const request of requests.sort((left, right) =>
        left.url.localeCompare(right.url)
      )) {
        const response = await cache.match(request);
        if (response === undefined) continue;
        const bounded = await helpers.readBounded(response, usedBytes);
        usedBytes = bounded.usedBytes;
        const bytes = bounded.body;
        const url = new URL(request.url);
        const responseUrl = response.url === "" ? null : new URL(response.url);
        rows.push({
          cacheName,
          method: request.method,
          href: url.origin === location.origin
            ? `${url.pathname}${url.search}`
            : url.href,
          requestHeaders: [...request.headers.entries()].sort(([left], [right]) =>
            left.localeCompare(right)
          ),
          status: response.status,
          statusText: response.statusText,
          responseHeaders: [...response.headers.entries()].sort(([left], [right]) =>
            left.localeCompare(right)
          ),
          responseHref: responseUrl === null
            ? ""
            : responseUrl.origin === location.origin
              ? `${responseUrl.pathname}${responseUrl.search}`
              : responseUrl.href,
          responseRedirected: response.redirected,
          responseType: response.type,
          bytes: bytes.byteLength,
          hash: await helpers.digest(bytes),
        });
      }
    }
      return {
        names: existing.filter((name) =>
          input.expectedNames.includes(name)
        ).sort(),
        rows,
      };
    }), {
    expectedNames: [...names],
    maximumResponseBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    maximumTotalBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
  });
  const entries = Object.freeze(snapshot.rows.map((row) => Object.freeze({
    ...row,
    requestHeaders: Object.freeze(row.requestHeaders.map(([name, value]) =>
      Object.freeze([name, value] as const)
    )),
    responseHeaders: Object.freeze(row.responseHeaders.map(([name, value]) =>
      Object.freeze([name, value] as const)
    )),
  })));
  return Object.freeze({
    names: Object.freeze([...snapshot.names]),
    hash: hashJson(snapshot),
    entries,
  });
}

export function assertPublisherOfflineCacheSnapshotUnchanged(
  expected: PublisherOfflineCacheSnapshot,
  actual: PublisherOfflineCacheSnapshot,
  label: string,
): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new TypeError(`${label} changed cache response state.`);
  }
}

async function seedProofCaches(
  page: Page,
): Promise<void> {
  await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const helpers = {
      async seedCache(cacheName: string, index: number): Promise<void> {
        const cache = await caches.open(cacheName);
        const body = new TextEncoder().encode(
          `coherence-cache-proof:${cacheName}:${index}`,
        );
        await cache.put(
          new Request(`${location.origin}/__coherence-cache-proof__/${index}`),
          new Response(body, {
            headers: {
              "cache-control": "private, max-age=0",
              "content-type": "application/octet-stream",
              "x-proof-cache": cacheName,
            },
          }),
        );
      },
    };
    for (const [index, cacheName] of input.coherenceNames.entries()) {
      await helpers.seedCache(cacheName, index);
    }
    for (const [index, cacheName] of input.stalePublisherRuntimeNames.entries()) {
      const cache = await caches.open(cacheName);
      await cache.put(
        new Request(`${location.origin}/__publisher-runtime-proof__/${index}`),
        new Response(`stale-runtime:${cacheName}`, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
      }
    }), {
    coherenceNames: [...SEEDED_COHERENCE_CACHE_NAMES],
    stalePublisherRuntimeNames: [...SEEDED_STALE_PUBLISHER_RUNTIME_NAMES],
  });
}

async function mutateInstalledPackageVersion(
  page: Page,
  publicationId: string,
  workId: string,
): Promise<void> {
  await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const metadata = await caches.open(input.metadataCacheName);
    const key = `${input.recordPrefix}${encodeURIComponent(input.publicationId)}/${
      encodeURIComponent(input.workId)}`;
    const response = await metadata.match(key);
    if (response === undefined) {
      throw new TypeError("Publisher offline proof found no installed record.");
    }
    const record: unknown = await response.json();
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      throw new TypeError("Publisher offline proof found an invalid installed record.");
    }
    const installedRecord = record as Record<string, unknown>;
    const version = installedRecord.version;
    if (version === null || typeof version !== "object" || Array.isArray(version)) {
      throw new TypeError("Publisher offline proof found an invalid installed version.");
    }
    await metadata.put(
      key,
      new Response(JSON.stringify({
        ...installedRecord,
        version: {
          ...version,
          workContentHash: input.previousWorkContentHash,
        },
      }), {
        headers: { "content-type": "application/json" },
      }),
      );
    }), {
    metadataCacheName: PUBLISHER_METADATA_CACHE_NAME,
    previousWorkContentHash: PREVIOUS_WORK_CONTENT_HASH,
    publicationId,
    recordPrefix: PUBLISHER_RECORD_PREFIX,
    workId,
  });
}

export type PublisherOfflineBrowserPackageState = Readonly<{
  record: JsonRecord | null;
  recordHash: string;
  recordResponseBytes: number;
  recordResponseStatus: number | null;
  recordResponseStatusText: string;
  recordResponseHeaders: readonly (readonly [string, string])[];
  recordResponseHref: string;
  recordResponseRedirected: boolean;
  recordResponseType: string;
  metadataCacheRequests: readonly Readonly<{
    method: string;
    href: string;
    headers: readonly (readonly [string, string])[];
  }>[];
  cacheName: string;
  cacheNames: readonly string[];
  packageCacheHash: string;
  packageCacheEntryCount: number;
  packageCacheHrefs: readonly string[];
  packageCacheEntries: readonly Readonly<{
    method: string;
    href: string;
    headers: readonly (readonly [string, string])[];
    responseHref: string;
    redirected: boolean;
    responseType: string;
  }>[];
}>;

async function readBrowserPackageState(
  page: Page,
  publicationId: string,
  workId: string,
): Promise<PublisherOfflineBrowserPackageState> {
  const value = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const helpers = {
      async digest(value: ArrayBuffer | Uint8Array): Promise<string> {
        const source = value instanceof Uint8Array
          ? value
          : new Uint8Array(value);
        const stable = new Uint8Array(source.byteLength);
        stable.set(source);
        const result = await crypto.subtle.digest("SHA-256", stable.buffer);
        return `sha256:${[...new Uint8Array(result)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
      },
      async readBounded(
        response: Response,
        usedBytes: number,
      ): Promise<{ body: Uint8Array; usedBytes: number }> {
        const declared = response.headers.get("content-length");
        if (declared !== null) {
          const size = Number(declared);
          if (
            !Number.isSafeInteger(size) ||
            size < 0 ||
            size > input.maximumResponseBytes ||
            usedBytes + size > input.maximumTotalBytes
          ) throw new TypeError("Package snapshot declared size exceeds its cap.");
        }
        const stream = response.clone().body;
        if (stream === null) return { body: new Uint8Array(), usedBytes };
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (
            size > input.maximumResponseBytes ||
            usedBytes + size > input.maximumTotalBytes
          ) {
            await reader.cancel();
            throw new TypeError("Package snapshot exceeds its cap.");
          }
          chunks.push(next.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { body, usedBytes: usedBytes + size };
      },
    };
    const metadata = await caches.open(input.metadataCacheName);
    const recordKey = `${input.recordPrefix}${encodeURIComponent(input.publicationId)}/${
      encodeURIComponent(input.workId)}`;
    const metadataRequests = [...await metadata.keys()].sort((left, right) =>
      left.url.localeCompare(right.url)
    );
    const recordRequest = metadataRequests.find((request) =>
      request.method === "GET" && request.url === recordKey
    );
    const recordResponse = recordRequest === undefined
      ? undefined
      : await metadata.match(recordRequest);
    const boundedRecord = recordResponse === undefined
      ? { body: new Uint8Array(), usedBytes: 0 }
      : await helpers.readBounded(recordResponse, 0);
    const recordText = new TextDecoder("utf-8", { fatal: true })
      .decode(boundedRecord.body);
    const record: unknown = recordText === "" ? null : JSON.parse(recordText);
    const cacheName = record !== null && typeof record === "object" &&
        !Array.isArray(record) &&
        typeof (record as Record<string, unknown>).cacheName === "string"
      ? (record as Record<string, unknown>).cacheName
      : "";
    const names = await caches.keys();
    const rows: Array<{
      method: string;
      href: string;
      requestHeaders: Array<[string, string]>;
      bytes: number;
      hash: string;
      status: number;
      statusText: string;
      headers: Array<[string, string]>;
      responseUrl: string;
      responseRedirected: boolean;
      responseType: string;
    }> = [];
    let usedBytes = boundedRecord.usedBytes;
    if (typeof cacheName === "string" && cacheName !== "" && names.includes(cacheName)) {
      const cache = await caches.open(cacheName);
      for (const request of [...await cache.keys()].sort((left, right) =>
        left.url.localeCompare(right.url)
      )) {
        const response = await cache.match(request);
        if (response === undefined) continue;
        const bounded = await helpers.readBounded(response, usedBytes);
        usedBytes = bounded.usedBytes;
        rows.push({
          method: request.method,
          href: request.url,
          requestHeaders: [...request.headers.entries()].sort(
            ([left], [right]) => left.localeCompare(right),
          ),
          bytes: bounded.body.byteLength,
          hash: await helpers.digest(bounded.body),
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers.entries()].sort(
            ([left], [right]) => left.localeCompare(right),
          ),
          responseUrl: response.url,
          responseRedirected: response.redirected,
          responseType: response.type,
        });
      }
    }
    return {
      record,
      recordHash: await helpers.digest(new TextEncoder().encode(recordText)),
      recordResponseBytes: boundedRecord.body.byteLength,
      recordResponseStatus: recordResponse?.status ?? null,
      recordResponseStatusText: recordResponse?.statusText ?? "",
      recordResponseHeaders: recordResponse === undefined
        ? []
        : [...recordResponse.headers.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
          ),
      recordResponseUrl: recordResponse?.url ?? "",
      recordResponseRedirected: recordResponse?.redirected ?? false,
      recordResponseType: recordResponse?.type ?? "",
      metadataCacheRequests: metadataRequests.map((request) => ({
        method: request.method,
        href: request.url,
        headers: [...request.headers.entries()].sort(
          ([left], [right]) => left.localeCompare(right),
        ),
      })),
      cacheName: typeof cacheName === "string" ? cacheName : "",
      cacheNames: names.filter((name) =>
        name.startsWith(input.packageCachePrefix)
      ).sort(),
        packageCacheRows: rows,
      };
    }), {
    metadataCacheName: PUBLISHER_METADATA_CACHE_NAME,
    packageCachePrefix: PUBLISHER_PACKAGE_CACHE_PREFIX,
    publicationId,
    recordPrefix: PUBLISHER_RECORD_PREFIX,
    workId,
    maximumResponseBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    maximumTotalBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
  });
  return Object.freeze({
    record: value.record === null
      ? null
      : asRecord(value.record, "Publisher offline package record"),
    recordHash: value.recordHash,
    recordResponseBytes: value.recordResponseBytes,
    recordResponseStatus: value.recordResponseStatus,
    recordResponseStatusText: value.recordResponseStatusText,
    recordResponseHeaders: Object.freeze(
      value.recordResponseHeaders.map((row) => Object.freeze([...row] as const)),
    ),
    recordResponseHref: (() => {
      if (value.recordResponseUrl === "") return "";
      const url = new URL(value.recordResponseUrl);
      return `${url.pathname}${url.search}`;
    })(),
    recordResponseRedirected: value.recordResponseRedirected,
    recordResponseType: value.recordResponseType,
    metadataCacheRequests: Object.freeze(
      value.metadataCacheRequests.map((request) => Object.freeze({
        ...request,
        headers: Object.freeze(
          request.headers.map((row) => Object.freeze([...row] as const)),
        ),
      })),
    ),
    cacheName: value.cacheName,
    cacheNames: Object.freeze([...value.cacheNames]),
    packageCacheHash: hashJson(value.packageCacheRows),
    packageCacheEntryCount: value.packageCacheRows.length,
    packageCacheHrefs: Object.freeze(value.packageCacheRows.map(({ href }) => {
      const url = new URL(href);
      return `${url.pathname}${url.search}`;
    })),
    packageCacheEntries: Object.freeze(value.packageCacheRows.map((row) => {
      const requestUrl = new URL(row.href);
      const responseUrl = row.responseUrl === "" ? null : new URL(row.responseUrl);
      return Object.freeze({
        method: row.method,
        href: `${requestUrl.pathname}${requestUrl.search}`,
        headers: Object.freeze(
          row.requestHeaders.map((header) => Object.freeze([...header] as const)),
        ),
        responseHref: responseUrl === null
          ? ""
          : responseUrl.origin === requestUrl.origin
            ? `${responseUrl.pathname}${responseUrl.search}`
            : responseUrl.href,
        redirected: row.responseRedirected,
        responseType: row.responseType,
      });
    })),
  });
}

function trimHtmlSpaceCharacters(value: string): string {
  return value.replace(
    /^[\u0009\u000A\u000C\u000D\u0020]+|[\u0009\u000A\u000C\u000D\u0020]+$/gu,
    "",
  );
}

function normalizedDocumentText(value: string): string {
  return trimHtmlSpaceCharacters(
    value.replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " "),
  );
}

function readerWorkReadingStat(
  work: PublicationReaderEnvelope["works"][number],
): string {
  const number = new Intl.NumberFormat("en");
  const minuteUnit = new Intl.PluralRules("en").select(work.readingMinutes) ===
      "one"
    ? "minute"
    : "minutes";
  return `${number.format(work.wordCount)} words, ${
    number.format(work.readingMinutes)
  } ${minuteUnit} read`;
}

function normalizedInlineText(value: string): string {
  return value.replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ");
}

function semanticTextNode(value: string): PublisherOfflineInlineSemanticTextNode {
  return Object.freeze({ type: "text" as const, value });
}

function semanticElementNode(
  tagName: PublisherOfflineInlineSemanticElementNode["tagName"],
  children: readonly PublisherOfflineInlineSemanticNode[] = Object.freeze([]),
  attributes: readonly (readonly [string, string])[] = Object.freeze([]),
): PublisherOfflineInlineSemanticElementNode {
  return Object.freeze({
    type: "element" as const,
    tagName,
    attributes: Object.freeze(attributes.map((row) => Object.freeze([
      row[0],
      row[1],
    ] as const))),
    children: Object.freeze([...children]),
  });
}

function normalizeSemanticChildren(
  children: readonly PublisherOfflineInlineSemanticNode[],
): readonly PublisherOfflineInlineSemanticNode[] {
  const output: PublisherOfflineInlineSemanticNode[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      output.push(child);
      continue;
    }
    const value = normalizedInlineText(child.value);
    if (value.length === 0) continue;
    const previous = output.at(-1);
    if (previous?.type === "text") {
      output[output.length - 1] = semanticTextNode(previous.value + value);
    } else {
      output.push(semanticTextNode(value));
    }
  }
  return Object.freeze(output);
}

function semanticNodeText(node: PublisherOfflineInlineSemanticNode): string {
  return node.type === "text"
    ? node.value
    : node.children.map(semanticNodeText).join("");
}

function safeMarkdownHref(value: string): string {
  if (value.startsWith("#")) {
    if (!inspectCanonicalUrlFragment(value.slice(1)).valid) {
      throw new TypeError("Publisher Markdown fragment href drifted.");
    }
    return value;
  }
  if (value.startsWith("/")) {
    const separator = value.indexOf("#");
    const routePath = separator < 0 ? value : value.slice(0, separator);
    if (
      !inspectCanonicalRoutePath(routePath).valid ||
      (separator >= 0 &&
        !inspectCanonicalUrlFragment(value.slice(separator + 1)).valid)
    ) {
      throw new TypeError("Publisher Markdown route href drifted.");
    }
    return value;
  }
  if (!inspectAbsoluteHttpUrl(value).valid) {
    throw new TypeError("Publisher Markdown absolute href drifted.");
  }
  return value;
}

function mdastRecord(value: unknown, label: string): JsonRecord {
  const record = asRecord(value, label);
  if (typeof record.type !== "string") {
    throw new TypeError(`${label} has no node type.`);
  }
  return record;
}

function mdastChildren(record: JsonRecord, label: string): readonly unknown[] {
  if (!Array.isArray(record.children)) {
    throw new TypeError(`${label} has no child list.`);
  }
  return record.children;
}

function projectMdastInlineChildren(
  values: readonly unknown[],
  census: Map<string, number>,
): readonly PublisherOfflineInlineSemanticNode[] {
  return normalizeSemanticChildren(values.map((value) => {
    const node = mdastRecord(value, "Publisher Reader Markdown inline node");
    census.set(node.type as string, (census.get(node.type as string) ?? 0) + 1);
    switch (node.type) {
      case "text": {
        assertExactKeys(
          node,
          ["type", "value", "position"],
          "Publisher Reader Markdown text node",
        );
        if (typeof node.value !== "string") {
          throw new TypeError("Publisher Reader Markdown text node drifted.");
        }
        return semanticTextNode(node.value);
      }
      case "emphasis":
      case "strong": {
        assertExactKeys(
          node,
          ["type", "children", "position"],
          `Publisher Reader Markdown ${node.type} node`,
        );
        return semanticElementNode(
          node.type === "emphasis" ? "em" : "strong",
          projectMdastInlineChildren(
            mdastChildren(node, `Publisher Reader Markdown ${node.type} node`),
            census,
          ),
        );
      }
      case "inlineCode": {
        assertExactKeys(
          node,
          ["type", "value", "position"],
          "Publisher Reader Markdown inline code node",
        );
        if (typeof node.value !== "string") {
          throw new TypeError("Publisher Reader Markdown inline code drifted.");
        }
        return semanticElementNode("code", [
          semanticTextNode(normalizedInlineText(node.value)),
        ]);
      }
      case "break": {
        assertExactKeys(
          node,
          ["type", "position"],
          "Publisher Reader Markdown break node",
        );
        return semanticElementNode("br");
      }
      case "link": {
        assertExactKeys(
          node,
          ["type", "url", "title", "children", "position"],
          "Publisher Reader Markdown link node",
        );
        if (
          typeof node.url !== "string" ||
          (node.title !== null && typeof node.title !== "string")
        ) {
          throw new TypeError("Publisher Reader Markdown link drifted.");
        }
        const href = safeMarkdownHref(node.url);
        return semanticElementNode(
          "a",
          projectMdastInlineChildren(
            mdastChildren(node, "Publisher Reader Markdown link node"),
            census,
          ),
          Object.freeze([
            Object.freeze(["href", href] as const),
            ...(node.title === null
              ? []
              : [Object.freeze(["title", node.title] as const)]),
          ]),
        );
      }
      default:
        throw new TypeError(
          `Publisher Reader Markdown contains unsupported inline node ${node.type}.`,
        );
    }
  }));
}

function projectMdastBlock(
  value: unknown,
  census: Map<string, number>,
): PublisherOfflineInlineSemanticElementNode {
  const node = mdastRecord(value, "Publisher Reader Markdown block node");
  census.set(node.type as string, (census.get(node.type as string) ?? 0) + 1);
  switch (node.type) {
    case "paragraph": {
      assertExactKeys(
        node,
        ["type", "children", "position"],
        "Publisher Reader Markdown paragraph node",
      );
      return semanticElementNode(
        "p",
        projectMdastInlineChildren(
          mdastChildren(node, "Publisher Reader Markdown paragraph node"),
          census,
        ),
      );
    }
    case "heading": {
      assertExactKeys(
        node,
        ["type", "depth", "children", "position"],
        "Publisher Reader Markdown heading node",
      );
      if (!Number.isInteger(node.depth) || Number(node.depth) < 1 || Number(node.depth) > 6) {
        throw new TypeError("Publisher Reader Markdown heading depth drifted.");
      }
      return semanticElementNode(
        `h${node.depth}` as PublisherOfflineInlineSemanticElementNode["tagName"],
        projectMdastInlineChildren(
          mdastChildren(node, "Publisher Reader Markdown heading node"),
          census,
        ),
      );
    }
    case "blockquote": {
      assertExactKeys(
        node,
        ["type", "children", "position"],
        "Publisher Reader Markdown blockquote node",
      );
      const children = mdastChildren(
        node,
        "Publisher Reader Markdown blockquote node",
      ).map((child) => projectMdastBlock(child, census));
      if (children.length !== 1 || children[0]?.tagName !== "p") {
        throw new TypeError("Publisher Reader Markdown blockquote shape drifted.");
      }
      return semanticElementNode("blockquote", children);
    }
    case "thematicBreak": {
      assertExactKeys(
        node,
        ["type", "position"],
        "Publisher Reader Markdown thematic break node",
      );
      return semanticElementNode("hr");
    }
    case "list": {
      assertExactKeys(
        node,
        ["type", "ordered", "start", "spread", "children", "position"],
        "Publisher Reader Markdown list node",
      );
      if (
        typeof node.ordered !== "boolean" ||
        typeof node.spread !== "boolean" ||
        (node.start !== null && !Number.isSafeInteger(node.start))
      ) {
        throw new TypeError("Publisher Reader Markdown list authority drifted.");
      }
      const listSpread = node.spread;
      const items = mdastChildren(node, "Publisher Reader Markdown list node")
        .map((itemValue) => {
          const item = mdastRecord(
            itemValue,
            "Publisher Reader Markdown list item node",
          );
          census.set(
            item.type as string,
            (census.get(item.type as string) ?? 0) + 1,
          );
          assertExactKeys(
            item,
            ["type", "checked", "spread", "children", "position"],
            "Publisher Reader Markdown list item node",
          );
          if (
            item.type !== "listItem" ||
            item.checked !== null ||
            typeof item.spread !== "boolean"
          ) {
            throw new TypeError("Publisher Reader Markdown list item drifted.");
          }
          const itemBlocks = mdastChildren(
            item,
            "Publisher Reader Markdown list item node",
          ).map((child) => projectMdastBlock(child, census));
          if (itemBlocks.length !== 1 || itemBlocks[0]?.tagName !== "p") {
            throw new TypeError("Publisher Reader Markdown list item shape drifted.");
          }
          return semanticElementNode(
            "li",
            listSpread || item.spread
              ? itemBlocks
              : itemBlocks[0].children,
          );
        });
      if (items.length < 1) {
        throw new TypeError("Publisher Reader Markdown list is empty.");
      }
      return semanticElementNode(node.ordered ? "ol" : "ul", items);
    }
    default:
      throw new TypeError(
        `Publisher Reader Markdown contains unsupported block node ${node.type}.`,
      );
  }
}

function parserCensusRecord(census: ReadonlyMap<string, number>): JsonRecord {
  return Object.fromEntries([...census.entries()].sort(([left], [right]) =>
    codePointCompare(left, right)
  ));
}

function createReaderBlockInlineAuthorities(
  reader: PublicationReaderEnvelope,
  work: PublicationReaderEnvelope["works"][number],
): ReadonlyMap<string, PublisherOfflineInlineSemanticElementNode> {
  assertPublisherOfflineMarkdownParserAuthority();
  const linksByBlock = new Map<string, ReaderBlockMarkdownLink[]>();
  for (const link of reader.links) {
    if (link.source.kind !== "block-markdown") continue;
    const key = JSON.stringify([
      link.source.workId,
      link.source.sectionId,
      link.source.blockId,
    ]);
    const links = linksByBlock.get(key) ?? [];
    links.push(link as ReaderBlockMarkdownLink);
    linksByBlock.set(key, links);
  }
  const output = new Map<string, PublisherOfflineInlineSemanticElementNode>();
  const census = new Map<string, number>();
  for (const section of work.sections) {
    for (const block of section.blocks) {
      const key = JSON.stringify([work.id, section.id, block.id]);
      const applied = reviewedApplyReaderLinksToMarkdown(
        block,
        Object.freeze(linksByBlock.get(key) ?? []),
      );
      if (!applied.valid || typeof applied.value !== "string") {
        throw new TypeError(
          "Publisher Reader Markdown link application failed for offline authority.",
        );
      }
      const root = mdastRecord(
        reviewedFromMarkdown(applied.value),
        "Publisher Reader Markdown root node",
      );
      census.set(root.type as string, (census.get(root.type as string) ?? 0) + 1);
      assertExactKeys(
        root,
        ["type", "children", "position"],
        "Publisher Reader Markdown root node",
      );
      const rootChildren = mdastChildren(root, "Publisher Reader Markdown root node");
      if (root.type !== "root" || rootChildren.length !== 1) {
        throw new TypeError("Publisher Reader Markdown root shape drifted.");
      }
      const semantics = projectMdastBlock(rootChildren[0], census);
      const text = normalizedDocumentText(semanticNodeText(semantics));
      if (
        output.has(block.id) ||
        text !== normalizedDocumentText(block.text)
      ) {
        throw new TypeError("Publisher Reader Markdown block authority drifted.");
      }
      output.set(block.id, semantics);
    }
  }
  if (
    output.size !== 83 ||
    !isDeepStrictEqual(
      parserCensusRecord(census),
      parserCensusRecord(new Map(Object.entries(
        PUBLISHER_OFFLINE_MARKDOWN_PARSER_NODE_CENSUS,
      ))),
    )
  ) {
    throw new TypeError("Publisher Reader Markdown node census drifted.");
  }
  return output;
}

function readerBlockTextSegments(
  semantics: PublisherOfflineInlineSemanticElementNode,
): readonly string[] {
  if (semantics.tagName !== "ul" && semantics.tagName !== "ol") {
    return Object.freeze([normalizedDocumentText(semanticNodeText(semantics))]);
  }
  const segments = semantics.children.map((item) => {
    if (item.type !== "element" || item.tagName !== "li") {
      throw new TypeError("Publisher Reader Markdown list semantics drifted.");
    }
    return normalizedDocumentText(semanticNodeText(item));
  });
  if (segments.length < 1 || segments.some((segment) => segment.length === 0)) {
    throw new TypeError("Publisher Reader Markdown list text drifted.");
  }
  return Object.freeze(segments);
}

function readerSectionHref(
  workRoute: string,
  section: PublicationReaderEnvelope["works"][number]["sections"][number],
): string {
  if (section.readerAddress === null) return workRoute;
  return `${section.readerAddress.path}${section.readerAddress.anchor === undefined
    ? ""
    : `#${section.readerAddress.anchor}`}`;
}

function owningReaderHeading(
  section: PublicationReaderEnvelope["works"][number]["sections"][number],
): PublicationReaderEnvelope["works"][number]["sections"][number]["blocks"][number] |
  null {
  const first = section.blocks[0];
  return first?.kind === "heading" && first.text === section.title
    ? first
    : null;
}

function expectedDirectChild(
  tagName: string,
  className = "",
  ownedBlockIds: readonly string[] = Object.freeze([]),
): PublisherOfflineDirectChildProjection {
  return Object.freeze({
    tagName,
    className,
    ownedBlockIds: Object.freeze([...ownedBlockIds]),
  });
}

function expectedHeadingContainer(
  block: PublicationReaderEnvelope["works"][number]["sections"][number]["blocks"][number] |
    null,
  level: number,
  className = "",
): PublisherOfflineDirectChildProjection {
  if (block !== null && block.readerAddress !== null) {
    return expectedDirectChild(
      "div",
      "publisher-linkable-heading",
      [block.id],
    );
  }
  return expectedDirectChild(
    `h${level}`,
    className,
    block === null ? [] : [block.id],
  );
}

function expectedHeadingWrapper(
  block: PublicationReaderEnvelope["works"][number]["sections"][number]["blocks"][number] |
    null,
  level: number,
  text: string,
  headingClassName = "",
  identifyBlock = true,
): PublisherOfflineHeadingWrapperProjection | null {
  if (block?.readerAddress === null || block === null) return null;
  return Object.freeze({
    tagName: "div" as const,
    className: "publisher-linkable-heading" as const,
    text: normalizedDocumentText(text),
    directChildren: Object.freeze([
      expectedDirectChild(
        `h${level}`,
        headingClassName,
        identifyBlock ? [block.id] : [],
      ),
      expectedDirectChild("button", "publisher-heading-action"),
    ]),
    actions: Object.freeze([Object.freeze({
      tagName: "button" as const,
      className: "publisher-heading-action" as const,
      hidden: true as const,
      transient: "true" as const,
      href:
        `${block.readerAddress.path}#${block.readerAddress.anchor}`,
      ariaLabel: `Copy link to ${normalizedDocumentText(block.text)}`,
      title: "Copy link" as const,
      buttonType: "button" as const,
      iconCount: 1 as const,
      iconTagName: "svg" as const,
    })]),
  });
}

function readerSectionTrail(
  work: PublicationReaderEnvelope["works"][number],
  section: PublicationReaderEnvelope["works"][number]["sections"][number],
): readonly PublicationReaderEnvelope["works"][number]["sections"][number][] {
  const byId = new Map(work.sections.map((candidate) => [candidate.id, candidate]));
  const reversed: PublicationReaderEnvelope["works"][number]["sections"][number][] = [];
  const seen = new Set<string>();
  let current: typeof section | undefined = section;
  while (current !== undefined) {
    if (seen.has(current.id)) {
      throw new TypeError("Publisher Reader section ancestry contains a cycle.");
    }
    seen.add(current.id);
    reversed.push(current);
    current = current.parentId === null
      ? undefined
      : byId.get(current.parentId);
  }
  return Object.freeze(reversed.reverse());
}

function expectedReaderBreadcrumbs(
  work: PublicationReaderEnvelope["works"][number] | undefined,
  section: PublicationReaderEnvelope["works"][number]["sections"][number] |
    undefined,
): readonly PublisherOfflineBreadcrumbProjection[] {
  if (work === undefined || section === undefined) return Object.freeze([]);
  const items = [
    Object.freeze({
      containerTagName: "li" as const,
      childCount: 1 as const,
      tagName: "a" as const,
      href: work.route,
      ariaCurrent: null,
      text: normalizedDocumentText(work.title),
    }),
    ...readerSectionTrail(work, section).map((trailSection) =>
      trailSection.id === section.id
        ? Object.freeze({
            containerTagName: "li" as const,
            childCount: 1 as const,
            tagName: "span" as const,
            href: null,
            ariaCurrent: "page" as const,
            text: normalizedDocumentText(trailSection.title),
          })
        : Object.freeze({
            containerTagName: "li" as const,
            childCount: 1 as const,
            tagName: "a" as const,
            href: readerSectionHref(work.route, trailSection),
            ariaCurrent: null,
            text: normalizedDocumentText(trailSection.title),
          })
    ),
  ];
  return Object.freeze([Object.freeze({
    tagName: "nav" as const,
    className: "publisher-breadcrumbs" as const,
    ariaLabel: "Breadcrumb" as const,
    listCount: 1 as const,
    listTagName: "ol" as const,
    items: Object.freeze(items),
  })]);
}

function expectedReaderSectionNavigations(
  work: PublicationReaderEnvelope["works"][number] | undefined,
  section: PublicationReaderEnvelope["works"][number]["sections"][number] |
    undefined,
): readonly PublisherOfflineSectionNavigationProjection[] {
  if (work === undefined || section === undefined) return Object.freeze([]);
  const previous = section.previousId === null
    ? undefined
    : work.sections.find(({ id }) => id === section.previousId);
  const next = section.nextId === null
    ? undefined
    : work.sections.find(({ id }) => id === section.nextId);
  if (
    (section.previousId !== null && previous === undefined) ||
    (section.nextId !== null && next === undefined)
  ) {
    throw new TypeError("Publisher Reader section navigation drifted.");
  }
  if (previous === undefined && next === undefined) return Object.freeze([]);
  const slots: Array<
    PublisherOfflineSectionNavigationProjection["slots"][number]
  > = [];
  if (previous === undefined) {
    slots.push(Object.freeze({
      tagName: "span" as const,
      href: null,
      text: "",
      titleSpanCount: 0 as const,
      titleLanguage: null,
      title: null,
    }));
  } else {
    slots.push(Object.freeze({
      tagName: "a" as const,
      href: readerSectionHref(work.route, previous),
      text: normalizedDocumentText(`Previous: ${previous.title}`),
      titleSpanCount: 1 as const,
      titleLanguage: work.language,
      title: normalizedDocumentText(previous.title),
    }));
  }
  if (next !== undefined) {
    slots.push(Object.freeze({
      tagName: "a" as const,
      href: readerSectionHref(work.route, next),
      text: normalizedDocumentText(`Next: ${next.title}`),
      titleSpanCount: 1 as const,
      titleLanguage: work.language,
      title: normalizedDocumentText(next.title),
    }));
  }
  return Object.freeze([Object.freeze({
    tagName: "nav" as const,
    className: "publisher-section-navigation" as const,
    ariaLabel: "Section navigation" as const,
    language: "en" as const,
    slots: Object.freeze(slots),
  })]);
}

function expectedReaderBlockLinks(
  reader: PublicationReaderEnvelope,
  workId: string,
  sectionId: string,
  blockId: string,
): readonly PublisherOfflineDocumentLinkProjection[] {
  return Object.freeze(reader.links.flatMap((link) => {
    if (
      link.source.workId !== workId ||
      link.source.sectionId !== sectionId ||
      link.source.blockId !== blockId
    ) return [];
    if (link.label === undefined) {
      throw new TypeError("Publisher Reader block link has no exact label.");
    }
    return [Object.freeze({
      href: link.href,
      label: normalizedDocumentText(link.label),
    })];
  }));
}

function expectedReaderDocumentBlocks(
  reader: PublicationReaderEnvelope,
  work: PublicationReaderEnvelope["works"][number],
  sections: readonly PublicationReaderEnvelope["works"][number]["sections"][number][],
  headingOutsideSectionId: string | null,
  renderedPath: string,
  headingOwnerTags: ReadonlyMap<string, string>,
  inlineAuthorityByBlockId: ReadonlyMap<
    string,
    PublisherOfflineInlineSemanticElementNode
  >,
): readonly PublisherOfflineDocumentBlockProjection[] {
  return Object.freeze(sections.flatMap((section) => {
    const outsideHeading = section.id === headingOutsideSectionId
      ? owningReaderHeading(section)
      : null;
    return section.blocks.map((block) => {
      const parsedInlineSemantics = inlineAuthorityByBlockId.get(block.id);
      if (parsedInlineSemantics === undefined) {
        throw new TypeError("Publisher Reader block has no inline authority.");
      }
      const headingOwnerTag = headingOwnerTags.get(block.id);
      const headingOwnerLevel = headingOwnerTag === undefined
        ? null
        : /^h([1-6])$/u.exec(headingOwnerTag)?.[1];
      const headingLevel = headingOwnerLevel === null ||
          headingOwnerLevel === undefined
        ? /^h([1-6])$/u.exec(parsedInlineSemantics.tagName)?.[1] === undefined
          ? null
          : Number(/^h([1-6])$/u.exec(parsedInlineSemantics.tagName)?.[1])
        : Number(headingOwnerLevel);
      const listTagName = parsedInlineSemantics.tagName === "ul" ||
          parsedInlineSemantics.tagName === "ol"
        ? parsedInlineSemantics.tagName
        : null;
      if (
        (block.kind === "heading" && headingLevel === null) ||
        (block.kind === "list" && listTagName === null)
      ) {
        throw new TypeError("Publisher Reader block structure drifted.");
      }
      const inlineSemantics = block.kind === "heading" && headingLevel !== null
        ? semanticElementNode(
            `h${headingLevel}` as
              PublisherOfflineInlineSemanticElementNode["tagName"],
            parsedInlineSemantics.children,
            parsedInlineSemantics.attributes,
          )
        : parsedInlineSemantics;
      const textSegments = readerBlockTextSegments(inlineSemantics);
      const headingWrapper = block.kind === "heading" &&
          headingOwnerTag === undefined && headingLevel !== null
        ? expectedHeadingWrapper(
            block,
            headingLevel,
            normalizedDocumentText(textSegments.join(" ")),
            "",
            false,
          )
        : null;
      const directChildTagNames = headingOwnerTag !== undefined
        ? inlineSemantics.children.flatMap((child) =>
            child.type === "element" ? [child.tagName] : []
          )
        : block.kind === "heading"
          ? ["div"]
          : block.kind === "paragraph"
            ? ["p"]
            : block.kind === "blockquote"
              ? ["blockquote"]
              : block.kind === "list"
                ? [listTagName as "ul" | "ol"]
                : block.kind === "thematic-break"
                  ? ["hr"]
                  : block.kind === "table"
                    ? ["div"]
                    : [];
      return Object.freeze({
        id: block.id,
        kind: block.kind,
        tagName: headingOwnerTag ?? "div",
        className: headingOwnerTag === undefined
          ? "publisher-markdown"
          : headingOwnerTag === "h1"
            ? ""
            : "publisher-section-title",
        domId: block.readerAddress?.path === renderedPath ? block.domId : null,
        headingLevel,
        listTagName,
        workOwnerId: work.id,
        sectionOwnerId: outsideHeading?.id === block.id ? null : section.id,
        text: normalizedDocumentText(textSegments.join(" ")),
        textSegments,
        directChildTagNames: Object.freeze(directChildTagNames),
        directChildClassNames: Object.freeze(directChildTagNames.map((tagName) =>
          block.kind === "heading" && headingOwnerTag === undefined &&
              tagName === "div"
            ? "publisher-linkable-heading"
            : block.kind === "table" && tagName === "div"
              ? "publisher-table-region"
              : ""
        )),
        primarySemanticChildTagName: block.kind === "paragraph"
          ? "p" as const
          : block.kind === "blockquote"
            ? "blockquote" as const
            : null,
        primarySemanticChildClassName:
          block.kind === "paragraph" || block.kind === "blockquote"
            ? "" as const
            : null,
        primarySemanticChildText:
          block.kind === "paragraph" || block.kind === "blockquote"
            ? normalizedDocumentText(textSegments.join(" "))
            : null,
        primarySemanticChildCount:
          block.kind === "paragraph" || block.kind === "blockquote"
            ? 1 as const
            : 0 as const,
        headingWrappers: Object.freeze(
          headingWrapper === null ? [] : [headingWrapper],
        ),
        prohibitedVisualElementCount: 0 as const,
        unexpectedDescendantClassCount: 0 as const,
        inlineSemantics,
        links: expectedReaderBlockLinks(
          reader,
          work.id,
          section.id,
          block.id,
        ),
      });
    });
  }));
}

function expectedOwnedDomIdOccurrences(
  targetKind: string,
  sections: readonly PublicationReaderEnvelope["works"][number]["sections"][number][],
  titleSection: PublicationReaderEnvelope["works"][number]["sections"][number] |
    undefined,
  blocks: readonly PublisherOfflineDocumentBlockProjection[],
  renderedPath: string,
): readonly string[] {
  if (targetKind === "home") return Object.freeze([]);
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const output: string[] = [];
  const appendBlock = (blockId: string | undefined): void => {
    if (blockId === undefined) return;
    const domId = blockById.get(blockId)?.domId;
    if (domId !== null && domId !== undefined) output.push(domId);
  };
  if (targetKind === "section") {
    const section = sections[0];
    const heading = section === undefined ? null : owningReaderHeading(section);
    appendBlock(heading?.id);
    if (
      section?.readerAddress?.path === renderedPath &&
      section.domId !== null
    ) output.push(section.domId);
    for (const block of section?.blocks ?? []) {
      if (block.id !== heading?.id) appendBlock(block.id);
    }
    return Object.freeze(output);
  }
  const titleHeading = titleSection === undefined
    ? null
    : owningReaderHeading(titleSection);
  appendBlock(titleHeading?.id);
  for (const section of sections) {
    const sectionDomId = section.readerAddress?.path === renderedPath
      ? section.domId
      : null;
    if (sectionDomId !== null) output.push(sectionDomId);
    for (const block of section.blocks) {
      if (block.id !== titleHeading?.id) appendBlock(block.id);
    }
  }
  return Object.freeze(output);
}

function expectedMainLinksForReaderRoute(
  reader: PublicationReaderEnvelope,
  target: Readonly<Record<string, string>>,
  blocks: readonly PublisherOfflineDocumentBlockProjection[],
): readonly PublisherOfflineDocumentLinkProjection[] {
  if (target.kind === "home") {
    return Object.freeze([
      ...reader.works.map((work) => Object.freeze({
        href: work.route,
        label: normalizedDocumentText(work.title),
      })),
      ...reader.collections.map((collection) => Object.freeze({
        href: collection.route,
        label: normalizedDocumentText(collection.title),
      })),
    ]);
  }
  const work = reader.works.find(({ id }) => id === target.workId);
  if (work === undefined) {
    throw new TypeError("Publisher semantic route has no Reader work.");
  }
  const blockLinks = blocks.flatMap(({ links }) => links);
  if (target.kind === "work") return Object.freeze(blockLinks);
  const section = work.sections.find(({ id }) => id === target.sectionId);
  if (section === undefined) {
    throw new TypeError("Publisher semantic route has no Reader section.");
  }
  const trail = readerSectionTrail(work, section);
  const previous = section.previousId === null
    ? undefined
    : work.sections.find(({ id }) => id === section.previousId);
  const next = section.nextId === null
    ? undefined
    : work.sections.find(({ id }) => id === section.nextId);
  if (
    (section.previousId !== null && previous === undefined) ||
    (section.nextId !== null && next === undefined)
  ) {
    throw new TypeError("Publisher semantic route navigation drifted.");
  }
  return Object.freeze([
    Object.freeze({
      href: work.route,
      label: normalizedDocumentText(work.title),
    }),
    ...trail.slice(0, -1).map((ancestor) => Object.freeze({
      href: readerSectionHref(work.route, ancestor),
      label: normalizedDocumentText(ancestor.title),
    })),
    ...blockLinks,
    ...(previous === undefined
      ? []
      : [Object.freeze({
          href: readerSectionHref(work.route, previous),
          label: normalizedDocumentText(`Previous: ${previous.title}`),
        })]),
    ...(next === undefined
      ? []
      : [Object.freeze({
          href: readerSectionHref(work.route, next),
          label: normalizedDocumentText(`Next: ${next.title}`),
        })]),
  ]);
}

export function createPublisherOfflineDocumentSemanticAuthorities(
  reader: PublicationReaderEnvelope,
  offlinePackage: ReaderOfflinePackage,
): readonly PublisherOfflineDocumentSemanticAuthority[] {
  if (reader.collections.length !== 0) {
    throw new TypeError("Publisher offline home collection authority drifted.");
  }
  const authorityWork = reader.works.find(
    ({ id }) => id === offlinePackage.workId,
  );
  if (authorityWork === undefined || authorityWork.id !== CARDINAL_SCALE_WORK_ID) {
    throw new TypeError("Publisher offline Markdown authority work drifted.");
  }
  const inlineAuthorityByBlockId = createReaderBlockInlineAuthorities(
    reader,
    authorityWork,
  );
  const activeByPath = new Map<string, PublicationReaderEnvelope["routes"]["active"][number]>();
  for (const route of reader.routes.active) {
    publicHref(route.path, "Publisher semantic active route");
    if (activeByPath.has(route.path)) {
      throw new TypeError("Publisher semantic active route is duplicated.");
    }
    activeByPath.set(route.path, route);
  }
  const redirectByFrom = new Map<string, string>();
  for (const redirect of reader.routes.redirects) {
    publicHref(redirect.from, "Publisher semantic redirect source");
    publicHref(redirect.to, "Publisher semantic redirect target");
    if (
      redirectByFrom.has(redirect.from) ||
      activeByPath.has(redirect.from)
    ) {
      throw new TypeError("Publisher semantic redirect source is duplicated.");
    }
    redirectByFrom.set(redirect.from, redirect.to);
  }
  return Object.freeze(offlinePackage.resources.flatMap((resource) => {
    if (resource.kind !== "document") return [];
    let resolvedHref = resource.href;
    const visited = new Set<string>();
    while (redirectByFrom.has(resolvedHref)) {
      if (
        visited.has(resolvedHref) ||
        visited.size > reader.routes.redirects.length
      ) {
        throw new TypeError("Publisher Reader redirect authority contains a cycle.");
      }
      visited.add(resolvedHref);
      const next = redirectByFrom.get(resolvedHref);
      if (next === undefined) break;
      resolvedHref = next;
    }
    const route = activeByPath.get(resolvedHref);
    if (route === undefined) {
      throw new TypeError("Publisher offline document has no active Reader target.");
    }
    const targetRecord = asRecord(
      route.target,
      "Publisher offline document route target",
    );
    const target = Object.freeze(Object.fromEntries(
      Object.entries(targetRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => {
          if (typeof value !== "string") {
            throw new TypeError("Publisher Reader route target is not scalar.");
          }
          return [key, value];
        }),
    ));
    if (
      !["home", "work", "section"].includes(target.kind ?? "") ||
      (target.kind !== "home" && target.workId !== offlinePackage.workId)
    ) {
      throw new TypeError("Publisher offline document escaped its Reader work.");
    }
    const work = target.kind === "home"
      ? undefined
      : reader.works.find(({ id }) => id === target.workId);
    const section = target.kind === "section"
      ? work?.sections.find(({ id }) => id === target.sectionId)
      : undefined;
    if (
      (target.kind !== "home" && work === undefined) ||
      (target.kind === "section" && section === undefined)
    ) {
      throw new TypeError("Publisher offline document Reader ownership drifted.");
    }
    const titleSection = target.kind === "work" &&
        work !== undefined &&
        work.rootSectionIds.length === 1
      ? work.sections.find(({ id, title }) =>
          id === work.rootSectionIds[0] && title === work.title
        )
      : undefined;
    const sections = target.kind === "work" && work !== undefined
      ? work.sections
      : section === undefined
        ? []
        : [section];
    const renderedPath = new URL(
      resolvedHref,
      "https://publisher.invalid",
    ).pathname;
    const headingOwnerTags = new Map<string, string>();
    if (target.kind === "section" && section !== undefined) {
      const heading = owningReaderHeading(section);
      if (heading !== null) headingOwnerTags.set(heading.id, "h1");
    } else if (target.kind === "work" && work !== undefined) {
      const titleHeading = titleSection === undefined
        ? null
        : owningReaderHeading(titleSection);
      if (titleHeading !== null) headingOwnerTags.set(titleHeading.id, "h1");
      for (const readerSection of work.sections) {
        if (readerSection.id === titleSection?.id) continue;
        const heading = owningReaderHeading(readerSection);
        if (heading !== null) {
          headingOwnerTags.set(
            heading.id,
            `h${Math.min(6, Math.max(2, readerSection.depth + 2))}`,
          );
        }
      }
    }
    const blocks = work === undefined
      ? Object.freeze([])
      : expectedReaderDocumentBlocks(
          reader,
          work,
          sections,
          target.kind === "section"
            ? section?.id ?? null
            : titleSection?.id ?? null,
          renderedPath,
          headingOwnerTags,
          inlineAuthorityByBlockId,
        );
    const routeHeadingBlock = target.kind === "work"
      ? titleSection === undefined ? null : owningReaderHeading(titleSection)
      : target.kind === "section" && section !== undefined
        ? owningReaderHeading(section)
        : null;
    const routeHeadingContainer = target.kind === "home"
      ? expectedDirectChild("h1")
      : expectedHeadingContainer(routeHeadingBlock, 1);
    const routeTitle = normalizedDocumentText(
      target.kind === "home"
        ? reader.publication.title
        : target.kind === "work"
          ? work?.title ?? ""
          : section?.title ?? "",
    );
    const routeHeadingWrapper = target.kind === "home"
      ? null
      : expectedHeadingWrapper(routeHeadingBlock, 1, routeTitle);
    const sectionDirectChildren = new Map(sections.map((readerSection) => {
      const sectionHeading = owningReaderHeading(readerSection);
      const isWorkSectionTitle = target.kind === "work" &&
        readerSection.id !== titleSection?.id;
      const omittedBlockId = target.kind === "section" ||
          readerSection.id === titleSection?.id
        ? sectionHeading?.id
        : isWorkSectionTitle
          ? sectionHeading?.id
          : undefined;
      const children = [
        ...(isWorkSectionTitle
          ? [expectedHeadingContainer(
              sectionHeading,
              Math.min(6, Math.max(2, readerSection.depth + 2)),
              "publisher-section-title",
            )]
          : []),
        ...readerSection.blocks.flatMap((block) =>
          block.id === omittedBlockId
            ? []
            : [expectedDirectChild(
                "div",
                "publisher-markdown",
                [block.id],
              )]
        ),
      ];
      return [readerSection.id, Object.freeze(children)] as const;
    }));
    const manuscriptDirectChildren = Object.freeze(sections.map((readerSection) =>
      expectedDirectChild(
        "section",
        "publisher-manuscript-section",
        (sectionDirectChildren.get(readerSection.id) ?? []).flatMap((child) =>
          child.className === "publisher-linkable-heading"
            ? []
            : child.ownedBlockIds
        ),
      )
    ));
    const headerDirectChildren = Object.freeze(target.kind === "work"
      ? [
          routeHeadingContainer,
          ...(work?.subtitle === undefined
            ? []
            : [expectedDirectChild("p", "publisher-work-subtitle")]),
          ...(work?.summary === undefined
            ? []
            : [expectedDirectChild("p")]),
        ]
      : target.kind === "section"
        ? [
            expectedDirectChild("nav", "publisher-breadcrumbs"),
            routeHeadingContainer,
          ]
        : []);
    const articleDirectChildren = Object.freeze(target.kind === "home"
      ? []
      : [
          expectedDirectChild("header"),
          expectedDirectChild("div", "publisher-manuscript"),
          ...(section !== undefined &&
              (section.previousId !== null || section.nextId !== null)
            ? [expectedDirectChild("nav", "publisher-section-navigation")]
            : []),
        ]);
    const mainDirectChildren = Object.freeze(target.kind === "home"
      ? [
          routeHeadingContainer,
          ...(reader.publication.description === undefined
            ? []
            : [expectedDirectChild("p", "publisher-publication-description")]),
          expectedDirectChild("section"),
        ]
      : [expectedDirectChild("article")]);
    const expectedDom = Object.freeze({
      documentElementTagName: "html" as const,
      documentLanguage: reader.publication.language,
      headCount: 1 as const,
      headIsDirectDocumentElementChild: true as const,
      bodyCount: 1 as const,
      bodyIsDirectDocumentElementChild: true as const,
      nextStreamingPlaceholderCount: 1 as const,
      nextStreamingPlaceholderTagName: "div" as const,
      nextStreamingPlaceholderIsDirectFirstBodyElement: true as const,
      nextStreamingPlaceholderAttributes: Object.freeze([
        Object.freeze(["hidden", ""] as const),
      ]),
      nextStreamingPlaceholderSerializedChildCount: 0 as const,
      nextStreamingPlaceholderStructuralDriftCount: 0 as const,
      bodyVisibleSiblingCount: 0 as const,
      bodyDirectText: Object.freeze([]),
      rootCount: 1 as const,
      rootTagName: "div" as const,
      rootClassName: "publisher-root" as const,
      rootIsDirectBodyChild: true as const,
      rootDirectChildren: Object.freeze([
        expectedDirectChild("a", "publisher-skip-link"),
        expectedDirectChild("header", "publisher-site-header"),
        expectedDirectChild("aside", "publisher-reader-rail"),
        expectedDirectChild("main"),
        expectedDirectChild("footer", "publisher-attribution"),
      ]),
      mainCount: 1 as const,
      mainId: "publisher:main" as const,
      mainClassName: "" as const,
      mainIsDirectRootChild: true as const,
      mainDirectChildren,
      unownedDirectText: Object.freeze([]),
      allOwnedByRoot: true as const,
      allOwnedByMain: true as const,
      pageKind: target.kind as "home" | "work" | "section",
      titleCount: 1 as const,
      title: routeTitle,
      titleWrapperCount: routeHeadingWrapper === null ? 0 as const : 1 as const,
      titleWrappers: Object.freeze(
        routeHeadingWrapper === null ? [] : [routeHeadingWrapper],
      ),
      readerRailCount: 1 as const,
      readerRailActionCount: 1 as const,
      readerRailProgressAriaLabel: target.kind === "section"
        ? "0% read" as const
        : "Publication tools" as const,
      readerRailProgressText: "§" as const,
      readerRailStructuralDriftCount: 0 as const,
      readerRailProjectionHash: PUBLISHER_OFFLINE_EXPECTED_READER_RAIL_HASH,
      dormantNarrationAudioHostCount: 1 as const,
      dormantNarrationAudioElementCount: 1 as const,
      dormantNarrationAudioStructuralDriftCount: 0 as const,
      dormantNarrationAudioHostStyleMatchesRoot: true as const,
      dormantNarrationAudioProjectionHash:
        PUBLISHER_OFFLINE_EXPECTED_DORMANT_AUDIO_SHELL_HASH,
      unexpectedMediaElementCount: 0 as const,
      declarativeShadowDomTemplateCount: 0 as const,
      styleElementCount: 0 as const,
      unsafeHeadElementCount: 0 as const,
      nonLiveSemanticContainerCount: 0 as const,
      semanticInlineStyleCount: 0 as const,
      inlineEventHandlerAttributeCount: 0 as const,
      explicitSemanticRoleCount: 0 as const,
      unexpectedSemanticDirectionCount: 0 as const,
      unexpectedSemanticLanguageAttributeCount: 0 as const,
      unexpectedPresentationalHintCount: 0 as const,
      unexpectedSemanticClassCount: 0 as const,
      unexpectedInteractiveElementCount: 0 as const,
      unexpectedSemanticAriaAttributeCount: 0 as const,
      unexpectedMainAnchorAttributeCount: 0 as const,
      plainSemanticInlineDriftCount: 0 as const,
      fixedIdentityDriftCount: 0 as const,
      publicationDescriptionCount: target.kind === "home" &&
          reader.publication.description !== undefined
        ? 1 as const
        : 0 as const,
      publicationDescriptionTagName: target.kind === "home" &&
          reader.publication.description !== undefined
        ? "p" as const
        : null,
      publicationDescription: target.kind === "home" &&
          reader.publication.description !== undefined
        ? normalizedDocumentText(reader.publication.description)
        : null,
      homeCollectionSectionCount: 0 as const,
      homeCollectionCardCount: 0 as const,
      homeWorksSectionCount: target.kind === "home" ? 1 as const : 0 as const,
      homeWorksSections: Object.freeze(target.kind === "home"
        ? [Object.freeze({
            tagName: "section" as const,
            ariaLabelledBy: "publisher-works-heading" as const,
            headingCount: 1 as const,
            heading: Object.freeze({
              tagName: "h2" as const,
              id: "publisher-works-heading" as const,
              language: "en" as const,
              text: "Works" as const,
            }),
            listCount: 1 as const,
            listTagName: "ol" as const,
            listClassName: "publisher-catalog" as const,
            directChildren: Object.freeze([
              expectedDirectChild("h2"),
              expectedDirectChild("ol", "publisher-catalog"),
            ]),
            cards: Object.freeze(reader.works.map((readerWork) => Object.freeze({
              route: readerWork.route,
              tagName: "li" as const,
              language: readerWork.language,
              headingCount: 1 as const,
              headingTagName: "h3" as const,
              headingText: normalizedDocumentText(readerWork.title),
              headingDirectChildren: Object.freeze([
                expectedDirectChild("a"),
              ]),
              routeLinkCount: 1 as const,
              title: normalizedDocumentText(readerWork.title),
              details: Object.freeze([
                ...(readerWork.subtitle === undefined
                  ? []
                  : [normalizedDocumentText(readerWork.subtitle)]),
                ...(readerWork.summary === undefined
                  ? []
                  : [normalizedDocumentText(readerWork.summary)]),
              ]),
              readingStatCount: 1 as const,
              readingStatTagName: "p" as const,
              readingStatLanguage: "en" as const,
              wordCount: readerWork.wordCount,
              readingMinutes: readerWork.readingMinutes,
              readingStat: readerWorkReadingStat(readerWork),
              directChildren: Object.freeze([
                expectedDirectChild("h3"),
                ...(readerWork.subtitle === undefined
                  ? []
                  : [expectedDirectChild("p")]),
                ...(readerWork.summary === undefined
                  ? []
                  : [expectedDirectChild("p")]),
                expectedDirectChild("p", "publisher-reading-stat"),
              ]),
            }))),
          })]
        : []),
      breadcrumbNavigationCount: target.kind === "section" ? 1 as const : 0 as const,
      breadcrumbs: expectedReaderBreadcrumbs(work, section),
      sectionNavigationCount: target.kind === "section" &&
          (section?.previousId !== null || section?.nextId !== null)
        ? 1 as const
        : 0 as const,
      sectionNavigations: expectedReaderSectionNavigations(work, section),
      workOwners: Object.freeze(work === undefined
        ? []
        : [Object.freeze({
            id: work.id,
            tagName: "article" as const,
            className: "" as const,
            language: work.language,
            subtitleCount: target.kind === "work" && work.subtitle !== undefined
              ? 1 as const
              : 0 as const,
            subtitle: target.kind === "work" && work.subtitle !== undefined
              ? normalizedDocumentText(work.subtitle)
              : null,
            summaryCount: target.kind === "work" && work.summary !== undefined
              ? 1 as const
              : 0 as const,
            summary: target.kind === "work" && work.summary !== undefined
              ? normalizedDocumentText(work.summary)
              : null,
            headerDirectChildren,
            articleDirectChildren,
            manuscriptDirectChildren,
          })]),
      sectionOwners: Object.freeze(sections.map((readerSection) => Object.freeze({
        id: readerSection.id,
        tagName: "section" as const,
        className: "publisher-manuscript-section" as const,
        domId: readerSection.readerAddress?.path === renderedPath
          ? readerSection.domId
          : null,
        directChildren: sectionDirectChildren.get(readerSection.id) ??
          Object.freeze([]),
        titleHeadingCount: target.kind === "work" &&
            readerSection.id !== titleSection?.id
          ? 1 as const
          : 0 as const,
        titleHeading: target.kind === "work" &&
            readerSection.id !== titleSection?.id
          ? (() => {
              const headingBlock = owningReaderHeading(readerSection);
              const level = Math.min(
                6,
                Math.max(2, readerSection.depth + 2),
              );
              const text = normalizedDocumentText(
                headingBlock?.text ?? readerSection.title,
              );
              const wrapper = expectedHeadingWrapper(
                headingBlock,
                level,
                text,
                "publisher-section-title",
              );
              return Object.freeze({
                tagName: `h${level}` as
                  "h2" | "h3" | "h4" | "h5" | "h6",
                text,
                blockId: headingBlock?.id ?? null,
                wrapped: wrapper !== null,
                wrappers: Object.freeze(wrapper === null ? [] : [wrapper]),
              });
            })()
          : null,
      }))),
      blocks,
      links: expectedMainLinksForReaderRoute(reader, target, blocks),
      ownedDomIdOccurrences: expectedOwnedDomIdOccurrences(
        target.kind ?? "",
        sections,
        titleSection,
        blocks,
        renderedPath,
      ),
    });
    return [Object.freeze({
      readerBuildId: PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID,
      href: publicHref(resource.href, "Publisher semantic document href"),
      resolvedHref: publicHref(
        resolvedHref,
        "Publisher semantic resolved document href",
      ),
      routeTarget: target,
      readerBlockOwners: Object.freeze(sections.flatMap((readerSection) =>
        readerSection.blocks.map((block) => {
          const projectedBlock = blocks.find(({ id }) => id === block.id);
          if (projectedBlock === undefined) {
            throw new TypeError(
              "Publisher Reader block owner has no rendered projection.",
            );
          }
          return Object.freeze({
            blockId: block.id,
            sectionId: readerSection.id,
            kind: block.kind,
            text: projectedBlock.text,
            textSegments: projectedBlock.textSegments,
            inlineSemantics: projectedBlock.inlineSemantics,
          });
        })
      )),
      readerHomeWorkCards: Object.freeze(target.kind === "home"
        ? reader.works.map((readerWork) => Object.freeze({
            workId: readerWork.id,
            route: readerWork.route,
            subtitle: readerWork.subtitle === undefined
              ? null
              : normalizedDocumentText(readerWork.subtitle),
            summary: readerWork.summary === undefined
              ? null
              : normalizedDocumentText(readerWork.summary),
          }))
        : []),
      expectedDom,
    })];
  }));
}

export function assertPublisherOfflineDocumentSemanticProjection(
  authority: PublisherOfflineDocumentSemanticAuthority,
  actual: PublisherOfflineDocumentDomProjection,
): string {
  if (
    authority.readerBuildId !== PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID ||
    publicHref(authority.href, "Publisher semantic authority href") !==
      authority.href ||
    publicHref(
      authority.resolvedHref,
      "Publisher semantic authority resolved href",
    ) !== authority.resolvedHref
  ) {
    throw new TypeError(
      "Publisher cached document diverged from its exact Reader projection.",
    );
  }
  if (!isDeepStrictEqual(actual, authority.expectedDom)) {
    let difference: PublisherOfflineProjectionDifference;
    try {
      difference = firstPublisherOfflineProjectionDifference(
        authority.expectedDom,
        actual,
      );
    } catch {
      throw new TypeError(
        "Publisher cached document divergence exceeded diagnostic bounds.",
      );
    }
    const message =
      "Publisher cached document diverged from its exact Reader projection " +
      `at ${authority.href} ${difference.path}; expected ` +
      `${difference.expected.kind}:${difference.expected.length}:` +
      `${difference.expected.hash}; actual ` +
      `${difference.actual.kind}:${difference.actual.length}:` +
      `${difference.actual.hash}.`;
    if (message.length > 1_024) {
      throw new TypeError(
        "Publisher cached document divergence exceeded diagnostic bounds.",
      );
    }
    throw new TypeError(message);
  }
  return hashJson(Object.freeze({ authority, actual }));
}

type PublisherOfflineProjectionDifferenceValue = Readonly<{
  kind: "missing" | "null" | "array" | "object" | "string" | "number" |
    "boolean";
  length: number;
  hash: string;
}>;

type PublisherOfflineProjectionDifference = Readonly<{
  path: string;
  expected: PublisherOfflineProjectionDifferenceValue;
  actual: PublisherOfflineProjectionDifferenceValue;
}>;

function publisherOfflineProjectionDifferenceValue(
  present: boolean,
  value: unknown,
): PublisherOfflineProjectionDifferenceValue {
  const kind = !present
    ? "missing" as const
    : value === null
      ? "null" as const
      : Array.isArray(value)
        ? "array" as const
        : typeof value === "object"
          ? "object" as const
          : typeof value === "string"
            ? "string" as const
            : typeof value === "number"
              ? "number" as const
              : "boolean" as const;
  const length = !present || value === null
    ? 0
    : typeof value === "string" || Array.isArray(value)
      ? value.length
      : typeof value === "object"
        ? Object.keys(value as Record<string, unknown>).length
        : 1;
  return Object.freeze({
    kind,
    length,
    hash: hashJson(Object.freeze({
      present,
      value: present ? value : null,
    })),
  });
}

function publisherOfflineJsonPointerToken(value: string): string {
  if (value.length > 64 || !/^[A-Za-z][A-Za-z0-9]*$/u.test(value)) {
    return `@${sha256Bytes(value)}`;
  }
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function firstPublisherOfflineProjectionDifference(
  expected: unknown,
  actual: unknown,
): PublisherOfflineProjectionDifference {
  type Pending = Readonly<{
    path: string;
    expectedPresent: boolean;
    expected: unknown;
    actualPresent: boolean;
    actual: unknown;
  }>;
  const pending: Pending[] = [{
    path: "",
    expectedPresent: true,
    expected,
    actualPresent: true,
    actual,
  }];
  let visitedEntries = 0;
  while (pending.length > 0) {
    visitedEntries += 1;
    if (visitedEntries > 200_000) {
      throw new TypeError("Publisher semantic difference diagnosis exceeded bounds.");
    }
    const current = pending.pop();
    if (current === undefined) break;
    if (
      current.expectedPresent === current.actualPresent &&
      Object.is(current.expected, current.actual)
    ) continue;
    if (
      current.expectedPresent && current.actualPresent &&
      Array.isArray(current.expected) && Array.isArray(current.actual) &&
      current.expected.length === current.actual.length
    ) {
      if (pending.length + current.expected.length > 200_000) {
        throw new TypeError("Publisher semantic difference diagnosis exceeded bounds.");
      }
      for (let index = current.expected.length - 1; index >= 0; index -= 1) {
        const path = `${current.path}/${index}`;
        if (path.length > 512) {
          throw new TypeError("Publisher semantic difference diagnosis exceeded bounds.");
        }
        pending.push({
          path,
          expectedPresent: true,
          expected: current.expected[index],
          actualPresent: true,
          actual: current.actual[index],
        });
      }
      continue;
    }
    const expectedRecord = current.expected !== null &&
        typeof current.expected === "object" &&
        !Array.isArray(current.expected)
      ? current.expected as Record<string, unknown>
      : null;
    const actualRecord = current.actual !== null &&
        typeof current.actual === "object" &&
        !Array.isArray(current.actual)
      ? current.actual as Record<string, unknown>
      : null;
    if (
      current.expectedPresent && current.actualPresent &&
      expectedRecord !== null && actualRecord !== null
    ) {
      const keys = [...new Set([
        ...Object.keys(expectedRecord),
        ...Object.keys(actualRecord),
      ])].sort(codePointCompare);
      if (pending.length + keys.length > 200_000) {
        throw new TypeError("Publisher semantic difference diagnosis exceeded bounds.");
      }
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index];
        if (key === undefined) continue;
        const path = `${current.path}/${publisherOfflineJsonPointerToken(key)}`;
        if (path.length > 512) {
          throw new TypeError("Publisher semantic difference diagnosis exceeded bounds.");
        }
        pending.push({
          path,
          expectedPresent: Object.hasOwn(expectedRecord, key),
          expected: expectedRecord[key],
          actualPresent: Object.hasOwn(actualRecord, key),
          actual: actualRecord[key],
        });
      }
      continue;
    }
    return Object.freeze({
      path: current.path === "" ? "/" : current.path,
      expected: publisherOfflineProjectionDifferenceValue(
        current.expectedPresent,
        current.expected,
      ),
      actual: publisherOfflineProjectionDifferenceValue(
        current.actualPresent,
        current.actual,
      ),
    });
  }
  throw new TypeError("Publisher semantic difference diagnosis was inconclusive.");
}

export function projectPublisherOfflineDocumentTree(
  value: unknown,
  input: Readonly<{ cardinalOwnedDomIds: readonly string[] }>,
): PublisherOfflineDocumentDomProjection {
  const treeRecord = asRecord(value, "Publisher offline HTML document tree");
  assertExactKeys(
    treeRecord,
    [
      "root",
      "nodeCount",
      "maximumDepth",
      "attributeCount",
      "attributeCodeUnits",
      "textCodeUnits",
    ],
    "Publisher offline HTML document tree",
  );
  let nodeCount = 0;
  let maximumDepth = 0;
  let attributeCount = 0;
  let attributeCodeUnits = 0;
  let textCodeUnits = 0;
  const parents = new Map<
    PublisherOfflineHtmlTreeElementNode,
    PublisherOfflineHtmlTreeElementNode | null
  >();
  const elements: PublisherOfflineHtmlTreeElementNode[] = [];
  const seenNodes = new WeakSet<object>();
  const validateNode = (
    candidate: unknown,
    parent: PublisherOfflineHtmlTreeElementNode | null,
    depth: number,
  ): PublisherOfflineHtmlTreeNode => {
    const record = asRecord(candidate, "Publisher offline HTML tree node");
    if (seenNodes.has(record)) {
      throw new TypeError("Publisher offline HTML tree contains a cycle or alias.");
    }
    seenNodes.add(record);
    nodeCount += 1;
    maximumDepth = Math.max(maximumDepth, depth);
    if (
      nodeCount > PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_NODES ||
      depth > PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_DEPTH
    ) {
      throw new TypeError("Publisher offline HTML tree exceeds its node cap.");
    }
    if (record.type === "text") {
      assertExactKeys(
        record,
        ["type", "value"],
        "Publisher offline HTML text node",
      );
      if (typeof record.value !== "string") {
        throw new TypeError("Publisher offline HTML text node drifted.");
      }
      textCodeUnits += record.value.length;
      if (
        textCodeUnits > PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_TEXT_CODE_UNITS
      ) {
        throw new TypeError("Publisher offline HTML tree exceeds its text cap.");
      }
      return record as unknown as PublisherOfflineHtmlTreeTextNode;
    }
    assertExactKeys(
      record,
      ["type", "tagName", "attributes", "children"],
      "Publisher offline HTML element node",
    );
    if (
      record.type !== "element" ||
      typeof record.tagName !== "string" ||
      !/^[a-z][a-z0-9:-]*$/u.test(record.tagName) ||
      !Array.isArray(record.attributes) ||
      !Array.isArray(record.children) ||
      record.attributes.length >
        PUBLISHER_OFFLINE_MAXIMUM_HTML_ATTRIBUTES_PER_ELEMENT
    ) {
      throw new TypeError("Publisher offline HTML element node drifted.");
    }
    const attributes = record.attributes as unknown[];
    const names: string[] = [];
    for (const row of attributes) {
      if (
        !Array.isArray(row) ||
        row.length !== 2 ||
        typeof row[0] !== "string" ||
        typeof row[1] !== "string" ||
        !/^[A-Za-z_:][A-Za-z0-9:._-]*$/u.test(row[0])
      ) {
        throw new TypeError("Publisher offline HTML attribute row drifted.");
      }
      names.push(row[0]);
      attributeCount += 1;
      attributeCodeUnits += row[0].length + row[1].length;
    }
    if (
      new Set(names).size !== names.length ||
      !isDeepStrictEqual(names, sorted(names)) ||
      attributeCodeUnits >
        PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_ATTRIBUTE_CODE_UNITS
    ) {
      throw new TypeError("Publisher offline HTML attributes exceed authority.");
    }
    const element = record as unknown as PublisherOfflineHtmlTreeElementNode;
    parents.set(element, parent);
    elements.push(element);
    for (const child of record.children as unknown[]) {
      validateNode(child, element, depth + 1);
    }
    return element;
  };
  const root = validateNode(treeRecord.root, null, 1);
  if (root.type !== "element") {
    throw new TypeError("Publisher offline HTML document root drifted.");
  }
  if (
    treeRecord.nodeCount !== nodeCount ||
    treeRecord.maximumDepth !== maximumDepth ||
    treeRecord.attributeCount !== attributeCount ||
    treeRecord.attributeCodeUnits !== attributeCodeUnits ||
    treeRecord.textCodeUnits !== textCodeUnits
  ) {
    throw new TypeError("Publisher offline HTML tree census drifted.");
  }
  const elementChildren = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): PublisherOfflineHtmlTreeElementNode[] =>
    element.children.filter(
      (child): child is PublisherOfflineHtmlTreeElementNode =>
        child.type === "element",
    );
  const attributes = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): Map<string, string> => new Map(element.attributes);
  const attribute = (
    element: PublisherOfflineHtmlTreeElementNode,
    name: string,
  ): string | null => attributes(element).get(name) ?? null;
  const hasAttribute = (
    element: PublisherOfflineHtmlTreeElementNode,
    name: string,
  ): boolean => attributes(element).has(name);
  const hasClass = (
    element: PublisherOfflineHtmlTreeElementNode,
    className: string,
  ): boolean => (attribute(element, "class") ?? "")
    .split(/[\u0009\u000A\u000C\u000D\u0020]+/u).includes(className);
  const descendants = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): PublisherOfflineHtmlTreeElementNode[] => {
    const output: PublisherOfflineHtmlTreeElementNode[] = [];
    const visit = (current: PublisherOfflineHtmlTreeElementNode): void => {
      for (const child of elementChildren(current)) {
        output.push(child);
        visit(child);
      }
    };
    visit(element);
    return output;
  };
  const contains = (
    ancestor: PublisherOfflineHtmlTreeElementNode,
    candidate: PublisherOfflineHtmlTreeElementNode,
  ): boolean => {
    let current: PublisherOfflineHtmlTreeElementNode | null = candidate;
    while (current !== null) {
      if (current === ancestor) return true;
      current = parents.get(current) ?? null;
    }
    return false;
  };
  const closestAttribute = (
    element: PublisherOfflineHtmlTreeElementNode,
    name: string,
  ): string | null => {
    let current: PublisherOfflineHtmlTreeElementNode | null = element;
    while (current !== null) {
      const result = attribute(current, name);
      if (result !== null) return result;
      current = parents.get(current) ?? null;
    }
    return null;
  };
  const normalized = normalizedDocumentText;
  const inlineStyleHides = (element: PublisherOfflineHtmlTreeElementNode): boolean => {
    const style = attribute(element, "style");
    if (style === null) return false;
    return style.split(";").some((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 1) return false;
      const property = trimHtmlSpaceCharacters(
        declaration.slice(0, separator),
      ).toLowerCase();
      const value = trimHtmlSpaceCharacters(
        trimHtmlSpaceCharacters(declaration.slice(separator + 1)).toLowerCase()
          .replace(
            /[\u0009\u000A\u000C\u000D\u0020]*!important[\u0009\u000A\u000C\u000D\u0020]*$/u,
            "",
          ),
      );
      return (property === "display" && value === "none") ||
        (property === "visibility" && ["hidden", "collapse"].includes(value)) ||
        (property === "content-visibility" && value === "hidden") ||
        (property === "opacity" && /^0(?:\.0+)?%?$/u.test(value));
    });
  };
  const intrinsicallyNonLiveTags = new Set([
    "datalist",
    "noembed",
    "noframes",
    "rp",
    "title",
  ]);
  const isNonLiveSemanticContainer = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): boolean => hasAttribute(element, "hidden") ||
    hasAttribute(element, "inert") ||
    trimHtmlSpaceCharacters(attribute(element, "aria-hidden") ?? "")
        .toLowerCase() === "true" ||
    inlineStyleHides(element) ||
    intrinsicallyNonLiveTags.has(element.tagName) ||
    (element.tagName === "details" && !hasAttribute(element, "open")) ||
    (element.tagName === "dialog" && !hasAttribute(element, "open")) ||
    hasAttribute(element, "popover");
  const boundaryTags = new Set([
    "p",
    "li",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "br",
    "hr",
    "tr",
    "th",
    "td",
  ]);
  const visibleText = (element: PublisherOfflineHtmlTreeElementNode): string => {
    const output: string[] = [];
    const visit = (node: PublisherOfflineHtmlTreeNode): void => {
      if (node.type === "text") {
        output.push(node.value);
        return;
      }
      if (
        hasAttribute(node, "hidden") ||
        ["script", "style", "template", "noscript"].includes(node.tagName)
      ) return;
      const boundary = boundaryTags.has(node.tagName);
      if (boundary) output.push(" ");
      for (const child of node.children) visit(child);
      if (boundary) output.push(" ");
    };
    visit(element);
    return normalized(output.join(""));
  };
  const all = [root, ...descendants(root)];
  const linkProjection = (element: PublisherOfflineHtmlTreeElementNode) => ({
    href: attribute(element, "href") ?? "",
    label: visibleText(element),
  });
  const directChildProjection = (
    element: PublisherOfflineHtmlTreeElementNode,
  ) => ({
    tagName: element.tagName,
    className: attribute(element, "class") ?? "",
    ownedBlockIds: [element, ...elementChildren(element)].flatMap((candidate) => {
      const blockId = attribute(candidate, "data-publisher-block");
      return blockId === null ? [] : [blockId];
    }),
  });
  const blockKind = (element: PublisherOfflineHtmlTreeElementNode): string => {
    if (/^h[1-6]$/u.test(element.tagName)) return "heading";
    const direct = elementChildren(element)[0];
    if (direct === undefined) return "unknown";
    if (hasClass(direct, "publisher-linkable-heading") ||
      /^h[1-6]$/u.test(direct.tagName)) return "heading";
    if (direct.tagName === "p") return "paragraph";
    if (direct.tagName === "ul" || direct.tagName === "ol") return "list";
    if (direct.tagName === "blockquote") return "blockquote";
    if (direct.tagName === "hr") return "thematic-break";
    if (
      direct.tagName === "table" ||
      descendants(direct).some(({ tagName }) => tagName === "table")
    ) return "table";
    return "unknown";
  };
  const directOrWrappedHeadings = (
    container: PublisherOfflineHtmlTreeElementNode | undefined,
    matches: (element: PublisherOfflineHtmlTreeElementNode) => boolean,
  ): Array<{
    element: PublisherOfflineHtmlTreeElementNode;
    wrapped: boolean;
    container: PublisherOfflineHtmlTreeElementNode;
  }> => container === undefined
    ? []
    : elementChildren(container).flatMap((child): Array<{
        element: PublisherOfflineHtmlTreeElementNode;
        wrapped: boolean;
        container: PublisherOfflineHtmlTreeElementNode;
      }> => {
        if (matches(child)) {
          return [{ element: child, wrapped: false, container: child }];
        }
        if (!hasClass(child, "publisher-linkable-heading")) return [];
        return elementChildren(child).filter(matches).map((element) => ({
          element,
          wrapped: true,
          container: child,
        }));
      });
  const headingWrapperProjection = (
    wrapper: PublisherOfflineHtmlTreeElementNode,
  ) => {
    const actions = elementChildren(wrapper).filter((element) =>
      element.tagName === "button" &&
      hasClass(element, "publisher-heading-action")
    );
    return {
      tagName: wrapper.tagName,
      className: attribute(wrapper, "class") ?? "",
      text: visibleText(wrapper),
      directChildren: elementChildren(wrapper).map(directChildProjection),
      actions: actions.map((action) => ({
        tagName: action.tagName,
        className: attribute(action, "class") ?? "",
        hidden: hasAttribute(action, "hidden"),
        transient: attribute(action, "data-publisher-reader-transient-ui"),
        href: attribute(action, "data-publisher-heading-href") ?? "",
        ariaLabel: attribute(action, "aria-label") ?? "",
        title: attribute(action, "title") ?? "",
        buttonType: attribute(action, "type") ?? "",
        iconCount: elementChildren(action).length,
        iconTagName: elementChildren(action)[0]?.tagName ?? "",
      })),
    };
  };
  const roots = all.filter((element) =>
    hasClass(element, "publisher-root") &&
    hasAttribute(element, "data-publisher-page")
  );
  const publisherRoot = roots[0];
  const heads = all.filter(({ tagName }) => tagName === "head");
  const head = heads[0];
  const bodies = all.filter(({ tagName }) => tagName === "body");
  const body = bodies[0];
  const bodyDirectElements = body === undefined ? [] : elementChildren(body);
  const nextStreamingPlaceholders = bodyDirectElements.filter((element) =>
    element.tagName === "div" && hasAttribute(element, "hidden")
  );
  const nextStreamingPlaceholder = nextStreamingPlaceholders[0];
  const nextStreamingPlaceholderAttributes = Object.freeze(
    nextStreamingPlaceholder?.attributes.map((row) =>
      Object.freeze([row[0], row[1]] as const)
    ) ?? [],
  );
  const nextStreamingPlaceholderIsDirectFirstBodyElement =
    nextStreamingPlaceholder !== undefined && body !== undefined &&
    parents.get(nextStreamingPlaceholder) === body &&
    bodyDirectElements[0] === nextStreamingPlaceholder;
  const nextStreamingPlaceholderStructuralChecks = [
    nextStreamingPlaceholders.length === 1,
    nextStreamingPlaceholder?.tagName === "div",
    nextStreamingPlaceholderIsDirectFirstBodyElement,
    isDeepStrictEqual(
      nextStreamingPlaceholderAttributes,
      [["hidden", ""]],
    ),
    nextStreamingPlaceholder?.children.length === 0,
  ];
  const nextStreamingPlaceholderStructuralDriftCount =
    nextStreamingPlaceholderStructuralChecks.filter((accepted) => !accepted)
      .length;
  const acceptedNextStreamingPlaceholders = new Set(
    nextStreamingPlaceholders.length === 1 &&
        nextStreamingPlaceholderStructuralDriftCount === 0
      ? nextStreamingPlaceholders
      : [],
  );
  const mains = all.filter(({ tagName }) => tagName === "main");
  const main = mains[0];
  const workOwners = all.filter((element) =>
    hasAttribute(element, "data-publisher-work")
  );
  const sectionOwners = all.filter((element) =>
    hasAttribute(element, "data-publisher-section")
  );
  const blockOwners = all.filter((element) =>
    hasAttribute(element, "data-publisher-block")
  );
  const owned = [...workOwners, ...sectionOwners, ...blockOwners];
  const pageKind = publisherRoot === undefined
    ? ""
    : attribute(publisherRoot, "data-publisher-page") ?? "";
  const mainArticles = main === undefined
    ? []
    : elementChildren(main).filter((element) =>
        hasAttribute(element, "data-publisher-work")
      );
  const mainArticle = mainArticles[0];
  const articleHeaders = mainArticle === undefined
    ? []
    : elementChildren(mainArticle).filter(({ tagName }) => tagName === "header");
  const articleHeader = articleHeaders[0];
  const titleMatches = main === undefined
    ? []
    : pageKind === "home"
      ? elementChildren(main)
          .filter(({ tagName }) => tagName === "h1")
          .map((element) => ({
            element,
            wrapped: false,
            container: element,
          }))
      : directOrWrappedHeadings(
          articleHeader,
          ({ tagName }) => tagName === "h1",
        );
  const titleElements = titleMatches.map(({ element }) => element);
  const titleWrappers = titleMatches
    .filter(({ wrapped }) => wrapped)
    .map(({ container }) => headingWrapperProjection(container));
  const publicationDescriptionElements = main === undefined
    ? []
    : elementChildren(main).filter((element) =>
        hasClass(element, "publisher-publication-description")
      );
  const homeDirectSections = main === undefined || pageKind !== "home"
    ? []
    : elementChildren(main).filter(({ tagName }) => tagName === "section");
  const homeCollectionSections = homeDirectSections.filter((element) =>
    attribute(element, "aria-labelledby") === "publisher-collections-heading" ||
    descendants(element).some((candidate) =>
      parents.get(candidate) === element &&
      attribute(candidate, "id") === "publisher-collections-heading"
    )
  );
  const breadcrumbElements = articleHeader === undefined
    ? []
    : elementChildren(articleHeader).filter((element) =>
        element.tagName === "nav" &&
        (hasClass(element, "publisher-breadcrumbs") ||
          attribute(element, "aria-label") === "Breadcrumb")
      );
  const sectionNavigationElements = mainArticle === undefined
    ? []
    : elementChildren(mainArticle).filter((element) =>
        element.tagName === "nav" &&
        (hasClass(element, "publisher-section-navigation") ||
          attribute(element, "aria-label") === "Section navigation")
      );
  const catalogLists = all.filter((element) =>
    element.tagName === "ol" && hasClass(element, "publisher-catalog")
  );
  const manuscripts = all.filter((element) =>
    hasClass(element, "publisher-manuscript")
  );
  const acceptedHeadingWrappers = new Set(all.filter((element) => {
    if (
      element.tagName !== "div" ||
      attribute(element, "class") !== "publisher-linkable-heading"
    ) return false;
    const parent = parents.get(element);
    return parent != null && (
      parent === articleHeader ||
      sectionOwners.includes(parent) ||
      blockOwners.includes(parent)
    );
  }));
  const acceptedHeadingActions = new Set(
    [...acceptedHeadingWrappers].flatMap((wrapper) =>
      elementChildren(wrapper).filter((element) =>
        element.tagName === "button" &&
        attribute(element, "class") === "publisher-heading-action"
      )
    ),
  );
  const isReviewedHeadingActionSubtree = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): boolean => {
    let current: PublisherOfflineHtmlTreeElementNode | null = element;
    while (current !== null) {
      if (acceptedHeadingActions.has(current)) return true;
      current = parents.get(current) ?? null;
    }
    return false;
  };
  const readerRailElements = all.filter((element) =>
    attribute(element, "class") === "publisher-reader-rail" ||
    attribute(element, "aria-label") === "Reader tools"
  );
  const readerRail = readerRailElements[0];
  const readerRailActions = all.filter((element) =>
    attribute(element, "class") === "publisher-reader-rail-actions"
  );
  const readerRailAction = readerRailActions[0];
  const readerRailButtons = readerRailAction === undefined
    ? []
    : elementChildren(readerRailAction);
  const sharedControlIndexes = [0, 1, 3, 4, 5, 6] as const;
  const sharedControlValues = sharedControlIndexes.map((index) => {
    const button = readerRailButtons[index];
    return button === undefined ? "" : attribute(button, "aria-controls") ?? "";
  });
  const sharedPanelId = sharedControlValues.length === 6 &&
      sharedControlValues[0] !== "" &&
      sharedControlValues.every((value) => value === sharedControlValues[0])
    ? sharedControlValues[0] as string
    : null;
  const narrationPanelId = readerRailButtons[2] === undefined
    ? null
    : attribute(readerRailButtons[2], "aria-controls");
  const readerRailProjection = Object.freeze({
    rail: Object.freeze({
      tagName: readerRail?.tagName ?? "",
      className: readerRail === undefined
        ? ""
        : attribute(readerRail, "class") ?? "",
      ariaLabel: readerRail === undefined
        ? ""
        : attribute(readerRail, "aria-label") ?? "",
    }),
    actions: Object.freeze({
      tagName: readerRailAction?.tagName ?? "",
      className: readerRailAction === undefined
        ? ""
        : attribute(readerRailAction, "class") ?? "",
    }),
    buttons: Object.freeze(readerRailButtons.map((button, index) => {
      const children = elementChildren(button);
      const svg = children[0];
      const label = children[1];
      const ariaControls = attribute(button, "aria-controls") ?? "";
      return Object.freeze({
        tagName: button.tagName,
        ariaControls: sharedPanelId !== null &&
            sharedControlIndexes.includes(index as
              typeof sharedControlIndexes[number]) &&
            ariaControls === sharedPanelId
          ? "shared-panel-id"
          : narrationPanelId !== null && index === 2 &&
              ariaControls === narrationPanelId
            ? "narration-panel-id"
          : ariaControls,
        ariaExpanded: attribute(button, "aria-expanded") ?? "",
        buttonType: attribute(button, "type") ?? "",
        directChildTagNames: Object.freeze(children.map(({ tagName }) =>
          tagName
        )),
        disabled: hasAttribute(button, "disabled"),
        label: label === undefined ? "" : visibleText(label),
        svg: Object.freeze({
          tagName: svg?.tagName ?? "",
          attributes: Object.freeze(svg?.attributes.map((row) =>
            Object.freeze([row[0], row[1]] as const)
          ) ?? []),
          children: Object.freeze(svg === undefined
            ? []
            : elementChildren(svg).map((child) => Object.freeze({
                tagName: child.tagName,
                attributes: Object.freeze(child.attributes.map((row) =>
                  Object.freeze([row[0], row[1]] as const)
                )),
              }))),
        }),
      });
    })),
  });
  const railChildren = readerRail === undefined
    ? []
    : elementChildren(readerRail);
  const railProgress = railChildren[0];
  const railProgressChildren = railProgress === undefined
    ? []
    : elementChildren(railProgress);
  const railProgressLabel = railProgressChildren[0];
  const readerRailProgressAriaLabel = railProgress === undefined
    ? ""
    : attribute(railProgress, "aria-label") ?? "";
  const readerRailProgressText = railProgressLabel === undefined
    ? ""
    : visibleText(railProgressLabel);
  const expectedReaderRailProgressAriaLabel = pageKind === "section"
    ? "0% read"
    : "Publication tools";
  const readerRailStructuralChecks = [
    readerRail !== undefined && readerRail.tagName === "aside" &&
      parents.get(readerRail) === publisherRoot &&
      isDeepStrictEqual(
        readerRail.attributes.map(([name]) => name),
        ["aria-label", "class"],
      ),
    readerRail?.children.length === 2 && railChildren.length === 2 &&
      railChildren[1] === readerRailAction,
    railProgress?.tagName === "div" &&
      attribute(railProgress, "class") === "publisher-reader-rail-progress" &&
      readerRailProgressAriaLabel === expectedReaderRailProgressAriaLabel &&
      isDeepStrictEqual(
        railProgress.attributes.map(([name]) => name),
        ["aria-label", "class"],
      ),
    railProgress?.children.length === 1 &&
      railProgressLabel?.tagName === "span" &&
      isDeepStrictEqual(railProgressLabel.attributes, [["aria-hidden", "true"]]) &&
      railProgressLabel.children.length === 1 &&
      railProgressLabel.children[0]?.type === "text" &&
      readerRailProgressText === "§",
    readerRailAction?.tagName === "div" &&
      parents.get(readerRailAction) === readerRail &&
      isDeepStrictEqual(readerRailAction.attributes, [[
        "class",
        "publisher-reader-rail-actions",
      ]]),
    readerRailAction?.children.length === 7 && readerRailButtons.length === 7,
    sharedPanelId !== null && narrationPanelId !== null &&
      sharedPanelId !== narrationPanelId &&
      sharedPanelId.length <= 128 && narrationPanelId.length <= 128 &&
      /^_R_[0-9a-v]+_$/u.test(sharedPanelId) &&
      /^_R_[0-9a-v]+_$/u.test(narrationPanelId),
    readerRailButtons.every((button) => {
      const children = elementChildren(button);
      const svg = children[0];
      const label = children[1];
      return button.tagName === "button" &&
        isDeepStrictEqual(
          button.attributes.map(([name]) => name),
          ["aria-controls", "aria-expanded", "type"],
        ) &&
        button.children.length === 2 &&
        children.length === 2 &&
        svg?.tagName === "svg" &&
        label?.tagName === "span" &&
        label.attributes.length === 0 &&
        label.children.length === 1 &&
        label.children[0]?.type === "text" &&
        svg.children.every((child) => child.type === "element") &&
        elementChildren(svg).every((child) => child.children.length === 0);
    }),
  ];
  const readerRailStructuralDriftCount = readerRailStructuralChecks.filter(
    (accepted) => !accepted,
  ).length;
  const readerRailProjectionHash = hashJson(readerRailProjection);
  const acceptedReaderRailSvgs = new Set<PublisherOfflineHtmlTreeElementNode>(
    readerRailElements.length === 1 &&
        readerRailActions.length === 1 &&
        readerRailStructuralDriftCount === 0 &&
        readerRailProjectionHash === PUBLISHER_OFFLINE_EXPECTED_READER_RAIL_HASH
      ? readerRailButtons.map((button) => elementChildren(button)[0]).filter(
          (element): element is PublisherOfflineHtmlTreeElementNode =>
            element?.tagName === "svg",
        )
      : [],
  );
  const dormantNarrationAudioHosts = all.filter((element) =>
    attribute(element, "class") === "publisher-reader-audio-host"
  );
  const dormantNarrationAudioHost = dormantNarrationAudioHosts[0];
  const dormantNarrationAudioElements = all.filter(({ tagName }) =>
    tagName === "audio"
  );
  const dormantNarrationAudio = dormantNarrationAudioElements[0];
  const dormantNarrationAudioHostThemeDeclarations = (() => {
    const rawStyle = dormantNarrationAudioHost === undefined
      ? null
      : attribute(dormantNarrationAudioHost, "style");
    if (rawStyle === null) return [] as readonly (readonly [string, string])[];
    const declarations: Array<readonly [string, string]> = [];
    for (const rawDeclaration of rawStyle.split(";")) {
      if (trimHtmlSpaceCharacters(rawDeclaration) === "") continue;
      const separator = rawDeclaration.indexOf(":");
      if (separator < 1) return [];
      const name = trimHtmlSpaceCharacters(rawDeclaration.slice(0, separator));
      const styleValue = trimHtmlSpaceCharacters(
        rawDeclaration.slice(separator + 1),
      );
      if (name === "" || styleValue === "" || styleValue.includes(";")) {
        return [];
      }
      declarations.push(Object.freeze([name, styleValue] as const));
    }
    return Object.freeze(declarations);
  })();
  const dormantNarrationAudioHostThemeStyleHash = hashJson(
    dormantNarrationAudioHostThemeDeclarations,
  );
  const dormantNarrationAudioHostStyleMatchesRoot =
    dormantNarrationAudioHost !== undefined && publisherRoot !== undefined &&
    attribute(dormantNarrationAudioHost, "style") ===
      attribute(publisherRoot, "style");
  const dormantNarrationAudioProjection = Object.freeze({
    hostCount: dormantNarrationAudioHosts.length,
    audioCount: dormantNarrationAudioElements.length,
    host: Object.freeze({
      tagName: dormantNarrationAudioHost?.tagName ?? "",
      className: dormantNarrationAudioHost === undefined
        ? ""
        : attribute(dormantNarrationAudioHost, "class") ?? "",
      directBodyChild: dormantNarrationAudioHost !== undefined &&
        parents.get(dormantNarrationAudioHost) === body,
      attributeNames: Object.freeze(
        dormantNarrationAudioHost?.attributes.map(([name]) => name) ?? [],
      ),
      themeStyleHash: dormantNarrationAudioHostThemeStyleHash,
      rawChildCount: dormantNarrationAudioHost?.children.length ?? 0,
      directChildTagNames: Object.freeze(dormantNarrationAudioHost === undefined
        ? []
        : elementChildren(dormantNarrationAudioHost).map(({ tagName }) =>
            tagName
          )),
    }),
    audio: Object.freeze({
      tagName: dormantNarrationAudio?.tagName ?? "",
      directHostChild: dormantNarrationAudio !== undefined &&
        parents.get(dormantNarrationAudio) === dormantNarrationAudioHost,
      attributes: Object.freeze(dormantNarrationAudio?.attributes.map((row) =>
        Object.freeze([row[0], row[1]] as const)
      ) ?? []),
      rawChildCount: dormantNarrationAudio?.children.length ?? 0,
      directChildTagNames: Object.freeze(dormantNarrationAudio === undefined
        ? []
        : elementChildren(dormantNarrationAudio).map(({ tagName }) => tagName)),
    }),
  });
  const dormantNarrationAudioProjectionHash = hashJson(
    dormantNarrationAudioProjection,
  );
  const dormantNarrationAudioStructuralChecks = [
    dormantNarrationAudioHost?.tagName === "div" &&
      parents.get(dormantNarrationAudioHost) === body &&
      isDeepStrictEqual(
        dormantNarrationAudioHost.attributes.map(([name]) => name),
        ["class", "style"],
      ),
    dormantNarrationAudioHost?.children.length === 1 &&
      dormantNarrationAudioHost.children[0] === dormantNarrationAudio,
    dormantNarrationAudio?.tagName === "audio" &&
      parents.get(dormantNarrationAudio) === dormantNarrationAudioHost &&
      isDeepStrictEqual(
        dormantNarrationAudio.attributes,
        [["preload", "metadata"]],
      ) && dormantNarrationAudio.children.length === 0,
    dormantNarrationAudioHostStyleMatchesRoot,
    dormantNarrationAudioHostThemeStyleHash ===
      PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH,
    dormantNarrationAudioProjectionHash ===
      PUBLISHER_OFFLINE_EXPECTED_DORMANT_AUDIO_SHELL_HASH,
  ];
  const dormantNarrationAudioStructuralDriftCount =
    dormantNarrationAudioStructuralChecks.filter((accepted) => !accepted)
      .length;
  const acceptedDormantNarrationAudioHosts = new Set(
    dormantNarrationAudioHosts.length === 1 &&
        dormantNarrationAudioElements.length === 1 &&
        dormantNarrationAudioStructuralDriftCount === 0
      ? dormantNarrationAudioHosts
      : [],
  );
  const acceptedDormantNarrationAudioElements = new Set(
    dormantNarrationAudioHosts.length === 1 &&
        dormantNarrationAudioElements.length === 1 &&
        dormantNarrationAudioStructuralDriftCount === 0
      ? dormantNarrationAudioElements
      : [],
  );
  const isTransparentFocusWrapper = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): boolean => {
    if (element.tagName !== "span") return false;
    const className = attribute(element, "class");
    const names = element.attributes.map(([name]) => name);
    if (
      className === "publisher-narration-word" ||
      className === "publisher-focus-word publisher-narration-word"
    ) {
      return isDeepStrictEqual(names, [
        "class",
        "data-publisher-narration-word",
      ]) && attribute(element, "data-publisher-narration-word") === "true";
    }
    if (className === "publisher-focus-word") {
      return isDeepStrictEqual(names, ["class"]);
    }
    return [
      "publisher-focus-emphasis publisher-focus-emphasis-light",
      "publisher-focus-emphasis publisher-focus-emphasis-normal",
      "publisher-focus-emphasis publisher-focus-emphasis-strong",
    ].includes(className ?? "") && isDeepStrictEqual(names, ["class"]);
  };
  const projectInlineNodes = (
    nodes: readonly PublisherOfflineHtmlTreeNode[],
    parentTagName: string | null = null,
  ): readonly PublisherOfflineInlineSemanticNode[] => {
    const output: PublisherOfflineInlineSemanticNode[] = [];
    const parentHasBlockChildren = parentTagName === "li" && nodes.some(
      (node) => node.type === "element" && [
        "p",
        "blockquote",
        "ul",
        "ol",
      ].includes(node.tagName),
    );
    const dropsFormattingWhitespace = ["ul", "ol", "blockquote"].includes(
      parentTagName ?? "",
    ) || parentHasBlockChildren;
    for (const node of nodes) {
      if (node.type === "text") {
        if (
          dropsFormattingWhitespace &&
          trimHtmlSpaceCharacters(node.value).length === 0
        ) continue;
        output.push(semanticTextNode(node.value));
        continue;
      }
      if (isTransparentFocusWrapper(node)) {
        output.push(...projectInlineNodes(node.children));
        continue;
      }
      const allowedTags = new Set([
        "p",
        "blockquote",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "em",
        "strong",
        "code",
        "br",
        "a",
      ]);
      if (!allowedTags.has(node.tagName)) {
        throw new TypeError(
          `Publisher rendered Markdown contains unsupported inline tag ${node.tagName}.`,
        );
      }
      let semanticAttributes: readonly (readonly [string, string])[] =
        Object.freeze([]);
      if (node.tagName === "a") {
        const allowedNames = hasAttribute(node, "title")
          ? ["href", "title"]
          : ["href"];
        if (!isDeepStrictEqual(node.attributes.map(([name]) => name), allowedNames)) {
          throw new TypeError("Publisher rendered Markdown link attributes drifted.");
        }
        const href = attribute(node, "href");
        if (href === null) {
          throw new TypeError("Publisher rendered Markdown link lost its href.");
        }
        safeMarkdownHref(href);
        semanticAttributes = Object.freeze(node.attributes.map((row) =>
          Object.freeze([row[0], row[1]] as const)
        ));
      } else if (node.attributes.length !== 0) {
        throw new TypeError(
          `Publisher rendered Markdown ${node.tagName} attributes drifted.`,
        );
      }
      output.push(semanticElementNode(
        node.tagName as PublisherOfflineInlineSemanticElementNode["tagName"],
        projectInlineNodes(node.children, node.tagName),
        semanticAttributes,
      ));
    }
    return normalizeSemanticChildren(output);
  };
  const projectBlockInlineSemantics = (
    owner: PublisherOfflineHtmlTreeElementNode,
    kind: string,
  ): PublisherOfflineInlineSemanticElementNode => {
    let rootElement: PublisherOfflineHtmlTreeElementNode | undefined;
    let ownerAttributes = false;
    if (/^h[1-6]$/u.test(owner.tagName)) {
      rootElement = owner;
      ownerAttributes = true;
    } else if (kind === "heading") {
      const direct = elementChildren(owner)[0];
      rootElement = direct !== undefined &&
          hasClass(direct, "publisher-linkable-heading")
        ? elementChildren(direct).find(({ tagName }) => /^h[1-6]$/u.test(tagName))
        : direct;
    } else {
      rootElement = elementChildren(owner)[0];
    }
    if (rootElement === undefined) {
      throw new TypeError("Publisher rendered Markdown has no semantic root.");
    }
    if (ownerAttributes) {
      const allowedNames = [
        "class",
        "data-publisher-block",
        "id",
      ].filter((name) => hasAttribute(rootElement as
        PublisherOfflineHtmlTreeElementNode, name)).sort(codePointCompare);
      if (!isDeepStrictEqual(
        rootElement.attributes.map(([name]) => name),
        allowedNames,
      )) {
        throw new TypeError("Publisher owning Markdown heading attributes drifted.");
      }
      return semanticElementNode(
        rootElement.tagName as
          PublisherOfflineInlineSemanticElementNode["tagName"],
        projectInlineNodes(rootElement.children),
      );
    }
    const projected = projectInlineNodes([rootElement]);
    if (projected.length !== 1 || projected[0]?.type !== "element") {
      throw new TypeError("Publisher rendered Markdown semantic root drifted.");
    }
    return projected[0];
  };
  const semanticContainers = new Set<PublisherOfflineHtmlTreeElementNode>([
    ...([publisherRoot, main].filter(
      (element): element is PublisherOfflineHtmlTreeElementNode =>
        element !== undefined,
    )),
    ...(main === undefined
      ? []
      : descendants(main).filter((element) =>
          !isReviewedHeadingActionSubtree(element)
        )),
  ]);
  if (publisherRoot !== undefined) {
    let ancestor = parents.get(publisherRoot) ?? null;
    while (ancestor !== null) {
      semanticContainers.add(ancestor);
      ancestor = parents.get(ancestor) ?? null;
    }
  }
  const closedContainers = new Set<PublisherOfflineHtmlTreeElementNode>([
    ...([publisherRoot, main].filter(
      (element): element is PublisherOfflineHtmlTreeElementNode =>
        element !== undefined,
    )),
    ...workOwners,
    ...workOwners.flatMap((owner) => elementChildren(owner).filter(
      ({ tagName }) => tagName === "header",
    )),
    ...manuscripts,
    ...sectionOwners,
    ...(main === undefined
      ? []
      : elementChildren(main).filter(({ tagName }) => tagName === "section")),
    ...catalogLists,
    ...catalogLists.flatMap(elementChildren),
    ...breadcrumbElements,
    ...breadcrumbElements.flatMap((navigation) =>
      elementChildren(navigation).filter(({ tagName }) => tagName === "ol")
    ),
    ...breadcrumbElements.flatMap((navigation) =>
      elementChildren(navigation)
        .filter(({ tagName }) => tagName === "ol")
        .flatMap(elementChildren)
    ),
    ...sectionNavigationElements,
  ]);
  const unownedDirectText = [...closedContainers].flatMap((container) =>
    container.children.flatMap((child) => {
      if (child.type !== "text") return [];
      const text = normalized(child.value);
      return text === "" ? [] : [text];
    })
  );
  const mainElements = main === undefined ? [] : [main, ...descendants(main)];
  const allowedSemanticLanguageElements = new Set<
    PublisherOfflineHtmlTreeElementNode
  >([
    root,
    ...workOwners,
    ...homeDirectSections.flatMap((section) =>
      elementChildren(section).filter((element) =>
        attribute(element, "id") === "publisher-works-heading"
      )
    ),
    ...catalogLists.flatMap((list) => elementChildren(list)),
    ...catalogLists.flatMap((list) =>
      elementChildren(list).flatMap((card) =>
        elementChildren(card).filter((element) =>
          hasClass(element, "publisher-reading-stat")
        )
      )
    ),
    ...sectionNavigationElements,
    ...sectionNavigationElements.flatMap((navigation) =>
      elementChildren(navigation).flatMap((slot) =>
        elementChildren(slot).filter(({ tagName }) => tagName === "span")
      )
    ),
  ]);
  const belongsToBlock = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): boolean => blockOwners.some((owner) => contains(owner, element));
  const isAllowedSemanticClass = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): boolean => {
    const className = attribute(element, "class");
    if (className === null || className === "") return true;
    if (element === publisherRoot) return className === "publisher-root";
    const parent = parents.get(element);
    if (
      element.tagName === "p" &&
      className === "publisher-publication-description" &&
      parent === main
    ) return true;
    if (
      element.tagName === "ol" && className === "publisher-catalog" &&
      parent != null && parents.get(parent) === main
    ) return true;
    if (
      element.tagName === "p" && className === "publisher-reading-stat" &&
      parent?.tagName === "li" &&
      parents.get(parent)?.tagName === "ol" &&
      attribute(parents.get(parent) as PublisherOfflineHtmlTreeElementNode, "class") ===
        "publisher-catalog"
    ) return true;
    if (
      element.tagName === "div" &&
      className === "publisher-linkable-heading" &&
      acceptedHeadingWrappers.has(element)
    ) return true;
    if (
      element.tagName === "button" &&
      className === "publisher-heading-action" &&
      acceptedHeadingActions.has(element)
    ) return true;
    if (
      element.tagName === "p" && className === "publisher-work-subtitle" &&
      parent === articleHeader
    ) return true;
    if (
      element.tagName === "div" && className === "publisher-manuscript" &&
      parent === mainArticle
    ) return true;
    if (
      element.tagName === "section" &&
      className === "publisher-manuscript-section" &&
      parent != null && manuscripts.includes(parent)
    ) return true;
    if (
      /^h[2-6]$/u.test(element.tagName) &&
      className === "publisher-section-title" &&
      parent != null && (
        sectionOwners.includes(parent) || acceptedHeadingWrappers.has(parent)
      )
    ) return true;
    if (
      element.tagName === "nav" && className === "publisher-breadcrumbs" &&
      parent === articleHeader
    ) return true;
    if (
      element.tagName === "nav" &&
      className === "publisher-section-navigation" &&
      parent === mainArticle
    ) return true;
    if (
      element.tagName === "div" && className === "publisher-markdown" &&
      blockOwners.includes(element)
    ) return true;
    if (element.tagName !== "span" || !belongsToBlock(element)) return false;
    const classes = className.split(
      /[\u0009\u000A\u000C\u000D\u0020]+/u,
    ).filter(Boolean);
    if (
      isDeepStrictEqual(classes, ["publisher-narration-word"]) &&
      attribute(element, "data-publisher-narration-word") === "true"
    ) return true;
    if (
      isDeepStrictEqual(classes, ["publisher-focus-word"]) &&
      !hasAttribute(element, "data-publisher-narration-word")
    ) return true;
    if (
      isDeepStrictEqual(
        classes,
        ["publisher-focus-word", "publisher-narration-word"],
      ) && attribute(element, "data-publisher-narration-word") === "true"
    ) return true;
    return classes.length === 2 &&
      classes[0] === "publisher-focus-emphasis" &&
      [
        "publisher-focus-emphasis-light",
        "publisher-focus-emphasis-normal",
        "publisher-focus-emphasis-strong",
      ].includes(classes[1] ?? "") &&
      !hasAttribute(element, "data-publisher-narration-word");
  };
  const interactiveTags = new Set([
    "button",
    "datalist",
    "details",
    "dialog",
    "embed",
    "form",
    "iframe",
    "input",
    "meter",
    "object",
    "progress",
    "select",
    "summary",
    "textarea",
  ]);
  const presentationalTags = new Set([
    "big",
    "blink",
    "center",
    "font",
    "marquee",
    "strike",
    "tt",
  ]);
  const presentationalAttributes = new Set([
    "align",
    "background",
    "bgcolor",
    "border",
    "cellpadding",
    "cellspacing",
    "color",
    "compact",
    "face",
    "height",
    "hspace",
    "nowrap",
    "reversed",
    "size",
    "start",
    "type",
    "valign",
    "value",
    "vspace",
    "width",
  ]);
  const isAllowedSemanticAriaAttribute = (
    element: PublisherOfflineHtmlTreeElementNode,
    name: string,
  ): boolean => (
    name === "aria-labelledby" &&
    element.tagName === "section" &&
    parents.get(element) === main &&
    attribute(element, name) === "publisher-works-heading"
  ) || (
    name === "aria-label" && breadcrumbElements.includes(element) &&
    attribute(element, name) === "Breadcrumb"
  ) || (
    name === "aria-label" && sectionNavigationElements.includes(element) &&
    attribute(element, name) === "Section navigation"
  ) || (
    name === "aria-current" && element.tagName === "span" &&
    breadcrumbElements.some((navigation) => contains(navigation, element)) &&
    attribute(element, name) === "page"
  ) || (
    name === "aria-label" && acceptedHeadingActions.has(element)
  ) || (
    name === "aria-hidden" && element.tagName === "svg" &&
    [...acceptedHeadingActions].some((action) => parents.get(element) === action) &&
    attribute(element, name) === "true"
  );
  const fixedMainIdOwners = all.filter((element) =>
    attribute(element, "id") === "publisher:main"
  );
  const fixedWorksHeadingOwners = all.filter((element) =>
    attribute(element, "id") === "publisher-works-heading"
  );
  const publisherRootClassOwners = all.filter((element) =>
    hasClass(element, "publisher-root")
  );
  const expectedWorksHeading = pageKind === "home"
    ? fixedWorksHeadingOwners.find((element) =>
        element.tagName === "h2" &&
        parents.get(element)?.tagName === "section" &&
        parents.get(parents.get(element) as PublisherOfflineHtmlTreeElementNode) === main
      )
    : undefined;
  const fixedIdentityDriftCount =
    (fixedMainIdOwners.length === 1 && fixedMainIdOwners[0] === main ? 0 : 1) +
    (pageKind === "home"
      ? fixedWorksHeadingOwners.length === 1 &&
          fixedWorksHeadingOwners[0] === expectedWorksHeading
        ? 0
        : 1
      : fixedWorksHeadingOwners.length === 0 ? 0 : 1) +
    (publisherRootClassOwners.length === 1 &&
        publisherRootClassOwners[0] === publisherRoot
      ? 0
      : 1);
  const semanticClassElements = [...new Set([
    root,
    ...([body, publisherRoot].filter(
      (element): element is PublisherOfflineHtmlTreeElementNode =>
        element !== undefined,
    )),
    ...mainElements,
  ])];
  const isExactPlainTextElement = (
    element: PublisherOfflineHtmlTreeElementNode,
  ): boolean => {
    if (element.children.some((child) => child.type === "element")) return false;
    const text = normalizeSemanticChildren(element.children.map((child) =>
      semanticTextNode((child as PublisherOfflineHtmlTreeTextNode).value)
    ));
    return text.length === 1 && text[0]?.type === "text" &&
      text[0].value.length > 0;
  };
  const cardElements = catalogLists.flatMap(elementChildren);
  const cardPlainTextElements = cardElements.flatMap((card) => {
    const cardChildren = elementChildren(card);
    const heading = cardChildren.find(({ tagName }) => tagName === "h3");
    return [
      ...(heading === undefined
        ? []
        : elementChildren(heading).filter(({ tagName }) => tagName === "a")),
      ...cardChildren.filter(({ tagName }) => tagName === "p"),
    ];
  });
  const workHeaderPlainTextElements = articleHeaders.flatMap((header) =>
    elementChildren(header).filter(({ tagName }) => tagName === "p")
  );
  const breadcrumbPlainTextElements = breadcrumbElements.flatMap((navigation) =>
    elementChildren(navigation).flatMap((list) =>
      elementChildren(list).flatMap((item) => elementChildren(item))
    )
  );
  const syntheticSectionTitleElements = sectionOwners.flatMap((section) =>
    descendants(section).filter((element) =>
      hasClass(element, "publisher-section-title") &&
      !hasAttribute(element, "data-publisher-block")
    )
  );
  const plainTextElements = [...new Set([
    ...titleElements.filter((element) =>
      !hasAttribute(element, "data-publisher-block")
    ),
    ...publicationDescriptionElements,
    ...fixedWorksHeadingOwners,
    ...cardPlainTextElements,
    ...workHeaderPlainTextElements,
    ...breadcrumbPlainTextElements,
    ...syntheticSectionTitleElements,
  ])];
  const navigationInlineDriftCount = sectionNavigationElements.flatMap(
    elementChildren,
  ).filter((slot) => {
    if (slot.tagName === "span") {
      return slot.attributes.length !== 0 || slot.children.length !== 0;
    }
    if (slot.tagName !== "a") return true;
    const titleSpans = elementChildren(slot).filter(({ tagName }) =>
      tagName === "span"
    );
    const titleSpan = titleSpans[0];
    if (
      titleSpans.length !== 1 || titleSpan === undefined ||
      !isDeepStrictEqual(titleSpan.attributes.map(([name]) => name), ["lang"]) ||
      !isExactPlainTextElement(titleSpan)
    ) return true;
    const titleIndex = slot.children.indexOf(titleSpan);
    if (
      titleIndex < 1 || titleIndex !== slot.children.length - 1 ||
      slot.children.slice(0, titleIndex).some((child) => child.type !== "text")
    ) return true;
    const prefix = normalizeSemanticChildren(
      slot.children.slice(0, titleIndex).map((child) =>
        semanticTextNode((child as PublisherOfflineHtmlTreeTextNode).value)
      ),
    );
    return prefix.length !== 1 || prefix[0]?.type !== "text" ||
      !["Previous: ", "Next: "].includes(prefix[0].value);
  }).length;
  const plainSemanticInlineDriftCount = plainTextElements.filter(
    (element) => !isExactPlainTextElement(element),
  ).length + navigationInlineDriftCount;
  const projection = {
    documentElementTagName: root.tagName,
    documentLanguage: attribute(root, "lang") ?? "",
    headCount: heads.length,
    headIsDirectDocumentElementChild: head !== undefined &&
      parents.get(head) === root,
    bodyCount: bodies.length,
    bodyIsDirectDocumentElementChild: body !== undefined &&
      parents.get(body) === root,
    nextStreamingPlaceholderCount: nextStreamingPlaceholders.length,
    nextStreamingPlaceholderTagName:
      nextStreamingPlaceholder?.tagName ?? "",
    nextStreamingPlaceholderIsDirectFirstBodyElement,
    nextStreamingPlaceholderAttributes,
    nextStreamingPlaceholderSerializedChildCount:
      nextStreamingPlaceholder?.children.length ?? -1,
    nextStreamingPlaceholderStructuralDriftCount,
    bodyVisibleSiblingCount: body === undefined || publisherRoot === undefined
      ? -1
      : elementChildren(body).filter((element) =>
          element !== publisherRoot &&
          !acceptedNextStreamingPlaceholders.has(element) &&
          !acceptedDormantNarrationAudioHosts.has(element) &&
          !["script", "template"].includes(element.tagName)
        ).length,
    bodyDirectText: body === undefined
      ? []
      : body.children.flatMap((child) => {
          if (child.type !== "text") return [];
          const text = normalized(child.value);
          return text === "" ? [] : [text];
        }),
    rootCount: roots.length,
    rootTagName: publisherRoot?.tagName ?? "",
    rootClassName: publisherRoot === undefined
      ? ""
      : attribute(publisherRoot, "class") ?? "",
    rootIsDirectBodyChild: publisherRoot !== undefined &&
      body !== undefined && parents.get(publisherRoot) === body,
    rootDirectChildren: publisherRoot === undefined
      ? []
      : elementChildren(publisherRoot).map(directChildProjection),
    mainCount: mains.length,
    mainId: main === undefined ? "" : attribute(main, "id") ?? "",
    mainClassName: main === undefined ? "" : attribute(main, "class") ?? "",
    mainIsDirectRootChild: publisherRoot !== undefined &&
      main !== undefined && parents.get(main) === publisherRoot,
    mainDirectChildren: main === undefined
      ? []
      : elementChildren(main).map(directChildProjection),
    unownedDirectText,
    allOwnedByRoot: publisherRoot !== undefined &&
      owned.every((element) => contains(publisherRoot, element)),
    allOwnedByMain: main !== undefined &&
      owned.every((element) => contains(main, element)),
    pageKind,
    titleCount: titleElements.length,
    title: titleElements[0] === undefined ? "" : visibleText(titleElements[0]),
    titleWrapperCount: titleWrappers.length,
    titleWrappers,
    readerRailCount: readerRailElements.length,
    readerRailActionCount: readerRailActions.length,
    readerRailProgressAriaLabel,
    readerRailProgressText,
    readerRailStructuralDriftCount,
    readerRailProjectionHash,
    dormantNarrationAudioHostCount: dormantNarrationAudioHosts.length,
    dormantNarrationAudioElementCount: dormantNarrationAudioElements.length,
    dormantNarrationAudioStructuralDriftCount,
    dormantNarrationAudioHostStyleMatchesRoot,
    dormantNarrationAudioProjectionHash,
    unexpectedMediaElementCount: all.filter((element) =>
      [
        "video",
        "source",
        "track",
        "embed",
        "img",
        "object",
        "iframe",
        "picture",
        "canvas",
        "math",
        "meter",
        "progress",
      ].includes(element.tagName) ||
      (element.tagName === "audio" &&
        !acceptedDormantNarrationAudioElements.has(element)) ||
      (element.tagName === "svg" &&
        !acceptedHeadingActions.has(parents.get(element) as
          PublisherOfflineHtmlTreeElementNode) &&
        !acceptedReaderRailSvgs.has(element)) ||
      [
        attribute(element, "src"),
        attribute(element, "href"),
        attribute(element, "data"),
      ].some((href) =>
        /^(?:blob:|data:(?:audio|video)\/)/iu.test(
          trimHtmlSpaceCharacters(href ?? ""),
        ) ||
        trimHtmlSpaceCharacters(href ?? "").toLowerCase().includes(
          "publication-audio",
        )
      )
    ).length,
    declarativeShadowDomTemplateCount: all.filter((element) =>
      element.tagName === "template" &&
      (hasAttribute(element, "shadowrootmode") ||
        hasAttribute(element, "shadowrootdelegatesfocus"))
    ).length,
    styleElementCount: all.filter(({ tagName }) => tagName === "style").length,
    unsafeHeadElementCount: all.filter((element) =>
      element.tagName === "base" ||
      (element.tagName === "meta" && hasAttribute(element, "http-equiv")) ||
      (element.tagName === "link" &&
        (attribute(element, "rel") ?? "").toLowerCase().split(
          /[\u0009\u000A\u000C\u000D\u0020]+/u,
        )
          .includes("stylesheet") && parents.get(element) !== head)
    ).length,
    nonLiveSemanticContainerCount: [...semanticContainers].filter(
      isNonLiveSemanticContainer,
    ).length,
    semanticInlineStyleCount: publisherRoot === undefined
      ? -1
      : all.filter((element) =>
          element !== publisherRoot &&
          !acceptedDormantNarrationAudioHosts.has(element) &&
          hasAttribute(element, "style")
        ).length,
    inlineEventHandlerAttributeCount: all.reduce((count, element) =>
      count + element.attributes.filter(([name]) =>
        name.toLowerCase().startsWith("on")
      ).length, 0),
    explicitSemanticRoleCount: main === undefined
      ? -1
      : [...semanticContainers].filter((element) =>
          hasAttribute(element, "role")
        ).length,
    unexpectedSemanticDirectionCount: main === undefined
      ? -1
      : [...semanticContainers].filter((element) =>
          element.tagName === "bdo" || hasAttribute(element, "dir")
        ).length,
    unexpectedSemanticLanguageAttributeCount: main === undefined
      ? -1
      : [...semanticContainers].filter((element) =>
          hasAttribute(element, "lang") &&
          !allowedSemanticLanguageElements.has(element)
        ).length,
    unexpectedPresentationalHintCount: main === undefined
      ? -1
      : [...semanticContainers].filter((element) =>
          presentationalTags.has(element.tagName) ||
            element.attributes.some(([name]) =>
              presentationalAttributes.has(name.toLowerCase())
            )
        ).length,
    unexpectedSemanticClassCount: main === undefined
      ? -1
      : semanticClassElements.filter((element) =>
          !isAllowedSemanticClass(element)
        ).length,
    unexpectedInteractiveElementCount: main === undefined
      ? -1
      : [...semanticContainers].filter((element) =>
          interactiveTags.has(element.tagName) ||
          hasAttribute(element, "contenteditable") ||
          hasAttribute(element, "tabindex")
        ).length,
    unexpectedSemanticAriaAttributeCount: main === undefined
      ? -1
      : [...semanticContainers].reduce((count, element) => count +
          element.attributes.filter(([name]) =>
            name.startsWith("aria-") &&
            !isAllowedSemanticAriaAttribute(element, name)
          ).length, 0),
    unexpectedMainAnchorAttributeCount: main === undefined
      ? -1
      : descendants(main)
          .filter(({ tagName }) => tagName === "a")
          .reduce((count, anchor) => {
            const allowed = belongsToBlock(anchor)
              ? new Set(["href", "title"])
              : new Set(["href"]);
            return count + (hasAttribute(anchor, "href") ? 0 : 1) +
              anchor.attributes.filter(([name]) =>
              !allowed.has(name)
            ).length;
          }, 0),
    plainSemanticInlineDriftCount,
    fixedIdentityDriftCount,
    publicationDescriptionCount: publicationDescriptionElements.length,
    publicationDescriptionTagName: publicationDescriptionElements.length === 1
      ? publicationDescriptionElements[0]?.tagName ?? null
      : null,
    publicationDescription: publicationDescriptionElements.length === 1
      ? visibleText(publicationDescriptionElements[0] as
        PublisherOfflineHtmlTreeElementNode)
      : null,
    homeCollectionSectionCount: homeCollectionSections.length,
    homeCollectionCardCount: homeCollectionSections.flatMap((section) =>
      elementChildren(section)
        .filter((element) =>
          element.tagName === "ol" && hasClass(element, "publisher-catalog")
        )
        .flatMap(elementChildren)
    ).length,
    homeWorksSectionCount: homeDirectSections.length,
    homeWorksSections: homeDirectSections.map((sectionElement) => {
      const headingElements = elementChildren(sectionElement).filter((child) =>
        /^h[1-6]$/u.test(child.tagName) ||
        attribute(child, "id") === "publisher-works-heading"
      );
      const heading = headingElements[0];
      const listElements = elementChildren(sectionElement).filter((child) =>
        hasClass(child, "publisher-catalog") ||
        child.tagName === "ol" || child.tagName === "ul"
      );
      const list = listElements[0];
      return {
        tagName: sectionElement.tagName,
        ariaLabelledBy: attribute(sectionElement, "aria-labelledby") ?? "",
        headingCount: headingElements.length,
        heading: {
          tagName: heading?.tagName ?? "",
          id: heading === undefined ? "" : attribute(heading, "id") ?? "",
          language: heading === undefined
            ? ""
            : attribute(heading, "lang") ?? "",
          text: heading === undefined ? "" : visibleText(heading),
        },
        listCount: listElements.length,
        listTagName: list?.tagName ?? "",
        listClassName: list === undefined ? "" : attribute(list, "class") ?? "",
        directChildren: elementChildren(sectionElement).map(
          directChildProjection,
        ),
        cards: list === undefined
          ? []
          : elementChildren(list).map((card) => {
              const headingCandidates = elementChildren(card).filter((child) =>
                /^h[1-6]$/u.test(child.tagName)
              );
              const cardHeading = headingCandidates[0];
              const routeLinks = cardHeading === undefined
                ? []
                : elementChildren(cardHeading).filter((child) =>
                    child.tagName === "a"
                  );
              const routeLink = routeLinks[0];
              const detailElements = elementChildren(card).filter((child) =>
                child.tagName === "p" &&
                !hasClass(child, "publisher-reading-stat")
              );
              const statElements = elementChildren(card).filter((child) =>
                hasClass(child, "publisher-reading-stat")
              );
              const readingStat = statElements.length === 1
                ? visibleText(statElements[0] as
                  PublisherOfflineHtmlTreeElementNode)
                : "";
              const stat = /^(\d[\d,]*) words, (\d[\d,]*) (?:minute|minutes) read$/u
                .exec(readingStat);
              return {
                route: routeLink === undefined
                  ? ""
                  : attribute(routeLink, "href") ?? "",
                tagName: card.tagName,
                language: attribute(card, "lang") ?? "",
                headingCount: headingCandidates.length,
                headingTagName: cardHeading?.tagName ?? "",
                headingText: cardHeading === undefined
                  ? ""
                  : visibleText(cardHeading),
                headingDirectChildren: cardHeading === undefined
                  ? []
                  : elementChildren(cardHeading).map(directChildProjection),
                routeLinkCount: routeLinks.length,
                title: routeLink === undefined ? "" : visibleText(routeLink),
                details: detailElements.map(visibleText),
                readingStatCount: statElements.length,
                readingStatTagName: statElements.length === 1
                  ? statElements[0]?.tagName ?? ""
                  : "",
                readingStatLanguage: statElements.length === 1
                  ? attribute(
                      statElements[0] as PublisherOfflineHtmlTreeElementNode,
                      "lang",
                    ) ?? ""
                  : "",
                wordCount: stat === null
                  ? -1
                  : Number((stat[1] ?? "").replaceAll(",", "")),
                readingMinutes: stat === null
                  ? -1
                  : Number((stat[2] ?? "").replaceAll(",", "")),
                readingStat,
                directChildren: elementChildren(card).map(
                  directChildProjection,
                ),
              };
            }),
      };
    }),
    breadcrumbNavigationCount: breadcrumbElements.length,
    breadcrumbs: breadcrumbElements.map((navigation) => {
      const lists = elementChildren(navigation);
      return {
        tagName: navigation.tagName,
        className: attribute(navigation, "class") ?? "",
        ariaLabel: attribute(navigation, "aria-label") ?? "",
        listCount: lists.length,
        listTagName: lists.length === 1 ? lists[0]?.tagName ?? "" : "",
        items: lists.flatMap((list) => elementChildren(list).map((item) => {
          const children = elementChildren(item);
          const child = children[0];
          return {
            containerTagName: item.tagName,
            childCount: children.length,
            tagName: child?.tagName ?? "",
            href: child === undefined ? null : attribute(child, "href"),
            ariaCurrent: child === undefined
              ? null
              : attribute(child, "aria-current"),
            text: child === undefined ? "" : visibleText(child),
          };
        })),
      };
    }),
    sectionNavigationCount: sectionNavigationElements.length,
    sectionNavigations: sectionNavigationElements.map((navigation) => ({
      tagName: navigation.tagName,
      className: attribute(navigation, "class") ?? "",
      ariaLabel: attribute(navigation, "aria-label") ?? "",
      language: attribute(navigation, "lang") ?? "",
      slots: elementChildren(navigation).map((slot) => {
        const titleSpans = elementChildren(slot).filter(({ tagName }) =>
          tagName === "span"
        );
        const titleSpan = titleSpans[0];
        return {
          tagName: slot.tagName,
          href: attribute(slot, "href"),
          text: visibleText(slot),
          titleSpanCount: titleSpans.length,
          titleLanguage: titleSpan === undefined
            ? null
            : attribute(titleSpan, "lang"),
          title: titleSpan === undefined ? null : visibleText(titleSpan),
        };
      }),
    })),
    workOwners: workOwners.map((element) => {
      const header = elementChildren(element).find(({ tagName }) =>
        tagName === "header"
      );
      const subtitleElements = header === undefined
        ? []
        : elementChildren(header).filter((child) =>
            child.tagName === "p" &&
            hasClass(child, "publisher-work-subtitle")
          );
      const summaryElements = header === undefined
        ? []
        : elementChildren(header).filter((child) =>
            child.tagName === "p" &&
            !hasClass(child, "publisher-work-subtitle")
          );
      return {
        id: attribute(element, "data-publisher-work") ?? "",
        tagName: element.tagName,
        className: attribute(element, "class") ?? "",
        language: attribute(element, "lang") ?? "",
        subtitleCount: subtitleElements.length,
        subtitle: subtitleElements.length === 1
          ? visibleText(subtitleElements[0] as
            PublisherOfflineHtmlTreeElementNode)
          : null,
        summaryCount: summaryElements.length,
        summary: summaryElements.length === 1
          ? visibleText(summaryElements[0] as
            PublisherOfflineHtmlTreeElementNode)
          : null,
        headerDirectChildren: header === undefined
          ? []
          : elementChildren(header).map(directChildProjection),
        articleDirectChildren: elementChildren(element).map(
          directChildProjection,
        ),
        manuscriptDirectChildren: elementChildren(element)
          .filter((child) => hasClass(child, "publisher-manuscript"))
          .flatMap((manuscript) =>
            elementChildren(manuscript).map(directChildProjection)
          ),
      };
    }),
    sectionOwners: sectionOwners.map((element) => {
      const titleHeadings = directOrWrappedHeadings(
        element,
        (child) => hasClass(child, "publisher-section-title"),
      );
      const titleHeading = titleHeadings.length === 1
        ? titleHeadings[0]
        : undefined;
      return {
        id: attribute(element, "data-publisher-section") ?? "",
        tagName: element.tagName,
        className: attribute(element, "class") ?? "",
        domId: attribute(element, "id"),
        directChildren: elementChildren(element).map(directChildProjection),
        titleHeadingCount: titleHeadings.length,
              titleHeading: titleHeading === undefined
                ? null
                : {
                    tagName: titleHeading.element.tagName,
                    text: visibleText(titleHeading.element),
              blockId: attribute(
                titleHeading.element,
                "data-publisher-block",
                    ),
                    wrapped: titleHeading.wrapped,
                    wrappers: titleHeading.wrapped
                      ? [headingWrapperProjection(titleHeading.container)]
                      : [],
                  },
      };
    }),
    blocks: blockOwners.map((element) => {
      const kind = blockKind(element);
      const directChildren = elementChildren(element);
      const headingElement = /^h[1-6]$/u.test(element.tagName)
        ? element
        : descendants(element).find(({ tagName }) => /^h[1-6]$/u.test(tagName));
      const directList = element.tagName === "ul" || element.tagName === "ol"
        ? element
        : elementChildren(element).find(({ tagName }) =>
            tagName === "ul" || tagName === "ol"
          );
      const textSegments = kind === "list" && directList !== undefined
        ? elementChildren(directList)
            .filter(({ tagName }) => tagName === "li")
            .map(visibleText)
        : [visibleText(element)];
      const primarySemanticChildren = directChildren.filter(
        ({ tagName }) => kind === "paragraph"
          ? tagName === "p"
          : kind === "blockquote"
            ? tagName === "blockquote"
            : false,
      );
      const primarySemanticChild = primarySemanticChildren[0];
      const blockHeadingWrappers = directChildren.filter((child) =>
        hasClass(child, "publisher-linkable-heading")
      ).map(headingWrapperProjection);
      const inlineSemantics = projectBlockInlineSemantics(element, kind);
      const directSemanticChildren = /^h[1-6]$/u.test(element.tagName)
        ? inlineSemantics.children.filter(
            (child): child is PublisherOfflineInlineSemanticElementNode =>
              child.type === "element",
          )
        : null;
      const allowedDescendantClass = (
        child: PublisherOfflineHtmlTreeElementNode,
      ): boolean => {
        const className = attribute(child, "class");
        if (className === null || className === "") return true;
        if (
          child.tagName === "div" &&
          className === "publisher-linkable-heading"
        ) return true;
        if (
          child.tagName === "button" &&
          className === "publisher-heading-action"
        ) return true;
        if (child.tagName !== "span") return false;
        const classes = className.split(
          /[\u0009\u000A\u000C\u000D\u0020]+/u,
        ).filter(Boolean);
        if (
          isDeepStrictEqual(classes, ["publisher-narration-word"]) &&
          attribute(child, "data-publisher-narration-word") === "true"
        ) return true;
        if (
          isDeepStrictEqual(classes, ["publisher-focus-word"]) &&
          !hasAttribute(child, "data-publisher-narration-word")
        ) return true;
        if (
          isDeepStrictEqual(
            classes,
            ["publisher-focus-word", "publisher-narration-word"],
          ) &&
          attribute(child, "data-publisher-narration-word") === "true"
        ) return true;
        return classes.length === 2 &&
          classes[0] === "publisher-focus-emphasis" &&
          [
            "publisher-focus-emphasis-light",
            "publisher-focus-emphasis-normal",
            "publisher-focus-emphasis-strong",
          ].includes(classes[1] ?? "") &&
          !hasAttribute(child, "data-publisher-narration-word");
      };
      return {
        id: attribute(element, "data-publisher-block") ?? "",
        kind,
        tagName: element.tagName,
        className: attribute(element, "class") ?? "",
        domId: attribute(element, "id"),
        headingLevel: headingElement === undefined
          ? null
          : Number(headingElement.tagName.slice(1)),
        listTagName: directList?.tagName ?? null,
        workOwnerId: closestAttribute(element, "data-publisher-work"),
        sectionOwnerId: closestAttribute(element, "data-publisher-section"),
        text: visibleText(element),
        textSegments,
        directChildTagNames: directSemanticChildren === null
          ? directChildren.map(({ tagName }) => tagName)
          : directSemanticChildren.map(({ tagName }) => tagName),
        directChildClassNames: directSemanticChildren === null
          ? directChildren.map((child) => attribute(child, "class") ?? "")
          : directSemanticChildren.map(() => ""),
        primarySemanticChildTagName: primarySemanticChild?.tagName ?? null,
        primarySemanticChildClassName: primarySemanticChild === undefined
          ? null
          : attribute(primarySemanticChild, "class") ?? "",
        primarySemanticChildText: primarySemanticChild === undefined
          ? null
          : visibleText(primarySemanticChild),
        primarySemanticChildCount: primarySemanticChildren.length,
        headingWrappers: blockHeadingWrappers,
        prohibitedVisualElementCount: descendants(element).filter((child) =>
          ["img", "picture", "canvas", "svg", "math", "audio", "video",
            "source", "track", "embed", "object", "iframe", "meter",
            "progress"]
            .includes(child.tagName) &&
          !(child.tagName === "svg" && isReviewedHeadingActionSubtree(child))
        ).length,
        unexpectedDescendantClassCount: descendants(element).filter((child) =>
          !allowedDescendantClass(child)
        ).length,
        inlineSemantics,
        links: descendants(element)
          .filter((candidate) =>
            candidate.tagName === "a" && hasAttribute(candidate, "href")
          )
          .map(linkProjection),
      };
    }),
    links: main === undefined
      ? []
      : descendants(main)
          .filter((element) =>
            element.tagName === "a" && hasAttribute(element, "href")
          )
          .map(linkProjection),
    ownedDomIdOccurrences: all
      .map((element) => attribute(element, "id") ?? "")
      .filter((domId) => input.cardinalOwnedDomIds.includes(domId)),
  };
  return projection as PublisherOfflineDocumentDomProjection;
}

export function projectPublisherOfflineDocumentHostStyle(
  value: unknown,
  input: Readonly<{ cardinalOwnedDomIds: readonly string[] }>,
): PublisherOfflineDocumentHostStyleProjection {
  projectPublisherOfflineDocumentTree(value, input);
  const tree = value as PublisherOfflineHtmlDocumentTree;
  const elements: PublisherOfflineHtmlTreeElementNode[] = [];
  const parents = new Map<
    PublisherOfflineHtmlTreeElementNode,
    PublisherOfflineHtmlTreeElementNode
  >();
  const visit = (
    node: PublisherOfflineHtmlTreeNode,
    parent?: PublisherOfflineHtmlTreeElementNode,
  ): void => {
    if (node.type === "text") return;
    elements.push(node);
    if (parent !== undefined) parents.set(node, parent);
    for (const child of node.children) visit(child, node);
  };
  visit(tree.root);
  const attribute = (
    element: PublisherOfflineHtmlTreeElementNode,
    name: string,
  ): string | null => element.attributes.find(([candidate]) =>
    candidate === name
  )?.[1] ?? null;
  const roots = elements.filter((element) =>
    (attribute(element, "class") ?? "").split(
      /[\u0009\u000A\u000C\u000D\u0020]+/u,
    )
      .includes("publisher-root") &&
    attribute(element, "data-publisher-page") !== null
  );
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) {
    throw new TypeError("Publisher offline theme root census drifted.");
  }
  const rawStyle = attribute(root, "style");
  if (rawStyle === null || trimHtmlSpaceCharacters(rawStyle) === "") {
    throw new TypeError("Publisher offline theme root style is absent.");
  }
  const rootThemeStyleDeclarations: Array<readonly [string, string]> = [];
  for (const rawDeclaration of rawStyle.split(";")) {
    if (trimHtmlSpaceCharacters(rawDeclaration) === "") continue;
    const separator = rawDeclaration.indexOf(":");
    if (separator < 1) {
      throw new TypeError("Publisher offline theme root style drifted.");
    }
    const name = trimHtmlSpaceCharacters(rawDeclaration.slice(0, separator));
    const styleValue = trimHtmlSpaceCharacters(
      rawDeclaration.slice(separator + 1),
    );
    if (name === "" || styleValue === "" || styleValue.includes(";")) {
      throw new TypeError("Publisher offline theme root style drifted.");
    }
    rootThemeStyleDeclarations.push(Object.freeze([name, styleValue] as const));
  }
  if (
    !isDeepStrictEqual(
      rootThemeStyleDeclarations.map(([name]) => name),
      PUBLISHER_OFFLINE_THEME_STYLE_PROPERTIES,
    ) ||
    new Set(rootThemeStyleDeclarations.map(([name]) => name)).size !==
      rootThemeStyleDeclarations.length
  ) {
    throw new TypeError("Publisher offline theme root style authority drifted.");
  }
  const stylesheetHrefs: string[] = [];
  for (const element of elements) {
    if (
      element.tagName === "base" ||
      (element.tagName === "meta" &&
        element.attributes.some(([name]) => name === "http-equiv"))
    ) {
      throw new TypeError("Publisher offline document head authority drifted.");
    }
    if (element.tagName === "style") {
      throw new TypeError("Publisher offline document contains inline CSS.");
    }
    if (element.tagName !== "link") continue;
    const attributes = new Map(element.attributes);
    const rel = (attributes.get("rel") ?? "").toLowerCase()
      .split(/[\u0009\u000A\u000C\u000D\u0020]+/u).filter(Boolean);
    if (!rel.includes("stylesheet")) continue;
    const href = attributes.get("href");
    const media = trimHtmlSpaceCharacters(attributes.get("media") ?? "")
      .toLowerCase();
    const type = trimHtmlSpaceCharacters(attributes.get("type") ?? "")
      .toLowerCase();
    if (
      href === undefined ||
      rel.includes("alternate") ||
      attributes.has("disabled") ||
      attributes.has("integrity") ||
      attributes.has("crossorigin") ||
      attributes.has("title") ||
      [...attributes.keys()].some((name) => /^on/iu.test(name)) ||
      (media !== "" && media !== "all") ||
      (type !== "" && type !== "text/css") ||
      parents.get(element)?.tagName !== "head" ||
      !/^\/_next\/static\/[A-Za-z0-9._/-]+\.css$/u.test(href) ||
      href.split("/").some((segment) => segment === "." || segment === "..") ||
      publicHref(href, "Publisher offline stylesheet href") !== href
    ) {
      throw new TypeError("Publisher offline stylesheet link drifted.");
    }
    stylesheetHrefs.push(href);
  }
  if (
    hashJson(rootThemeStyleDeclarations) !==
      PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH ||
    !isDeepStrictEqual(
      stylesheetHrefs,
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS,
    ) ||
    hashJson(stylesheetHrefs) !==
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH ||
    new Set(stylesheetHrefs).size !== stylesheetHrefs.length
  ) {
    throw new TypeError("Publisher offline stylesheet census drifted.");
  }
  return Object.freeze({
    rootThemeStyleDeclarations: Object.freeze(rootThemeStyleDeclarations),
    rootThemeStyleHash: hashJson(rootThemeStyleDeclarations),
    stylesheetHrefs: Object.freeze(stylesheetHrefs),
    stylesheetHrefsHash: hashJson(stylesheetHrefs),
  });
}

function publisherOfflineStylesheetHashPath(href: string): string {
  if (!/^\/_next\/static\/[A-Za-z0-9._/-]+\.css$/u.test(href)) {
    throw new TypeError("Publisher offline stylesheet hash path drifted.");
  }
  return href.slice("/_next/".length);
}

async function createBrowserCacheReceipt(
  page: Page,
  cacheName: string,
  reader: PublicationReaderEnvelope,
  offlinePackage: ReaderOfflinePackage,
  declaredResources: readonly Readonly<{
    href: string;
    kind: ReaderOfflineResourceKind;
  }>[],
  installedResourceHrefs: readonly string[],
  expectedRootThemeStyleDeclarations: readonly (readonly [string, string])[],
): Promise<PublisherOfflineCacheReceipt> {
  const documentAuthorities = createPublisherOfflineDocumentSemanticAuthorities(
    reader,
    offlinePackage,
  );
  const cardinalWork = reader.works.find(({ id }) => id === CARDINAL_SCALE_WORK_ID);
  const cardinalOwnedDomIds = cardinalWork === undefined
    ? []
    : cardinalWork.sections.flatMap((section) => [
        section.domId,
        ...section.blocks.map(({ domId }) => domId),
      ]).filter((domId): domId is string =>
        typeof domId === "string" && domId !== ""
      );
  if (
    cardinalWork === undefined ||
    new Set(cardinalOwnedDomIds).size !== cardinalOwnedDomIds.length
  ) {
    throw new TypeError("Publisher Cardinal DOM id authority drifted.");
  }
  const result = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const helpers = {
      async digest(value: ArrayBuffer | Uint8Array): Promise<string> {
        const source = value instanceof Uint8Array
          ? value
          : new Uint8Array(value);
        const stable = new Uint8Array(source.byteLength);
        stable.set(source);
        const result = await crypto.subtle.digest("SHA-256", stable.buffer);
        return `sha256:${[...new Uint8Array(result)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")}`;
      },
      async readBounded(
        response: Response,
        usedBytes: number,
      ): Promise<{ body: Uint8Array; usedBytes: number }> {
        const declared = response.headers.get("content-length");
        if (declared !== null) {
          const size = Number(declared);
          if (
            !Number.isSafeInteger(size) ||
            size < 0 ||
            size > input.maximumResponseBytes ||
            usedBytes + size > input.maximumTotalBytes
          ) throw new TypeError("Cache receipt declared size exceeds its cap.");
        }
        const stream = response.clone().body;
        if (stream === null) return { body: new Uint8Array(), usedBytes };
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (
            size > input.maximumResponseBytes ||
            usedBytes + size > input.maximumTotalBytes
          ) {
            await reader.cancel();
            throw new TypeError("Cache receipt exceeds its cap.");
          }
          chunks.push(next.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { body, usedBytes: usedBytes + size };
      },
    };
    let aggregateTreeNodes = 0;
    let aggregateTreeAttributeCodeUnits = 0;
    let aggregateTreeTextCodeUnits = 0;
    const treeHelpers = {
      serializeDocumentTree(
        document: Document,
      ): PublisherOfflineHtmlDocumentTree {
      let nodeCount = 0;
      let maximumDepth = 0;
      let attributeCount = 0;
      let attributeCodeUnits = 0;
      let textCodeUnits = 0;
      const serializer = {
        serializeNode(
          node: Node,
          depth: number,
        ): PublisherOfflineHtmlTreeNode | null {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = node.textContent ?? "";
          nodeCount += 1;
          textCodeUnits += value.length;
          aggregateTreeNodes += 1;
          aggregateTreeTextCodeUnits += value.length;
          maximumDepth = Math.max(maximumDepth, depth);
          if (
            aggregateTreeNodes > input.maximumTreeNodes ||
            depth > input.maximumTreeDepth ||
            aggregateTreeTextCodeUnits > input.maximumTreeTextCodeUnits
          ) {
            throw new TypeError(
              "Publisher offline serialized HTML tree exceeds its cap.",
            );
          }
          return { type: "text", value };
        }
        if (!(node instanceof Element)) return null;
        const names = node.getAttributeNames().sort((left, right) =>
          left.localeCompare(right)
        );
        if (names.length > input.maximumAttributesPerElement) {
          throw new TypeError(
            "Publisher offline serialized HTML element exceeds its cap.",
          );
        }
        const attributes = names.map((name) => {
          const value = node.getAttribute(name) ?? "";
          attributeCount += 1;
          attributeCodeUnits += name.length + value.length;
          aggregateTreeAttributeCodeUnits += name.length + value.length;
          return [name, value] as const;
        });
        nodeCount += 1;
        aggregateTreeNodes += 1;
        maximumDepth = Math.max(maximumDepth, depth);
        if (
          aggregateTreeNodes > input.maximumTreeNodes ||
          depth > input.maximumTreeDepth ||
          aggregateTreeAttributeCodeUnits >
            input.maximumTreeAttributeCodeUnits
        ) {
          throw new TypeError(
            "Publisher offline serialized HTML tree exceeds its cap.",
          );
        }
        const children = [...node.childNodes].flatMap((child) => {
          const serialized = serializer.serializeNode(child, depth + 1);
          return serialized === null ? [] : [serialized];
        });
        return {
          type: "element",
          tagName: node.tagName.toLowerCase(),
          attributes,
          children,
        };
        },
      };
      const root = serializer.serializeNode(document.documentElement, 1);
      if (root === null || root.type !== "element") {
        throw new TypeError("Publisher offline HTML document has no root.");
      }
      return {
        root,
        nodeCount,
        maximumDepth,
        attributeCount,
        attributeCodeUnits,
        textCodeUnits,
      };
      },
    };
    const cache = await caches.open(input.cacheName);
    const declared = new Map(input.declaredResources.map((
      { href, kind }: Readonly<{
        href: string;
        kind: ReaderOfflineResourceKind;
      }>,
    ) => [new URL(href, location.origin).href, kind]));
    const rows: Array<Record<string, unknown>> = [];
    let totalBytes = 0;
    for (const request of [...await cache.keys()].sort((left, right) =>
      left.url.localeCompare(right.url)
    )) {
      const response = await cache.match(request);
      if (response === undefined) continue;
      const bounded = await helpers.readBounded(response, totalBytes);
      const body = bounded.body;
      totalBytes = bounded.usedBytes;
      const url = new URL(request.url);
      if (url.origin !== location.origin) {
        throw new TypeError("Publisher offline package cache crossed its origin.");
      }
      const href = `${url.pathname}${url.search}`;
      const contentType = response.headers.get("content-type") ?? "";
      const responseUrl = response.url === "" ? null : new URL(response.url);
      if (
        response.redirected ||
        (responseUrl !== null && responseUrl.origin !== location.origin) ||
        (responseUrl !== null &&
          `${responseUrl.pathname}${responseUrl.search}` !== href)
      ) {
        throw new TypeError(
          "Publisher offline cached response redirect authority drifted.",
        );
      }
      const common = {
        href,
        kind: declared.get(request.url) ?? "discovered",
        bytes: body.byteLength,
        status: response.status,
        contentType,
        responseHref: responseUrl === null
          ? ""
          : `${responseUrl.pathname}${responseUrl.search}`,
        redirected: false as const,
      };
      const mediaType = (contentType.split(";", 1)[0] ?? "").replace(
        /^[\u0009\u000A\u000C\u000D\u0020]+|[\u0009\u000A\u000C\u000D\u0020]+$/gu,
        "",
      ).toLowerCase();
      if (
        mediaType === "text/html" &&
        contentType !== input.documentContentType
      ) {
        throw new TypeError(
          "Publisher cached HTML response media type drifted.",
        );
      }
      if (contentType === input.documentContentType) {
        const html = new TextDecoder("utf-8", { fatal: true }).decode(body);
        const document = new DOMParser().parseFromString(html, "text/html");
        rows.push({
          ...common,
          identity: "semantic-dom",
          tree: treeHelpers.serializeDocumentTree(document),
        });
      } else {
        rows.push({
          ...common,
          identity: "bytes",
          hash: await helpers.digest(body),
        });
      }
    }
      return { rows, totalBytes };
    }), {
    cacheName,
    declaredResources,
    maximumResponseBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    maximumTotalBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
    maximumTreeNodes: PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_NODES,
    maximumTreeDepth: PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_DEPTH,
    maximumAttributesPerElement:
      PUBLISHER_OFFLINE_MAXIMUM_HTML_ATTRIBUTES_PER_ELEMENT,
    maximumTreeAttributeCodeUnits:
      PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_ATTRIBUTE_CODE_UNITS,
    maximumTreeTextCodeUnits:
      PUBLISHER_OFFLINE_MAXIMUM_HTML_TREE_TEXT_CODE_UNITS,
    documentContentType: PUBLISHER_OFFLINE_DOCUMENT_CONTENT_TYPE,
  });
  if (
    documentAuthorities.length !== 14 ||
    new Set(documentAuthorities.map(({ href }) => href)).size !== 14
  ) {
    throw new TypeError("Publisher semantic document authority census drifted.");
  }
  const authorityByHref = new Map(
    documentAuthorities.map((authority) => [authority.href, authority]),
  );
  const documentHostStyles: PublisherOfflineDocumentHostStyleProjection[] = [];
  const unorderedRows = Object.freeze(result.rows.map((row) => {
    const record = asRecord(row, "Publisher offline cache receipt row");
    const identity = record.identity;
    if (identity === "semantic-dom") {
      assertExactKeys(
        record,
        [
          "href",
          "kind",
          "bytes",
          "status",
          "contentType",
          "responseHref",
          "redirected",
          "identity",
          "tree",
        ],
        "Publisher semantic cache receipt row",
      );
      const href = requiredString(
        record,
        "href",
        "Publisher semantic cache receipt row",
      );
      const authority = authorityByHref.get(href);
      if (authority === undefined) {
        throw new TypeError("Publisher semantic cache row has no Reader authority.");
      }
      const actual = projectPublisherOfflineDocumentTree(record.tree, {
        cardinalOwnedDomIds,
      });
      documentHostStyles.push(projectPublisherOfflineDocumentHostStyle(
        record.tree,
        { cardinalOwnedDomIds },
      ));
      const semanticHash = assertPublisherOfflineDocumentSemanticProjection(
        authority,
        actual,
      );
      const routeTargetKind = authority.routeTarget.kind;
      if (
        routeTargetKind !== "home" &&
        routeTargetKind !== "work" &&
        routeTargetKind !== "section"
      ) {
        throw new TypeError("Publisher semantic route target kind drifted.");
      }
      return Object.freeze({
        href,
        kind: record.kind as ReaderOfflineResourceKind | "discovered",
        bytes: record.bytes as number,
        status: record.status as number,
        contentType: record.contentType as string,
        responseHref: record.responseHref as string,
        redirected: record.redirected as false,
        identity: "semantic-dom" as const,
        resolvedHref: authority.resolvedHref,
        routeTargetKind,
        workId: routeTargetKind === "home"
          ? null
          : authority.routeTarget.workId ?? null,
        sectionId: routeTargetKind === "section"
          ? authority.routeTarget.sectionId ?? null
          : null,
        blockCount: authority.expectedDom.blocks.length,
        linkCount: authority.expectedDom.links.length,
        semanticHash,
      });
    }
    if (identity === "bytes") {
      assertExactKeys(
        record,
        [
          "href",
          "kind",
          "bytes",
          "status",
          "contentType",
          "responseHref",
          "redirected",
          "identity",
          "hash",
        ],
        "Publisher byte cache receipt row",
      );
      return Object.freeze(record as unknown as PublisherOfflineByteReceiptRow);
    }
    throw new TypeError("Publisher offline cache receipt identity drifted.");
  }));
  const declaredResourceHrefs = declaredResources.map(({ href }) =>
    publicHref(href, "Publisher declared cache href")
  );
  const normalizedInstalledHrefs = installedResourceHrefs.map((href) =>
    publicHref(href, "Publisher installed cache href")
  );
  const discoveredResourceHrefs = normalizedInstalledHrefs.slice(
    declaredResourceHrefs.length,
  );
  const firstHostStyle = documentHostStyles[0];
  const rowByHref = new Map(unorderedRows.map((row) => [row.href, row]));
  const rows = Object.freeze(normalizedInstalledHrefs.map((href) => {
    const row = rowByHref.get(href);
    if (row === undefined) {
      throw new TypeError("Publisher installed cache order references no response.");
    }
    return row;
  }));
  const declaredHrefs = new Set(declaredResourceHrefs);
  const byteIdentity = (
    href: string,
    bytes: number,
    hash: string,
  ): boolean => {
    const row = rows.find((candidate) => candidate.href === href);
    return row?.identity === "bytes" &&
      row.bytes === bytes &&
      row.hash === hash;
  };
  const compiledCssHash = firstHostStyle === undefined
    ? ""
    : hashJson(firstHostStyle.stylesheetHrefs.map((href) => {
        const row = rows.find((candidate) => candidate.href === href);
        return Object.freeze({
          path: publisherOfflineStylesheetHashPath(href),
          bytes: row?.bytes ?? -1,
          hash: row?.identity === "bytes" ? row.hash : "",
        });
      }).sort((left, right) => left.path.localeCompare(right.path)));
  if (
    declaredResources.length !== 17 ||
    normalizedInstalledHrefs.length !== unorderedRows.length ||
    new Set(normalizedInstalledHrefs).size !== normalizedInstalledHrefs.length ||
    !isDeepStrictEqual(
      normalizedInstalledHrefs.slice(0, declaredResourceHrefs.length),
      declaredResourceHrefs,
    ) ||
    discoveredResourceHrefs.length <= 0 ||
    firstHostStyle === undefined ||
    documentHostStyles.length !== 14 ||
    !isDeepStrictEqual(
      firstHostStyle.rootThemeStyleDeclarations,
      expectedRootThemeStyleDeclarations,
    ) ||
    documentHostStyles.some((style) =>
      !isDeepStrictEqual(
        style.rootThemeStyleDeclarations,
        firstHostStyle.rootThemeStyleDeclarations,
      ) ||
      !isDeepStrictEqual(style.stylesheetHrefs, firstHostStyle.stylesheetHrefs)
    ) ||
    !isDeepStrictEqual(
      firstHostStyle.stylesheetHrefs,
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS,
    ) ||
    firstHostStyle.stylesheetHrefsHash !==
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH ||
    !firstHostStyle.stylesheetHrefs.every((href) =>
      discoveredResourceHrefs.includes(href) &&
      rows.some((row) =>
        row.href === href &&
        row.kind === "discovered" &&
        row.identity === "bytes" &&
        row.status === 200 &&
        row.contentType === PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE
      )
    ) ||
    firstHostStyle.rootThemeStyleHash !==
      PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH ||
    compiledCssHash !== PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH ||
    !isDeepStrictEqual(
      sorted(normalizedInstalledHrefs),
      sorted(rows.map(({ href }) => href)),
    ) ||
    declaredResources.filter(({ kind }) => kind === "document").length !== 14 ||
    declaredResources.filter(({ kind }) => kind === "data").length !== 3 ||
    new Set(rows.map(({ href }) => href)).size !== rows.length ||
    !declaredResources.every(({ href, kind }) => rows.some((row) =>
      row.href === href &&
      row.kind === kind &&
      (kind === "document"
        ? row.identity === "semantic-dom"
        : row.identity === "bytes")
    )) ||
    rows.some(({ bytes, status }) =>
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      bytes > PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES ||
      status !== 200
    ) ||
    rows.some(({ href, contentType }) =>
      /^(?:audio|video)\//iu.test(trimHtmlSpaceCharacters(contentType)) ||
      /(?:^|\/)(?:publication-audio\.json|[^/?]+\.(?:aac|flac|m4a|mp3|oga|ogg|opus|vtt|wav))(?:\?|$)/iu
        .test(href) ||
      /(?:timing|timings)(?:\.json)?(?:\?|$)/iu.test(href)
    ) ||
    result.totalBytes > PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES ||
    rows.filter(({ identity }) => identity === "semantic-dom").length !== 14 ||
    rows.length - declaredHrefs.size <= 0 ||
    !byteIdentity(
      PUBLISHER_OFFLINE_CATALOG_HREF,
      PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES,
      PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH,
    ) ||
    !byteIdentity(
      "/publication-reader-progress.json",
      PUBLISHER_OFFLINE_EXPECTED_PROGRESS_BYTES,
      PUBLISHER_OFFLINE_EXPECTED_PROGRESS_HASH,
    ) ||
    !byteIdentity(
      "/publication-reader-search.json",
      PUBLISHER_OFFLINE_EXPECTED_SEARCH_BYTES,
      PUBLISHER_OFFLINE_EXPECTED_SEARCH_HASH,
    ) ||
    !byteIdentity(
      COHERENCE_READER_STATE_MIGRATION_HREF,
      PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES,
      PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_HASH,
    )
  ) {
    throw new TypeError("Publisher offline cache receipt is incomplete.");
  }
  const receiptBasis = Object.freeze({
    responseCount: rows.length,
    declaredResourceCount: 18 as const,
    discoveredResourceCount: discoveredResourceHrefs.length,
    declaredResourceHrefs: Object.freeze([...declaredResourceHrefs]),
    discoveredResourceHrefs: Object.freeze([...discoveredResourceHrefs]),
    totalBytes: result.totalBytes,
    maximumResponseBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    maximumTotalBytes: PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
    rawHtmlHashCount: 0 as const,
    semanticDocumentCount: rows.filter(
      ({ identity }) => identity === "semantic-dom",
    ).length,
    themeTokensHash: PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH,
    rootThemeStyleHash: firstHostStyle.rootThemeStyleHash,
    stylesheetCount: firstHostStyle.stylesheetHrefs.length,
    stylesheetHrefs: firstHostStyle.stylesheetHrefs,
    stylesheetHrefsHash:
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH,
    compiledCssHash: PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH,
    rows,
  });
  const receipt = Object.freeze({
    ...receiptBasis,
    hash: "",
  });
  return Object.freeze({
    ...receipt,
    hash: hashJson(publisherOfflineDurableCacheReceiptBasis(receipt)),
  });
}

export function publisherOfflineDurableCacheReceiptBasis(
  receipt: Omit<PublisherOfflineCacheReceipt, "hash"> &
    Readonly<{ hash?: string }>,
): Readonly<{
  responseCount: number;
  declaredResourceCount: 18;
  discoveredResourceCount: number;
  declaredResourceHrefs: readonly string[];
  discoveredResourceHrefs: readonly string[];
  maximumResponseBytes: typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES;
  maximumTotalBytes: typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES;
  rawHtmlHashCount: 0;
  semanticDocumentCount: number;
  themeTokensHash: typeof PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH;
  rootThemeStyleHash: string;
  stylesheetCount: number;
  stylesheetHrefs: readonly string[];
  stylesheetHrefsHash: string;
  compiledCssHash: typeof PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH;
  rows: readonly unknown[];
}> {
  return Object.freeze({
    responseCount: receipt.responseCount,
    declaredResourceCount: receipt.declaredResourceCount,
    discoveredResourceCount: receipt.discoveredResourceCount,
    declaredResourceHrefs: receipt.declaredResourceHrefs,
    discoveredResourceHrefs: receipt.discoveredResourceHrefs,
    maximumResponseBytes: receipt.maximumResponseBytes,
    maximumTotalBytes: receipt.maximumTotalBytes,
    rawHtmlHashCount: receipt.rawHtmlHashCount,
    semanticDocumentCount: receipt.semanticDocumentCount,
    themeTokensHash: receipt.themeTokensHash,
    rootThemeStyleHash: receipt.rootThemeStyleHash,
    stylesheetCount: receipt.stylesheetCount,
    stylesheetHrefs: receipt.stylesheetHrefs,
    stylesheetHrefsHash: receipt.stylesheetHrefsHash,
    compiledCssHash: receipt.compiledCssHash,
    rows: Object.freeze(receipt.rows.map(
      publisherOfflineDurableCacheReceiptRowBasis,
    )),
  });
}

function publisherOfflineDurableCacheReceiptRowBasis(
  row: PublisherOfflineCacheReceiptRow,
): unknown {
  return row.identity === "semantic-dom"
    ? Object.freeze({
        href: row.href,
        kind: row.kind,
        status: row.status,
        contentType: row.contentType,
        responseHref: row.responseHref,
        redirected: row.redirected,
        identity: row.identity,
        resolvedHref: row.resolvedHref,
        routeTargetKind: row.routeTargetKind,
        workId: row.workId,
        sectionId: row.sectionId,
        blockCount: row.blockCount,
        linkCount: row.linkCount,
        semanticHash: row.semanticHash,
      })
    : row;
}

function publisherOfflinePublicPathname(href: string): string {
  const suffixOffset = href.search(/[?#]/u);
  return suffixOffset < 0 ? href : href.slice(0, suffixOffset);
}

function publisherOfflineIsNextChunkJavaScriptHref(href: string): boolean {
  return /^\/_next\/static\/chunks\/.+\.js$/u.test(
    publisherOfflinePublicPathname(href),
  );
}

function publisherOfflineIsJavaScriptContentType(
  contentType: string,
): boolean {
  const mediaType = (contentType.split(";", 1)[0] ?? "")
    .replace(
      /^[\u0009\u000A\u000C\u000D\u0020]+|[\u0009\u000A\u000C\u000D\u0020]+$/gu,
      "",
    )
    .toLowerCase();
  return mediaType === "application/javascript" ||
    mediaType === "text/javascript";
}

function publisherOfflineAuthenticatedDisposableTransportKind(
  row: PublisherOfflineCacheReceiptRow,
  stylesheetHrefs: ReadonlySet<string>,
): "next-chunk-javascript" | "pinned-stylesheet" | null {
  if (
    row.kind !== "discovered" ||
    row.identity !== "bytes" ||
    row.status !== 200 ||
    row.redirected !== false ||
    !Number.isSafeInteger(row.bytes) ||
    row.bytes < 0 ||
    !/^sha256:[0-9a-f]{64}$/u.test(row.hash)
  ) return null;
  const javascriptTransport =
    publisherOfflineIsNextChunkJavaScriptHref(row.href) &&
    publisherOfflineIsNextChunkJavaScriptHref(row.responseHref) &&
    row.responseHref === row.href &&
    publisherOfflineIsJavaScriptContentType(row.contentType);
  const stylesheetTransport =
    stylesheetHrefs.has(row.href) &&
    row.responseHref === row.href &&
    row.contentType === PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE;
  if (javascriptTransport) return "next-chunk-javascript";
  if (stylesheetTransport) return "pinned-stylesheet";
  return null;
}

function publisherOfflineCrossRunCacheReceiptBasis(
  receipt: PublisherOfflineCacheReceipt,
): Readonly<{
  declaredResourceCount: 18;
  declaredResourceHrefs: readonly string[];
  retainedDiscoveredResourceCount: number;
  retainedDiscoveredResourceHrefs: readonly string[];
  retainedDiscoveredRows: readonly PublisherOfflineCacheReceiptRow[];
  nextStaticTransportPresent: boolean;
  nextChunkJavaScriptTransportPresent: boolean;
  pinnedStylesheetTransportCount: number;
  maximumResponseBytes: typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES;
  maximumTotalBytes: typeof PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES;
  rawHtmlHashCount: 0;
  semanticDocumentCount: number;
  themeTokensHash: typeof PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH;
  rootThemeStyleHash: string;
  stylesheetCount: number;
  stylesheetHrefs: readonly string[];
  stylesheetHrefsHash: string;
  compiledCssHash: typeof PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH;
  rows: readonly unknown[];
}> {
  const stylesheetHrefs = new Set(receipt.stylesheetHrefs);
  const normalizedTransportEntries = receipt.rows.map((row) =>
    Object.freeze({
      row,
      kind: publisherOfflineAuthenticatedDisposableTransportKind(
        row,
        stylesheetHrefs,
      ),
    })
  ).filter(({ kind }) => kind !== null);
  const normalizedTransportRows = normalizedTransportEntries.map(
    ({ row }) => row,
  );
  const normalizedTransportHrefs = new Set(
    normalizedTransportRows.map(({ href }) => href),
  );
  const normalizedTransportRowSet = new Set(normalizedTransportRows);
  const retainedDiscoveredResourceHrefs =
    receipt.discoveredResourceHrefs.filter((href) =>
      !normalizedTransportHrefs.has(href)
    );
  const retainedDiscoveredRows = receipt.rows.filter((row) =>
    row.kind === "discovered" && !normalizedTransportRowSet.has(row)
  );
  return Object.freeze({
    declaredResourceCount: receipt.declaredResourceCount,
    declaredResourceHrefs: receipt.declaredResourceHrefs,
    retainedDiscoveredResourceCount: retainedDiscoveredResourceHrefs.length,
    retainedDiscoveredResourceHrefs: Object.freeze(
      retainedDiscoveredResourceHrefs,
    ),
    retainedDiscoveredRows: Object.freeze(retainedDiscoveredRows),
    nextStaticTransportPresent: normalizedTransportRows.length > 0,
    nextChunkJavaScriptTransportPresent:
      normalizedTransportEntries.some(
        ({ kind }) => kind === "next-chunk-javascript",
      ),
    pinnedStylesheetTransportCount: normalizedTransportEntries.filter(
      ({ kind }) => kind === "pinned-stylesheet",
    ).length,
    maximumResponseBytes: receipt.maximumResponseBytes,
    maximumTotalBytes: receipt.maximumTotalBytes,
    rawHtmlHashCount: receipt.rawHtmlHashCount,
    semanticDocumentCount: receipt.semanticDocumentCount,
    themeTokensHash: receipt.themeTokensHash,
    rootThemeStyleHash: receipt.rootThemeStyleHash,
    stylesheetCount: receipt.stylesheetCount,
    stylesheetHrefs: receipt.stylesheetHrefs,
    stylesheetHrefsHash: receipt.stylesheetHrefsHash,
    compiledCssHash: receipt.compiledCssHash,
    rows: Object.freeze(receipt.rows
      .filter(({ kind }) => kind !== "discovered")
      .map(publisherOfflineDurableCacheReceiptRowBasis)),
  });
}

async function waitForReaderHydration(
  page: Page,
  expected: Readonly<{ pageKind: "work" | "section"; title: string }>,
): Promise<void> {
  const root = page.locator(
    `.publisher-root[data-publisher-page='${expected.pageKind}']`,
  );
  await root.waitFor({ state: "visible", timeout: READER_READY_TIMEOUT_MS });
  const rail = root.locator("aside.publisher-reader-rail[aria-label='Reader tools']");
  await rail.getByRole("button", { name: "Offline", exact: true }).waitFor({
    state: "visible",
    timeout: READER_READY_TIMEOUT_MS,
  });
  const ready = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback((input) => {
    const text = {
      normalize(value: string): string {
        return value
          .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
          .replace(/^ +| +$/gu, "");
      },
    };
    const roots = document.querySelectorAll(
      `.publisher-root[data-publisher-page='${input.pageKind}']`,
    );
    const publisherRoot = roots[0];
    const workSelector = `[data-publisher-work="${input.workId}"]`;
    const article = publisherRoot?.querySelector(`main article${workSelector}`);
    return document.readyState === "complete" &&
      roots.length === 1 &&
      publisherRoot instanceof HTMLElement &&
      publisherRoot.querySelectorAll(
        "aside.publisher-reader-rail[aria-label='Reader tools']",
      ).length === 1 &&
      publisherRoot.querySelectorAll(`main ${workSelector}`).length === 1 &&
      document.querySelectorAll(workSelector).length === 1 &&
      text.normalize(article?.querySelector("h1")?.textContent ?? "") ===
        input.title;
    }), {
    pageKind: expected.pageKind,
    title: expected.title,
    workId: CARDINAL_SCALE_WORK_ID,
  });
  if (!ready) {
    await page.waitForFunction(
      assertPublisherOfflineSerializableBrowserCallback((input) => {
        const text = {
          normalize(value: string): string {
            return value
              .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
              .replace(/^ +| +$/gu, "");
          },
        };
        const roots = document.querySelectorAll(
          `.publisher-root[data-publisher-page='${input.pageKind}']`,
        );
        const publisherRoot = roots[0];
        const workSelector = `[data-publisher-work="${input.workId}"]`;
        const article = publisherRoot?.querySelector(`main article${workSelector}`);
        return document.readyState === "complete" &&
          roots.length === 1 &&
          publisherRoot instanceof HTMLElement &&
          publisherRoot.querySelectorAll(
            "aside.publisher-reader-rail[aria-label='Reader tools']",
          ).length === 1 &&
          publisherRoot.querySelectorAll(`main ${workSelector}`).length === 1 &&
          document.querySelectorAll(workSelector).length === 1 &&
          text.normalize(article?.querySelector("h1")?.textContent ?? "") ===
            input.title;
      }),
      {
        pageKind: expected.pageKind,
        title: expected.title,
        workId: CARDINAL_SCALE_WORK_ID,
      },
      { timeout: READER_READY_TIMEOUT_MS },
    );
  }
}

export type PublisherOfflinePreInstallState = Readonly<{
  registrationCount: number;
  controller: boolean;
  caches: readonly Readonly<{
    name: string;
    keyCount: number;
  }>[];
}>;

export function assertPublisherOfflinePreInstallState(
  state: PublisherOfflinePreInstallState,
  phase: "clean" | "seeded",
): void {
  const expectedSeededNames = sorted([
    PUBLISHER_METADATA_CACHE_NAME,
    ...SEEDED_COHERENCE_CACHE_NAMES,
    ...SEEDED_STALE_PUBLISHER_RUNTIME_NAMES,
  ]);
  const names = state.caches.map(({ name }) => name);
  const metadata = state.caches.find(({ name }) =>
    name === PUBLISHER_METADATA_CACHE_NAME
  );
  const allowedCleanNames = names.length === 0 ||
    isDeepStrictEqual(names, [PUBLISHER_METADATA_CACHE_NAME]);
  if (
    state.registrationCount !== 0 ||
    state.controller ||
    new Set(names).size !== names.length ||
    !isDeepStrictEqual(names, sorted(names)) ||
    (metadata !== undefined && metadata.keyCount !== 0) ||
    (phase === "clean"
      ? !allowedCleanNames || state.caches.some(({ keyCount }) => keyCount !== 0)
      : !isDeepStrictEqual(names, expectedSeededNames) ||
        state.caches.some(({ name, keyCount }) =>
          name === PUBLISHER_METADATA_CACHE_NAME
            ? keyCount !== 0
            : keyCount !== 1
        ))
  ) {
    throw new TypeError(
      `Publisher offline ${phase} pre-install state drifted.`,
    );
  }
}

async function assertNoOfflineRegistrationOrCacheState(
  page: Page,
  phase: "clean" | "seeded",
): Promise<void> {
  const state = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async () => {
    const names = (await caches.keys()).sort();
    return {
      registrationCount:
        (await navigator.serviceWorker.getRegistrations()).length,
      controller: navigator.serviceWorker.controller !== null,
      caches: await Promise.all(names.map(async (name) => ({
        name,
        keyCount: (await (await caches.open(name)).keys()).length,
      }))),
      };
    }),
  );
  assertPublisherOfflinePreInstallState(state, phase);
}

async function openOfflinePanel(
  page: Page,
  expectedButtonLabel: "Download" | "Update offline copy",
): Promise<Readonly<{
  itemText: string;
}>> {
  const root = page.locator(".publisher-root[data-publisher-page]");
  const rail = root.locator("aside.publisher-reader-rail[aria-label='Reader tools']");
  await rail.getByRole("button", { name: "Offline", exact: true }).click();
  const panel = rail.locator(
    "section.publisher-reader-panel[aria-label='Offline reading']",
  );
  const item = panel.locator(
    `.publisher-reader-offline > .publisher-reader-offline-packages > li[data-work-id="${CARDINAL_SCALE_WORK_ID}"]`,
  );
  await item.waitFor({ state: "visible", timeout: READER_READY_TIMEOUT_MS });
  await page.waitForFunction(
    assertPublisherOfflineSerializableBrowserCallback(({ workId, label }) => {
      const text = {
        normalize(value: string): string {
          return value
            .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
            .replace(/^ +| +$/gu, "");
        },
      };
      const roots = document.querySelectorAll(
        ".publisher-root[data-publisher-page]",
      );
      const root = roots[0];
      const panel = root?.querySelector(
        "aside.publisher-reader-rail section.publisher-reader-panel[aria-label='Offline reading']",
      );
      const selector =
        `.publisher-reader-offline > .publisher-reader-offline-packages > li[data-work-id="${workId}"]`;
      const elements = document.querySelectorAll(`[data-work-id="${workId}"]`);
      const element = panel?.querySelector(selector);
      const button = element?.querySelector("button");
      return roots.length === 1 &&
        elements.length === 1 &&
        element instanceof HTMLLIElement &&
        text.normalize(element.querySelector("h3")?.textContent ?? "") ===
          "The Cardinal Scale" &&
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        text.normalize(button.textContent ?? "") === label;
    }),
    { label: expectedButtonLabel, workId: CARDINAL_SCALE_WORK_ID },
    { timeout: READER_READY_TIMEOUT_MS },
  );
  const itemText = normalizedDocumentText(await item.textContent() ?? "");
  if (
    !itemText.includes("Cardinal") ||
    !itemText.includes("10 sections, 18 files") ||
    !itemText.includes("Text only") ||
    !itemText.includes("17 files without a declared size")
  ) {
    throw new TypeError("Cardinal Scale offline package UI drifted.");
  }
  return Object.freeze({ itemText });
}

async function clickOfflinePackageAndWaitForSuccess(page: Page): Promise<void> {
  const item = page.locator(
    ".publisher-root[data-publisher-page] " +
      "aside.publisher-reader-rail " +
      "section.publisher-reader-panel[aria-label='Offline reading'] " +
      `.publisher-reader-offline-packages > li[data-work-id="${CARDINAL_SCALE_WORK_ID}"]`,
  );
  await item.getByRole("button").click();
  await page.waitForFunction(
    assertPublisherOfflineSerializableBrowserCallback((workId) => {
      const text = {
        normalize(value: string): string {
          return value
            .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
            .replace(/^ +| +$/gu, "");
        },
      };
      const root = document.querySelector(".publisher-root[data-publisher-page]");
      const element = root?.querySelector(
        `aside.publisher-reader-rail section.publisher-reader-panel[aria-label='Offline reading'] ` +
          `.publisher-reader-offline-packages > li[data-work-id="${workId}"]`,
      );
      const button = element?.querySelector("button");
      return element?.getAttribute("data-installed") === "true" &&
        text.normalize(button?.textContent ?? "") === "Available offline" &&
        element.querySelector("[role=alert]") === null;
    }),
    CARDINAL_SCALE_WORK_ID,
    { timeout: INSTALL_TIMEOUT_MS },
  );
}

export function assertPublisherOfflineOnlyInstalledVersionChanged(
  before: PublisherOfflineBrowserPackageState,
  after: PublisherOfflineBrowserPackageState,
): void {
  const beforeValue = before.record;
  const afterValue = after.record;
  if (beforeValue === null || afterValue === null) {
    throw new TypeError("Publisher rollback baseline lost its package record.");
  }
  const normalize = (value: JsonRecord): JsonRecord => {
    const version = asRecord(value.version, "Publisher installed package version");
    return {
      ...value,
      version: {
        ...version,
        workContentHash: "<normalized>",
      },
    };
  };
  const beforeVersion = asRecord(
    beforeValue.version,
    "Publisher installed package version",
  );
  const afterVersion = asRecord(
    afterValue.version,
    "Publisher installed package version",
  );
  if (
    beforeVersion.workContentHash === PREVIOUS_WORK_CONTENT_HASH ||
    afterVersion.workContentHash !== PREVIOUS_WORK_CONTENT_HASH ||
    before.recordHash === after.recordHash ||
    !isDeepStrictEqual(
      { ...before, record: normalize(beforeValue), recordHash: "<normalized>" },
      { ...after, record: normalize(afterValue), recordHash: "<normalized>" },
    )
  ) {
    throw new TypeError(
      "Publisher rollback baseline changed more than its version identity.",
    );
  }
}

async function installDeferredFetchFailure(
  page: Page,
  href: string,
): Promise<void> {
  await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback((failedHref) => {
    type ProofGlobal = typeof globalThis & {
      __publisherOfflineOriginalFetch?: typeof fetch;
      __publisherOfflineFailureHref?: string;
      __publisherOfflineFailureHits?: number;
      __publisherOfflineRejectFetch?: () => void;
    };
    const proofGlobal = globalThis as ProofGlobal;
    if (proofGlobal.__publisherOfflineOriginalFetch !== undefined) {
      throw new TypeError("Publisher offline fetch failure is already installed.");
    }
    const original = globalThis.fetch;
    const target = new URL(failedHref, location.origin).href;
    proofGlobal.__publisherOfflineOriginalFetch = original;
    proofGlobal.__publisherOfflineFailureHref = target;
    proofGlobal.__publisherOfflineFailureHits = 0;
    globalThis.fetch = async (input, init) => {
      const requestHref = input instanceof Request
        ? input.url
        : new URL(String(input), location.href).href;
      if (
        requestHref === target &&
        proofGlobal.__publisherOfflineFailureHits === 0
      ) {
        proofGlobal.__publisherOfflineFailureHits = 1;
        return await new Promise<Response>((_resolve, reject) => {
          proofGlobal.__publisherOfflineRejectFetch = () => {
            delete proofGlobal.__publisherOfflineRejectFetch;
            reject(new TypeError(
              "Publisher offline proof injected one deferred fetch failure.",
            ));
          };
        });
      }
      return await Reflect.apply(original, globalThis, [input, init]);
      };
    }),
    href,
  );
}

async function waitForDeferredFetchFailure(page: Page): Promise<void> {
  await page.waitForFunction(
    assertPublisherOfflineSerializableBrowserCallback(() => {
    type ProofGlobal = typeof globalThis & {
      __publisherOfflineFailureHits?: number;
      __publisherOfflineRejectFetch?: () => void;
    };
    const proofGlobal = globalThis as ProofGlobal;
    return proofGlobal.__publisherOfflineFailureHits === 1 &&
      typeof proofGlobal.__publisherOfflineRejectFetch === "function";
    }),
    undefined,
    { timeout: INSTALL_TIMEOUT_MS },
  );
}

async function rejectDeferredFetchFailure(page: Page): Promise<void> {
  const released = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(() => {
    type ProofGlobal = typeof globalThis & {
      __publisherOfflineFailureHits?: number;
      __publisherOfflineRejectFetch?: () => void;
    };
    const proofGlobal = globalThis as ProofGlobal;
    const reject = proofGlobal.__publisherOfflineRejectFetch;
    if (reject === undefined) {
      return proofGlobal.__publisherOfflineFailureHits === 1;
    }
    reject();
      return proofGlobal.__publisherOfflineRejectFetch === undefined;
    }),
  );
  if (!released) {
    throw new TypeError("Publisher deferred replacement failure was not released.");
  }
}

async function removeDeferredFetchFailure(page: Page): Promise<Readonly<{
  hits: number;
  restored: boolean;
  released: boolean;
}>> {
  return await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(() => {
    type ProofGlobal = typeof globalThis & {
      __publisherOfflineOriginalFetch?: typeof fetch;
      __publisherOfflineFailureHref?: string;
      __publisherOfflineFailureHits?: number;
      __publisherOfflineRejectFetch?: () => void;
    };
    const proofGlobal = globalThis as ProofGlobal;
    const original = proofGlobal.__publisherOfflineOriginalFetch;
    const hits = proofGlobal.__publisherOfflineFailureHits ?? 0;
    proofGlobal.__publisherOfflineRejectFetch?.();
    const released = proofGlobal.__publisherOfflineRejectFetch === undefined;
    if (original !== undefined) globalThis.fetch = original;
    const restored = original !== undefined && globalThis.fetch === original;
    delete proofGlobal.__publisherOfflineOriginalFetch;
    delete proofGlobal.__publisherOfflineFailureHref;
    delete proofGlobal.__publisherOfflineFailureHits;
    delete proofGlobal.__publisherOfflineRejectFetch;
      return { hits, restored, released };
    }),
  );
}

async function clickOfflinePackage(page: Page): Promise<void> {
  const item = page.locator(
    ".publisher-root[data-publisher-page] " +
      "aside.publisher-reader-rail " +
      "section.publisher-reader-panel[aria-label='Offline reading'] " +
      `.publisher-reader-offline-packages > li[data-work-id="${CARDINAL_SCALE_WORK_ID}"]`,
  );
  await item.getByRole("button").click();
}

async function waitForOfflinePackageFailure(page: Page): Promise<void> {
  await page.waitForFunction(
    assertPublisherOfflineSerializableBrowserCallback((workId) => {
      const text = {
        normalize(value: string): string {
          return value
            .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
            .replace(/^ +| +$/gu, "");
        },
      };
      const root = document.querySelector(".publisher-root[data-publisher-page]");
      const element = root?.querySelector(
        `aside.publisher-reader-rail section.publisher-reader-panel[aria-label='Offline reading'] ` +
          `.publisher-reader-offline-packages > li[data-work-id="${workId}"]`,
      );
      const alert = element?.querySelector("[role=alert]")?.textContent ?? "";
      const button = element?.querySelector("button");
      return alert.includes("previous complete copy") &&
        button instanceof HTMLButtonElement &&
        text.normalize(button?.textContent ?? "") === "Update offline copy" &&
        !button.hasAttribute("disabled");
    }),
    CARDINAL_SCALE_WORK_ID,
    { timeout: READER_READY_TIMEOUT_MS },
  );
}

function assertCurrentInstalledRecord(
  state: PublisherOfflineBrowserPackageState,
  offlinePackage: ReaderOfflinePackage,
  previousCacheName?: string,
): Readonly<{
  cacheName: string;
  resourceHrefs: readonly string[];
  declaredResourceHrefs: readonly string[];
  discoveredResourceHrefs: readonly string[];
}> {
  if (state.record === null) {
    throw new TypeError("Publisher offline package pointer is absent.");
  }
  assertExactKeys(
    state.record,
    [
      "schemaVersion",
      "publicationId",
      "workId",
      "route",
      "version",
      "cacheName",
      "resourceHrefs",
      "savedAt",
    ],
    "Publisher offline package pointer",
  );
  const version = asRecord(
    state.record.version,
    "Publisher offline package pointer version",
  );
  assertExactKeys(
    version,
    [
      "readerBuildId",
      "rendererBuildId",
      "workContentHash",
      "narrationCatalogHash",
    ],
    "Publisher offline package pointer version",
  );
  const resourceHrefs = state.record.resourceHrefs;
  const declaredResourceHrefs = offlinePackage.resources.map(({ href }) => href);
  const metadataRecordHref = `${PUBLISHER_RECORD_PREFIX}${
    encodeURIComponent(EXPECTED_PUBLICATION_ID)
  }/${encodeURIComponent(offlinePackage.workId)}`;
  const cacheName = state.record.cacheName;
  const savedAt = state.record.savedAt;
  if (
    state.record.schemaVersion !== 1 ||
    state.record.publicationId !== EXPECTED_PUBLICATION_ID ||
    state.record.workId !== offlinePackage.workId ||
    state.record.route !== offlinePackage.route ||
    version.readerBuildId !== offlinePackage.version.readerBuildId ||
    version.rendererBuildId !== offlinePackage.version.rendererBuildId ||
    version.workContentHash !== offlinePackage.version.workContentHash ||
    version.narrationCatalogHash !== null ||
    state.recordResponseBytes < 1 ||
    state.recordResponseStatus !== 200 ||
    state.recordResponseStatusText !== "" ||
    !isDeepStrictEqual(
      state.recordResponseHeaders,
      [["content-type", "application/json"]],
    ) ||
    state.recordResponseHref !== "" ||
    state.recordResponseRedirected ||
    state.recordResponseType !== "default" ||
    !isDeepStrictEqual(state.metadataCacheRequests, [{
      method: "GET",
      href: metadataRecordHref,
      headers: [],
    }]) ||
    typeof cacheName !== "string" ||
    !cacheName.startsWith(PUBLISHER_PACKAGE_CACHE_PREFIX) ||
    cacheName === previousCacheName ||
    !Array.isArray(resourceHrefs) ||
    !resourceHrefs.every((href) => typeof href === "string") ||
    new Set(resourceHrefs).size !== resourceHrefs.length ||
    !isDeepStrictEqual(
      resourceHrefs.slice(0, declaredResourceHrefs.length),
      declaredResourceHrefs,
    ) ||
    resourceHrefs.length <= declaredResourceHrefs.length ||
    state.packageCacheEntryCount !== resourceHrefs.length ||
    !isDeepStrictEqual(sorted(state.packageCacheHrefs), sorted(resourceHrefs)) ||
    state.packageCacheEntries.length !== resourceHrefs.length ||
    state.packageCacheEntries.some((entry) =>
      entry.method !== "GET" ||
      !resourceHrefs.includes(entry.href) ||
      !isDeepStrictEqual(entry.headers, []) ||
      entry.redirected ||
      entry.responseHref !== entry.href ||
      entry.responseType !== "basic"
    ) ||
    typeof savedAt !== "string" ||
    Number.isNaN(Date.parse(savedAt)) ||
    !isDeepStrictEqual(state.cacheNames, [cacheName])
  ) {
    throw new TypeError("Publisher offline package pointer identity drifted.");
  }
  return Object.freeze({
    cacheName,
    resourceHrefs: Object.freeze([...resourceHrefs]),
    declaredResourceHrefs: Object.freeze([...declaredResourceHrefs]),
    discoveredResourceHrefs: Object.freeze(
      resourceHrefs.slice(declaredResourceHrefs.length),
    ),
  });
}

export function assertPublisherOfflineBrowserPackageStateUnchanged(
  expected: PublisherOfflineBrowserPackageState,
  actual: PublisherOfflineBrowserPackageState,
  label: string,
): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new TypeError(`${label} changed the active Publisher package state.`);
  }
}

export function assertPublisherOfflineInFlightPackageStateUnchanged(
  expected: PublisherOfflineBrowserPackageState,
  actual: PublisherOfflineBrowserPackageState,
): void {
  const expectedActive = expected.cacheName;
  const staging = actual.cacheNames.filter((name) => name !== expectedActive);
  if (
    expected.cacheNames.length !== 1 ||
    expected.cacheNames[0] !== expectedActive ||
    actual.cacheNames.length !== 2 ||
    !actual.cacheNames.includes(expectedActive) ||
    staging.length !== 1 ||
    !staging[0]?.startsWith(PUBLISHER_PACKAGE_CACHE_PREFIX) ||
    !isDeepStrictEqual(
      { ...actual, cacheNames: expected.cacheNames },
      expected,
    )
  ) {
    throw new TypeError(
      "In-flight Publisher replacement changed its active pointer or package.",
    );
  }
}

async function waitForExactServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    assertPublisherOfflineSerializableBrowserCallback(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const registration = registrations[0];
      const active = registration?.active;
      const controller = navigator.serviceWorker.controller;
      if (registrations.length !== 1 || active == null || controller === null) {
        return false;
      }
      const activeUrl = new URL(active.scriptURL);
      const controllerUrl = new URL(controller.scriptURL);
      return activeUrl.origin === location.origin &&
        activeUrl.pathname === "/offline-sw.js" &&
        activeUrl.search === "" &&
        activeUrl.hash === "" &&
        controllerUrl.origin === location.origin &&
        controllerUrl.pathname === "/offline-sw.js" &&
        controllerUrl.search === "" &&
        controllerUrl.hash === "" &&
        active.state === "activated" &&
        controller.state === "activated" &&
        registration?.installing === null &&
        registration.waiting === null &&
        controller === active;
    }),
    undefined,
    { timeout: READER_READY_TIMEOUT_MS },
  );
  await assertExactServiceWorkerState(page);
}

async function assertExactServiceWorkerState(page: Page): Promise<void> {
  const state = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return {
      count: registrations.length,
      origin: location.origin,
      scope: registrations[0]?.scope ?? "",
      activeScript: registrations[0]?.active?.scriptURL ?? "",
      activeState: registrations[0]?.active?.state ?? "",
      installingScript: registrations[0]?.installing?.scriptURL ?? null,
      waitingScript: registrations[0]?.waiting?.scriptURL ?? null,
      controllerScript: navigator.serviceWorker.controller?.scriptURL ?? "",
      controllerState: navigator.serviceWorker.controller?.state ?? "",
        controllerIsActive:
          navigator.serviceWorker.controller === registrations[0]?.active,
      };
    }),
  );
  assertPublisherOfflineServiceWorkerState(state);
}

export function assertPublisherOfflineServiceWorkerState(state: Readonly<{
  count: number;
  origin: string;
  scope: string;
  activeScript: string;
  activeState: string;
  installingScript: string | null;
  waitingScript: string | null;
  controllerScript: string;
  controllerState: string;
  controllerIsActive: boolean;
}>): void {
  let scope: URL;
  let active: URL;
  let controller: URL;
  try {
    scope = new URL(state.scope);
    active = new URL(state.activeScript);
    controller = new URL(state.controllerScript);
  } catch {
    throw new TypeError("Publisher offline service worker registration drifted.");
  }
  if (
    state.count !== 1 ||
    scope.origin !== state.origin ||
    scope.pathname !== "/" ||
    scope.search !== "" ||
    scope.hash !== "" ||
    active.origin !== state.origin ||
    active.pathname !== OFFLINE_WORKER_PATH ||
    active.search !== "" ||
    active.hash !== "" ||
    state.activeState !== "activated" ||
    state.installingScript !== null ||
    state.waitingScript !== null ||
    controller.origin !== state.origin ||
    controller.pathname !== OFFLINE_WORKER_PATH ||
    controller.search !== "" ||
    controller.hash !== "" ||
    state.controllerState !== "activated" ||
    !state.controllerIsActive
  ) {
    throw new TypeError("Publisher offline service worker registration drifted.");
  }
}

async function assertStalePublisherRuntimesDeleted(page: Page): Promise<void> {
  await page.waitForFunction(
    assertPublisherOfflineSerializableBrowserCallback(async (staleNames) => {
      const names = await caches.keys();
      return staleNames.every((name: string) => !names.includes(name));
    }),
    [...SEEDED_STALE_PUBLISHER_RUNTIME_NAMES],
    { timeout: READER_READY_TIMEOUT_MS },
  );
  const names = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(
      async () => await caches.keys(),
    ),
  );
  if (
    SEEDED_STALE_PUBLISHER_RUNTIME_NAMES.some((name) => names.includes(name)) ||
    names.some((name) =>
      name.startsWith(PUBLISHER_RUNTIME_CACHE_PREFIX) &&
      name !== PUBLISHER_RUNTIME_CACHE_NAME
    )
  ) {
    throw new TypeError("Publisher offline stale runtime caches survived activation.");
  }
}

async function exerciseRangeAnd206Policy(
  page: Page,
  receipt: PublisherOfflineCacheReceipt,
): Promise<Readonly<{
  status: 206;
  bytes: 32;
  notRuntimeCached: true;
}>> {
  const target = receipt.rows.find((row) =>
    row.identity === "bytes" &&
    row.href.startsWith("/_next/static/") &&
    row.bytes >= 32
  );
  if (target === undefined) {
    throw new TypeError("Publisher offline receipt has no ranged static asset.");
  }
  const result = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const runtime = await caches.open(input.runtimeCacheName);
    const absolute = new URL(input.href, location.origin).href;
    await runtime.delete(absolute);
    const response = await fetch(absolute, {
      cache: "no-store",
      credentials: "omit",
      headers: { range: "bytes=0-31" },
    });
    const body = await response.arrayBuffer();
    return {
      status: response.status,
      contentRange: response.headers.get("content-range"),
      bytes: body.byteLength,
        runtimeCached: await runtime.match(absolute) !== undefined,
      };
    }), {
    href: target.href,
    runtimeCacheName: PUBLISHER_RUNTIME_CACHE_NAME,
  });
  if (
    result.status !== 206 ||
    result.bytes !== 32 ||
    result.contentRange === null ||
    !result.contentRange.startsWith("bytes 0-31/") ||
    result.runtimeCached
  ) {
    throw new TypeError("Publisher offline Range or 206 cache policy drifted.");
  }
  return Object.freeze({
    status: 206 as const,
    bytes: 32 as const,
    notRuntimeCached: true as const,
  });
}

async function exerciseExcludedRequests(
  context: BrowserContext,
  page: Page,
  activeCacheName: string,
  installedHref: string,
): Promise<void> {
  const descriptors = Object.freeze([
    Object.freeze({ href: "/api/offline-proof", headers: {} }),
    Object.freeze({ href: "/auth/offline-proof", headers: {} }),
    Object.freeze({ href: "/__publisher-excluded__/rsc-header", headers: { rsc: "1" } }),
    Object.freeze({ href: "/__publisher-excluded__/rsc-query?_rsc=proof", headers: {} }),
    Object.freeze({
      href: "/__publisher-excluded__/prefetch",
      headers: { "next-router-prefetch": "1" },
    }),
    Object.freeze({
      href: "/__publisher-excluded__/state-tree",
      headers: { "next-router-state-tree": "proof" },
    }),
    Object.freeze({ href: OFFLINE_WORKER_PATH, headers: {} }),
  ]);
  await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const packageCache = await caches.open(input.activeCacheName);
    const runtimeCache = await caches.open(input.runtimeCacheName);
    for (const [index, descriptor] of input.descriptors.entries()) {
      const request = new Request(new URL(descriptor.href, location.origin), {
        headers: descriptor.headers,
      });
      const response = new Response(`excluded-sentinel:${index}`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
      await packageCache.put(request, response.clone());
        await runtimeCache.put(request, response);
      }
    }), {
    activeCacheName,
    descriptors,
    runtimeCacheName: PUBLISHER_RUNTIME_CACHE_NAME,
  });
  await context.setOffline(true);
  try {
    const result = await page.evaluate(
      assertPublisherOfflineSerializableBrowserCallback(async (input) => {
      const outcomes: Array<{
        href: string;
        rejected: boolean;
        status: number;
      }> = [];
      for (const descriptor of input.descriptors) {
        try {
          const response = await fetch(descriptor.href, {
            cache: "reload",
            headers: descriptor.headers,
          });
          outcomes.push({
            href: descriptor.href,
            rejected: false,
            status: response.status,
          });
        } catch {
          outcomes.push({ href: descriptor.href, rejected: true, status: 0 });
        }
      }
      try {
        const response = await fetch(input.installedHref, {
          cache: "reload",
          headers: { range: "bytes=0-31" },
        });
        outcomes.push({
          href: input.installedHref,
          rejected: false,
          status: response.status,
        });
      } catch {
        outcomes.push({
          href: input.installedHref,
          rejected: true,
          status: 0,
        });
      }
        return outcomes;
      }), {
      descriptors,
      installedHref,
    });
    if (
      result.length !== 8 ||
      result.some(({ rejected, status }) => !rejected || status !== 0)
    ) {
      throw new TypeError(
        "Publisher offline worker served an excluded or ranged request.",
      );
    }
  } finally {
    await context.setOffline(false);
    const cleaned = await page.evaluate(
      assertPublisherOfflineSerializableBrowserCallback(async (input) => {
      const packageCache = await caches.open(input.activeCacheName);
      const runtimeCache = await caches.open(input.runtimeCacheName);
      const results: boolean[] = [];
      for (const descriptor of input.descriptors) {
        const request = new Request(new URL(descriptor.href, location.origin), {
          headers: descriptor.headers,
        });
        results.push(await packageCache.delete(request));
        results.push(await runtimeCache.delete(request));
        results.push(await packageCache.match(request) === undefined);
        results.push(await runtimeCache.match(request) === undefined);
      }
        return results.every(Boolean);
      }), {
      activeCacheName,
      descriptors,
      runtimeCacheName: PUBLISHER_RUNTIME_CACHE_NAME,
    });
    if (!cleaned) {
      throw new TypeError("Publisher excluded-request sentinels survived cleanup.");
    }
  }
}

export type PublisherOfflineDormantAudioShellState = Readonly<{
  rootCount: number;
  hostCount: number;
  audioCount: number;
  hostIsHtmlDiv: boolean;
  hostDirectBodyChild: boolean;
  hostAttributeNamesExact: boolean;
  hostClassExact: boolean;
  hostStyleNonempty: boolean;
  hostStyleMatchesRoot: boolean;
  hostChildNodeCount: number;
  hostFirstChildIsAudio: boolean;
  audioIsHtmlAudio: boolean;
  audioDirectHostChild: boolean;
  audioAttributeNamesExact: boolean;
  audioPreloadMetadata: boolean;
  audioSrcAbsent: boolean;
  audioCurrentSrcAbsent: boolean;
  audioControls: boolean;
  audioAutoplay: boolean;
  audioLoop: boolean;
  audioMuted: boolean;
  audioPaused: boolean;
  audioChildNodeCount: number;
  sourceTrackCount: number;
}>;

export type PublisherOfflineColdDocumentState = Readonly<{
  documentReadyState: string;
  online: boolean;
  controlled: boolean;
  rootCount: number;
  pageKind: string;
  articleCount: number;
  title: string;
  rootBlockCount: number;
  manuscriptBlockCount: number;
  blockId: string;
  blockVisibleText: string;
  blockVisible: boolean;
  blockHasPositiveArea: boolean;
  blockTextHasPositiveArea: boolean;
  allBlockTextNodesVisible: boolean;
  allBlockTextRunsPositiveGeometry: boolean;
  dormantAudioShellState: PublisherOfflineDormantAudioShellState;
  dormantAudioShellVerified: boolean;
  unexpectedMediaElementCount: number;
}>;

export type PublisherOfflineColdDocumentExpectation = Readonly<{
  pageKind: "section";
  pageTitle: string;
  blockId: string;
  bodyText: string;
}>;

function expectedPublisherOfflineColdDocumentState(
  expected: PublisherOfflineColdDocumentExpectation,
): PublisherOfflineColdDocumentState {
  return Object.freeze({
    documentReadyState: "complete",
    online: false,
    controlled: true,
    rootCount: 1,
    pageKind: expected.pageKind,
    articleCount: 1,
    title: expected.pageTitle,
    rootBlockCount: 1,
    manuscriptBlockCount: 1,
    blockId: expected.blockId,
    blockVisibleText: expected.bodyText,
    blockVisible: true,
    blockHasPositiveArea: true,
    blockTextHasPositiveArea: true,
    allBlockTextNodesVisible: true,
    allBlockTextRunsPositiveGeometry: true,
    dormantAudioShellState: Object.freeze({
      rootCount: 1,
      hostCount: 1,
      audioCount: 1,
      hostIsHtmlDiv: true,
      hostDirectBodyChild: true,
      hostAttributeNamesExact: true,
      hostClassExact: true,
      hostStyleNonempty: true,
      hostStyleMatchesRoot: true,
      hostChildNodeCount: 1,
      hostFirstChildIsAudio: true,
      audioIsHtmlAudio: true,
      audioDirectHostChild: true,
      audioAttributeNamesExact: true,
      audioPreloadMetadata: true,
      audioSrcAbsent: true,
      audioCurrentSrcAbsent: true,
      audioControls: false,
      audioAutoplay: false,
      audioLoop: false,
      audioMuted: false,
      audioPaused: true,
      audioChildNodeCount: 0,
      sourceTrackCount: 0,
    }),
    dormantAudioShellVerified: true,
    unexpectedMediaElementCount: 0,
  });
}

export function assertPublisherOfflineColdDocumentState(
  actual: PublisherOfflineColdDocumentState,
  expected: PublisherOfflineColdDocumentExpectation,
): void {
  const exact = expectedPublisherOfflineColdDocumentState(expected);
  if (isDeepStrictEqual(actual, exact)) return;
  let difference: PublisherOfflineProjectionDifference;
  try {
    difference = firstPublisherOfflineProjectionDifference(exact, actual);
  } catch {
    throw new TypeError(
      "Publisher initial-cold-wait state diagnosis exceeded bounds.",
    );
  }
  const message =
    `Publisher initial-cold-wait semantic state drifted at ${difference.path}; ` +
    `expected ${difference.expected.kind}:${difference.expected.length}:` +
    `${difference.expected.hash}; actual ${difference.actual.kind}:` +
    `${difference.actual.length}:${difference.actual.hash}.`;
  if (message.length > 1_024) {
    throw new TypeError(
      "Publisher initial-cold-wait state diagnosis exceeded bounds.",
    );
  }
  throw new TypeError(message);
}

async function readPublisherOfflineColdStateWithDeadline(
  readState: () => Promise<PublisherOfflineColdDocumentState>,
): Promise<PublisherOfflineColdDocumentState> {
  type ReadOutcome =
    | Readonly<{ kind: "state"; state: PublisherOfflineColdDocumentState }>
    | Readonly<{ kind: "unavailable" }>
    | Readonly<{ kind: "deadline" }>;
  const stateOutcome = Promise.resolve().then(readState).then<
    ReadOutcome,
    ReadOutcome
  >(
    (state) => Object.freeze({ kind: "state", state }),
    () => Object.freeze({ kind: "unavailable" }),
  );
  let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
  const deadlineOutcome = new Promise<ReadOutcome>((resolve) => {
    diagnosticTimer = setTimeout(() => {
      resolve(Object.freeze({ kind: "deadline" }));
    }, COLD_STATE_DIAGNOSTIC_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([stateOutcome, deadlineOutcome]);
    if (outcome.kind !== "state") {
      throw new TypeError(
        "Publisher initial-cold-wait diagnostic state was unavailable.",
      );
    }
    return outcome.state;
  } finally {
    if (diagnosticTimer !== undefined) clearTimeout(diagnosticTimer);
  }
}

export async function assertPublisherOfflineInitialColdStateBoundary(
  waitForReady: () => Promise<void>,
  readState: () => Promise<PublisherOfflineColdDocumentState>,
  expected: PublisherOfflineColdDocumentExpectation,
): Promise<void> {
  let waitTimedOut = false;
  try {
    await waitForReady();
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
    waitTimedOut = true;
  }
  const actual = await readPublisherOfflineColdStateWithDeadline(readState);
  assertPublisherOfflineColdDocumentState(actual, expected);
  if (waitTimedOut) {
    throw new TypeError(
      "Publisher initial-cold-wait timed out after exact state was captured.",
    );
  }
}

async function readPublisherOfflineColdDocumentState(
  page: Page,
  input: Readonly<{ workId: string; blockId: string }>,
): Promise<PublisherOfflineColdDocumentState> {
  return await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(({ workId, blockId }) => {
      const text = {
        normalize(value: string): string {
          return value
            .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
            .replace(/^ +| +$/gu, "");
        },
      };
      const roots = document.querySelectorAll(
        ".publisher-root[data-publisher-page]",
      );
      const root = roots[0];
      const articles = root?.querySelectorAll(
        `main article[data-publisher-work="${workId}"]`,
      );
      const article = articles?.[0];
      const manuscript = article?.querySelector(".publisher-manuscript");
      const blocks = manuscript?.querySelectorAll(
        `[data-publisher-block="${blockId}"]`,
      );
      const block = blocks?.[0];
      const media = {
        inspect(): Readonly<{
          dormantAudioShellState: PublisherOfflineDormantAudioShellState;
          dormantAudioShellVerified: boolean;
          unexpectedMediaElementCount: number;
        }> {
          const roots = document.querySelectorAll(
            ".publisher-root[data-publisher-page]",
          );
          const root = roots[0];
          const hosts = document.querySelectorAll(
            ".publisher-reader-audio-host",
          );
          const host = hosts[0];
          const audios = document.querySelectorAll("audio");
          const audio = audios[0];
          const dormantAudioShellState = {
            rootCount: roots.length,
            hostCount: hosts.length,
            audioCount: audios.length,
            hostIsHtmlDiv: host instanceof HTMLDivElement,
            hostDirectBodyChild: host?.parentElement === document.body,
            hostAttributeNamesExact:
              host?.getAttributeNames().sort().join(",") === "class,style",
            hostClassExact:
              host?.getAttribute("class") === "publisher-reader-audio-host",
            hostStyleNonempty: (host?.getAttribute("style") ?? "") !== "",
            hostStyleMatchesRoot:
              host !== undefined && root !== undefined &&
              host.getAttribute("style") === root.getAttribute("style"),
            hostChildNodeCount: host?.childNodes.length ?? 0,
            hostFirstChildIsAudio:
              host !== undefined && audio !== undefined &&
              host.firstChild === audio,
            audioIsHtmlAudio: audio instanceof HTMLAudioElement,
            audioDirectHostChild:
              audio !== undefined && host !== undefined &&
              audio.parentElement === host,
            audioAttributeNamesExact:
              audio?.getAttributeNames().sort().join(",") === "preload",
            audioPreloadMetadata: audio?.getAttribute("preload") === "metadata",
            audioSrcAbsent: audio?.getAttribute("src") === null,
            audioCurrentSrcAbsent:
              audio instanceof HTMLAudioElement && audio.currentSrc === "",
            audioControls:
              audio instanceof HTMLAudioElement && audio.controls,
            audioAutoplay:
              audio instanceof HTMLAudioElement && audio.autoplay,
            audioLoop: audio instanceof HTMLAudioElement && audio.loop,
            audioMuted: audio instanceof HTMLAudioElement && audio.muted,
            audioPaused: audio instanceof HTMLAudioElement && audio.paused,
            audioChildNodeCount: audio?.childNodes.length ?? 0,
            sourceTrackCount: audio?.querySelectorAll("source,track").length ?? 0,
          } satisfies PublisherOfflineDormantAudioShellState;
          const dormantAudioShellVerified =
            dormantAudioShellState.rootCount === 1 &&
            dormantAudioShellState.hostCount === 1 &&
            dormantAudioShellState.audioCount === 1 &&
            dormantAudioShellState.hostIsHtmlDiv &&
            dormantAudioShellState.hostDirectBodyChild &&
            dormantAudioShellState.hostAttributeNamesExact &&
            dormantAudioShellState.hostClassExact &&
            dormantAudioShellState.hostStyleNonempty &&
            dormantAudioShellState.hostStyleMatchesRoot &&
            dormantAudioShellState.hostChildNodeCount === 1 &&
            dormantAudioShellState.hostFirstChildIsAudio &&
            dormantAudioShellState.audioIsHtmlAudio &&
            dormantAudioShellState.audioDirectHostChild &&
            dormantAudioShellState.audioAttributeNamesExact &&
            dormantAudioShellState.audioPreloadMetadata &&
            dormantAudioShellState.audioSrcAbsent &&
            dormantAudioShellState.audioCurrentSrcAbsent &&
            !dormantAudioShellState.audioControls &&
            !dormantAudioShellState.audioAutoplay &&
            !dormantAudioShellState.audioLoop &&
            !dormantAudioShellState.audioMuted &&
            dormantAudioShellState.audioPaused &&
            dormantAudioShellState.audioChildNodeCount === 0 &&
            dormantAudioShellState.sourceTrackCount === 0;
          const unexpectedMediaElementCount = [
            ...document.querySelectorAll("*"),
          ].filter((element) => {
            if (element === audio && dormantAudioShellVerified) return false;
            if ([
              "audio", "video", "source", "track", "embed", "object",
              "iframe",
            ].includes(element.localName)) return true;
            return ["src", "href", "data"].some((name) => {
              const value = (element.getAttribute(name) ?? "").replace(
                /^[\u0009\u000A\u000C\u000D\u0020]+|[\u0009\u000A\u000C\u000D\u0020]+$/gu,
                "",
              );
              return /^(?:blob:|data:(?:audio|video)\/)/iu.test(value) ||
                value.toLowerCase().includes("publication-audio");
            });
          }).length;
          return {
            dormantAudioShellState,
            dormantAudioShellVerified,
            unexpectedMediaElementCount,
          };
        },
      };
      const textRuns = {
        inspect(blockElement: HTMLElement): Readonly<{
          allTextNodesVisible: boolean;
          allRunsPositiveGeometry: boolean;
        }> {
          const maximumDescendantNodeCount = 4_096;
          const maximumTextCodeUnitCount = 65_536;
          const maximumRunCount = 1_024;
          const maximumWrapperDepth = 2;
          const maximumRectCountPerRun = 4_096;
          const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’·ˈ]*/gu;
          const FOCUS_WORD_PATTERN = /^\p{L}[\p{L}'’]*$/u;
          const RAW_TEXT_RUN_PATTERN =
            /[^\u0009\u000A\u000C\u000D\u0020]+/gu;
          const semanticOwnerTags = new Set([
            "a",
            "blockquote",
            "code",
            "em",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "li",
            "p",
            "strong",
          ]);
          const authority = {
            matchesWordToken(value: string): boolean {
              WORD_PATTERN.lastIndex = 0;
              const match = WORD_PATTERN.exec(value);
              const accepted = match !== null &&
                match.index === 0 &&
                match[0] === value &&
                WORD_PATTERN.exec(value) === null;
              WORD_PATTERN.lastIndex = 0;
              return accepted;
            },
            wrapperKind(element: Element): string | null {
              if (!(element instanceof HTMLSpanElement)) return null;
              const attributeCount = element.attributes.length;
              if (attributeCount !== 1 && attributeCount !== 2) return null;
              const className = element.getAttribute("class");
              const attributeNames = element.getAttributeNames().sort().join(",");
              if (
                className === "publisher-focus-word" &&
                attributeNames === "class"
              ) return "focus-word";
              if (
                className === "publisher-narration-word" &&
                attributeNames ===
                  "class,data-publisher-narration-word" &&
                element.getAttribute("data-publisher-narration-word") === "true"
              ) return "narration-word";
              if (
                className ===
                  "publisher-focus-word publisher-narration-word" &&
                attributeNames ===
                  "class,data-publisher-narration-word" &&
                element.getAttribute("data-publisher-narration-word") === "true"
              ) return "focus-narration-word";
              const emphasisClasses = [
                "publisher-focus-emphasis publisher-focus-emphasis-light",
                "publisher-focus-emphasis publisher-focus-emphasis-normal",
                "publisher-focus-emphasis publisher-focus-emphasis-strong",
              ];
              const emphasisIndex = emphasisClasses.indexOf(className ?? "");
              return emphasisIndex >= 0 && attributeNames === "class"
                ? "emphasis-" + emphasisIndex
                : null;
            },
            shapingKey(textNode: Text): string | null {
              const parent = textNode.parentElement;
              if (parent === null) return null;
              const style = getComputedStyle(parent);
              return JSON.stringify([
                style.font,
                style.fontKerning,
                style.fontFeatureSettings,
                style.fontVariationSettings,
                style.fontVariantLigatures,
                style.letterSpacing,
                style.wordSpacing,
                style.textTransform,
                style.direction,
                style.writingMode,
              ]);
            },
          };
          const pending: Node[] = [];
          if (
            blockElement.childNodes.length >
              maximumDescendantNodeCount
          ) {
            return {
              allTextNodesVisible: false,
              allRunsPositiveGeometry: false,
            };
          }
          for (let index = blockElement.childNodes.length - 1; index >= 0; index--) {
            const child = blockElement.childNodes[index];
            if (child !== undefined) pending.push(child);
          }
          const textNodes: Text[] = [];
          let descendantNodeCount = 0;
          let textCodeUnitCount = 0;
          let allTextNodesVisible = true;
          while (pending.length > 0) {
            const node = pending.pop();
            if (node === undefined) break;
            descendantNodeCount += 1;
            if (descendantNodeCount > maximumDescendantNodeCount) {
              return {
                allTextNodesVisible: false,
                allRunsPositiveGeometry: false,
              };
            }
            if (node instanceof Text) {
              textCodeUnitCount += node.data.length;
              if (textCodeUnitCount > maximumTextCodeUnitCount) {
                return {
                  allTextNodesVisible: false,
                  allRunsPositiveGeometry: false,
                };
              }
              if (
                node.data.replace(
                  /[\u0009\u000A\u000C\u000D\u0020]+/gu,
                  "",
                ).length > 0
              ) {
                textNodes.push(node);
                const parent = node.parentElement;
                if (
                  parent === null ||
                  typeof parent.checkVisibility !== "function" ||
                  !parent.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                  })
                ) allTextNodesVisible = false;
              }
            }
            if (
              descendantNodeCount + pending.length + node.childNodes.length >
                maximumDescendantNodeCount
            ) {
              return {
                allTextNodesVisible: false,
                allRunsPositiveGeometry: false,
              };
            }
            for (let index = node.childNodes.length - 1; index >= 0; index--) {
              const child = node.childNodes[index];
              if (child !== undefined) pending.push(child);
            }
          }
          const anchors = new Map<Node, {
            owner: Element;
            textNodes: Text[];
          }>();
          let allRunAnchorsAccepted = textNodes.length > 0;
          for (const textNode of textNodes) {
            const parent = textNode.parentElement;
            if (parent === null) {
              allRunAnchorsAccepted = false;
              continue;
            }
            let owner: Element | null = parent;
            let outermostWrapper: Element | null = null;
            let wrapperDepth = 0;
            while (
              owner !== null && authority.wrapperKind(owner) !== null
            ) {
              wrapperDepth += 1;
              if (wrapperDepth > maximumWrapperDepth) {
                owner = null;
                break;
              }
              outermostWrapper = owner;
              const next: Element | null = owner.parentElement;
              if (
                next === null ||
                (next !== blockElement && !blockElement.contains(next))
              ) {
                owner = null;
                break;
              }
              owner = next;
            }
            if (
              owner === null ||
              !semanticOwnerTags.has(owner.localName) ||
              (owner !== blockElement && !blockElement.contains(owner))
            ) {
              allRunAnchorsAccepted = false;
              continue;
            }
            const anchor: Node = outermostWrapper ?? textNode;
            const existing = anchors.get(anchor);
            if (existing !== undefined) {
              if (existing.owner !== owner) allRunAnchorsAccepted = false;
              existing.textNodes.push(textNode);
            } else {
              anchors.set(anchor, { owner, textNodes: [textNode] });
            }
          }
          const shapingRuns: Array<{
            textNodes: Text[];
            startOffset: number;
            endOffset: number;
          }> = [];
          for (const [anchor, group] of anchors) {
            if (anchor instanceof Text) {
              if (
                group.textNodes.length !== 1 ||
                group.textNodes[0] !== anchor
              ) {
                allRunAnchorsAccepted = false;
                continue;
              }
              RAW_TEXT_RUN_PATTERN.lastIndex = 0;
              let rawTextRun: RegExpExecArray | null;
              while (
                (rawTextRun = RAW_TEXT_RUN_PATTERN.exec(anchor.data)) !== null
              ) {
                shapingRuns.push({
                  textNodes: [anchor],
                  startOffset: rawTextRun.index,
                  endOffset: rawTextRun.index + rawTextRun[0].length,
                });
              }
              RAW_TEXT_RUN_PATTERN.lastIndex = 0;
              continue;
            }
            if (!(anchor instanceof HTMLSpanElement)) {
              allRunAnchorsAccepted = false;
              continue;
            }
            const wordKind = authority.wrapperKind(anchor);
            if (
              ![
                "focus-word",
                "narration-word",
                "focus-narration-word",
              ].includes(wordKind ?? "") ||
              anchor.parentElement !== group.owner
            ) {
              allRunAnchorsAccepted = false;
              continue;
            }
            const leaves: Text[] = [];
            let grammarAccepted = true;
            if (wordKind === "narration-word") {
              const onlyChild = anchor.childNodes[0];
              grammarAccepted = anchor.childNodes.length === 1 &&
                onlyChild instanceof Text;
              if (onlyChild instanceof Text) {
                leaves.push(onlyChild);
                grammarAccepted = grammarAccepted &&
                  authority.matchesWordToken(onlyChild.data) &&
                  !FOCUS_WORD_PATTERN.test(onlyChild.data);
              }
            } else {
              const actualSegments: Array<{
                kind: string;
                text: string;
              }> = [];
              for (
                let childIndex = 0;
                childIndex < anchor.childNodes.length;
                childIndex++
              ) {
                const child = anchor.childNodes[childIndex];
                if (child instanceof Text) {
                  leaves.push(child);
                  actualSegments.push({ kind: "raw", text: child.data });
                  continue;
                }
                if (!(child instanceof HTMLSpanElement)) {
                  grammarAccepted = false;
                  continue;
                }
                const childKind = authority.wrapperKind(child);
                const onlyChild = child.childNodes[0];
                if (
                  !childKind?.startsWith("emphasis-") ||
                  child.childNodes.length !== 1 ||
                  !(onlyChild instanceof Text)
                ) {
                  grammarAccepted = false;
                  continue;
                }
                leaves.push(onlyChild);
                actualSegments.push({
                  kind: childKind,
                  text: onlyChild.data,
                });
              }
              const word = leaves.map((leaf) => leaf.data).join("");
              const codePoints = Array.from(word);
              const boundaries = [
                { end: Math.ceil(codePoints.length * 0.15), kind: "emphasis-0" },
                { end: Math.ceil(codePoints.length * 0.25), kind: "emphasis-1" },
                { end: Math.ceil(codePoints.length * 0.35), kind: "emphasis-2" },
              ];
              const expectedSegments: Array<{
                kind: string;
                text: string;
              }> = [];
              let offset = 0;
              for (const boundary of boundaries) {
                if (boundary.end <= offset) continue;
                expectedSegments.push({
                  kind: boundary.kind,
                  text: codePoints.slice(offset, boundary.end).join(""),
                });
                offset = boundary.end;
              }
              if (offset < codePoints.length) {
                expectedSegments.push({
                  kind: "raw",
                  text: codePoints.slice(offset).join(""),
                });
              }
              grammarAccepted = grammarAccepted &&
                authority.matchesWordToken(word) &&
                FOCUS_WORD_PATTERN.test(word) &&
                actualSegments.length === expectedSegments.length &&
                actualSegments.every((segment, index) =>
                  segment.kind === expectedSegments[index]?.kind &&
                  segment.text === expectedSegments[index]?.text
                );
            }
            if (
              leaves.length < 1 ||
              leaves.length > 4 ||
              leaves.some((leaf) =>
                leaf.data.length === 0 ||
                /[\u0009\u000A\u000C\u000D\u0020]/u.test(leaf.data)
              ) ||
              group.textNodes.length !== leaves.length ||
              leaves.some((leaf, index) => group.textNodes[index] !== leaf)
            ) grammarAccepted = false;
            if (!grammarAccepted) {
              allRunAnchorsAccepted = false;
              continue;
            }
            let currentRun: Text[] = [];
            let currentShapingKey: string | null = null;
            for (const leaf of leaves) {
              const shapingKey = authority.shapingKey(leaf);
              if (shapingKey === null) {
                allRunAnchorsAccepted = false;
                currentRun = [];
                break;
              }
              if (
                currentRun.length > 0 &&
                shapingKey !== currentShapingKey
              ) {
                const lastTextNode = currentRun.at(-1);
                if (lastTextNode === undefined) {
                  allRunAnchorsAccepted = false;
                  currentRun = [];
                  break;
                }
                shapingRuns.push({
                  textNodes: currentRun,
                  startOffset: 0,
                  endOffset: lastTextNode.data.length,
                });
                currentRun = [];
              }
              currentRun.push(leaf);
              currentShapingKey = shapingKey;
            }
            if (currentRun.length > 0) {
              const lastTextNode = currentRun.at(-1);
              if (lastTextNode === undefined) {
                allRunAnchorsAccepted = false;
              } else {
                shapingRuns.push({
                  textNodes: currentRun,
                  startOffset: 0,
                  endOffset: lastTextNode.data.length,
                });
              }
            }
          }
          let allRunsPositiveGeometry = allRunAnchorsAccepted &&
            shapingRuns.length > 0 &&
            shapingRuns.length <= maximumRunCount;
          if (allRunsPositiveGeometry) {
            for (const run of shapingRuns) {
              const firstTextNode = run.textNodes[0];
              const lastTextNode = run.textNodes.at(-1);
              if (firstTextNode === undefined || lastTextNode === undefined) {
                allRunsPositiveGeometry = false;
                break;
              }
              const range = document.createRange();
              range.setStart(firstTextNode, run.startOffset);
              range.setEnd(lastTextNode, run.endOffset);
              const rectangles = range.getClientRects();
              if (
                rectangles.length === 0 ||
                rectangles.length > maximumRectCountPerRun
              ) {
                allRunsPositiveGeometry = false;
                break;
              }
              let sawPositiveRectangle = false;
              for (let index = 0; index < rectangles.length; index++) {
                const rectangle = rectangles[index];
                if (
                  rectangle === undefined ||
                  !Number.isFinite(rectangle.width) ||
                  !Number.isFinite(rectangle.height)
                ) {
                  allRunsPositiveGeometry = false;
                  break;
                }
                if (rectangle.width > 0 && rectangle.height > 0) {
                  sawPositiveRectangle = true;
                }
              }
              if (!allRunsPositiveGeometry || !sawPositiveRectangle) {
                allRunsPositiveGeometry = false;
                break;
              }
            }
          }
          return {
            allTextNodesVisible: textNodes.length > 0 &&
              allTextNodesVisible,
            allRunsPositiveGeometry,
          };
        },
      };
      const textRunState = block instanceof HTMLElement
        ? textRuns.inspect(block)
        : {
          allTextNodesVisible: false,
          allRunsPositiveGeometry: false,
        };
      const mediaState = media.inspect();
      return {
        documentReadyState: document.readyState,
        online: navigator.onLine,
        controlled: navigator.serviceWorker.controller !== null,
        rootCount: roots.length,
        pageKind: root?.getAttribute("data-publisher-page") ?? "",
        articleCount: articles?.length ?? 0,
        title: text.normalize(article?.querySelector("h1")?.textContent ?? ""),
        rootBlockCount: root?.querySelectorAll(
          `[data-publisher-block="${blockId}"]`,
        ).length ?? 0,
        manuscriptBlockCount: blocks?.length ?? 0,
        blockId: block?.getAttribute("data-publisher-block") ?? "",
        blockVisibleText: text.normalize(
          block instanceof HTMLElement ? block.innerText : "",
        ),
        blockVisible: block instanceof HTMLElement &&
          typeof block.checkVisibility === "function" &&
          block.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }),
        blockHasPositiveArea: block instanceof HTMLElement &&
          [...block.getClientRects()].some((rect) =>
            Number.isFinite(rect.width) &&
            Number.isFinite(rect.height) &&
            rect.width > 0 &&
            rect.height > 0
          ),
        blockTextHasPositiveArea: block instanceof HTMLElement && (() => {
          const range = document.createRange();
          range.selectNodeContents(block);
          return [...range.getClientRects()].some((rect) =>
            Number.isFinite(rect.width) &&
            Number.isFinite(rect.height) &&
            rect.width > 0 &&
            rect.height > 0
          );
        })(),
        allBlockTextNodesVisible: textRunState.allTextNodesVisible,
        allBlockTextRunsPositiveGeometry:
          textRunState.allRunsPositiveGeometry,
        dormantAudioShellState: mediaState.dormantAudioShellState,
        dormantAudioShellVerified: mediaState.dormantAudioShellVerified,
        unexpectedMediaElementCount: mediaState.unexpectedMediaElementCount,
      };
    }),
    input,
  );
}

export function assertPublisherOfflineSearchTargetState(
  actual: Readonly<{ visible: boolean; href: string }>,
  expectedHref: string,
): void {
  if (
    !actual.visible ||
    publicHref(actual.href, "Publisher offline search target") !== actual.href ||
    actual.href !== expectedHref
  ) {
    throw new TypeError("Publisher offline search target was not visibly owned.");
  }
}

async function exerciseColdOfflineReader(
  context: BrowserContext,
  installPage: Page,
  baseUrl: string,
  input: Readonly<{
    route: string;
    pageKind: "section";
    pageTitle: string;
    blockId: string;
    bodyText: string;
    documents: readonly Readonly<{
      href: string;
      pageKind: "section";
      title: string;
      blockId: string;
      bodyText: string;
    }>[];
  }>,
): Promise<Readonly<{
  searchResultCount: number;
  runtimeCacheEntryCountBeforeCold: 0;
  runtimeCacheEntryCountAfterCold: 0;
  browserHttpCacheCleared: true;
  browserHttpCacheClearedBeforeOfflineCutoff: true;
  dormantAudioShellBoundaryCount: 2;
  dormantAudioShellVerified: true;
  unexpectedColdMediaElementCount: 0;
  page: Page;
}>> {
  const runtimeCacheEntryCountBeforeCold = await installPage.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(
      async (runtimeCacheName) => {
        await caches.delete(runtimeCacheName);
        const runtime = await caches.open(runtimeCacheName);
        return (await runtime.keys()).length;
      },
    ),
    PUBLISHER_RUNTIME_CACHE_NAME,
  );
  if (runtimeCacheEntryCountBeforeCold !== 0) {
    throw new TypeError("Publisher runtime cache was not empty before cold proof.");
  }
  const cdp = await context.newCDPSession(installPage);
  let transitionError: unknown;
  try {
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    await context.setOffline(true);
  } catch (error) {
    transitionError = error;
  }
  try {
    await cdp.detach();
  } catch (error) {
    transitionError = transitionError === undefined
      ? error
      : new AggregateError(
          [transitionError, error],
          "Publisher HTTP cache cutoff and CDP cleanup failed.",
        );
  }
  if (transitionError !== undefined) {
    await context.setOffline(false).catch(() => undefined);
    throw transitionError;
  }
  await installPage.close();
  const page = await context.newPage();
  try {
    const response = await page.goto(new URL(input.route, baseUrl).href, {
      waitUntil: "domcontentloaded",
      timeout: READER_READY_TIMEOUT_MS,
    });
    if (
      response === null ||
      response.status() !== 200 ||
      !response.fromServiceWorker()
    ) {
      throw new TypeError("Cold offline Reader did not use the service worker.");
    }
    await assertExactServiceWorkerState(page);
    await assertPublisherOfflineInitialColdStateBoundary(
      async () => {
        await page.waitForFunction(
          assertPublisherOfflineSerializableBrowserCallback(
        ({ workId, pageKind, pageTitle, blockId, bodyText }) => {
        const text = {
          normalize(value: string): string {
            return value
              .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
              .replace(/^ +| +$/gu, "");
          },
        };
        const roots = document.querySelectorAll(
          ".publisher-root[data-publisher-page]",
        );
        const root = roots[0];
        const articles = root?.querySelectorAll(
          `main article[data-publisher-work="${workId}"]`,
        );
        const article = articles?.[0];
        const manuscript = article?.querySelector(".publisher-manuscript");
        const blocks = manuscript?.querySelectorAll(
          `[data-publisher-block="${blockId}"]`,
        );
        const block = blocks?.[0];
        const normalized = text.normalize(
          block instanceof HTMLElement ? block.innerText : "",
        );
        const textRange = document.createRange();
        if (block !== undefined) textRange.selectNodeContents(block);
        const textRuns = {
          inspect(blockElement: HTMLElement): Readonly<{
            allTextNodesVisible: boolean;
            allRunsPositiveGeometry: boolean;
          }> {
            const maximumDescendantNodeCount = 4_096;
            const maximumTextCodeUnitCount = 65_536;
            const maximumRunCount = 1_024;
            const maximumWrapperDepth = 2;
            const maximumRectCountPerRun = 4_096;
            const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’·ˈ]*/gu;
            const FOCUS_WORD_PATTERN = /^\p{L}[\p{L}'’]*$/u;
            const RAW_TEXT_RUN_PATTERN =
              /[^\u0009\u000A\u000C\u000D\u0020]+/gu;
            const semanticOwnerTags = new Set([
              "a",
              "blockquote",
              "code",
              "em",
              "h1",
              "h2",
              "h3",
              "h4",
              "h5",
              "h6",
              "li",
              "p",
              "strong",
            ]);
            const authority = {
              matchesWordToken(value: string): boolean {
                WORD_PATTERN.lastIndex = 0;
                const match = WORD_PATTERN.exec(value);
                const accepted = match !== null &&
                  match.index === 0 &&
                  match[0] === value &&
                  WORD_PATTERN.exec(value) === null;
                WORD_PATTERN.lastIndex = 0;
                return accepted;
              },
              wrapperKind(element: Element): string | null {
                if (!(element instanceof HTMLSpanElement)) return null;
                const attributeCount = element.attributes.length;
                if (attributeCount !== 1 && attributeCount !== 2) return null;
                const className = element.getAttribute("class");
                const attributeNames = element.getAttributeNames().sort().join(",");
                if (
                  className === "publisher-focus-word" &&
                  attributeNames === "class"
                ) return "focus-word";
                if (
                  className === "publisher-narration-word" &&
                  attributeNames ===
                    "class,data-publisher-narration-word" &&
                  element.getAttribute("data-publisher-narration-word") === "true"
                ) return "narration-word";
                if (
                  className ===
                    "publisher-focus-word publisher-narration-word" &&
                  attributeNames ===
                    "class,data-publisher-narration-word" &&
                  element.getAttribute("data-publisher-narration-word") === "true"
                ) return "focus-narration-word";
                const emphasisClasses = [
                  "publisher-focus-emphasis publisher-focus-emphasis-light",
                  "publisher-focus-emphasis publisher-focus-emphasis-normal",
                  "publisher-focus-emphasis publisher-focus-emphasis-strong",
                ];
                const emphasisIndex = emphasisClasses.indexOf(className ?? "");
                return emphasisIndex >= 0 && attributeNames === "class"
                  ? "emphasis-" + emphasisIndex
                  : null;
              },
              shapingKey(textNode: Text): string | null {
                const parent = textNode.parentElement;
                if (parent === null) return null;
                const style = getComputedStyle(parent);
                return JSON.stringify([
                  style.font,
                  style.fontKerning,
                  style.fontFeatureSettings,
                  style.fontVariationSettings,
                  style.fontVariantLigatures,
                  style.letterSpacing,
                  style.wordSpacing,
                  style.textTransform,
                  style.direction,
                  style.writingMode,
                ]);
              },
            };
            const pending: Node[] = [];
            if (
              blockElement.childNodes.length >
                maximumDescendantNodeCount
            ) {
              return {
                allTextNodesVisible: false,
                allRunsPositiveGeometry: false,
              };
            }
            for (let index = blockElement.childNodes.length - 1; index >= 0; index--) {
              const child = blockElement.childNodes[index];
              if (child !== undefined) pending.push(child);
            }
            const textNodes: Text[] = [];
            let descendantNodeCount = 0;
            let textCodeUnitCount = 0;
            let allTextNodesVisible = true;
            while (pending.length > 0) {
              const node = pending.pop();
              if (node === undefined) break;
              descendantNodeCount += 1;
              if (descendantNodeCount > maximumDescendantNodeCount) {
                return {
                  allTextNodesVisible: false,
                  allRunsPositiveGeometry: false,
                };
              }
              if (node instanceof Text) {
                textCodeUnitCount += node.data.length;
                if (textCodeUnitCount > maximumTextCodeUnitCount) {
                  return {
                    allTextNodesVisible: false,
                    allRunsPositiveGeometry: false,
                  };
                }
                if (
                  node.data.replace(
                    /[\u0009\u000A\u000C\u000D\u0020]+/gu,
                    "",
                  ).length > 0
                ) {
                  textNodes.push(node);
                  const parent = node.parentElement;
                  if (
                    parent === null ||
                    typeof parent.checkVisibility !== "function" ||
                    !parent.checkVisibility({
                      checkOpacity: true,
                      checkVisibilityCSS: true,
                    })
                  ) allTextNodesVisible = false;
                }
              }
              if (
                descendantNodeCount + pending.length + node.childNodes.length >
                  maximumDescendantNodeCount
              ) {
                return {
                  allTextNodesVisible: false,
                  allRunsPositiveGeometry: false,
                };
              }
              for (let index = node.childNodes.length - 1; index >= 0; index--) {
                const child = node.childNodes[index];
                if (child !== undefined) pending.push(child);
              }
            }
            const anchors = new Map<Node, {
              owner: Element;
              textNodes: Text[];
            }>();
            let allRunAnchorsAccepted = textNodes.length > 0;
            for (const textNode of textNodes) {
              const parent = textNode.parentElement;
              if (parent === null) {
                allRunAnchorsAccepted = false;
                continue;
              }
              let owner: Element | null = parent;
              let outermostWrapper: Element | null = null;
              let wrapperDepth = 0;
              while (
                owner !== null && authority.wrapperKind(owner) !== null
              ) {
                wrapperDepth += 1;
                if (wrapperDepth > maximumWrapperDepth) {
                  owner = null;
                  break;
                }
                outermostWrapper = owner;
                const next: Element | null = owner.parentElement;
                if (
                  next === null ||
                  (next !== blockElement && !blockElement.contains(next))
                ) {
                  owner = null;
                  break;
                }
                owner = next;
              }
              if (
                owner === null ||
                !semanticOwnerTags.has(owner.localName) ||
                (owner !== blockElement && !blockElement.contains(owner))
              ) {
                allRunAnchorsAccepted = false;
                continue;
              }
              const anchor: Node = outermostWrapper ?? textNode;
              const existing = anchors.get(anchor);
              if (existing !== undefined) {
                if (existing.owner !== owner) allRunAnchorsAccepted = false;
                existing.textNodes.push(textNode);
              } else {
                anchors.set(anchor, { owner, textNodes: [textNode] });
              }
            }
            const shapingRuns: Array<{
              textNodes: Text[];
              startOffset: number;
              endOffset: number;
            }> = [];
            for (const [anchor, group] of anchors) {
              if (anchor instanceof Text) {
                if (
                  group.textNodes.length !== 1 ||
                  group.textNodes[0] !== anchor
                ) {
                  allRunAnchorsAccepted = false;
                  continue;
                }
                RAW_TEXT_RUN_PATTERN.lastIndex = 0;
                let rawTextRun: RegExpExecArray | null;
                while (
                  (rawTextRun = RAW_TEXT_RUN_PATTERN.exec(anchor.data)) !== null
                ) {
                  shapingRuns.push({
                    textNodes: [anchor],
                    startOffset: rawTextRun.index,
                    endOffset: rawTextRun.index + rawTextRun[0].length,
                  });
                }
                RAW_TEXT_RUN_PATTERN.lastIndex = 0;
                continue;
              }
              if (!(anchor instanceof HTMLSpanElement)) {
                allRunAnchorsAccepted = false;
                continue;
              }
              const wordKind = authority.wrapperKind(anchor);
              if (
                ![
                  "focus-word",
                  "narration-word",
                  "focus-narration-word",
                ].includes(wordKind ?? "") ||
                anchor.parentElement !== group.owner
              ) {
                allRunAnchorsAccepted = false;
                continue;
              }
              const leaves: Text[] = [];
              let grammarAccepted = true;
              if (wordKind === "narration-word") {
                const onlyChild = anchor.childNodes[0];
                grammarAccepted = anchor.childNodes.length === 1 &&
                  onlyChild instanceof Text;
                if (onlyChild instanceof Text) {
                  leaves.push(onlyChild);
                  grammarAccepted = grammarAccepted &&
                    authority.matchesWordToken(onlyChild.data) &&
                    !FOCUS_WORD_PATTERN.test(onlyChild.data);
                }
              } else {
                const actualSegments: Array<{
                  kind: string;
                  text: string;
                }> = [];
                for (
                  let childIndex = 0;
                  childIndex < anchor.childNodes.length;
                  childIndex++
                ) {
                  const child = anchor.childNodes[childIndex];
                  if (child instanceof Text) {
                    leaves.push(child);
                    actualSegments.push({ kind: "raw", text: child.data });
                    continue;
                  }
                  if (!(child instanceof HTMLSpanElement)) {
                    grammarAccepted = false;
                    continue;
                  }
                  const childKind = authority.wrapperKind(child);
                  const onlyChild = child.childNodes[0];
                  if (
                    !childKind?.startsWith("emphasis-") ||
                    child.childNodes.length !== 1 ||
                    !(onlyChild instanceof Text)
                  ) {
                    grammarAccepted = false;
                    continue;
                  }
                  leaves.push(onlyChild);
                  actualSegments.push({
                    kind: childKind,
                    text: onlyChild.data,
                  });
                }
                const word = leaves.map((leaf) => leaf.data).join("");
                const codePoints = Array.from(word);
                const boundaries = [
                  { end: Math.ceil(codePoints.length * 0.15), kind: "emphasis-0" },
                  { end: Math.ceil(codePoints.length * 0.25), kind: "emphasis-1" },
                  { end: Math.ceil(codePoints.length * 0.35), kind: "emphasis-2" },
                ];
                const expectedSegments: Array<{
                  kind: string;
                  text: string;
                }> = [];
                let offset = 0;
                for (const boundary of boundaries) {
                  if (boundary.end <= offset) continue;
                  expectedSegments.push({
                    kind: boundary.kind,
                    text: codePoints.slice(offset, boundary.end).join(""),
                  });
                  offset = boundary.end;
                }
                if (offset < codePoints.length) {
                  expectedSegments.push({
                    kind: "raw",
                    text: codePoints.slice(offset).join(""),
                  });
                }
                grammarAccepted = grammarAccepted &&
                  authority.matchesWordToken(word) &&
                  FOCUS_WORD_PATTERN.test(word) &&
                  actualSegments.length === expectedSegments.length &&
                  actualSegments.every((segment, index) =>
                    segment.kind === expectedSegments[index]?.kind &&
                    segment.text === expectedSegments[index]?.text
                  );
              }
              if (
                leaves.length < 1 ||
                leaves.length > 4 ||
                leaves.some((leaf) =>
                  leaf.data.length === 0 ||
                  /[\u0009\u000A\u000C\u000D\u0020]/u.test(leaf.data)
                ) ||
                group.textNodes.length !== leaves.length ||
                leaves.some((leaf, index) => group.textNodes[index] !== leaf)
              ) grammarAccepted = false;
              if (!grammarAccepted) {
                allRunAnchorsAccepted = false;
                continue;
              }
              let currentRun: Text[] = [];
              let currentShapingKey: string | null = null;
              for (const leaf of leaves) {
                const shapingKey = authority.shapingKey(leaf);
                if (shapingKey === null) {
                  allRunAnchorsAccepted = false;
                  currentRun = [];
                  break;
                }
                if (
                  currentRun.length > 0 &&
                  shapingKey !== currentShapingKey
                ) {
                  const lastTextNode = currentRun.at(-1);
                  if (lastTextNode === undefined) {
                    allRunAnchorsAccepted = false;
                    currentRun = [];
                    break;
                  }
                  shapingRuns.push({
                    textNodes: currentRun,
                    startOffset: 0,
                    endOffset: lastTextNode.data.length,
                  });
                  currentRun = [];
                }
                currentRun.push(leaf);
                currentShapingKey = shapingKey;
              }
              if (currentRun.length > 0) {
                const lastTextNode = currentRun.at(-1);
                if (lastTextNode === undefined) {
                  allRunAnchorsAccepted = false;
                } else {
                  shapingRuns.push({
                    textNodes: currentRun,
                    startOffset: 0,
                    endOffset: lastTextNode.data.length,
                  });
                }
              }
            }
            let allRunsPositiveGeometry = allRunAnchorsAccepted &&
              shapingRuns.length > 0 &&
              shapingRuns.length <= maximumRunCount;
            if (allRunsPositiveGeometry) {
              for (const run of shapingRuns) {
                const firstTextNode = run.textNodes[0];
                const lastTextNode = run.textNodes.at(-1);
                if (firstTextNode === undefined || lastTextNode === undefined) {
                  allRunsPositiveGeometry = false;
                  break;
                }
                const range = document.createRange();
                range.setStart(firstTextNode, run.startOffset);
                range.setEnd(lastTextNode, run.endOffset);
                const rectangles = range.getClientRects();
                if (
                  rectangles.length === 0 ||
                  rectangles.length > maximumRectCountPerRun
                ) {
                  allRunsPositiveGeometry = false;
                  break;
                }
                let sawPositiveRectangle = false;
                for (let index = 0; index < rectangles.length; index++) {
                  const rectangle = rectangles[index];
                  if (
                    rectangle === undefined ||
                    !Number.isFinite(rectangle.width) ||
                    !Number.isFinite(rectangle.height)
                  ) {
                    allRunsPositiveGeometry = false;
                    break;
                  }
                  if (rectangle.width > 0 && rectangle.height > 0) {
                    sawPositiveRectangle = true;
                  }
                }
                if (!allRunsPositiveGeometry || !sawPositiveRectangle) {
                  allRunsPositiveGeometry = false;
                  break;
                }
              }
            }
            return {
              allTextNodesVisible: textNodes.length > 0 &&
                allTextNodesVisible,
              allRunsPositiveGeometry,
            };
          },
        };
        const textRunState = block instanceof HTMLElement
          ? textRuns.inspect(block)
          : {
            allTextNodesVisible: false,
            allRunsPositiveGeometry: false,
          };
        const heading = article?.querySelector("h1")?.textContent ?? "";
        const media = {
          inspect(): Readonly<{
            dormantAudioShellVerified: boolean;
            unexpectedMediaElementCount: number;
          }> {
            const roots = document.querySelectorAll(
              ".publisher-root[data-publisher-page]",
            );
            const root = roots[0];
            const hosts = document.querySelectorAll(
              ".publisher-reader-audio-host",
            );
            const host = hosts[0];
            const audios = document.querySelectorAll("audio");
            const audio = audios[0];
            const dormantAudioShellVerified = roots.length === 1 &&
              hosts.length === 1 &&
              audios.length === 1 &&
              host instanceof HTMLDivElement &&
              host.parentElement === document.body &&
              host.getAttributeNames().sort().join(",") === "class,style" &&
              host.getAttribute("class") ===
                "publisher-reader-audio-host" &&
              (host.getAttribute("style") ?? "") !== "" &&
              host.getAttribute("style") === root?.getAttribute("style") &&
              host.childNodes.length === 1 &&
              host.firstChild === audio &&
              audio instanceof HTMLAudioElement &&
              audio.parentElement === host &&
              audio.getAttributeNames().sort().join(",") === "preload" &&
              audio.getAttribute("preload") === "metadata" &&
              audio.getAttribute("src") === null &&
              audio.currentSrc === "" &&
              !audio.controls && !audio.autoplay && !audio.loop &&
              !audio.muted && audio.paused &&
              audio.childNodes.length === 0 &&
              audio.querySelectorAll("source,track").length === 0;
            const unexpectedMediaElementCount = [
              ...document.querySelectorAll("*"),
            ].filter((element) => {
              if (element === audio && dormantAudioShellVerified) return false;
              if ([
                "audio", "video", "source", "track", "embed", "object",
                "iframe",
              ].includes(element.localName)) return true;
              return ["src", "href", "data"].some((name) => {
                const value = (element.getAttribute(name) ?? "").replace(
                  /^[\u0009\u000A\u000C\u000D\u0020]+|[\u0009\u000A\u000C\u000D\u0020]+$/gu,
                  "",
                );
                return /^(?:blob:|data:(?:audio|video)\/)/iu.test(value) ||
                  value.toLowerCase().includes("publication-audio");
              });
            }).length;
            return { dormantAudioShellVerified, unexpectedMediaElementCount };
          },
        };
        const mediaState = media.inspect();
        return document.readyState === "complete" &&
          navigator.onLine === false &&
          navigator.serviceWorker.controller !== null &&
          roots.length === 1 &&
          root?.getAttribute("data-publisher-page") === pageKind &&
          articles?.length === 1 &&
          text.normalize(heading) === pageTitle &&
          root?.querySelectorAll(`[data-publisher-block="${blockId}"]`).length ===
            1 &&
          blocks?.length === 1 &&
          normalized === bodyText &&
          block instanceof HTMLElement &&
          typeof block.checkVisibility === "function" &&
          block.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }) &&
          [...block.getClientRects()].some((rect) =>
            Number.isFinite(rect.width) &&
            Number.isFinite(rect.height) &&
            rect.width > 0 &&
            rect.height > 0
          ) &&
          [...textRange.getClientRects()].some((rect) =>
            Number.isFinite(rect.width) &&
            Number.isFinite(rect.height) &&
            rect.width > 0 &&
            rect.height > 0
          ) &&
          textRunState.allTextNodesVisible &&
          textRunState.allRunsPositiveGeometry &&
          mediaState.dormantAudioShellVerified &&
          mediaState.unexpectedMediaElementCount === 0;
        },
      ),
      {
        blockId: input.blockId,
        bodyText: input.bodyText,
        pageKind: input.pageKind,
        workId: CARDINAL_SCALE_WORK_ID,
        pageTitle: input.pageTitle,
      },
          { timeout: READER_READY_TIMEOUT_MS },
        );
      },
      () => readPublisherOfflineColdDocumentState(page, {
        blockId: input.blockId,
        workId: CARDINAL_SCALE_WORK_ID,
      }),
      {
        pageKind: input.pageKind,
        pageTitle: input.pageTitle,
        blockId: input.blockId,
        bodyText: input.bodyText,
      },
    );
    await waitForReaderHydration(page, {
      pageKind: input.pageKind,
      title: input.pageTitle,
    });
    const root = page.locator(".publisher-root[data-publisher-page]");
    const rail = root.locator(
      "aside.publisher-reader-rail[aria-label='Reader tools']",
    );
    await rail.getByRole("button", { name: "Search", exact: true }).click();
    const panel = rail.locator(
      "section.publisher-reader-panel[aria-label='Search']",
    );
    const searchInput = panel.locator(
      ".publisher-reader-search input[type=search]",
    );
    await searchInput.waitFor({
      state: "visible",
      timeout: READER_READY_TIMEOUT_MS,
    });
    await searchInput.fill("cardinal scale");
    await page.waitForFunction(
      assertPublisherOfflineSerializableBrowserCallback(() => {
        const text = {
          normalize(value: string): string {
            return value
              .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
              .replace(/^ +| +$/gu, "");
          },
        };
        const root = document.querySelector(
          ".publisher-root[data-publisher-page]",
        );
        const panel = root?.querySelector(
          "aside.publisher-reader-rail section.publisher-reader-panel[aria-label='Search'] .publisher-reader-search",
        );
        const label = text.normalize(
          panel?.querySelector("label")?.textContent ?? "",
        );
        const loading = panel?.querySelector("[role=status]") !== null;
        const results = panel?.querySelectorAll(
          ".publisher-reader-search-results li",
        ).length ?? 0;
        return label === "Search downloaded works" && !loading && results > 0;
      }),
      undefined,
      { timeout: READER_READY_TIMEOUT_MS },
    );
    const searchState = await page.evaluate(
      assertPublisherOfflineSerializableBrowserCallback((documentHrefs) => {
      const root = document.querySelector(
        ".publisher-root[data-publisher-page]",
      );
      const links = [...(root?.querySelectorAll<HTMLAnchorElement>(
        "aside.publisher-reader-rail section.publisher-reader-panel[aria-label='Search'] " +
          ".publisher-reader-search-results a[href]",
      ) ?? [])];
      const current = `${location.pathname}${location.search}`;
      const allowed = new Set(documentHrefs);
      const targets = links.map((link) => new URL(link.href, location.href));
      const hrefs = targets.map((url) => `${url.pathname}${url.search}`);
      const target = targets.find((url) =>
        url.origin === location.origin &&
        `${url.pathname}${url.search}` !== current &&
        allowed.has(`${url.pathname}${url.search}`)
      );
      return {
        allInstalledDocuments: hrefs.every((href) => allowed.has(href)),
        resultCount: links.length,
        target: target?.href ?? "",
          targetIndex: target === undefined ? -1 : targets.indexOf(target),
        };
      }),
      input.documents.map(({ href }) => href),
    );
    if (
      searchState.resultCount < 1 ||
      !searchState.allInstalledDocuments ||
      searchState.target === "" ||
      searchState.targetIndex < 0
    ) {
      throw new TypeError(
        "Offline Reader search produced no navigable Cardinal result.",
      );
    }
    const targetUrl = new URL(searchState.target);
    const targetPath = `${targetUrl.pathname}${targetUrl.search}`;
    const targetDocument = input.documents.find(({ href }) => href === targetPath);
    if (targetDocument === undefined) {
      throw new TypeError("Offline Reader search escaped the installed work.");
    }
    const targetLink = panel.locator(
      ".publisher-reader-search-results a[href]",
    ).nth(searchState.targetIndex);
    await targetLink.waitFor({ state: "visible", timeout: READER_READY_TIMEOUT_MS });
    const targetState = {
      visible: await targetLink.isVisible(),
      href: await targetLink.evaluate(
        assertPublisherOfflineSerializableBrowserCallback((link) => {
          const url = new URL((link as HTMLAnchorElement).href, location.href);
          return `${url.pathname}${url.search}`;
        }),
      ),
    };
    assertPublisherOfflineSearchTargetState(targetState, targetPath);
    await page.evaluate(
      assertPublisherOfflineSerializableBrowserCallback(() => {
        type MarkerGlobal = typeof globalThis & {
          __publisherOfflineDocumentMarker?: boolean;
        };
        (globalThis as MarkerGlobal).__publisherOfflineDocumentMarker = true;
      }),
    );
    const navigationPromise = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: READER_READY_TIMEOUT_MS,
    });
    await targetLink.click();
    const navigation = await navigationPromise;
    if (
      navigation === null ||
      navigation.status() !== 200 ||
      !navigation.fromServiceWorker()
    ) {
      throw new TypeError("Offline Reader link did not use a cached document.");
    }
    await page.waitForFunction(
      assertPublisherOfflineSerializableBrowserCallback(
        ({ workId, pageKind, pageTitle, blockId, bodyText }) => {
        type MarkerGlobal = typeof globalThis & {
          __publisherOfflineDocumentMarker?: boolean;
        };
        const text = {
          normalize(value: string): string {
            return value
              .replace(/[\u0009\u000A\u000C\u000D\u0020]+/gu, " ")
              .replace(/^ +| +$/gu, "");
          },
        };
        const roots = document.querySelectorAll(
          ".publisher-root[data-publisher-page]",
        );
        const articles = roots[0]?.querySelectorAll(
          `main article[data-publisher-work="${workId}"]`,
        );
        const media = {
          inspect(): Readonly<{
            dormantAudioShellVerified: boolean;
            unexpectedMediaElementCount: number;
          }> {
            const roots = document.querySelectorAll(
              ".publisher-root[data-publisher-page]",
            );
            const root = roots[0];
            const hosts = document.querySelectorAll(
              ".publisher-reader-audio-host",
            );
            const host = hosts[0];
            const audios = document.querySelectorAll("audio");
            const audio = audios[0];
            const dormantAudioShellVerified = roots.length === 1 &&
              hosts.length === 1 &&
              audios.length === 1 &&
              host instanceof HTMLDivElement &&
              host.parentElement === document.body &&
              host.getAttributeNames().sort().join(",") === "class,style" &&
              host.getAttribute("class") ===
                "publisher-reader-audio-host" &&
              (host.getAttribute("style") ?? "") !== "" &&
              host.getAttribute("style") === root?.getAttribute("style") &&
              host.childNodes.length === 1 &&
              host.firstChild === audio &&
              audio instanceof HTMLAudioElement &&
              audio.parentElement === host &&
              audio.getAttributeNames().sort().join(",") === "preload" &&
              audio.getAttribute("preload") === "metadata" &&
              audio.getAttribute("src") === null &&
              audio.currentSrc === "" &&
              !audio.controls && !audio.autoplay && !audio.loop &&
              !audio.muted && audio.paused &&
              audio.childNodes.length === 0 &&
              audio.querySelectorAll("source,track").length === 0;
            const unexpectedMediaElementCount = [
              ...document.querySelectorAll("*"),
            ].filter((element) => {
              if (element === audio && dormantAudioShellVerified) return false;
              if ([
                "audio", "video", "source", "track", "embed", "object",
                "iframe",
              ].includes(element.localName)) return true;
              return ["src", "href", "data"].some((name) => {
                const value = (element.getAttribute(name) ?? "").replace(
                  /^[\u0009\u000A\u000C\u000D\u0020]+|[\u0009\u000A\u000C\u000D\u0020]+$/gu,
                  "",
                );
                return /^(?:blob:|data:(?:audio|video)\/)/iu.test(value) ||
                  value.toLowerCase().includes("publication-audio");
              });
            }).length;
            return { dormantAudioShellVerified, unexpectedMediaElementCount };
          },
        };
        const mediaState = media.inspect();
        const manuscript = articles?.[0]?.querySelector(".publisher-manuscript");
        const blocks = manuscript?.querySelectorAll(
          `[data-publisher-block="${blockId}"]`,
        );
        const block = blocks?.[0];
        const textRuns = {
          inspect(blockElement: HTMLElement): Readonly<{
            allTextNodesVisible: boolean;
            allRunsPositiveGeometry: boolean;
          }> {
            const maximumDescendantNodeCount = 4_096;
            const maximumTextCodeUnitCount = 65_536;
            const maximumRunCount = 1_024;
            const maximumWrapperDepth = 2;
            const maximumRectCountPerRun = 4_096;
            const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’·ˈ]*/gu;
            const FOCUS_WORD_PATTERN = /^\p{L}[\p{L}'’]*$/u;
            const RAW_TEXT_RUN_PATTERN =
              /[^\u0009\u000A\u000C\u000D\u0020]+/gu;
            const semanticOwnerTags = new Set([
              "a",
              "blockquote",
              "code",
              "em",
              "h1",
              "h2",
              "h3",
              "h4",
              "h5",
              "h6",
              "li",
              "p",
              "strong",
            ]);
            const authority = {
              matchesWordToken(value: string): boolean {
                WORD_PATTERN.lastIndex = 0;
                const match = WORD_PATTERN.exec(value);
                const accepted = match !== null &&
                  match.index === 0 &&
                  match[0] === value &&
                  WORD_PATTERN.exec(value) === null;
                WORD_PATTERN.lastIndex = 0;
                return accepted;
              },
              wrapperKind(element: Element): string | null {
                if (!(element instanceof HTMLSpanElement)) return null;
                const attributeCount = element.attributes.length;
                if (attributeCount !== 1 && attributeCount !== 2) return null;
                const className = element.getAttribute("class");
                const attributeNames = element.getAttributeNames().sort().join(",");
                if (
                  className === "publisher-focus-word" &&
                  attributeNames === "class"
                ) return "focus-word";
                if (
                  className === "publisher-narration-word" &&
                  attributeNames ===
                    "class,data-publisher-narration-word" &&
                  element.getAttribute("data-publisher-narration-word") === "true"
                ) return "narration-word";
                if (
                  className ===
                    "publisher-focus-word publisher-narration-word" &&
                  attributeNames ===
                    "class,data-publisher-narration-word" &&
                  element.getAttribute("data-publisher-narration-word") === "true"
                ) return "focus-narration-word";
                const emphasisClasses = [
                  "publisher-focus-emphasis publisher-focus-emphasis-light",
                  "publisher-focus-emphasis publisher-focus-emphasis-normal",
                  "publisher-focus-emphasis publisher-focus-emphasis-strong",
                ];
                const emphasisIndex = emphasisClasses.indexOf(className ?? "");
                return emphasisIndex >= 0 && attributeNames === "class"
                  ? "emphasis-" + emphasisIndex
                  : null;
              },
              shapingKey(textNode: Text): string | null {
                const parent = textNode.parentElement;
                if (parent === null) return null;
                const style = getComputedStyle(parent);
                return JSON.stringify([
                  style.font,
                  style.fontKerning,
                  style.fontFeatureSettings,
                  style.fontVariationSettings,
                  style.fontVariantLigatures,
                  style.letterSpacing,
                  style.wordSpacing,
                  style.textTransform,
                  style.direction,
                  style.writingMode,
                ]);
              },
            };
            const pending: Node[] = [];
            if (
              blockElement.childNodes.length >
                maximumDescendantNodeCount
            ) {
              return {
                allTextNodesVisible: false,
                allRunsPositiveGeometry: false,
              };
            }
            for (let index = blockElement.childNodes.length - 1; index >= 0; index--) {
              const child = blockElement.childNodes[index];
              if (child !== undefined) pending.push(child);
            }
            const textNodes: Text[] = [];
            let descendantNodeCount = 0;
            let textCodeUnitCount = 0;
            let allTextNodesVisible = true;
            while (pending.length > 0) {
              const node = pending.pop();
              if (node === undefined) break;
              descendantNodeCount += 1;
              if (descendantNodeCount > maximumDescendantNodeCount) {
                return {
                  allTextNodesVisible: false,
                  allRunsPositiveGeometry: false,
                };
              }
              if (node instanceof Text) {
                textCodeUnitCount += node.data.length;
                if (textCodeUnitCount > maximumTextCodeUnitCount) {
                  return {
                    allTextNodesVisible: false,
                    allRunsPositiveGeometry: false,
                  };
                }
                if (
                  node.data.replace(
                    /[\u0009\u000A\u000C\u000D\u0020]+/gu,
                    "",
                  ).length > 0
                ) {
                  textNodes.push(node);
                  const parent = node.parentElement;
                  if (
                    parent === null ||
                    typeof parent.checkVisibility !== "function" ||
                    !parent.checkVisibility({
                      checkOpacity: true,
                      checkVisibilityCSS: true,
                    })
                  ) allTextNodesVisible = false;
                }
              }
              if (
                descendantNodeCount + pending.length + node.childNodes.length >
                  maximumDescendantNodeCount
              ) {
                return {
                  allTextNodesVisible: false,
                  allRunsPositiveGeometry: false,
                };
              }
              for (let index = node.childNodes.length - 1; index >= 0; index--) {
                const child = node.childNodes[index];
                if (child !== undefined) pending.push(child);
              }
            }
            const anchors = new Map<Node, {
              owner: Element;
              textNodes: Text[];
            }>();
            let allRunAnchorsAccepted = textNodes.length > 0;
            for (const textNode of textNodes) {
              const parent = textNode.parentElement;
              if (parent === null) {
                allRunAnchorsAccepted = false;
                continue;
              }
              let owner: Element | null = parent;
              let outermostWrapper: Element | null = null;
              let wrapperDepth = 0;
              while (
                owner !== null && authority.wrapperKind(owner) !== null
              ) {
                wrapperDepth += 1;
                if (wrapperDepth > maximumWrapperDepth) {
                  owner = null;
                  break;
                }
                outermostWrapper = owner;
                const next: Element | null = owner.parentElement;
                if (
                  next === null ||
                  (next !== blockElement && !blockElement.contains(next))
                ) {
                  owner = null;
                  break;
                }
                owner = next;
              }
              if (
                owner === null ||
                !semanticOwnerTags.has(owner.localName) ||
                (owner !== blockElement && !blockElement.contains(owner))
              ) {
                allRunAnchorsAccepted = false;
                continue;
              }
              const anchor: Node = outermostWrapper ?? textNode;
              const existing = anchors.get(anchor);
              if (existing !== undefined) {
                if (existing.owner !== owner) allRunAnchorsAccepted = false;
                existing.textNodes.push(textNode);
              } else {
                anchors.set(anchor, { owner, textNodes: [textNode] });
              }
            }
            const shapingRuns: Array<{
              textNodes: Text[];
              startOffset: number;
              endOffset: number;
            }> = [];
            for (const [anchor, group] of anchors) {
              if (anchor instanceof Text) {
                if (
                  group.textNodes.length !== 1 ||
                  group.textNodes[0] !== anchor
                ) {
                  allRunAnchorsAccepted = false;
                  continue;
                }
                RAW_TEXT_RUN_PATTERN.lastIndex = 0;
                let rawTextRun: RegExpExecArray | null;
                while (
                  (rawTextRun = RAW_TEXT_RUN_PATTERN.exec(anchor.data)) !== null
                ) {
                  shapingRuns.push({
                    textNodes: [anchor],
                    startOffset: rawTextRun.index,
                    endOffset: rawTextRun.index + rawTextRun[0].length,
                  });
                }
                RAW_TEXT_RUN_PATTERN.lastIndex = 0;
                continue;
              }
              if (!(anchor instanceof HTMLSpanElement)) {
                allRunAnchorsAccepted = false;
                continue;
              }
              const wordKind = authority.wrapperKind(anchor);
              if (
                ![
                  "focus-word",
                  "narration-word",
                  "focus-narration-word",
                ].includes(wordKind ?? "") ||
                anchor.parentElement !== group.owner
              ) {
                allRunAnchorsAccepted = false;
                continue;
              }
              const leaves: Text[] = [];
              let grammarAccepted = true;
              if (wordKind === "narration-word") {
                const onlyChild = anchor.childNodes[0];
                grammarAccepted = anchor.childNodes.length === 1 &&
                  onlyChild instanceof Text;
                if (onlyChild instanceof Text) {
                  leaves.push(onlyChild);
                  grammarAccepted = grammarAccepted &&
                    authority.matchesWordToken(onlyChild.data) &&
                    !FOCUS_WORD_PATTERN.test(onlyChild.data);
                }
              } else {
                const actualSegments: Array<{
                  kind: string;
                  text: string;
                }> = [];
                for (
                  let childIndex = 0;
                  childIndex < anchor.childNodes.length;
                  childIndex++
                ) {
                  const child = anchor.childNodes[childIndex];
                  if (child instanceof Text) {
                    leaves.push(child);
                    actualSegments.push({ kind: "raw", text: child.data });
                    continue;
                  }
                  if (!(child instanceof HTMLSpanElement)) {
                    grammarAccepted = false;
                    continue;
                  }
                  const childKind = authority.wrapperKind(child);
                  const onlyChild = child.childNodes[0];
                  if (
                    !childKind?.startsWith("emphasis-") ||
                    child.childNodes.length !== 1 ||
                    !(onlyChild instanceof Text)
                  ) {
                    grammarAccepted = false;
                    continue;
                  }
                  leaves.push(onlyChild);
                  actualSegments.push({
                    kind: childKind,
                    text: onlyChild.data,
                  });
                }
                const word = leaves.map((leaf) => leaf.data).join("");
                const codePoints = Array.from(word);
                const boundaries = [
                  { end: Math.ceil(codePoints.length * 0.15), kind: "emphasis-0" },
                  { end: Math.ceil(codePoints.length * 0.25), kind: "emphasis-1" },
                  { end: Math.ceil(codePoints.length * 0.35), kind: "emphasis-2" },
                ];
                const expectedSegments: Array<{
                  kind: string;
                  text: string;
                }> = [];
                let offset = 0;
                for (const boundary of boundaries) {
                  if (boundary.end <= offset) continue;
                  expectedSegments.push({
                    kind: boundary.kind,
                    text: codePoints.slice(offset, boundary.end).join(""),
                  });
                  offset = boundary.end;
                }
                if (offset < codePoints.length) {
                  expectedSegments.push({
                    kind: "raw",
                    text: codePoints.slice(offset).join(""),
                  });
                }
                grammarAccepted = grammarAccepted &&
                  authority.matchesWordToken(word) &&
                  FOCUS_WORD_PATTERN.test(word) &&
                  actualSegments.length === expectedSegments.length &&
                  actualSegments.every((segment, index) =>
                    segment.kind === expectedSegments[index]?.kind &&
                    segment.text === expectedSegments[index]?.text
                  );
              }
              if (
                leaves.length < 1 ||
                leaves.length > 4 ||
                leaves.some((leaf) =>
                  leaf.data.length === 0 ||
                  /[\u0009\u000A\u000C\u000D\u0020]/u.test(leaf.data)
                ) ||
                group.textNodes.length !== leaves.length ||
                leaves.some((leaf, index) => group.textNodes[index] !== leaf)
              ) grammarAccepted = false;
              if (!grammarAccepted) {
                allRunAnchorsAccepted = false;
                continue;
              }
              let currentRun: Text[] = [];
              let currentShapingKey: string | null = null;
              for (const leaf of leaves) {
                const shapingKey = authority.shapingKey(leaf);
                if (shapingKey === null) {
                  allRunAnchorsAccepted = false;
                  currentRun = [];
                  break;
                }
                if (
                  currentRun.length > 0 &&
                  shapingKey !== currentShapingKey
                ) {
                  const lastTextNode = currentRun.at(-1);
                  if (lastTextNode === undefined) {
                    allRunAnchorsAccepted = false;
                    currentRun = [];
                    break;
                  }
                  shapingRuns.push({
                    textNodes: currentRun,
                    startOffset: 0,
                    endOffset: lastTextNode.data.length,
                  });
                  currentRun = [];
                }
                currentRun.push(leaf);
                currentShapingKey = shapingKey;
              }
              if (currentRun.length > 0) {
                const lastTextNode = currentRun.at(-1);
                if (lastTextNode === undefined) {
                  allRunAnchorsAccepted = false;
                } else {
                  shapingRuns.push({
                    textNodes: currentRun,
                    startOffset: 0,
                    endOffset: lastTextNode.data.length,
                  });
                }
              }
            }
            let allRunsPositiveGeometry = allRunAnchorsAccepted &&
              shapingRuns.length > 0 &&
              shapingRuns.length <= maximumRunCount;
            if (allRunsPositiveGeometry) {
              for (const run of shapingRuns) {
                const firstTextNode = run.textNodes[0];
                const lastTextNode = run.textNodes.at(-1);
                if (firstTextNode === undefined || lastTextNode === undefined) {
                  allRunsPositiveGeometry = false;
                  break;
                }
                const range = document.createRange();
                range.setStart(firstTextNode, run.startOffset);
                range.setEnd(lastTextNode, run.endOffset);
                const rectangles = range.getClientRects();
                if (
                  rectangles.length === 0 ||
                  rectangles.length > maximumRectCountPerRun
                ) {
                  allRunsPositiveGeometry = false;
                  break;
                }
                let sawPositiveRectangle = false;
                for (let index = 0; index < rectangles.length; index++) {
                  const rectangle = rectangles[index];
                  if (
                    rectangle === undefined ||
                    !Number.isFinite(rectangle.width) ||
                    !Number.isFinite(rectangle.height)
                  ) {
                    allRunsPositiveGeometry = false;
                    break;
                  }
                  if (rectangle.width > 0 && rectangle.height > 0) {
                    sawPositiveRectangle = true;
                  }
                }
                if (!allRunsPositiveGeometry || !sawPositiveRectangle) {
                  allRunsPositiveGeometry = false;
                  break;
                }
              }
            }
            return {
              allTextNodesVisible: textNodes.length > 0 &&
                allTextNodesVisible,
              allRunsPositiveGeometry,
            };
          },
        };
        const textRunState = block instanceof HTMLElement
          ? textRuns.inspect(block)
          : {
            allTextNodesVisible: false,
            allRunsPositiveGeometry: false,
          };
        return document.readyState === "complete" &&
          navigator.onLine === false &&
          navigator.serviceWorker.controller !== null &&
          (globalThis as MarkerGlobal).__publisherOfflineDocumentMarker !== true &&
          roots.length === 1 &&
          roots[0]?.getAttribute("data-publisher-page") === pageKind &&
          articles?.length === 1 &&
          text.normalize(articles[0]?.querySelector("h1")?.textContent ?? "") ===
            pageTitle &&
          roots[0]?.querySelectorAll(`[data-publisher-block="${blockId}"]`)
            .length === 1 &&
          blocks?.length === 1 &&
          text.normalize(block instanceof HTMLElement ? block.innerText : "") ===
            bodyText &&
          block instanceof HTMLElement &&
          typeof block.checkVisibility === "function" &&
          block.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }) &&
          [...block.getClientRects()].some((rect) =>
            Number.isFinite(rect.width) &&
            Number.isFinite(rect.height) &&
            rect.width > 0 &&
            rect.height > 0
          ) &&
          (() => {
            const range = document.createRange();
            range.selectNodeContents(block);
            return [...range.getClientRects()].some((rect) =>
              Number.isFinite(rect.width) &&
              Number.isFinite(rect.height) &&
              rect.width > 0 &&
              rect.height > 0
            );
          })() &&
          textRunState.allTextNodesVisible &&
          textRunState.allRunsPositiveGeometry &&
          mediaState.dormantAudioShellVerified &&
          mediaState.unexpectedMediaElementCount === 0;
        },
      ),
      {
        workId: CARDINAL_SCALE_WORK_ID,
        pageKind: targetDocument.pageKind,
        pageTitle: targetDocument.title,
        blockId: targetDocument.blockId,
        bodyText: targetDocument.bodyText,
      },
      { timeout: READER_READY_TIMEOUT_MS },
    );
    const runtimeEntryCount = await page.evaluate(
      assertPublisherOfflineSerializableBrowserCallback(
        async (runtimeCacheName) =>
          (await (await caches.open(runtimeCacheName)).keys()).length,
      ),
      PUBLISHER_RUNTIME_CACHE_NAME,
    );
    if (runtimeEntryCount !== 0) {
      throw new TypeError(
        "Cold Publisher Reader populated its opportunistic runtime cache.",
      );
    }
    return Object.freeze({
      searchResultCount: searchState.resultCount,
      runtimeCacheEntryCountBeforeCold: 0 as const,
      runtimeCacheEntryCountAfterCold: 0 as const,
      browserHttpCacheCleared: true as const,
      browserHttpCacheClearedBeforeOfflineCutoff: true as const,
      dormantAudioShellBoundaryCount: 2 as const,
      dormantAudioShellVerified: true as const,
      unexpectedColdMediaElementCount: 0 as const,
      page,
    });
  } catch (error) {
    await page.close().catch(() => undefined);
    throw error;
  } finally {
    await context.setOffline(false);
  }
}

async function assertCoherenceCachesUnchanged(
  page: Page,
  expected: PublisherOfflineCacheSnapshot,
  label: string,
): Promise<void> {
  const actual = await snapshotBrowserCaches(page, SEEDED_COHERENCE_CACHE_NAMES);
  assertPublisherOfflineCacheSnapshotUnchanged(expected, actual, label);
}

async function cleanupBrowserProofState(
  page: Page,
  coherenceBefore: PublisherOfflineCacheSnapshot,
): Promise<Readonly<{
  publisherRegistrationCount: 0;
  publisherCacheCount: 0;
  coherenceCachesPreservedAfterCleanup: true;
}>> {
  await assertExactServiceWorkerState(page);
  const state = await page.evaluate(
    assertPublisherOfflineSerializableBrowserCallback(async (input) => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const registration = registrations[0];
    const registrationScope = registration === undefined
      ? null
      : new URL(registration.scope);
    const activeScript = registration?.active === null ||
        registration?.active === undefined
      ? null
      : new URL(registration.active.scriptURL);
    const controller = navigator.serviceWorker.controller;
    const controllerScript = controller === null
      ? null
      : new URL(controller.scriptURL);
    if (
      registrations.length !== 1 ||
      registration === undefined ||
      registrationScope?.origin !== location.origin ||
      registrationScope.pathname !== "/" ||
      registrationScope.search !== "" ||
      registrationScope.hash !== "" ||
      activeScript?.origin !== location.origin ||
      activeScript.pathname !== input.workerPath ||
      activeScript.search !== "" ||
      activeScript.hash !== "" ||
      registration.active?.state !== "activated" ||
      registration.installing !== null ||
      registration.waiting !== null ||
      controller === null ||
      controller !== registration.active ||
      controller.state !== "activated" ||
      controllerScript?.origin !== location.origin ||
      controllerScript.pathname !== input.workerPath ||
      controllerScript.search !== "" ||
      controllerScript.hash !== ""
    ) {
      throw new TypeError("Publisher cleanup registration authority drifted.");
    }
    if (!await registration.unregister()) {
      throw new TypeError("Publisher service worker did not unregister.");
    }
    const names = await caches.keys();
    const publisherCacheNames = names.filter((name) =>
      name.startsWith(input.publisherPrefix)
    );
    if (publisherCacheNames.length === 0) {
      throw new TypeError("Publisher cleanup found no owned cache state.");
    }
    const deletions = await Promise.all(publisherCacheNames.map(async (name) =>
      await caches.delete(name)
    ));
    if (deletions.some((deleted) => !deleted)) {
      throw new TypeError("Publisher cleanup could not delete an owned cache.");
    }
    const remainingNames = await caches.keys();
    return {
      registrationCount: (await navigator.serviceWorker.getRegistrations()).length,
      publisherCacheCount: remainingNames.filter((name) =>
        name.startsWith(input.publisherPrefix)
      ).length,
        remainingNames: remainingNames.sort(),
      };
    }), {
    publisherPrefix: "genii-publisher-offline-",
    workerPath: OFFLINE_WORKER_PATH,
  });
  if (
    state.registrationCount !== 0 ||
    state.publisherCacheCount !== 0 ||
    !isDeepStrictEqual(
      state.remainingNames,
      sorted(SEEDED_COHERENCE_CACHE_NAMES),
    )
  ) {
    throw new TypeError("Publisher offline browser proof state survived cleanup.");
  }
  await assertCoherenceCachesUnchanged(
    page,
    coherenceBefore,
    "Publisher-only cleanup",
  );
  return Object.freeze({
    publisherRegistrationCount: 0 as const,
    publisherCacheCount: 0 as const,
    coherenceCachesPreservedAfterCleanup: true as const,
  });
}

export function cardinalSectionBrowserProofInput(
  projection: PublisherThemeHostReaderProjection,
  offlinePackage: ReaderOfflinePackage,
): Readonly<{
  route: string;
  pageKind: "section";
  pageTitle: string;
  blockId: string;
  bodyText: string;
  documents: readonly Readonly<{
    href: string;
    pageKind: "section";
    title: string;
    blockId: string;
    bodyText: string;
  }>[];
}> {
  const work = projection.reader.works.find(
    ({ id }) => id === CARDINAL_SCALE_WORK_ID,
  );
  if (work === undefined) {
    throw new TypeError("Publisher Reader has no Cardinal Scale work.");
  }
  const declaredDocuments = new Set(
    offlinePackage.resources
      .filter(({ kind }) => kind === "document")
      .map(({ href }) => href),
  );
  const sections = new Map(work.sections.map((section) => [section.id, section]));
  const documents = projection.reader.routes.active.flatMap((route) => {
    if (
      route.target.kind !== "section" ||
      route.target.workId !== CARDINAL_SCALE_WORK_ID ||
      !declaredDocuments.has(route.path)
    ) return [];
    const section = sections.get(route.target.sectionId);
    if (section === undefined) return [];
    const readableBlocks = section.blocks.filter(({ kind, text, wordCount }) =>
      wordCount > 0 && kind !== "heading" &&
      normalizedDocumentText(text).length > 0
    );
    let longestReadableBlock = readableBlocks[0];
    for (const candidate of readableBlocks.slice(1)) {
      if (
        longestReadableBlock === undefined ||
        candidate.wordCount > longestReadableBlock.wordCount
      ) longestReadableBlock = candidate;
    }
    const block = readableBlocks.find(({ wordCount }) => wordCount >= 8) ??
      longestReadableBlock;
    if (block === undefined) return [];
    return [Object.freeze({
      href: route.path,
      pageKind: "section" as const,
      title: normalizedDocumentText(section.title),
      blockId: block.id,
      bodyText: normalizedDocumentText(block.text),
    })];
  });
  const target = documents[0];
  if (
    target === undefined ||
    documents.length !== 12 ||
    new Set(documents.map(({ href }) => href)).size !== documents.length
  ) {
    throw new TypeError("Publisher Cardinal section proof routes drifted.");
  }
  return Object.freeze({
    route: target.href,
    pageKind: "section" as const,
    pageTitle: target.title,
    blockId: target.blockId,
    bodyText: target.bodyText,
    documents: Object.freeze(documents),
  });
}

type BrowserSessionEvidenceBeforeClose = Omit<
  PublisherOfflineBrowserEvidence,
  "contextClosed" | "browserClosed"
>;

async function exercisePublisherOfflineBrowser(
  browser: Browser,
  context: BrowserContext,
  input: PublisherOfflineBrowserRunnerInput,
  catalog: ReaderOfflineCatalog,
  catalogEvidence: PublisherOfflineCatalogEvidence,
  workerEvidence: PublisherOfflineWorkerEvidence,
  markdownParserEvidence: PublisherOfflineMarkdownParserEvidence,
  playwrightVersion: string,
): Promise<BrowserSessionEvidenceBeforeClose> {
  const probeAuthority = assertPublisherOfflineProbe(
    input.probe,
    input.projection,
  );
  const offlinePackage = catalog.packages.find(
    ({ workId }) => workId === CARDINAL_SCALE_WORK_ID,
  );
  if (offlinePackage === undefined || offlinePackage.resourceCount !== 18) {
    throw new TypeError("Publisher offline catalog has no exact Cardinal package.");
  }
  const page = await context.newPage();
  page.setDefaultTimeout(READER_READY_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(READER_READY_TIMEOUT_MS);
  const initialNavigation = await page.goto(
    new URL(offlinePackage.route, input.baseUrl).href,
    { waitUntil: "domcontentloaded" },
  );
  if (
    initialNavigation === null ||
    initialNavigation.status() !== 200 ||
    initialNavigation.fromServiceWorker()
  ) {
    throw new TypeError("Publisher offline setup route did not start on network.");
  }
  await waitForReaderHydration(page, {
    pageKind: "work",
    title: "The Cardinal Scale",
  });
  await assertNoOfflineRegistrationOrCacheState(page, "clean");
  await openOfflinePanel(page, "Download");
  await assertNoOfflineRegistrationOrCacheState(page, "clean");
  await seedProofCaches(page);
  const coherenceBefore = await snapshotBrowserCaches(
    page,
    SEEDED_COHERENCE_CACHE_NAMES,
  );
  if (
    !isDeepStrictEqual(
      coherenceBefore.names,
      sorted(SEEDED_COHERENCE_CACHE_NAMES),
    ) ||
    coherenceBefore.entries.length !== SEEDED_COHERENCE_CACHE_NAMES.length
  ) {
    throw new TypeError("Coherence offline cache seed census drifted.");
  }
  await assertNoOfflineRegistrationOrCacheState(page, "seeded");
  await clickOfflinePackageAndWaitForSuccess(page);
  await waitForExactServiceWorker(page);
  await assertStalePublisherRuntimesDeleted(page);
  const firstInstalled = await readBrowserPackageState(
    page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  const firstPointer = assertCurrentInstalledRecord(
    firstInstalled,
    offlinePackage,
  );
  if (firstInstalled.record === null) {
    throw new TypeError("Publisher first complete install lost its pointer.");
  }
  await assertCoherenceCachesUnchanged(
    page,
    coherenceBefore,
    "Publisher first install and activation",
  );

  await mutateInstalledPackageVersion(
    page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  const replacementBaseline = await readBrowserPackageState(
    page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  if (replacementBaseline.record === null) {
    throw new TypeError("Publisher replacement baseline lost its pointer.");
  }
  assertPublisherOfflineOnlyInstalledVersionChanged(
    firstInstalled,
    replacementBaseline,
  );

  const reloaded = await page.reload({ waitUntil: "domcontentloaded" });
  if (
    reloaded === null ||
    reloaded.status() !== 200 ||
    !reloaded.fromServiceWorker()
  ) {
    throw new TypeError("Publisher replacement page did not reload through its worker.");
  }
  await waitForReaderHydration(page, {
    pageKind: "work",
    title: "The Cardinal Scale",
  });
  await openOfflinePanel(page, "Update offline copy");
  const failedHref = firstPointer.resourceHrefs.at(-1);
  if (
    failedHref === undefined ||
    failedHref === offlinePackage.route ||
    firstPointer.discoveredResourceHrefs.at(-1) !== failedHref ||
    publicHref(failedHref, "Publisher deferred replacement failure href") !==
      failedHref
  ) {
    throw new TypeError(
      "Publisher Cardinal package has no final discovered replacement fault href.",
    );
  }
  await installDeferredFetchFailure(page, failedHref);
  let failureCleanup: Readonly<{
    hits: number;
    restored: boolean;
    released: boolean;
  }> | undefined;
  let inFlightReplacementObserved = false;
  try {
    await clickOfflinePackage(page);
    await waitForDeferredFetchFailure(page);
    const inFlightReplacement = await readBrowserPackageState(
      page,
      EXPECTED_PUBLICATION_ID,
      CARDINAL_SCALE_WORK_ID,
    );
    assertPublisherOfflineInFlightPackageStateUnchanged(
      replacementBaseline,
      inFlightReplacement,
    );
    inFlightReplacementObserved = true;
    await rejectDeferredFetchFailure(page);
    await waitForOfflinePackageFailure(page);
  } finally {
    failureCleanup = await removeDeferredFetchFailure(page);
  }
  if (
    !inFlightReplacementObserved ||
    failureCleanup.hits !== 1 ||
    !failureCleanup.restored ||
    !failureCleanup.released
  ) {
    throw new TypeError("Publisher replacement fault boundary drifted.");
  }
  const failedReplacement = await readBrowserPackageState(
    page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  assertPublisherOfflineBrowserPackageStateUnchanged(
    replacementBaseline,
    failedReplacement,
    "Failed Publisher replacement",
  );
  await assertCoherenceCachesUnchanged(
    page,
    coherenceBefore,
    "Failed Publisher replacement",
  );

  await clickOfflinePackageAndWaitForSuccess(page);
  const successfulReplacement = await readBrowserPackageState(
    page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  const activePointer = assertCurrentInstalledRecord(
    successfulReplacement,
    offlinePackage,
    firstPointer.cacheName,
  );
  if (
    successfulReplacement.cacheNames.includes(firstPointer.cacheName) ||
    successfulReplacement.cacheName === firstPointer.cacheName
  ) {
    throw new TypeError("Publisher successful replacement retained its prior cache.");
  }
  await assertCoherenceCachesUnchanged(
    page,
    coherenceBefore,
    "Successful Publisher replacement",
  );
  const receipt = await createBrowserCacheReceipt(
    page,
    activePointer.cacheName,
    input.projection.reader,
    offlinePackage,
    offlinePackage.resources,
    activePointer.resourceHrefs,
    probeAuthority.rootThemeStyleDeclarations,
  );
  if (
    activePointer.resourceHrefs.length !== receipt.responseCount ||
    new Set(activePointer.resourceHrefs).size !==
      activePointer.resourceHrefs.length ||
    !activePointer.resourceHrefs.every((href) =>
      receipt.rows.some((row) => row.href === href)
    ) ||
    !receipt.rows.every(({ href }) => activePointer.resourceHrefs.includes(href))
  ) {
    throw new TypeError("Publisher active pointer and cache receipt diverged.");
  }

  const rangeEvidence = await exerciseRangeAnd206Policy(page, receipt);
  await exerciseExcludedRequests(
    context,
    page,
    activePointer.cacheName,
    offlinePackage.route,
  );
  await assertCoherenceCachesUnchanged(
    page,
    coherenceBefore,
    "Publisher Range and exclusion probes",
  );
  const postBehaviorPackageState = await readBrowserPackageState(
    page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  assertPublisherOfflineBrowserPackageStateUnchanged(
    successfulReplacement,
    postBehaviorPackageState,
    "Publisher Range and exclusion probes",
  );

  const coldInput = cardinalSectionBrowserProofInput(input.projection, offlinePackage);
  const cold = await exerciseColdOfflineReader(
    context,
    page,
    input.baseUrl,
    coldInput,
  );
  await assertCoherenceCachesUnchanged(
    cold.page,
    coherenceBefore,
    "Cold Publisher Reader",
  );
  const postColdPackageState = await readBrowserPackageState(
    cold.page,
    EXPECTED_PUBLICATION_ID,
    CARDINAL_SCALE_WORK_ID,
  );
  assertPublisherOfflineBrowserPackageStateUnchanged(
    successfulReplacement,
    postColdPackageState,
    "Cold Publisher Reader",
  );
  const cleanup = await cleanupBrowserProofState(cold.page, coherenceBefore);
  await cold.page.close();

  return Object.freeze({
    proofSchemaVersion: "1.0" as const,
    browserEngine: "chromium" as const,
    playwrightVersion:
      playwrightVersion as typeof PUBLISHER_OFFLINE_EXPECTED_PLAYWRIGHT_VERSION,
    browserVersion:
      browser.version() as typeof PUBLISHER_OFFLINE_EXPECTED_BROWSER_VERSION,
    browserSource: "bundled Playwright Chromium" as const,
    serviceWorkers: "allow" as const,
    persistentProfile: false as const,
    preRegistrationCount: 0 as const,
    preInstallCleanBoundaryCount: 2 as const,
    preInstallMetadataRequestCount: 0 as const,
    preInstallPackageCacheCount: 0 as const,
    preInstallCurrentRuntimeCacheCount: 0 as const,
    preInstallSeededCoherenceCacheCount: 5 as const,
    preInstallSeededStaleRuntimeCacheCount: 2 as const,
    controlledRegistrationCount: 1 as const,
    serviceWorkerScopeRoot: true as const,
    serviceWorkerActiveState: "activated" as const,
    serviceWorkerControllerState: "activated" as const,
    serviceWorkerInstallingState: "absent" as const,
    serviceWorkerWaitingState: "absent" as const,
    serviceWorkerControllerIsActiveWorker: true as const,
    publisherRegistrationCount: cleanup.publisherRegistrationCount,
    publisherCacheCount: cleanup.publisherCacheCount,
    catalog: catalogEvidence,
    worker: workerEvidence,
    markdownParser: markdownParserEvidence,
    installedWorkId: CARDINAL_SCALE_WORK_ID,
    installedRoute: offlinePackage.route,
    declaredInstalledResourceCount: 18 as const,
    failedReplacementPreservedPointer: true as const,
    failedReplacementPreservedCache: true as const,
    failedReplacementRemovedStagingCache: true as const,
    inFlightReplacementPreservedPointer: true as const,
    inFlightReplacementPreservedCache: true as const,
    inFlightStagingCacheCount: 1 as const,
    replacementFailureHitCount: 1 as const,
    replacementFailurePromiseReleased: true as const,
    replacementFailureFetchRestored: true as const,
    replacementFailureHref: failedHref,
    successfulReplacementSwitchedPointer: true as const,
    successfulReplacementDeletedPriorCache: true as const,
    coherenceCacheNames: SEEDED_COHERENCE_CACHE_NAMES,
    coherenceCacheSnapshotHash: coherenceBefore.hash,
    coherenceCachesPreserved: true as const,
    coherenceCachesPreservedAfterCleanup:
      cleanup.coherenceCachesPreservedAfterCleanup,
    coherenceSnapshotBoundaryCount: 6 as const,
    activePackageStateBoundaryCount: 3 as const,
    packageStateMaximumResponseBytes:
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES,
    packageStateMaximumAggregateBytes:
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES,
    metadataSharesPackageStateAggregate: true as const,
    postBehaviorPackageStatePreserved: true as const,
    postColdPackageStatePreserved: true as const,
    stalePublisherRuntimeCachesDeleted: true as const,
    browserHttpCacheCleared: cold.browserHttpCacheCleared,
    browserHttpCacheClearedBeforeOfflineCutoff:
      cold.browserHttpCacheClearedBeforeOfflineCutoff,
    runtimeCacheEntryCountBeforeCold: cold.runtimeCacheEntryCountBeforeCold,
    runtimeCacheEntryCountAfterCold: cold.runtimeCacheEntryCountAfterCold,
    coldOfflineFreshPage: true as const,
    offlineReaderTextPresent: true as const,
    coldTextVisibilityBoundaryCount: 2 as const,
    allColdBlockTextNodesVisible: true as const,
    allColdBlockTextRunsPositiveGeometry: true as const,
    dormantAudioShellBoundaryCount: cold.dormantAudioShellBoundaryCount,
    dormantAudioShellVerified: cold.dormantAudioShellVerified,
    unexpectedColdMediaElementCount: cold.unexpectedColdMediaElementCount,
    offlineSearchResultCount: cold.searchResultCount,
    offlineSameOriginFullNavigation: true as const,
    excludedRequestCount: 8 as const,
    excludedRequestsRejected: true as const,
    offlineRangeInstalledRequestRejected: true as const,
    rangeResponseStatus: rangeEvidence.status,
    rangeResponseBytes: rangeEvidence.bytes,
    rangeResponseNotRuntimeCached: rangeEvidence.notRuntimeCached,
    cacheReceipt: receipt,
    publishedAudio: "absent" as const,
    dormantAudioRuntime: "present-inert" as const,
    audioActivation: "not exercised" as const,
    nativeInstallability: "not asserted" as const,
    currentPublicRoutes: "untouched" as const,
  });
}

export const runPublisherOfflineBrowserSession: PublisherOfflineBrowserRunner =
  async (input) => {
    input.signal.throwIfAborted();
    const markdownParserEvidence =
      assertPublisherOfflineMarkdownParserAuthority();
    assertPublisherOfflineProbe(input.probe, input.projection);
    const budget: ArtifactResponseBudget = {
      maximumBytes: 2 * PUBLISHER_OFFLINE_MAXIMUM_ARTIFACT_RESPONSE_BYTES,
      usedBytes: 0,
    };
    const catalogResponse = await fetchBoundedArtifact(
      input.baseUrl,
      PUBLISHER_OFFLINE_CATALOG_HREF,
      input.signal,
      budget,
    );
    const { catalog, evidence: catalogEvidence } =
      assertPublisherOfflineCatalogResponse({
        ...catalogResponse,
        reader: input.projection.reader,
      });
    const workerResponse = await fetchBoundedArtifact(
      input.baseUrl,
      OFFLINE_WORKER_PATH,
      input.signal,
      budget,
    );
    const workerEvidence = assertPublisherOfflineWorkerResponse(workerResponse);
    input.signal.throwIfAborted();

    const playwrightVersion = installedPlaywrightVersion();
    let playwright: typeof import("@playwright/test");
    try {
      playwright = await import("@playwright/test");
    } catch (error) {
      throw new TypeError("Publisher offline proof cannot load Playwright.", {
        cause: error,
      });
    }
    if (playwright.chromium.name() !== "chromium") {
      throw new TypeError("Publisher offline proof loaded the wrong browser engine.");
    }
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let sessionEvidence: BrowserSessionEvidenceBeforeClose | undefined;
    let operationError: unknown;
    let contextClosed = false;
    let browserClosed = false;
    const abort = (): void => {
      void browser?.close().catch(() => undefined);
    };
    input.signal.addEventListener("abort", abort, { once: true });
    try {
      input.signal.throwIfAborted();
      browser = await playwright.chromium.launch(
        publisherOfflineChromiumLaunchOptions(),
      );
      assertPublisherOfflinePlaywrightAuthority({
        playwrightVersion,
        browserEngine: playwright.chromium.name(),
        browserVersion: browser.version(),
      });
      context = await browser.newContext({ serviceWorkers: "allow" });
      sessionEvidence = await exercisePublisherOfflineBrowser(
        browser,
        context,
        input,
        catalog,
        catalogEvidence,
        workerEvidence,
        markdownParserEvidence,
        playwrightVersion,
      );
      input.signal.throwIfAborted();
    } catch (error) {
      operationError = error;
    }
    const cleanupErrors: unknown[] = [];
    if (context !== undefined) {
      try {
        await context.close();
        contextClosed = true;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (browser !== undefined) {
      try {
        await browser.close();
        browserClosed = !browser.isConnected();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    input.signal.removeEventListener("abort", abort);
    if (operationError !== undefined || cleanupErrors.length > 0) {
      const errors = [
        ...(operationError === undefined ? [] : [operationError]),
        ...cleanupErrors,
      ];
      throw errors.length === 1
        ? errors[0]
        : new AggregateError(
            errors,
            "Publisher offline browser proof and cleanup failed.",
          );
    }
    if (
      sessionEvidence === undefined ||
      !contextClosed ||
      !browserClosed
    ) {
      throw new TypeError("Publisher offline browser proof did not close cleanly.");
    }
    return Object.freeze({
      ...sessionEvidence,
      contextClosed: true as const,
      browserClosed: true as const,
    });
  };

function assertCacheReceiptEvidence(
  receipt: PublisherOfflineCacheReceipt,
): void {
  assertExactKeys(
    receipt as unknown as JsonRecord,
    [
      "responseCount",
      "declaredResourceCount",
      "discoveredResourceCount",
      "declaredResourceHrefs",
      "discoveredResourceHrefs",
      "totalBytes",
      "maximumResponseBytes",
      "maximumTotalBytes",
      "rawHtmlHashCount",
      "semanticDocumentCount",
      "themeTokensHash",
      "rootThemeStyleHash",
      "stylesheetCount",
      "stylesheetHrefs",
      "stylesheetHrefsHash",
      "compiledCssHash",
      "hash",
      "rows",
    ],
    "Publisher offline cache receipt evidence",
  );
  for (const row of receipt.rows) {
    if (row.identity !== "semantic-dom" && row.identity !== "bytes") {
      throw new TypeError("Publisher offline cache receipt row identity drifted.");
    }
    assertExactKeys(
      row as unknown as JsonRecord,
      row.identity === "semantic-dom"
        ? [
            "href",
            "kind",
            "bytes",
            "status",
            "contentType",
            "responseHref",
            "redirected",
            "identity",
            "resolvedHref",
            "routeTargetKind",
            "workId",
            "sectionId",
            "blockCount",
            "linkCount",
            "semanticHash",
          ]
        : [
            "href",
            "kind",
            "bytes",
            "status",
            "contentType",
            "responseHref",
            "redirected",
            "identity",
            "hash",
          ],
      "Publisher offline cache receipt row evidence",
    );
  }
  const hrefs = receipt.rows.map(({ href }) =>
    publicHref(href, "Publisher offline receipt href")
  );
  const byteRow = (href: string): PublisherOfflineByteReceiptRow | undefined => {
    const row = receipt.rows.find((candidate) => candidate.href === href);
    return row?.identity === "bytes" ? row : undefined;
  };
  const catalogRow = byteRow(PUBLISHER_OFFLINE_CATALOG_HREF);
  const progressRow = byteRow("/publication-reader-progress.json");
  const searchRow = byteRow("/publication-reader-search.json");
  const stateMigrationRow = byteRow(COHERENCE_READER_STATE_MIGRATION_HREF);
  let rowByteTotal = 0;
  let rowByteTotalValid = true;
  for (const row of receipt.rows) {
    rowByteTotal += row.bytes;
    if (
      !Number.isSafeInteger(rowByteTotal) ||
      rowByteTotal > receipt.maximumTotalBytes
    ) {
      rowByteTotalValid = false;
      break;
    }
  }
  const declaredResourceHrefs = receipt.declaredResourceHrefs.map((href) =>
    publicHref(href, "Publisher declared receipt href")
  );
  const discoveredResourceHrefs = receipt.discoveredResourceHrefs.map((href) =>
    publicHref(href, "Publisher discovered receipt href")
  );
  const orderedResourceHrefs = [
    ...declaredResourceHrefs,
    ...discoveredResourceHrefs,
  ];
  const stylesheetHrefs = receipt.stylesheetHrefs.map((href) => {
    publicHref(href, "Publisher receipt stylesheet href");
    if (!/^\/_next\/static\/[A-Za-z0-9._/-]+\.css$/u.test(href)) {
      throw new TypeError("Publisher receipt stylesheet href drifted.");
    }
    return href;
  });
  const compiledCssHash = hashJson(stylesheetHrefs.map((href) => {
    const row = receipt.rows.find((candidate) => candidate.href === href);
    return Object.freeze({
      path: publisherOfflineStylesheetHashPath(href),
      bytes: row?.bytes ?? -1,
      hash: row?.identity === "bytes" ? row.hash : "",
    });
  }).sort((left, right) => left.path.localeCompare(right.path)));
  if (
    receipt.declaredResourceCount !== 18 ||
    declaredResourceHrefs.length !== receipt.declaredResourceCount ||
    receipt.discoveredResourceCount <= 0 ||
    discoveredResourceHrefs.length !== receipt.discoveredResourceCount ||
    receipt.responseCount !== receipt.rows.length ||
    receipt.responseCount !== 18 + receipt.discoveredResourceCount ||
    new Set(orderedResourceHrefs).size !== orderedResourceHrefs.length ||
    !isDeepStrictEqual(orderedResourceHrefs, hrefs) ||
    receipt.maximumResponseBytes !==
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES ||
    receipt.maximumTotalBytes !==
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES ||
    receipt.totalBytes < 1 ||
    receipt.totalBytes > receipt.maximumTotalBytes ||
    !rowByteTotalValid ||
    receipt.totalBytes !== rowByteTotal ||
    receipt.rawHtmlHashCount !== 0 ||
    receipt.semanticDocumentCount !== 14 ||
    receipt.themeTokensHash !== PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH ||
    receipt.rootThemeStyleHash !==
      PUBLISHER_OFFLINE_EXPECTED_ROOT_THEME_STYLE_HASH ||
    !Number.isSafeInteger(receipt.stylesheetCount) ||
    receipt.stylesheetCount !== PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS.length ||
    receipt.stylesheetCount !== stylesheetHrefs.length ||
    !isDeepStrictEqual(
      stylesheetHrefs,
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS,
    ) ||
    new Set(stylesheetHrefs).size !== stylesheetHrefs.length ||
    !stylesheetHrefs.every((href) =>
      discoveredResourceHrefs.includes(href) &&
      receipt.rows.some((row) =>
        row.href === href &&
        row.kind === "discovered" &&
        row.identity === "bytes" &&
        row.status === 200 &&
        row.contentType === PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_CONTENT_TYPE
      )
    ) ||
    receipt.stylesheetHrefsHash !==
      PUBLISHER_OFFLINE_EXPECTED_STYLESHEET_HREFS_HASH ||
    receipt.stylesheetHrefsHash !== hashJson(stylesheetHrefs) ||
    receipt.compiledCssHash !== PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH ||
    compiledCssHash !== receipt.compiledCssHash ||
    new Set(hrefs).size !== hrefs.length ||
    receipt.rows.slice(0, receipt.declaredResourceCount).some(
      ({ kind }) => kind === "discovered",
    ) ||
    receipt.rows.slice(receipt.declaredResourceCount).some(
      ({ kind }) => kind !== "discovered",
    ) ||
    receipt.rows.filter(({ identity }) => identity === "semantic-dom").length !==
      14 ||
    receipt.rows.some((row) =>
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      row.bytes > receipt.maximumResponseBytes ||
      row.status !== 200 ||
      row.redirected !== false ||
      publicHref(
        row.responseHref,
        "Publisher cached response href",
      ) !== row.responseHref ||
      row.responseHref !== row.href ||
      (row.identity === "semantic-dom"
        ? row.contentType !== PUBLISHER_OFFLINE_DOCUMENT_CONTENT_TYPE ||
          publicHref(
            row.resolvedHref,
            "Publisher semantic receipt resolved href",
          ) !== row.resolvedHref ||
          !["home", "work", "section"].includes(row.routeTargetKind) ||
          (row.routeTargetKind === "home"
            ? row.workId !== null || row.sectionId !== null
            : row.workId !== CARDINAL_SCALE_WORK_ID) ||
          (row.routeTargetKind === "section") !== (row.sectionId !== null) ||
          !Number.isSafeInteger(row.blockCount) ||
          row.blockCount < 0 ||
          !Number.isSafeInteger(row.linkCount) ||
          row.linkCount < 0 ||
          !/^sha256:[0-9a-f]{64}$/u.test(row.semanticHash) ||
          Object.hasOwn(row, "hash")
        : trimHtmlSpaceCharacters(row.contentType.split(";", 1)[0] ?? "")
            .toLowerCase() ===
            "text/html" ||
          !/^sha256:[0-9a-f]{64}$/u.test(row.hash) ||
          Object.hasOwn(row, "semanticHash")) ||
      /^(?:audio|video)\//iu.test(
        trimHtmlSpaceCharacters(row.contentType),
      ) ||
      /(?:^|\/)(?:publication-audio\.json|[^/?]+\.(?:aac|flac|m4a|mp3|oga|ogg|opus|vtt|wav))(?:\?|$)/iu
        .test(row.href) ||
      /(?:timing|timings)(?:\.json)?(?:\?|$)/iu.test(row.href)
    ) ||
    catalogRow?.bytes !== PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES ||
    catalogRow?.hash !== PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH ||
    progressRow?.bytes !== PUBLISHER_OFFLINE_EXPECTED_PROGRESS_BYTES ||
    progressRow?.hash !== PUBLISHER_OFFLINE_EXPECTED_PROGRESS_HASH ||
    searchRow?.bytes !== PUBLISHER_OFFLINE_EXPECTED_SEARCH_BYTES ||
    searchRow?.hash !== PUBLISHER_OFFLINE_EXPECTED_SEARCH_HASH ||
    stateMigrationRow?.bytes !==
      PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES ||
    stateMigrationRow?.hash !==
      PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_HASH ||
    receipt.hash !== hashJson(publisherOfflineDurableCacheReceiptBasis(receipt))
  ) {
    throw new TypeError("Publisher offline cache receipt evidence drifted.");
  }
}

export function assertPublisherOfflineBrowserEvidence(
  evidence: PublisherOfflineBrowserEvidence,
): void {
  assertExactKeys(
    evidence as unknown as JsonRecord,
    [
      "proofSchemaVersion",
      "browserEngine",
      "playwrightVersion",
      "browserVersion",
      "browserSource",
      "serviceWorkers",
      "persistentProfile",
      "preRegistrationCount",
      "preInstallCleanBoundaryCount",
      "preInstallMetadataRequestCount",
      "preInstallPackageCacheCount",
      "preInstallCurrentRuntimeCacheCount",
      "preInstallSeededCoherenceCacheCount",
      "preInstallSeededStaleRuntimeCacheCount",
      "controlledRegistrationCount",
      "serviceWorkerScopeRoot",
      "serviceWorkerActiveState",
      "serviceWorkerControllerState",
      "serviceWorkerInstallingState",
      "serviceWorkerWaitingState",
      "serviceWorkerControllerIsActiveWorker",
      "publisherRegistrationCount",
      "publisherCacheCount",
      "contextClosed",
      "browserClosed",
      "catalog",
      "worker",
      "markdownParser",
      "installedWorkId",
      "installedRoute",
      "declaredInstalledResourceCount",
      "failedReplacementPreservedPointer",
      "failedReplacementPreservedCache",
      "failedReplacementRemovedStagingCache",
      "inFlightReplacementPreservedPointer",
      "inFlightReplacementPreservedCache",
      "inFlightStagingCacheCount",
      "replacementFailureHitCount",
      "replacementFailurePromiseReleased",
      "replacementFailureFetchRestored",
      "replacementFailureHref",
      "successfulReplacementSwitchedPointer",
      "successfulReplacementDeletedPriorCache",
      "coherenceCacheNames",
      "coherenceCacheSnapshotHash",
      "coherenceCachesPreserved",
      "coherenceCachesPreservedAfterCleanup",
      "coherenceSnapshotBoundaryCount",
      "activePackageStateBoundaryCount",
      "packageStateMaximumResponseBytes",
      "packageStateMaximumAggregateBytes",
      "metadataSharesPackageStateAggregate",
      "postBehaviorPackageStatePreserved",
      "postColdPackageStatePreserved",
      "stalePublisherRuntimeCachesDeleted",
      "browserHttpCacheCleared",
      "browserHttpCacheClearedBeforeOfflineCutoff",
      "runtimeCacheEntryCountBeforeCold",
      "runtimeCacheEntryCountAfterCold",
      "coldOfflineFreshPage",
      "offlineReaderTextPresent",
      "coldTextVisibilityBoundaryCount",
      "allColdBlockTextNodesVisible",
      "allColdBlockTextRunsPositiveGeometry",
      "dormantAudioShellBoundaryCount",
      "dormantAudioShellVerified",
      "unexpectedColdMediaElementCount",
      "offlineSearchResultCount",
      "offlineSameOriginFullNavigation",
      "excludedRequestCount",
      "excludedRequestsRejected",
      "offlineRangeInstalledRequestRejected",
      "rangeResponseStatus",
      "rangeResponseBytes",
      "rangeResponseNotRuntimeCached",
      "cacheReceipt",
      "publishedAudio",
      "dormantAudioRuntime",
      "audioActivation",
      "nativeInstallability",
      "currentPublicRoutes",
    ],
    "Publisher offline browser evidence",
  );
  assertPublisherOfflinePlaywrightAuthority({
    playwrightVersion: evidence.playwrightVersion,
    browserEngine: evidence.browserEngine,
    browserVersion: evidence.browserVersion,
  });
  assertPublisherOfflineMarkdownParserEvidence(evidence.markdownParser);
  const installedMarkdownParser =
    assertPublisherOfflineMarkdownParserAuthority();
  if (
    evidence.proofSchemaVersion !== "1.0" ||
    evidence.browserSource !== "bundled Playwright Chromium" ||
    evidence.serviceWorkers !== "allow" ||
    evidence.persistentProfile !== false ||
    evidence.preRegistrationCount !== 0 ||
    evidence.preInstallCleanBoundaryCount !== 2 ||
    evidence.preInstallMetadataRequestCount !== 0 ||
    evidence.preInstallPackageCacheCount !== 0 ||
    evidence.preInstallCurrentRuntimeCacheCount !== 0 ||
    evidence.preInstallSeededCoherenceCacheCount !== 5 ||
    evidence.preInstallSeededStaleRuntimeCacheCount !== 2 ||
    evidence.controlledRegistrationCount !== 1 ||
    !evidence.serviceWorkerScopeRoot ||
    evidence.serviceWorkerActiveState !== "activated" ||
    evidence.serviceWorkerControllerState !== "activated" ||
    evidence.serviceWorkerInstallingState !== "absent" ||
    evidence.serviceWorkerWaitingState !== "absent" ||
    !evidence.serviceWorkerControllerIsActiveWorker ||
    evidence.publisherRegistrationCount !== 0 ||
    evidence.publisherCacheCount !== 0 ||
    !evidence.contextClosed ||
    !evidence.browserClosed ||
    !isDeepStrictEqual(evidence.catalog, {
      href: PUBLISHER_OFFLINE_CATALOG_HREF,
      mediaType: READER_OFFLINE_CATALOG_ARTIFACT_MEDIA_TYPE,
      cacheControl: CATALOG_CACHE_CONTROL,
      bytes: PUBLISHER_OFFLINE_EXPECTED_CATALOG_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_HASH,
      structureHash: PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH,
      cardinalResourcesHash: PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH,
      cardinalHrefOrderHash:
        PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH,
      packageCount: 9,
      resourceDeclarationCount: 627,
      uniqueResourceCount: 587,
      documentResourceCount: 583,
      dataResourceCount: 4,
      assetResourceCount: 0,
      audioResourceCount: 0,
      timingResourceCount: 0,
      audioClipCount: 0,
      cardinalScaleResourceCount: 18,
      packageEvidence: PUBLISHER_OFFLINE_EXPECTED_PACKAGES,
    }) ||
    !isDeepStrictEqual(evidence.worker, {
      path: OFFLINE_WORKER_PATH,
      bytes: PUBLISHER_OFFLINE_EXPECTED_WORKER_BYTES,
      hash: PUBLISHER_OFFLINE_EXPECTED_WORKER_HASH,
      contentType: PUBLISHER_OFFLINE_EXPECTED_WORKER_CONTENT_TYPE,
      cacheControl: PUBLISHER_OFFLINE_EXPECTED_WORKER_CACHE_CONTROL,
      doesNotCache206: true,
      excludesRange: true,
      excludesApi: true,
      excludesAuth: true,
      excludesRsc: true,
      excludesPrefetch: true,
      excludesStateTree: true,
      excludesWorker: true,
    }) ||
    !isDeepStrictEqual(evidence.markdownParser, installedMarkdownParser) ||
    evidence.installedWorkId !== CARDINAL_SCALE_WORK_ID ||
    publicHref(evidence.installedRoute, "Publisher installed route") !==
      evidence.installedRoute ||
    evidence.declaredInstalledResourceCount !== 18 ||
    !evidence.failedReplacementPreservedPointer ||
    !evidence.failedReplacementPreservedCache ||
    !evidence.failedReplacementRemovedStagingCache ||
    !evidence.inFlightReplacementPreservedPointer ||
    !evidence.inFlightReplacementPreservedCache ||
    evidence.inFlightStagingCacheCount !== 1 ||
    evidence.replacementFailureHitCount !== 1 ||
    !evidence.replacementFailurePromiseReleased ||
    !evidence.replacementFailureFetchRestored ||
    publicHref(
      evidence.replacementFailureHref,
      "Publisher replacement failure href",
    ) !== evidence.replacementFailureHref ||
    evidence.replacementFailureHref === evidence.installedRoute ||
    !evidence.cacheReceipt.rows.some((row) =>
      row.href === evidence.installedRoute &&
      row.kind === "document" &&
      row.identity === "semantic-dom"
    ) ||
    evidence.cacheReceipt.rows.at(-1)?.href !==
      evidence.replacementFailureHref ||
    evidence.cacheReceipt.rows.at(-1)?.kind !== "discovered" ||
    evidence.cacheReceipt.discoveredResourceHrefs.at(-1) !==
      evidence.replacementFailureHref ||
    !evidence.successfulReplacementSwitchedPointer ||
    !evidence.successfulReplacementDeletedPriorCache ||
    !isDeepStrictEqual(
      evidence.coherenceCacheNames,
      SEEDED_COHERENCE_CACHE_NAMES,
    ) ||
    !/^sha256:[0-9a-f]{64}$/u.test(evidence.coherenceCacheSnapshotHash) ||
    !evidence.coherenceCachesPreserved ||
    !evidence.coherenceCachesPreservedAfterCleanup ||
    evidence.coherenceSnapshotBoundaryCount !== 6 ||
    evidence.activePackageStateBoundaryCount !== 3 ||
    evidence.packageStateMaximumResponseBytes !==
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RESPONSE_BYTES ||
    evidence.packageStateMaximumAggregateBytes !==
      PUBLISHER_OFFLINE_MAXIMUM_CACHE_RECEIPT_BYTES ||
    !evidence.metadataSharesPackageStateAggregate ||
    !evidence.postBehaviorPackageStatePreserved ||
    !evidence.postColdPackageStatePreserved ||
    !evidence.stalePublisherRuntimeCachesDeleted ||
    !evidence.browserHttpCacheCleared ||
    !evidence.browserHttpCacheClearedBeforeOfflineCutoff ||
    evidence.runtimeCacheEntryCountBeforeCold !== 0 ||
    evidence.runtimeCacheEntryCountAfterCold !== 0 ||
    !evidence.coldOfflineFreshPage ||
    !evidence.offlineReaderTextPresent ||
    evidence.coldTextVisibilityBoundaryCount !== 2 ||
    !evidence.allColdBlockTextNodesVisible ||
    !evidence.allColdBlockTextRunsPositiveGeometry ||
    evidence.dormantAudioShellBoundaryCount !== 2 ||
    !evidence.dormantAudioShellVerified ||
    evidence.unexpectedColdMediaElementCount !== 0 ||
    !Number.isSafeInteger(evidence.offlineSearchResultCount) ||
    evidence.offlineSearchResultCount < 1 ||
    !evidence.offlineSameOriginFullNavigation ||
    evidence.excludedRequestCount !== 8 ||
    !evidence.excludedRequestsRejected ||
    !evidence.offlineRangeInstalledRequestRejected ||
    evidence.rangeResponseStatus !== 206 ||
    evidence.rangeResponseBytes !== 32 ||
    !evidence.rangeResponseNotRuntimeCached ||
    evidence.publishedAudio !== "absent" ||
    evidence.dormantAudioRuntime !== "present-inert" ||
    evidence.audioActivation !== "not exercised" ||
    evidence.nativeInstallability !== "not asserted" ||
    evidence.currentPublicRoutes !== "untouched"
  ) {
    throw new TypeError("Publisher offline browser evidence drifted.");
  }
  assertCacheReceiptEvidence(evidence.cacheReceipt);
  const serialized = JSON.stringify(evidence);
  if (
    serialized.includes("http://127.0.0.1") ||
    serialized.includes("file:") ||
    serialized.includes("/Users/") ||
    serialized.includes("\\Users\\")
  ) {
    throw new TypeError("Publisher offline browser evidence exposed a local path.");
  }
}

export function publisherOfflineDurableBrowserEvidenceBasis(
  evidence: PublisherOfflineBrowserEvidence,
): unknown {
  const { cacheReceipt, ...rest } = evidence;
  return Object.freeze({
    ...rest,
    cacheReceipt: Object.freeze({
      ...publisherOfflineDurableCacheReceiptBasis(cacheReceipt),
      hash: cacheReceipt.hash,
    }),
  });
}

export function publisherOfflineCrossRunSemanticEvidenceBasis(
  evidence: PublisherOfflineBrowserEvidence,
): unknown {
  const { cacheReceipt, replacementFailureHref, ...rest } = evidence;
  const replacementFailureTargetsFinalDiscoveredResource =
    cacheReceipt.rows.at(-1)?.kind === "discovered" &&
    cacheReceipt.rows.at(-1)?.href === replacementFailureHref &&
    cacheReceipt.discoveredResourceHrefs.at(-1) === replacementFailureHref;
  return Object.freeze({
    ...rest,
    replacementFailureTargetsFinalDiscoveredResource,
    cacheReceipt: publisherOfflineCrossRunCacheReceiptBasis(cacheReceipt),
  });
}

function assertAcceptedThemeSummary(
  summary: PublisherThemeHostProofSummary,
  projection: PublisherThemeHostReaderProjection,
): void {
  if (
    summary.proofScope !== "isolated Next linkful theme compiler host" ||
    summary.contentParity !== "not asserted" ||
    !summary.adaptedReaderHostVerified ||
    summary.currentPublicRoutes !== "untouched" ||
    summary.publicationId !== EXPECTED_PUBLICATION_ID ||
    summary.readerBuildId !== PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID ||
    summary.readerBuildId !== projection.reader.buildId ||
    summary.contentBuildId !== projection.contentBuildId ||
    summary.contentEvidenceHash !== projection.contentEvidenceHash ||
    summary.adaptedApplicationBuildId !==
      projection.adaptedApplicationBuildId ||
    summary.applicationBuildId !==
      PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID ||
    summary.applicationArtifactHash !==
      PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH ||
    summary.themeTokensHash !== PUBLISHER_OFFLINE_EXPECTED_THEME_TOKENS_HASH ||
    summary.compiledCssHash !== PUBLISHER_OFFLINE_EXPECTED_COMPILED_CSS_HASH ||
    summary.routePlanStaticParamCount !== 583 ||
    summary.applicationStaticParamCount !== 582 ||
    summary.readerArtifactCount !== 4 ||
    summary.semanticLinkCount !== 21 ||
    summary.semanticLinkBlockGroupCount !== 17 ||
    summary.catalogChapterRootOwnerCount !== 46 ||
    summary.catalogChapterRootChildCount !== 107 ||
    summary.liveContentPathCount !== 47 ||
    summary.audioDeclaration !== "absent" ||
    summary.audioArtifact !== "absent" ||
    summary.offlineAudioEnvelopeResourceCount !== 0 ||
    summary.baseRoutePresence !== true ||
    summary.aggregateChapterPageParity !== false ||
    summary.nestedFragmentParity !== false ||
    summary.durableFragmentParity !== false ||
    summary.fullReaderRouteParity !== false ||
    summary.generatedHostCleanup !== "completed"
  ) {
    throw new TypeError("Publisher accepted theme proof identity drifted.");
  }
}

function assertPublisherOfflineReceiptAgainstReader(
  readerValue: unknown,
  receipt: PublisherOfflineCacheReceipt,
): void {
  const reader = assertPublisherOfflineReaderAuthority(readerValue);
  const catalog = createReaderOfflineCatalog({
    reader,
    rendererBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
    catalogHref: PUBLISHER_OFFLINE_CATALOG_HREF,
    sharedResources: Object.freeze([
      Object.freeze({
        href: "/publication-reader-search.json",
        kind: "data" as const,
      }),
      Object.freeze({
        href: "/publication-reader-progress.json",
        kind: "data" as const,
      }),
      Object.freeze({
        href: COHERENCE_READER_STATE_MIGRATION_HREF,
        kind: "data" as const,
        byteSize: PUBLISHER_OFFLINE_EXPECTED_STATE_MIGRATION_BYTES,
      }),
    ]),
  });
  assertPublisherOfflineCatalogStructure(catalog, reader);
  const cardinalPackage = catalog.packages.find(
    ({ workId }) => workId === CARDINAL_SCALE_WORK_ID,
  );
  if (
    cardinalPackage === undefined ||
    hashJson(catalog) !== PUBLISHER_OFFLINE_EXPECTED_CATALOG_STRUCTURE_HASH ||
    hashJson(cardinalPackage.resources) !==
      PUBLISHER_OFFLINE_EXPECTED_CARDINAL_RESOURCES_HASH ||
    hashJson(cardinalPackage.resources.map(({ href }) => href)) !==
      PUBLISHER_OFFLINE_EXPECTED_CARDINAL_HREF_ORDER_HASH ||
    !isDeepStrictEqual(
      receipt.declaredResourceHrefs,
      cardinalPackage.resources.map(({ href }) => href),
    ) ||
    !isDeepStrictEqual(
      receipt.rows.slice(0, cardinalPackage.resources.length).map(
        ({ href, kind }) => ({ href, kind }),
      ),
      cardinalPackage.resources.map(({ href, kind }) => ({ href, kind })),
    ) ||
    receipt.rows.slice(cardinalPackage.resources.length).some(
      ({ kind }) => kind !== "discovered",
    )
  ) {
    throw new TypeError("Publisher receipt catalog authority drifted.");
  }
  const authorities = createPublisherOfflineDocumentSemanticAuthorities(
    reader,
    cardinalPackage,
  );
  const semanticRows = receipt.rows.filter(
    (row): row is PublisherOfflineSemanticReceiptRow =>
      row.identity === "semantic-dom",
  );
  if (
    authorities.length !== 14 ||
    semanticRows.length !== authorities.length
  ) {
    throw new TypeError("Publisher receipt semantic authority census drifted.");
  }
  for (const [index, authority] of authorities.entries()) {
    const row = semanticRows[index];
    const routeTargetKind = authority.routeTarget.kind;
    if (
      row === undefined ||
      row.href !== authority.href ||
      row.resolvedHref !== authority.resolvedHref ||
      row.routeTargetKind !== routeTargetKind ||
      row.workId !== (routeTargetKind === "home"
        ? null
        : authority.routeTarget.workId ?? null) ||
      row.sectionId !== (routeTargetKind === "section"
        ? authority.routeTarget.sectionId ?? null
        : null) ||
      row.blockCount !== authority.expectedDom.blocks.length ||
      row.linkCount !== authority.expectedDom.links.length ||
      row.semanticHash !== assertPublisherOfflineDocumentSemanticProjection(
        authority,
        authority.expectedDom,
      )
    ) {
      throw new TypeError(
        "Publisher receipt semantic row diverged from the Reader authority.",
      );
    }
  }
}

export function composePublisherOfflineHostProofSummary(input: Readonly<{
  themeSummary: PublisherThemeHostProofSummary;
  projection: PublisherThemeHostReaderProjection;
  browserEvidence: PublisherOfflineBrowserEvidence;
}>): PublisherOfflineHostProofSummary {
  const { themeSummary, projection, browserEvidence } = input;
  const installedMarkdownParser =
    assertPublisherOfflineMarkdownParserAuthority();
  assertPublisherOfflineMarkdownParserEvidence(browserEvidence.markdownParser);
  if (!isDeepStrictEqual(
    browserEvidence.markdownParser,
    installedMarkdownParser,
  )) {
    throw new TypeError(
      "Publisher offline Markdown parser composition authority drifted.",
    );
  }
  assertPublisherOfflineReceiptAgainstReader(
    projection.reader,
    browserEvidence.cacheReceipt,
  );
  assertAcceptedThemeSummary(themeSummary, projection);
  assertPublisherOfflineBrowserEvidence(browserEvidence);
  const browserEvidenceHash = hashJson(
    publisherOfflineDurableBrowserEvidenceBasis(browserEvidence),
  );
  const crossRunSemanticEvidenceHash = hashJson(
    publisherOfflineCrossRunSemanticEvidenceBasis(browserEvidence),
  );
  const summary = Object.freeze({
    proofScope: "isolated Publisher offline browser host" as const,
    contentParity: "not asserted" as const,
    nativeInstallability: "not asserted" as const,
    publishedAudio: "absent" as const,
    dormantAudioRuntime: "present-inert" as const,
    audioActivation: "not exercised" as const,
    currentPublicRoutes: "untouched" as const,
    publicationId: EXPECTED_PUBLICATION_ID,
    readerBuildId: PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID,
    adaptedApplicationBuildId: projection.adaptedApplicationBuildId,
    rendererBuildId: PUBLISHER_OFFLINE_EXPECTED_RENDERER_BUILD_ID,
    applicationArtifactHash:
      PUBLISHER_OFFLINE_EXPECTED_APPLICATION_ARTIFACT_HASH,
    contentBuildId: projection.contentBuildId,
    contentEvidenceHash: projection.contentEvidenceHash,
    catalog: browserEvidence.catalog,
    worker: browserEvidence.worker,
    markdownParser: browserEvidence.markdownParser,
    browser: Object.freeze({
      engine: "chromium" as const,
      playwrightVersion: browserEvidence.playwrightVersion,
      version: browserEvidence.browserVersion,
      source: "bundled Playwright Chromium" as const,
      serviceWorkers: "allow" as const,
      persistentProfile: false as const,
      closed: true as const,
    }),
    installedWorkId: CARDINAL_SCALE_WORK_ID,
    replacementFailureHref: browserEvidence.replacementFailureHref,
    explicitInstallCausalityVerified: true as const,
    serviceWorkerLifecycleVerified: true as const,
    rollbackVerified: true as const,
    inFlightAtomicPointerVerified: true as const,
    atomicReplacementVerified: true as const,
    coherenceCachesPreserved: true as const,
    coldOfflineReaderVerified: true as const,
    coldOfflineTextVisibilityVerified: true as const,
    packageStateDurabilityVerified: true as const,
    offlineSearchVerified: true as const,
    offlineSameOriginNavigationVerified: true as const,
    excludedRequestsVerified: true as const,
    rangeAnd206CachingVerified: true as const,
    cacheReceipt: browserEvidence.cacheReceipt,
    browserEvidenceHash,
    crossRunSemanticEvidenceHash,
    generatedHostCleanup: "completed" as const,
  });
  const serialized = JSON.stringify(summary);
  if (
    serialized.includes("http://127.0.0.1") ||
    serialized.includes("file:") ||
    serialized.includes("/Users/") ||
    summary.cacheReceipt.rows.some((row) =>
      row.identity === "semantic-dom" && Object.hasOwn(row, "hash")
    )
  ) {
    throw new TypeError("Publisher offline proof summary is not path private.");
  }
  return summary;
}

async function runPublisherOfflineHostProofAttempt(): Promise<
  PublisherOfflineHostProofSummary
> {
  assertPublisherOfflineMarkdownParserAuthority();
  const themeHostProofPath = fs.realpathSync(path.join(
    PUBLISHER_OFFLINE_REPO_ROOT,
    "scripts/publisher/theme-host-proof.ts",
  ));
  const expectedThemeHostProofPath = path.join(
    PUBLISHER_OFFLINE_REPO_ROOT,
    "scripts/publisher/theme-host-proof.ts",
  );
  if (
    themeHostProofPath !== expectedThemeHostProofPath ||
    !isStrictlyInsidePath(themeHostProofPath, PUBLISHER_OFFLINE_REPO_ROOT)
  ) {
    throw new TypeError("Publisher theme proof module path drifted.");
  }
  readStableReviewedFile(
    themeHostProofPath,
    PUBLISHER_OFFLINE_REPO_ROOT,
    "Publisher theme proof module",
  );
  const themeHostProofModule = asRecord(
    await import(pathToFileURL(themeHostProofPath).href),
    "Publisher theme proof module",
  );
  const runThemeHostProof = themeHostProofModule.runPublisherThemeHostProof;
  if (typeof runThemeHostProof !== "function") {
    throw new TypeError("Publisher theme proof runner export drifted.");
  }
  assertPublisherOfflineMarkdownParserAuthority();
  let observerCount = 0;
  let projection: PublisherThemeHostReaderProjection | undefined;
  let browserEvidence: PublisherOfflineBrowserEvidence | undefined;
  const liveHostObserver: PublisherThemeHostLiveObserver = async (input) => {
    observerCount += 1;
    if (observerCount !== 1) {
      throw new TypeError("Publisher offline observer ran more than once.");
    }
    if (
      input.projection.reader.publicationId !== EXPECTED_PUBLICATION_ID ||
      input.projection.reader.buildId !==
        PUBLISHER_OFFLINE_EXPECTED_READER_BUILD_ID ||
      input.projection.reader.works.length !== 9
    ) {
      throw new TypeError("Publisher offline observer projection drifted.");
    }
    projection = input.projection;
    browserEvidence = await runPublisherOfflineBrowserSession(input);
    assertPublisherOfflineBrowserEvidence(browserEvidence);
  };
  const themeSummary = await (runThemeHostProof as (
    input: Readonly<{ liveHostObserver: PublisherThemeHostLiveObserver }>,
  ) => Promise<PublisherThemeHostProofSummary>)({ liveHostObserver });
  if (
    observerCount !== 1 ||
    projection === undefined ||
    browserEvidence === undefined
  ) {
    throw new TypeError("Publisher theme proof omitted its live offline observer.");
  }
  return composePublisherOfflineHostProofSummary({
    themeSummary,
    projection,
    browserEvidence,
  });
}

export async function runPublisherOfflineHostProof(): Promise<
  PublisherOfflineHostProofSummary
> {
  assertPublisherOfflineMarkdownParserAuthority();
  let runFailed = false;
  let runFailure: unknown;
  try {
    return await runPublisherOfflineHostProofAttempt();
  } catch (error) {
    runFailed = true;
    runFailure = error;
    throw error;
  } finally {
    try {
      assertPublisherOfflineMarkdownParserAuthority();
    } catch (authorityError) {
      if (!runFailed) throw authorityError;
      throw new AggregateError(
        [runFailure, authorityError],
        "Publisher offline proof and final authority recheck both failed.",
      );
    }
  }
}

export function assertPublisherOfflineCliArguments(args: readonly string[]): void {
  if (args.length !== 0) {
    throw new TypeError("Usage: offline-host-proof.ts");
  }
}

async function main(): Promise<void> {
  assertPublisherOfflineCliArguments(process.argv.slice(2));
  const summary = await runPublisherOfflineHostProof();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === scriptPath
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
