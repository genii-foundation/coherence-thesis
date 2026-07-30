"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const refreshIntervalMs = 5_000;

export function AdminLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, refreshIntervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <span className="sr-only" aria-live="polite">
      Repository status refreshes automatically every five seconds.
    </span>
  );
}
