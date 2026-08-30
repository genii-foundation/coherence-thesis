import { createHash } from "node:crypto";
import fs from "node:fs";

import { createPublisherNextRoutePlan } from "@genii-foundation/publisher-next/config";
import {
  parseJsonWithUniqueObjectKeys,
  validateUpdatesCatalogShape,
  validateUpdatesEnvelopeShape,
  type PublicationReaderEnvelope,
} from "@genii-foundation/publisher-schema";
import { describe, expect, it } from "vitest";

import {
  parseUpdatesSnapshot,
} from "../../src/lib/updates";
import { updatesSnapshotPath } from "../repository/paths";
import {
  adaptCoherencePublisherUpdatesSnapshot,
  loadCoherencePublisherUpdatesData,
  verifyCoherencePublisherUpdatesDormancy,
} from "./updates-adapter";

const CURRENT_READER = Object.freeze({
  publicationId: "coherence-thesis",
  buildId:
    "sha256:fd3c1932dc375b764fc43ec4ac0a000e7894fb2e68ad070da957a44829a74ad0",
});
const GREAT_REVISION_SHA =
  "29ac0f92c261f3673f42d5fbac388c20de105cf6";

function sha256(text: string): string {
  return `sha256:${createHash("sha256")
    .update(text, "utf8")
    .digest("hex")}`;
}

function checkedSnapshotText(): string {
  return fs.readFileSync(updatesSnapshotPath, "utf8");
}

function requireStrictJson(text: string): unknown {
  const parsed = parseJsonWithUniqueObjectKeys(text);
  if (!parsed.valid) {
    throw new TypeError("Expected strict JSON in Publisher Updates test.");
  }
  return parsed.value;
}

function dormantReader(): PublicationReaderEnvelope {
  return {
    publicationId: CURRENT_READER.publicationId,
    buildId: CURRENT_READER.buildId,
    schemaVersion: "1.0",
    engineVersion: "0.1.0-alpha.0",
    audience: "public",
    routes: {
      active: [
        {
          path: "/",
          target: { kind: "home" },
        },
      ],
      redirects: [],
    },
    links: [],
    works: [],
  } as unknown as PublicationReaderEnvelope;
}

describe("Coherence Publisher Updates adapter", () => {
  it("binds the exact checked snapshot to the current Reader build", () => {
    const proof = loadCoherencePublisherUpdatesData(CURRENT_READER);

    expect(proof.reader).toEqual(CURRENT_READER);
    expect(proof.source).toEqual({
      relativePath: "publishing/updates/snapshot.json",
      bytes: 99_570,
      sha256:
        "sha256:6c6e326b991980e1d64b5bdd37151917d19595de46a64efeff1500281ecfc63f",
      headSha: "845a358b0e9659243781d60970895368da6ef770",
      commitCount: 240,
      literaryCommitCount: 12,
      latestCommitSha: "845a358b0e9659243781d60970895368da6ef770",
      earliestCommitSha: "4dd72208a5fefda31ac0d55ea82b2c6965caa345",
    });
    expect(proof.updatesData).toMatchObject({
      $schema:
        "https://publisher.genii.foundation/schemas/updates-envelope.schema.json",
      schemaVersion: "1.0",
      publicationId: CURRENT_READER.publicationId,
      buildId: CURRENT_READER.buildId,
      source: {
        adapter: {
          package: "coherence-thesis",
          config: {
            kind: "checked-updates-snapshot",
            schemaVersion: 1,
            snapshotHeadSha:
              "845a358b0e9659243781d60970895368da6ef770",
            snapshotSha256:
              "sha256:6c6e326b991980e1d64b5bdd37151917d19595de46a64efeff1500281ecfc63f",
          },
        },
        catalogPath: "publishing/updates/snapshot.json",
        catalogSha256:
          "sha256:6c6e326b991980e1d64b5bdd37151917d19595de46a64efeff1500281ecfc63f",
      },
    });
    expect(
      validateUpdatesCatalogShape(requireStrictJson(proof.catalogText)).valid,
    ).toBe(true);
    expect(
      validateUpdatesEnvelopeShape(
        requireStrictJson(proof.updatesDataText),
      ).valid,
    ).toBe(true);
    expect(JSON.parse(proof.catalogText)).toEqual(proof.catalog);
    expect(JSON.parse(proof.updatesDataText)).toEqual(proof.updatesData);
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.routes)).toBe(true);
  });

  it("preserves canonical commit ordering in both named views", () => {
    const snapshot = parseUpdatesSnapshot(
      requireStrictJson(checkedSnapshotText()),
    );
    const proof = loadCoherencePublisherUpdatesData(CURRENT_READER);
    const [all, literary] = proof.catalog.views;

    expect(proof.catalog.views.map(({ id }) => id)).toEqual([
      "all",
      "literary",
    ]);
    expect(all?.entries.map(({ id }) => id)).toEqual(
      snapshot.commits.map(({ sha }) => sha),
    );
    expect(literary?.entries.map(({ id }) => id)).toEqual(
      snapshot.commits
        .filter(({ isLiterary }) => isLiterary)
        .map(({ sha }) => sha),
    );
    expect(all?.entries).toHaveLength(240);
    expect(literary?.entries).toHaveLength(12);
    expect(
      proof.catalog.views.every(
        (view) => new Set(view.entries.map(({ id }) => id)).size === view.entries.length,
      ),
    ).toBe(true);
  });

  it("binds the current Great Revision title and both source links", () => {
    const proof = loadCoherencePublisherUpdatesData(CURRENT_READER);

    expect(proof.greatRevision).toEqual({
      sha: GREAT_REVISION_SHA,
      title:
        "The Great Revision: Recasting All Nine Manuscripts of The Coherence Thesis",
      commitUrl:
        "https://github.com/genii-foundation/coherence-thesis/commit/29ac0f92c261f3673f42d5fbac388c20de105cf6",
      pullRequestUrl:
        "https://github.com/genii-foundation/coherence-thesis/pull/112",
      primarySourceUrl:
        "https://github.com/genii-foundation/coherence-thesis/pull/112",
      presentInViews: ["all", "literary"],
    });
    for (const view of proof.catalog.views) {
      const entry = view.entries.find(({ id }) => id === GREAT_REVISION_SHA);
      expect(entry).toMatchObject({
        title:
          "The Great Revision: Recasting All Nine Manuscripts of The Coherence Thesis",
        publishedAt: "2026-08-01T17:56:44.000Z",
      });
      expect(entry?.summary).toContain(
        "https://github.com/genii-foundation/coherence-thesis/pull/112",
      );
      expect(entry?.summary).toContain(
        "https://github.com/genii-foundation/coherence-thesis/commit/29ac0f92c261f3673f42d5fbac388c20de105cf6",
      );
    }
  });

  it("declares the two existing Coherence routes with finite Publisher pagination", () => {
    const proof = loadCoherencePublisherUpdatesData(CURRENT_READER);

    expect(proof.routes).toEqual([
      {
        id: "all",
        path: "/updates/",
        pagination: {
          path: "/updates/{page}/",
          pageSize: 5,
        },
      },
      {
        id: "literary",
        path: "/updates/literary/",
        pagination: {
          path: "/updates/literary/{page}/",
          pageSize: 5,
        },
      },
    ]);
    expect(proof.pagination).toEqual({
      pageSize: 5,
      allPageCount: 48,
      literaryPageCount: 3,
    });

    const readerWithUpdates = {
      publicationId: CURRENT_READER.publicationId,
      buildId: CURRENT_READER.buildId,
      routes: {
        active: proof.routes.map(({ id, path, pagination }) => ({
          path,
          target: {
            kind: "updates" as const,
            viewId: id,
            pagination,
          },
        })),
        redirects: [],
      },
    } as unknown as PublicationReaderEnvelope;
    const plan = createPublisherNextRoutePlan(
      readerWithUpdates,
      proof.updatesData,
    );
    expect(plan.valid).toBe(true);
    if (!plan.valid) return;
    expect(plan.value.activePaths).toHaveLength(51);
    expect(plan.value.activePaths).toContain("/updates/");
    expect(plan.value.activePaths).toContain("/updates/48/");
    expect(plan.value.activePaths).toContain("/updates/literary/");
    expect(plan.value.activePaths).toContain("/updates/literary/3/");
    expect(plan.value.resolve(["updates", "48"])).toMatchObject({
      status: "resolved",
      route: {
        target: {
          kind: "updates",
          viewId: "all",
          pageNumber: 48,
          previousPath: "/updates/47/",
        },
      },
    });
  });

  it("keeps the current Coherence pages authoritative during the transition", () => {
    const proof = loadCoherencePublisherUpdatesData(CURRENT_READER);

    expect(proof.transition).toEqual({
      coherenceUpdatesRoutesRemainVisible: true,
      publisherUpdatesRoutesActivated: false,
      sourceLinksRenderedByPublisher: false,
      sourceLinksPreservedInSummaries: true,
    });
    expect(
      proof.catalog.views.flatMap(({ entries }) =>
        entries.map(({ href }) => href),
      ),
    ).toSatisfy((hrefs: unknown) =>
      Array.isArray(hrefs) &&
      hrefs.every(
        (href) =>
          href === "/updates/" || href === "/updates/literary/",
      ),
    );
    expect(
      proof.catalog.views.flatMap(({ entries }) => entries).every(
        ({ summary }) =>
          summary?.includes(
            "https://github.com/genii-foundation/coherence-thesis/commit/",
          ) === true,
      ),
    ).toBe(true);
  });

  it("proves adaptation readiness while the Reader boundary stays dormant", () => {
    const proof = verifyCoherencePublisherUpdatesDormancy(
      dormantReader(),
    );

    expect(proof.updates.reader).toEqual(CURRENT_READER);
    expect(proof.identities).toEqual({
      catalogTextSha256:
        "sha256:f57afe7238fb47d84c4acbce0488c8190026d4944706bc8997bccca3ba53be46",
      updatesDataTextSha256:
        "sha256:ea86223359487df88029e984a405229040fc97ec8fb6993f74448fa2129d8220",
    });
    expect(proof.boundary).toEqual({
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
    });
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.boundary)).toBe(true);
  });

  it("fails closed if the Reader starts declaring an Updates route", () => {
    const reader = dormantReader();
    const activated = {
      ...reader,
      routes: {
        ...reader.routes,
        active: [
          ...reader.routes.active,
          {
            path: "/updates/",
            target: {
              kind: "updates" as const,
              viewId: "all",
              pagination: {
                path: "/updates/{page}/",
                pageSize: 5,
              },
            },
          },
        ],
      },
    } as PublicationReaderEnvelope;

    expect(() =>
      verifyCoherencePublisherUpdatesDormancy(activated)
    ).toThrow("unexpectedly activates 1 Updates route targets");
  });

  it("fails closed on source, publication, and Reader identity drift", () => {
    const text = checkedSnapshotText();
    const sameLengthDrift = text.replace(
      "845a358b0e9659243781d60970895368da6ef770",
      "945a358b0e9659243781d60970895368da6ef770",
    );

    expect(() =>
      adaptCoherencePublisherUpdatesSnapshot(
        CURRENT_READER,
        sameLengthDrift,
      ),
    ).toThrow("snapshot text identity drifted");
    expect(() =>
      adaptCoherencePublisherUpdatesSnapshot(CURRENT_READER, `${text}\n`),
    ).toThrow("snapshot byte identity drifted");
    expect(() =>
      adaptCoherencePublisherUpdatesSnapshot(
        { ...CURRENT_READER, publicationId: "another-publication" },
        text,
      ),
    ).toThrow("does not match coherence-thesis");
    expect(() =>
      adaptCoherencePublisherUpdatesSnapshot(
        {
          ...CURRENT_READER,
          buildId:
            "not-a-build" as PublicationReaderEnvelope["buildId"],
        },
        text,
      ),
    ).toThrow("is not a SHA-256 digest");
  });

  it("produces deterministic catalog and envelope text", () => {
    const text = checkedSnapshotText();
    const first = adaptCoherencePublisherUpdatesSnapshot(
      CURRENT_READER,
      text,
    );
    const second = adaptCoherencePublisherUpdatesSnapshot(
      CURRENT_READER,
      text,
    );

    expect(second.catalogText).toBe(first.catalogText);
    expect(second.updatesDataText).toBe(first.updatesDataText);
    expect(sha256(first.catalogText)).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(sha256(first.updatesDataText)).toMatch(
      /^sha256:[0-9a-f]{64}$/u,
    );
  });
});
