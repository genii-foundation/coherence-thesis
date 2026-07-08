"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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

export type ToolbarMenu<C extends HTMLElement> = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  containerRef: RefObject<C | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  triggerProps: ToolbarMenuTriggerProps;
};

export function useToolbarMenu<C extends HTMLElement = HTMLDivElement>(
  { floatingRefs = [], onDismiss, onEscape }: ToolbarMenuOptions = {},
): ToolbarMenu<C> {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<C | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const floatingRefsRef = useRef(floatingRefs);
  const onDismissRef = useRef(onDismiss);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    floatingRefsRef.current = floatingRefs;
    onDismissRef.current = onDismiss;
    onEscapeRef.current = onEscape;
  });

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const isInsideContainer = containerRef.current?.contains(target);
      const isInsideFloatingElement = floatingRefsRef.current.some((ref) =>
        ref.current?.contains(target),
      );
      if (!isInsideContainer && !isInsideFloatingElement) {
        setOpen(false);
        onDismissRef.current?.();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (onEscapeRef.current?.() === false) return;
      setOpen(false);
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
  }, [open]);

  return {
    open,
    setOpen,
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
  };
}
