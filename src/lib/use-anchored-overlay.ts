"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

// Shared tracking for floating bubbles that hang off a piece of the page: the
// word playback tooltip today, any tooltip of that style later. A bubble placed
// from a rect captured when it opened drifts away from its text the moment the
// reader scrolls, and it keeps hanging in the viewport long after its anchor has
// scrolled off. Measuring the anchor live on scroll, resize, and reflow keeps
// the bubble glued to its text. Reporting null once the anchor leaves the
// viewport lets the caller drop the bubble until the anchor scrolls back.
//
// Radix tooltips get the same two behaviours from `hideWhenDetached`, so they do
// not need this hook. Use it for bubbles positioned by hand.

export type AnchoredOverlayBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

// The site header is sticky, so the top of the viewport is not the top of what
// the reader can see. An anchor that has slid under the header is out of view
// and its bubble should go with it. A header that is not pinned scrolls away
// and stops occluding anything, which this reads for free.
function occludedTop(): number {
  const header = document.querySelector(".site-header");
  if (!header) return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

function measure(anchor: Element): AnchoredOverlayBox | null {
  const rect = anchor.getBoundingClientRect();
  // A collapsed rect means the anchor is display:none or detached from layout.
  if (rect.width === 0 && rect.height === 0) return null;
  const inView =
    rect.bottom > occludedTop() &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth;
  if (!inView) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function sameBox(
  first: AnchoredOverlayBox | null,
  second: AnchoredOverlayBox | null,
): boolean {
  if (first === null || second === null) return first === second;
  return (
    first.left === second.left &&
    first.top === second.top &&
    first.right === second.right &&
    first.bottom === second.bottom
  );
}

export function useAnchoredOverlay(
  anchor: Element | null,
): AnchoredOverlayBox | null {
  // Element geometry is external state that React cannot see, which is what
  // useSyncExternalStore is for. The snapshot has to keep its identity while the
  // geometry holds still, so the last box is cached and only replaced when the
  // anchor has actually moved.
  const boxRef = useRef<AnchoredOverlayBox | null>(null);

  const subscribe = useCallback(
    (onGeometryChange: () => void) => {
      if (anchor === null) return () => undefined;

      // Scroll and resize fire faster than the compositor paints, so the
      // notification is coalesced onto the next frame the way the toolbar menus
      // coalesce their own measurements.
      let frame: number | null = null;
      const schedule = () => {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          onGeometryChange();
        });
      };

      // Capture phase so a scroll inside any nested scroller counts, not just
      // the document's own.
      window.addEventListener("scroll", schedule, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", schedule);
      // The anchor's own box changes when the reader switches type size, and the
      // document's changes on any reflow that moves the anchor without a scroll.
      const anchorObserver = new ResizeObserver(schedule);
      anchorObserver.observe(anchor);
      const documentObserver = new ResizeObserver(schedule);
      documentObserver.observe(document.documentElement);

      return () => {
        window.removeEventListener("scroll", schedule, { capture: true });
        window.removeEventListener("resize", schedule);
        anchorObserver.disconnect();
        documentObserver.disconnect();
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    },
    [anchor],
  );

  const getSnapshot = useCallback(() => {
    const next = anchor === null ? null : measure(anchor);
    if (!sameBox(boxRef.current, next)) boxRef.current = next;
    return boxRef.current;
  }, [anchor]);

  // Nothing floats before hydration, so the server has no box to report.
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
