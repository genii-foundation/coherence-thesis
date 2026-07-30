"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./admin.module.css";

const views = [
  { href: "/admin/", label: "Status" },
  { href: "/admin/calibration/", label: "Editorial revisions" },
];

export function AdminNavigation() {
  const pathname = usePathname() ?? "/admin/";

  return (
    <nav className={styles.nav} aria-label="Admin views">
      {views.map((view) => {
        const current =
          view.href === "/admin/"
            ? pathname === "/admin" || pathname === "/admin/"
            : pathname.startsWith(view.href) || pathname.startsWith("/admin/bench/");

        return (
          <Link
            href={view.href}
            aria-current={current ? "page" : undefined}
            key={view.href}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
