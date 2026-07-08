"use client";

import { useSyncExternalStore } from "react";
import { copyrightYearLabel } from "@/lib/copyright";

const noopSubscribe = () => () => {};

// The shell is statically prerendered, so a build-time copyright year would go
// stale until the next deploy (DOC-08). useSyncExternalStore renders the
// build-time label on the server and for the first client paint (no hydration
// mismatch), then the live current-year label thereafter.
export function CopyrightYearIsland({
  startYear,
  fallback,
}: {
  startYear: number;
  fallback: string;
}) {
  const label = useSyncExternalStore(
    noopSubscribe,
    () => copyrightYearLabel(startYear),
    () => fallback,
  );
  return <>{label}</>;
}
