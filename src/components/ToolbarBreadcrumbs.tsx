"use client";

import { normalizePath } from "@/lib/routes";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCleanTooltip } from "@/components/CleanTooltip";
import { loadBreadcrumbRoutes, type BreadcrumbRoute } from "@/lib/reader-data";

function isTruncated(element: HTMLElement | null): boolean {
  if (!element) return false;
  return element.scrollWidth > element.clientWidth + 1;
}

function BreadcrumbTooltip({
  current,
  href,
  label,
}: {
  current: boolean;
  href: string;
  label: string;
}) {
  const labelRef = useRef<HTMLElement | null>(null);
  const labelTooltip = useCleanTooltip({
    label,
    shouldOpen: () => isTruncated(labelRef.current),
    triggerRef: labelRef,
  });

  const setLabelElement = (
    element: HTMLAnchorElement | HTMLSpanElement | null,
  ) => {
    labelRef.current = element;
  };

  return (
    <span
      className="breadcrumb-tooltip-trigger"
      onBlur={labelTooltip.closeTooltip}
      onFocus={labelTooltip.openTooltip}
      onPointerDown={labelTooltip.closeTooltip}
      onPointerEnter={labelTooltip.openTooltip}
      onPointerLeave={labelTooltip.closeTooltip}
    >
      {current ? (
        <span
          ref={setLabelElement}
          aria-current="page"
          aria-describedby={labelTooltip.describedBy}
          className="breadcrumb-label"
        >
          {label}
        </span>
      ) : (
        <Link
          ref={setLabelElement}
          href={href}
          aria-describedby={labelTooltip.describedBy}
          className="breadcrumb-label"
        >
          {label}
        </Link>
      )}
      {labelTooltip.tooltip}
    </span>
  );
}

export function ToolbarBreadcrumbs({ className }: { className?: string } = {}) {
  const pathname = usePathname();
  const [routes, setRoutes] = useState<BreadcrumbRoute[]>([]);
  const currentPath = normalizePath(pathname);
  const route =
    routes.find((candidate) => normalizePath(candidate.href) === currentPath) ??
    routes[0];

  useEffect(() => {
    let mounted = true;
    loadBreadcrumbRoutes()
      .then((loadedRoutes) => {
        if (mounted) setRoutes(loadedRoutes);
      })
      .catch(() => {
        if (mounted) setRoutes([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!route || route.crumbs.length === 0) return null;

  return (
    <nav
      className={["breadcrumb-trail", className].filter(Boolean).join(" ")}
      aria-label="Breadcrumb"
    >
      <ol>
        {route.crumbs.map((crumb, index) => {
          const isCurrent = index === route.crumbs.length - 1;
          return (
            <li key={`${crumb.href}-${index}`}>
              <BreadcrumbTooltip
                current={isCurrent}
                href={crumb.href}
                label={crumb.label}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
