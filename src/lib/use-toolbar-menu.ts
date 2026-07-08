"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const toolbarMenuAnimationMs = 180;

// Shared open/close behavior for the toolbar popover menus (DUP-01). Every menu
// island repeated the same effect: close on an outside pointerdown, close on
// Escape, and add/remove those listeners while open. This centralizes that and
// adds focus return (A11Y-04): pressing Escape sends focus back to the trigger
// button so keyboard users are not stranded on the closed menu. Clicking
// outside intentionally does not steal focus back, so focus follows the click.
type ToolbarMenuOptions = {
  floatingRefs?: Array<RefObject<HTMLElement | null>>;
  onDismiss?: () => void;
  onEscape?: () => boolean | void;
};

type ToolbarMenuTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>;
  "aria-expanded": boolean;
  "data-menu-open"?: "true";
  "data-toolbar-menu-trigger": "true";
};

type ToolbarMenuPopoverProps = {
  ref: (element: HTMLElement | null) => void;
  "aria-hidden"?: true;
  "data-menu-state": "open" | "closing";
  style: CSSProperties;
};

export type ToolbarMenu<C extends HTMLElement> = {
  open: boolean;
  rendered: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  containerRef: RefObject<C | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  triggerProps: ToolbarMenuTriggerProps;
  popoverProps: ToolbarMenuPopoverProps;
};

export function useToolbarMenu<C extends HTMLElement = HTMLDivElement>(
  { floatingRefs = [], onDismiss, onEscape }: ToolbarMenuOptions = {},
): ToolbarMenu<C> {
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [menuState, setMenuState] = useState<"open" | "closing">("closing");
  const [menuHeight, setMenuHeight] = useState(0);
  const openRef = useRef(open);
  const containerRef = useRef<C | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const floatingRefsRef = useRef(floatingRefs);
  const popoverRef = useRef<HTMLElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  const onEscapeRef = useRef(onEscape);
  const transitionFrameRef = useRef<number | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    floatingRefsRef.current = floatingRefs;
    onDismissRef.current = onDismiss;
    onEscapeRef.current = onEscape;
  });

  const clearTransitionFrame = useCallback(() => {
    if (transitionFrameRef.current === null) return;
    window.cancelAnimationFrame(transitionFrameRef.current);
    transitionFrameRef.current = null;
  }, []);

  const clearMeasureFrame = useCallback(() => {
    if (measureFrameRef.current === null) return;
    window.cancelAnimationFrame(measureFrameRef.current);
    measureFrameRef.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const measurePopover = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    setMenuHeight(popover.scrollHeight);
  }, []);

  const scheduleMeasure = useCallback(() => {
    clearMeasureFrame();
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      measurePopover();
    });
  }, [clearMeasureFrame, measurePopover]);

  const beginOpen = useCallback(() => {
    clearCloseTimer();
    clearMeasureFrame();
    clearTransitionFrame();
    openRef.current = true;
    setRendered(true);
    setMenuState("closing");
    setMenuHeight(0);
    setOpen(true);
  }, [clearCloseTimer, clearMeasureFrame, clearTransitionFrame]);

  const beginClose = useCallback(() => {
    clearCloseTimer();
    clearMeasureFrame();
    clearTransitionFrame();
    measurePopover();
    openRef.current = false;
    setMenuState("closing");
    setOpen(false);
    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = null;
      setMenuHeight(0);
    });
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setRendered(false);
    }, toolbarMenuAnimationMs);
  }, [
    clearCloseTimer,
    clearMeasureFrame,
    clearTransitionFrame,
    measurePopover,
  ]);

  const setMenuOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen === openRef.current) return;
      if (nextOpen) beginOpen();
      else beginClose();
    },
    [beginClose, beginOpen],
  );
  const close = beginClose;
  const toggle = useCallback(() => {
    if (open) beginClose();
    else beginOpen();
  }, [beginClose, beginOpen, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const isInsideContainer = containerRef.current?.contains(target);
      const isInsideFloatingElement = floatingRefsRef.current.some((ref) =>
        ref.current?.contains(target),
      );
      if (!isInsideContainer && !isInsideFloatingElement) {
        beginClose();
        onDismissRef.current?.();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (onEscapeRef.current?.() === false) return;
      beginClose();
      onDismissRef.current?.();
      // Escape is a keyboard dismissal; return focus to the trigger.
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [beginClose, open]);

  useEffect(() => {
    if (!open || !rendered) return;
    clearTransitionFrame();
    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = null;
      measurePopover();
      setMenuState("open");
    });
  }, [clearTransitionFrame, measurePopover, open, rendered]);

  useEffect(() => {
    if (!open || !rendered) return;
    const popover = popoverRef.current;
    if (!popover) return;

    scheduleMeasure();
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(popover, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [open, rendered, scheduleMeasure]);

  useEffect(() => {
    return () => {
      clearMeasureFrame();
      clearTransitionFrame();
      clearCloseTimer();
    };
  }, [clearCloseTimer, clearMeasureFrame, clearTransitionFrame]);

  return {
    open,
    rendered,
    setOpen: setMenuOpen,
    toggle,
    close,
    containerRef,
    triggerRef,
    triggerProps: {
      ref: triggerRef,
      "aria-expanded": open,
      "data-menu-open": open ? "true" : undefined,
      "data-toolbar-menu-trigger": "true",
    },
    popoverProps: {
      ref: (element) => {
        popoverRef.current = element;
      },
      "aria-hidden": open ? undefined : true,
      "data-menu-state": menuState,
      style: {
        "--toolbar-menu-height": `${menuHeight}px`,
      } as CSSProperties,
    },
  };
}
