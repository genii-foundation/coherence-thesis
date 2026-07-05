"use client";

import { normalizePath } from "@/lib/routes";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";

type ContextVolume = {
  href: string;
  numberLabel: string;
  title: string;
};

export function MobilePageContextIsland({
  volumes,
}: {
  volumes: ContextVolume[];
}) {
  const pathname = usePathname();
  const currentPath = normalizePath(pathname);
  if (currentPath === "/") return null;

  const activeVolume = volumes.find((volume) =>
    currentPath.startsWith(normalizePath(volume.href)),
  );
  const kicker = activeVolume
    ? "The Coherence Thesis"
    : "Providence Collective";
  const title = activeVolume
    ? `Volume ${activeVolume.numberLabel} · ${activeVolume.title}`
    : "The Coherence Thesis";

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
