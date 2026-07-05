"use client";

import {
  type CSSProperties,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  arrowLeft: number;
  left: number;
  placement: "top" | "bottom";
  ready: boolean;
  top: number;
};

const tooltipOffset = 10;
const tooltipViewportPadding = 10;
const tooltipArrowInset = 14;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function useCleanTooltip({
  label,
  shouldOpen = () => true,
  triggerRef,
}: {
  label: string;
  shouldOpen?: () => boolean;
  triggerRef: RefObject<HTMLElement | null>;
}) {
  const tooltipId = useId();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    arrowLeft: 0,
    left: 0,
    placement: "bottom",
    ready: false,
    top: 0,
  });

  const openTooltip = () => {
    if (!shouldOpen()) {
      setOpen(false);
      return;
    }
    setPosition((current) => ({ ...current, ready: false }));
    setOpen(true);
  };

  const closeTooltip = () => {
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open) return;

    let frame = 0;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const preferredLeft =
        triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      const left = clamp(
        preferredLeft,
        tooltipViewportPadding,
        Math.max(
          tooltipViewportPadding,
          viewportWidth - tooltipRect.width - tooltipViewportPadding,
        ),
      );
      const hasRoomBelow =
        triggerRect.bottom + tooltipOffset + tooltipRect.height <=
        viewportHeight - tooltipViewportPadding;
      const hasRoomAbove =
        triggerRect.top - tooltipOffset - tooltipRect.height >=
        tooltipViewportPadding;
      const placement = hasRoomBelow || !hasRoomAbove ? "bottom" : "top";
      const top =
        placement === "bottom"
          ? triggerRect.bottom + tooltipOffset
          : triggerRect.top - tooltipRect.height - tooltipOffset;
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const arrowLeft = clamp(
        triggerCenter - left,
        tooltipArrowInset,
        Math.max(tooltipArrowInset, tooltipRect.width - tooltipArrowInset),
      );

      setPosition({
        arrowLeft,
        left,
        placement,
        ready: true,
        top,
      });
    };

    const requestUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };

    // WCAG 1.4.13: hover/focus content must be dismissable without moving the
    // pointer.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    requestUpdate();
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("scroll", requestUpdate, true);
    document.addEventListener("keydown", onKeyDown);

    const resizeObserver = new ResizeObserver(requestUpdate);
    if (triggerRef.current) resizeObserver.observe(triggerRef.current);
    if (tooltipRef.current) resizeObserver.observe(tooltipRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("scroll", requestUpdate, true);
      document.removeEventListener("keydown", onKeyDown);
      resizeObserver.disconnect();
    };
  }, [open, triggerRef]);

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={`clean-tooltip clean-tooltip-${position.placement}`}
            style={
              {
                "--clean-tooltip-arrow-left": `${position.arrowLeft}px`,
                left: `${position.left}px`,
                opacity: position.ready ? 1 : 0,
                top: `${position.top}px`,
              } as CSSProperties
            }
          >
            {label}
          </div>,
          document.body,
        )
      : null;

  return {
    closeTooltip,
    describedBy: open ? tooltipId : undefined,
    openTooltip,
    tooltip,
  };
}
