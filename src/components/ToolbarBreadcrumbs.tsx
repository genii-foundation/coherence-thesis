"use client";

import { normalizePath } from "@/lib/routes";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CleanTooltip } from "@/components/CleanTooltip";
import { loadBreadcrumbShard, type BreadcrumbRoute } from "@/lib/reader-data";

function breadcrumbShardKey(path: string): string {
  return path.match(/^\/manuscripts\/([^/]+)\//)?.[1] ?? "index";
}

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

  const setLabelElement = (
    element: HTMLAnchorElement | HTMLSpanElement | null,
  ) => {
    labelRef.current = element;
  };

  return (
    <span className="breadcrumb-tooltip-trigger">
      <CleanTooltip
        label={label}
        shouldOpen={() => isTruncated(labelRef.current)}
      >
        {current ? (
          <span
            ref={setLabelElement}
            aria-current="page"
            className="breadcrumb-label"
          >
            {label}
          </span>
        ) : (
          <Link ref={setLabelElement} href={href} className="breadcrumb-label">
            {label}
          </Link>
        )}
      </CleanTooltip>
    </span>
  );
}

export function ToolbarBreadcrumbs({ className }: { className?: string } = {}) {
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);
  const shardKey = breadcrumbShardKey(currentPath);
  const [routes, setRoutes] = useState<BreadcrumbRoute[]>([]);

  // Load only the current volume's shard. It refetches only when the volume
  // changes; it is cached per key, so navigation within a volume never refetches
  // and the route lookup below just re-runs against the loaded shard.
  useEffect(() => {
    let active = true;
    loadBreadcrumbShard(shardKey)
      .then((loaded) => {
        if (active) setRoutes(loaded);
      })
      .catch(() => {
        if (active) setRoutes([]);
      });
    return () => {
      active = false;
    };
  }, [shardKey]);

  const route = routes.find(
    (candidate) => normalizePath(candidate.href) === currentPath,
  );

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
