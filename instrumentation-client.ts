import * as Sentry from "@sentry/nextjs";
import {
  filterSentryBreadcrumb,
  scrubSentryEvent,
  sentryDataCollection,
} from "./src/lib/sentry-privacy";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    beforeBreadcrumb: filterSentryBreadcrumb,
    beforeSend: scrubSentryEvent,
    dataCollection: sentryDataCollection,
    dsn,
    enableLogs: false,
    environment: process.env.NODE_ENV,
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          integration.name !== "BrowserTracing" &&
          integration.name !== "Replay" &&
          integration.name !== "BrowserSession",
      ),
    tracesSampleRate: 0,
  });
}
