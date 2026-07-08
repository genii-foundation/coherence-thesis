"use client";

import { normalizePath } from "@/lib/routes";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { brandIdentity, type BrandVolume } from "@/lib/brand-identity";

export function MobilePageContextIsland({
  volumes,
}: {
  volumes: BrandVolume[];
}) {
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);
  if (currentPath === "/") return null;

  const { kicker, title } = brandIdentity(volumes, currentPath);

  return (
    <section className="mobile-page-context" aria-label="Page context">
      <Link
        href="/"
        className="mobile-page-brand"
        aria-label={`${kicker} ${title} home`}
      >
        <span className="mobile-page-brand-kicker">{kicker}</span>
        <span className="mobile-page-brand-title">{title}</span>
      </Link>
      <ToolbarBreadcrumbs className="mobile-page-breadcrumbs" />
    </section>
  );
}
