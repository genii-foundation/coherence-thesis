"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AdminHeaderContext } from "@/components/ToolbarBreadcrumbs";
import { normalizePath } from "@/lib/routes";

export function AdminModeToolbarIsland({ children }: { children: ReactNode }) {
  const currentPath = normalizePath(usePathname());

  if (currentPath.startsWith("/admin")) {
    return (
      <div className="site-nav site-nav-admin">
        <AdminHeaderContext path={currentPath} placement="toolbar" />
      </div>
    );
  }

  return (
    <nav className="site-nav" aria-label="Primary">
      {children}
    </nav>
  );
}
