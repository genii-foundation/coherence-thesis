"use client";

import { normalizePath } from "@/lib/routes";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { CleanTooltip } from "@/components/CleanTooltip";
import { brandIdentity, type BrandVolume } from "@/lib/brand-identity";

export function ToolbarBrandIsland({ volumes }: { volumes: BrandVolume[] }) {
  const pathname = usePathname();
  const brandRef = useRef<HTMLAnchorElement | HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [compactTitle, setCompactTitle] = useState(false);
  const currentPath = normalizePath(pathname);
  const { activeVolume, hasActiveVolume, kicker, title, mobileTitle } =
    brandIdentity(volumes, currentPath);
  const showCompactTitle = Boolean(activeVolume && compactTitle);
  const setBrandElement = useCallback(
    (element: HTMLAnchorElement | HTMLDivElement | null) => {
      brandRef.current = element;
    },
    [],
  );

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

  const brandClassName = [
    "brand-mark",
    activeVolume ? "brand-mark-active" : "",
    showCompactTitle ? "brand-mark-compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (activeVolume) {
    return (
      <div
        ref={setBrandElement}
        className={brandClassName}
        role="group"
        aria-label={`${kicker} ${title}`}
      >
        <Link
          href="/"
          className="brand-link brand-home-link"
          aria-label="The Coherence Thesis home"
        >
          <span className="brand-kicker">{kicker}</span>
          <span
            className="brand-title-mobile-home"
            aria-hidden="true"
          >
            <span className="brand-title-mobile-logo">
              <span className="brand-title-mobile-logo-full">
                Coherence Thesis
              </span>
              <span className="brand-title-mobile-logo-initials">CT</span>
            </span>
          </span>
        </Link>
        <CleanTooltip label={title} shouldOpen={() => showCompactTitle}>
          <Link
            href={activeVolume.href}
            className="brand-link brand-volume-link"
            aria-label={`${title} outline`}
          >
            <span className="brand-title">
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
          </Link>
        </CleanTooltip>
      </div>
    );
  }

  return (
    <CleanTooltip label={title} shouldOpen={() => showCompactTitle}>
      <Link
        ref={setBrandElement}
        href="/"
        className={brandClassName}
        aria-label={`${kicker} ${title} home`}
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
      </Link>
    </CleanTooltip>
  );
}
