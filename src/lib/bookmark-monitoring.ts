"use client";

import * as Sentry from "@sentry/nextjs";
import {
  bookmarksByteSize,
  isLiveBookmark,
  liveBookmarkCount,
  type ReaderBookmarksState,
} from "./reader-bookmarks";

export type BookmarkOperation =
  | "add"
  | "edit_note"
  | "open_menu"
  | "remove"
  | "remove_all"
  | "sync_merge"
  | "update_note"
  | "unspecified";

type BookmarkOperationPhase = "complete" | "failed" | "start";

function diagnosticContext(state: ReaderBookmarksState) {
  const records = Object.values(state.bookmarks);
  const viewport =
    typeof window === "undefined"
      ? { height: 0, width: 0 }
      : {
          height: window.innerHeight,
          width: window.innerWidth,
        };
  const touch =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  return {
    live_count: liveBookmarkCount(state),
    record_count: records.length,
    storage_bytes: bookmarksByteSize(state),
    tombstone_count: records.filter((bookmark) => !isLiveBookmark(bookmark))
      .length,
    touch,
    viewport_height: viewport.height,
    viewport_width: viewport.width,
  };
}

export function recordBookmarkOperation(
  operation: BookmarkOperation,
  phase: BookmarkOperationPhase,
  state: ReaderBookmarksState,
) {
  try {
    Sentry.addBreadcrumb({
      category: "coherence.bookmark",
      data: {
        operation,
        phase,
        ...diagnosticContext(state),
      },
      level: phase === "failed" ? "error" : "info",
      message: `${operation}:${phase}`,
    });
  } catch {
    // Monitoring must never interfere with a reader operation.
  }
}

export function captureBookmarkOperationError(
  operation: BookmarkOperation,
  error: unknown,
  state: ReaderBookmarksState,
) {
  recordBookmarkOperation(operation, "failed", state);
  try {
    Sentry.withScope((scope) => {
      scope.setTag("bookmark.operation", operation);
      scope.setTag("bookmark.phase", "failed");
      Sentry.captureException(error);
    });
  } catch {
    // Preserve the original failure even if monitoring itself is unavailable.
  }
}
