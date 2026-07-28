"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BookOpen, RotateCcw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="page-frame">
      <header className="page-heading">
        <p className="eyebrow">Something went wrong</p>
        <h1>This page hit an unexpected error</h1>
        <p>Your reading progress is stored locally and was not affected.</p>
      </header>
      <div className="hero-actions">
        <button className="primary-link" type="button" onClick={() => reset()}>
          <RotateCcw aria-hidden="true" size={18} />
          Try again
        </button>
        <Link className="secondary-link" href="/">
          <BookOpen aria-hidden="true" size={18} />
          Return home
        </Link>
      </div>
    </div>
  );
}
