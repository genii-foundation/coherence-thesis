import { describe, expect, it } from "vitest";
import {
  filterSentryBreadcrumb,
  scrubSentryEvent,
  sentryDataCollection,
} from "./sentry-privacy";

describe("Sentry privacy", () => {
  it("disables every sensitive automatic collection category", () => {
    expect(sentryDataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });

  it("drops automatic breadcrumbs and retains only aggregate bookmark data", () => {
    expect(
      filterSentryBreadcrumb({
        category: "ui.click",
        message: "Remove bookmark: private quoted passage",
      }),
    ).toBeNull();

    expect(
      filterSentryBreadcrumb({
        category: "coherence.bookmark",
        message: "private note text",
        data: {
          operation: "update_note",
          phase: "failed",
          live_count: 4,
          quote: "private quoted passage",
        },
      }),
    ).toEqual({
      category: "coherence.bookmark",
      data: {
        operation: "update_note",
        phase: "failed",
        live_count: 4,
      },
      level: undefined,
      message: "update_note:failed",
      timestamp: undefined,
      type: undefined,
    });
  });

  it("removes reader identity, content, routes, request data, and error messages", () => {
    const scrubbed = scrubSentryEvent({
      type: undefined,
      message: "private note text",
      fingerprint: ["private note text"],
      logentry: { message: "private quoted passage" },
      request: {
        url: "https://www.coherence-thesis.com/manuscripts/private-route/",
        data: { note: "private note text" },
        headers: { authorization: "secret" },
      },
      transaction: "/manuscripts/volume-1/private-section/",
      user: { email: "reader@example.com" },
      extra: { quote: "private quoted passage" },
      tags: {
        "bookmark.operation": "update_note",
        section: "private-section",
      },
      contexts: {
        browser: { name: "Mobile Safari", version: "18" },
        device: { model: "iPhone" },
        custom: { quote: "private quoted passage" },
      },
      exception: {
        values: [
          {
            type: "QuotaExceededError",
            value: "private quoted passage",
            mechanism: {
              type: "onerror",
              handled: false,
              data: { target: "private note text" },
            },
            stacktrace: {
              frames: [
                {
                  filename: "app.js",
                  function: "writeStoredBookmarks",
                  vars: { note: "private note text" },
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { to: "/manuscripts/private-route/" },
        },
        {
          category: "coherence.bookmark",
          data: {
            operation: "update_note",
            phase: "failed",
            storage_bytes: 2048,
          },
        },
      ],
    });

    expect(scrubbed).toMatchObject({
      transaction: "reader-page",
      tags: { "bookmark.operation": "update_note" },
      contexts: {
        browser: { name: "Mobile Safari", version: "18" },
        device: { model: "iPhone" },
      },
      exception: {
        values: [
          {
            type: "QuotaExceededError",
            value: undefined,
            mechanism: {
              type: "onerror",
              handled: false,
              data: undefined,
            },
            stacktrace: {
              frames: [
                {
                  filename: "app.js",
                  function: "writeStoredBookmarks",
                  vars: undefined,
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        {
          category: "coherence.bookmark",
          message: "update_note:failed",
          data: {
            operation: "update_note",
            phase: "failed",
            storage_bytes: 2048,
          },
        },
      ],
    });
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.fingerprint).toBeUndefined();
    expect(scrubbed.message).toBeUndefined();
    expect(scrubbed.logentry).toBeUndefined();
    expect(scrubbed.tags).not.toHaveProperty("section");
    expect(scrubbed.contexts).not.toHaveProperty("custom");
  });

  it("keeps API transaction names while hiding reader routes", () => {
    expect(
      scrubSentryEvent({ type: undefined, transaction: "/api/account" })
        .transaction,
    ).toBe("/api/account");
  });
});
