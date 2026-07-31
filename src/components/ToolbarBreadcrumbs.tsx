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

function adminBreadcrumbRoute(path: string): BreadcrumbRoute | null {
  if (!path.startsWith("/admin")) return null;

  const segments = path.split("/").filter(Boolean).slice(1);
  const crumbs = [{ label: "Admin", href: "/admin/" }];

  if (segments[0] === "bench" || segments[0] === "revisions") {
    crumbs.push({
      label: "Editorial revisions",
      href: "/admin/calibration/",
    });
    if (segments[1]) {
      crumbs.push({
        label:
          segments[0] === "revisions"
            ? `Working revision: ${segments[1]}`
            : segments[1],
        href: path,
      });
    }
  }

  if (segments[0] === "debt") {
    crumbs.push({ label: "Editorial debt", href: "/admin/debt/" });
    if (segments[1]) {
      crumbs.push({ label: segments[1].toUpperCase(), href: path });
    }
  }

  return { href: path, crumbs };
}

function AdminHeaderContext({ path }: { path: string }) {
  const revisionsCurrent =
    path.startsWith("/admin/calibration") ||
    path.startsWith("/admin/bench/") ||
    path.startsWith("/admin/revisions/");
  const debtCurrent = path.startsWith("/admin/debt");

  return (
    <div className="admin-header-row">
      <nav className="admin-header-views" aria-label="Admin views">
        <Link
          href="/admin/"
          aria-current={revisionsCurrent || debtCurrent ? undefined : "page"}
        >
          Status
        </Link>
        <Link
          href="/admin/calibration/"
          aria-current={revisionsCurrent ? "page" : undefined}
        >
          Editorial revisions
        </Link>
        <Link
          href="/admin/debt/"
          aria-current={debtCurrent ? "page" : undefined}
        >
          Editorial debt
        </Link>
      </nav>
      <div
        className="admin-repository-state"
        aria-label="Local repository, read only"
      >
        <span className="admin-repository-dot" aria-hidden="true" />
        <span>Local</span>
        <span className="admin-repository-separator" aria-hidden="true">
          ·
        </span>
        <span>Read only</span>
      </div>
    </div>
  );
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
  const isAdminPath = currentPath.startsWith("/admin");
  const [routes, setRoutes] = useState<BreadcrumbRoute[]>([]);

  // Load only the current volume's shard. It refetches only when the volume
  // changes; it is cached per key, so navigation within a volume never refetches
  // and the route lookup below just re-runs against the loaded shard.
  useEffect(() => {
    if (isAdminPath) return;

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
  }, [isAdminPath, shardKey]);

  const route =
    adminBreadcrumbRoute(currentPath) ??
    routes.find(
      (candidate) => normalizePath(candidate.href) === currentPath,
    );

  if (!route || route.crumbs.length === 0) return null;

  const adminViewOwnsCurrentState = isAdminPath && route.crumbs.length === 1;
  const breadcrumbs = (
    <nav
      className={["breadcrumb-trail", className].filter(Boolean).join(" ")}
      aria-label="Breadcrumb"
    >
      <ol>
        {route.crumbs.map((crumb, index) => {
          const isCurrent =
            !adminViewOwnsCurrentState && index === route.crumbs.length - 1;
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

  if (!isAdminPath) return breadcrumbs;

  return (
    <div className="admin-header-context">
      {breadcrumbs}
      <AdminHeaderContext path={currentPath} />
    </div>
  );
}
