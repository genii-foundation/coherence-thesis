import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryEvent,
  sentryDataCollection,
} from "./src/lib/sentry-privacy";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    beforeSend: scrubSentryEvent,
    dataCollection: sentryDataCollection,
    dsn,
    enableLogs: false,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
