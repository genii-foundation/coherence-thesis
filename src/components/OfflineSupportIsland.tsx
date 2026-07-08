"use client";

import { useEffect } from "react";

export function OfflineSupportIsland() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const { protocol, hostname } = window.location;
    const canRegister =
      protocol === "https:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";
    if (!canRegister) return;
    navigator.serviceWorker.register("/offline-sw.js").catch(() => undefined);
  }, []);

  return null;
}
