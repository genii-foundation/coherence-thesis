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

    // Next's client router asks the server for an RSC response before changing
    // pages. A completed offline package contains the exact server-rendered
    // documents instead, so force ordinary document navigation while offline.
    // This preserves the same no-JavaScript reader markup and lets the service
    // worker answer from the selected manuscript's package.
    const navigateFromOfflinePackage = (event: MouseEvent) => {
      if (navigator.onLine || event.defaultPrevented || event.button !== 0)
        return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      window.location.assign(url.href);
    };

    document.addEventListener("click", navigateFromOfflinePackage, true);
    return () => {
      document.removeEventListener("click", navigateFromOfflinePackage, true);
    };
  }, []);

  return null;
}
