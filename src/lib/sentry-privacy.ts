import type {
  Breadcrumb,
  ErrorEvent,
} from "@sentry/nextjs";

const allowedContextKeys = ["browser", "device", "os", "runtime"] as const;
const allowedBookmarkDataKeys = new Set([
  "live_count",
  "operation",
  "phase",
  "record_count",
  "storage_bytes",
  "tombstone_count",
  "touch",
  "viewport_height",
  "viewport_width",
]);
const allowedBookmarkTagKeys = new Set([
  "bookmark.operation",
  "bookmark.phase",
]);

export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: false,
    response: false,
  },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: {
    document: false,
    variables: false,
  },
  genAI: {
    inputs: false,
    outputs: false,
  },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 5,
};

function privateTransactionName(transaction: string | undefined) {
  if (!transaction) return undefined;
  return transaction.startsWith("/api/") ? transaction : "reader-page";
}

function safeBookmarkBreadcrumb(
  breadcrumb: Breadcrumb,
): Breadcrumb | null {
  if (breadcrumb.category !== "coherence.bookmark") return null;

  const data = Object.fromEntries(
    Object.entries(breadcrumb.data ?? {}).filter(
      ([key, value]) =>
        allowedBookmarkDataKeys.has(key) &&
        (typeof value === "boolean" ||
          typeof value === "number" ||
          typeof value === "string"),
    ),
  );

  return {
    category: "coherence.bookmark",
    data,
    level: breadcrumb.level,
    message:
      typeof data.operation === "string" && typeof data.phase === "string"
        ? `${data.operation}:${data.phase}`
        : "bookmark-operation",
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
  };
}

export function filterSentryBreadcrumb(
  breadcrumb: Breadcrumb,
): Breadcrumb | null {
  return safeBookmarkBreadcrumb(breadcrumb);
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const contexts = Object.fromEntries(
    allowedContextKeys.flatMap((key) =>
      event.contexts?.[key] ? [[key, event.contexts[key]]] : [],
    ),
  );
  const tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([key]) =>
      allowedBookmarkTagKeys.has(key),
    ),
  );
  const breadcrumbs =
    event.breadcrumbs
      ?.map(safeBookmarkBreadcrumb)
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null) ??
    [];
  const exception = event.exception
    ? {
        values: event.exception.values?.map((value) => ({
          ...value,
          mechanism: value.mechanism
            ? { ...value.mechanism, data: undefined }
            : undefined,
          stacktrace: value.stacktrace
            ? {
                ...value.stacktrace,
                frames: value.stacktrace.frames?.map((frame) => ({
                  ...frame,
                  vars: undefined,
                })),
              }
            : undefined,
          value: undefined,
        })),
      }
    : undefined;

  return {
    ...event,
    breadcrumbs,
    contexts,
    exception,
    extra: undefined,
    fingerprint: undefined,
    logentry: undefined,
    message: undefined,
    request: undefined,
    tags,
    transaction: privateTransactionName(event.transaction),
    user: undefined,
  };
}
