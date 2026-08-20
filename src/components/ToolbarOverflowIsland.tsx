"use client";

import {
  Bookmark,
  Ellipsis,
  Gauge,
  ListTree,
  Search,
  Share2,
  SlidersVertical,
  type LucideIcon,
} from "lucide-react";

import { CleanTooltip } from "@/components/CleanTooltip";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";

type OverflowOption = {
  icon: LucideIcon;
  label: string;
  selector: string;
};

const overflowOptions: OverflowOption[] = [
  { icon: Search, label: "Search", selector: ".search-menu-button" },
  { icon: ListTree, label: "Outline", selector: ".outline-menu-button" },
  {
    icon: Bookmark,
    label: "Bookmarks",
    selector: ".bookmarks-menu-button",
  },
  {
    icon: SlidersVertical,
    label: "Reader settings",
    selector: ".settings-menu-button",
  },
  {
    icon: Share2,
    label: "Share and downloads",
    selector: ".share-menu-button",
  },
  { icon: Gauge, label: "Reading progress", selector: ".progress-menu-button" },
];

export function ToolbarOverflowIsland() {
  const {
    close,
    containerRef,
    open,
    popoverProps,
    rendered,
    toggle,
    triggerProps,
    triggerRef,
  } = useToolbarMenu<HTMLDivElement>();

  function openToolbarOption(selector: string): void {
    close();
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLButtonElement>(selector);
      target?.click();
      triggerRef.current?.focus();
    });
  }

  return (
    <div className="toolbar-overflow-menu" ref={containerRef}>
      <CleanTooltip
        label="More reader options"
        shouldOpen={() => !open}
      >
        <button
          {...triggerProps}
          type="button"
          className="toolbar-overflow-button"
          aria-label="More reader options"
          aria-controls="reader-toolbar-overflow"
          onClick={toggle}
        >
          <Ellipsis aria-hidden="true" size={20} />
        </button>
      </CleanTooltip>
      {rendered && (
        <section
          {...popoverProps}
          id="reader-toolbar-overflow"
          className="reader-toolbar-overflow toolbar-overflow-popover"
          aria-label="More reader options"
        >
          {overflowOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.selector}
                type="button"
                className="toolbar-overflow-option"
                onClick={() => openToolbarOption(option.selector)}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
