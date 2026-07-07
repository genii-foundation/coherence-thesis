"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Shared open/close behavior for the toolbar popover menus (DUP-01). Every menu
// island repeated the same effect: close on an outside pointerdown, close on
// Escape, and add/remove those listeners while open. This centralizes that and
// adds focus return (A11Y-04): pressing Escape sends focus back to the trigger
// button so keyboard users are not stranded on the closed menu. Clicking
// outside intentionally does not steal focus back, so focus follows the click.
export type ToolbarMenu<C extends HTMLElement> = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  containerRef: RefObject<C | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

export function useToolbarMenu<C extends HTMLElement = HTMLDivElement>(
  { onDismiss }: { onDismiss?: () => void } = {},
): ToolbarMenu<C> {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<C | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onDismissRef.current?.();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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

  return { open, setOpen, toggle, close, containerRef, triggerRef };
}
