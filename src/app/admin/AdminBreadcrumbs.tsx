"use client";

import { usePathname } from "next/navigation";

import styles from "./admin.module.css";

const LABELS: Record<string, string> = {
  calibration: "Calibration",
  bench: "Calibration",
};

/**
 * Wayfinding for the admin surface, matching the reader's trail rather than inventing a
 * second one. A layout does not receive the pathname, so this reads it on the client.
 *
 * The bench sits at /admin/bench/<section> but belongs under Calibration, which is where
 * it is reached from and where its session is listed. The trail says so rather than
 * mirroring the route, because a breadcrumb describes where you are in the work, not
 * where the files happen to live.
 */
export function AdminBreadcrumbs() {
  const pathname = usePathname() ?? "/admin/";
  const segments = pathname.split("/").filter(Boolean).slice(1);

  const crumbs: { label: string; href: string | null }[] = [
    { label: "Workbench", href: segments.length ? "/admin/" : null },
  ];

  if (segments[0] === "bench") {
    crumbs.push({ label: "Calibration", href: "/admin/calibration/" });
    if (segments[1]) crumbs.push({ label: segments[1], href: null });
  } else if (segments[0]) {
    crumbs.push({ label: LABELS[segments[0]] ?? segments[0], href: null });
  }

  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`}>
            {crumb.href ? (
              <a href={crumb.href}>{crumb.label}</a>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
