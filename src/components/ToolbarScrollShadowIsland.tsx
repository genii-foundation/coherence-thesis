"use client";

import { useEffect, useRef } from "react";

const fullShadowScrollDistance = 80;
const restingShadowOpacity = 0.025;
const scrolledShadowOpacity = 0.1;

export function ToolbarScrollShadowIsland() {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = anchorRef.current?.parentElement;
    if (!header) return;

    let frame: number | null = null;

    const updateShadow = () => {
      frame = null;
      const progress = Math.min(
        1,
        Math.max(0, window.scrollY / fullShadowScrollDistance),
      );
      const opacity =
        restingShadowOpacity +
        (scrolledShadowOpacity - restingShadowOpacity) * progress;

      header.style.setProperty("--toolbar-shadow-opacity", opacity.toFixed(3));
    };

    const requestShadowUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateShadow);
    };

    updateShadow();
    window.addEventListener("scroll", requestShadowUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", requestShadowUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
      header.style.removeProperty("--toolbar-shadow-opacity");
    };
  }, []);

  return <span ref={anchorRef} aria-hidden="true" hidden />;
}
