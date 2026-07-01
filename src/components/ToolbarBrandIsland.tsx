"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useCleanTooltip } from "@/components/CleanTooltip";

type BrandVolume = {
  title: string;
  href: string;
  numberLabel: string;
};

function normalizePath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function ToolbarBrandIsland({ volumes }: { volumes: BrandVolume[] }) {
  const pathname = usePathname();
  const brandRef = useRef<HTMLAnchorElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [compactTitle, setCompactTitle] = useState(false);
  const currentPath = normalizePath(pathname);
  const activeVolume = volumes.find((volume) =>
    currentPath.startsWith(normalizePath(volume.href)),
  );
  const hasActiveVolume = Boolean(activeVolume);
  const kicker = activeVolume
    ? "The Coherence Thesis"
    : "Providence Collective";
  const title = activeVolume
    ? `Volume ${activeVolume.numberLabel} · ${activeVolume.title}`
    : "The Coherence Thesis";
  const mobileTitle = activeVolume
    ? `Volume ${activeVolume.numberLabel}`
    : undefined;
  const showCompactTitle = Boolean(activeVolume && compactTitle);
  const brandTooltip = useCleanTooltip({
    label: title,
    shouldOpen: () => showCompactTitle,
    triggerRef: brandRef,
  });

  useLayoutEffect(() => {
    if (!hasActiveVolume) return;

    const brand = brandRef.current;
    const measure = measureRef.current;
    if (!brand || !measure) return;

    const updateTitleMode = () => {
      if (window.matchMedia("(max-width: 860px)").matches) {
        setCompactTitle(true);
        return;
      }

      const header = brand.closest<HTMLElement>(".site-header");
      const nav = header?.querySelector<HTMLElement>(".site-nav");
      const breadcrumbs =
        header?.querySelector<HTMLElement>(".breadcrumb-trail");
      const brandStyle = window.getComputedStyle(brand);
      const headerStyle = header ? window.getComputedStyle(header) : null;
      const maxBrandWidth = Number.parseFloat(brandStyle.maxWidth);
      const brandPadding =
        Number.parseFloat(brandStyle.paddingLeft) +
        Number.parseFloat(brandStyle.paddingRight);
      const headerPadding = headerStyle
        ? Number.parseFloat(headerStyle.paddingLeft) +
          Number.parseFloat(headerStyle.paddingRight)
        : 0;
      const headerGap = headerStyle
        ? Number.parseFloat(headerStyle.columnGap || headerStyle.gap || "0")
        : 0;
      const headerWidth = header?.clientWidth ?? window.innerWidth;
      const navWidth = nav?.getBoundingClientRect().width ?? 0;
      const breadcrumbWidth = breadcrumbs?.getBoundingClientRect().width ?? 0;
      const visibleSiblingCount = [brand, nav, breadcrumbs].filter(
        (element) => {
          if (!element) return false;
          return window.getComputedStyle(element).display !== "none";
        },
      ).length;
      const occupiedWidth =
        navWidth +
        breadcrumbWidth +
        headerGap * Math.max(visibleSiblingCount - 1, 0);
      const headerAvailableWidth =
        headerWidth - headerPadding - occupiedWidth - brandPadding;
      const maxTitleWidth = Number.isFinite(maxBrandWidth)
        ? maxBrandWidth - brandPadding
        : headerAvailableWidth;
      const availableTitleWidth = Math.max(
        0,
        Math.min(maxTitleWidth, headerAvailableWidth),
      );

      setCompactTitle(measure.scrollWidth > availableTitleWidth + 1);
    };

    const frame = window.requestAnimationFrame(updateTitleMode);

    const observer = new ResizeObserver(updateTitleMode);
    observer.observe(brand);
    const header = brand.closest<HTMLElement>(".site-header");
    if (header) observer.observe(header);
    const nav = header?.querySelector<HTMLElement>(".site-nav");
    if (nav) observer.observe(nav);
    const breadcrumbs = header?.querySelector<HTMLElement>(".breadcrumb-trail");
    if (breadcrumbs) observer.observe(breadcrumbs);
    window.addEventListener("resize", updateTitleMode);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateTitleMode);
    };
  }, [hasActiveVolume, title]);

  return (
    <Link
      ref={brandRef}
      href="/"
      className={[
        "brand-mark",
        activeVolume ? "brand-mark-active" : "",
        showCompactTitle ? "brand-mark-compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${kicker} ${title} home`}
      aria-describedby={brandTooltip.describedBy}
      onBlur={brandTooltip.closeTooltip}
      onFocus={brandTooltip.openTooltip}
      onPointerDown={brandTooltip.closeTooltip}
      onPointerEnter={brandTooltip.openTooltip}
      onPointerLeave={brandTooltip.closeTooltip}
    >
      <span className="brand-kicker">{kicker}</span>
      <span className="brand-title">
        <span className="brand-title-mobile-logo" aria-hidden="true">
          <span className="brand-title-mobile-logo-full">
            Coherence Thesis
          </span>
          <span className="brand-title-mobile-logo-initials">CT</span>
        </span>
        <span className="brand-title-full">{title}</span>
        {mobileTitle ? (
          <span className="brand-title-mobile" aria-hidden="true">
            {mobileTitle}
          </span>
        ) : null}
        {mobileTitle ? (
          <span
            className="brand-title-measure"
            ref={measureRef}
            aria-hidden="true"
          >
            {title}
          </span>
        ) : null}
      </span>
      {brandTooltip.tooltip}
    </Link>
  );
}
