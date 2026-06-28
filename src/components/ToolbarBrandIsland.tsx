"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const currentPath = normalizePath(pathname);
  const activeVolume = volumes.find((volume) =>
    currentPath.startsWith(normalizePath(volume.href)),
  );
  const kicker = activeVolume ? "The Coherent Thesis" : "Providence Collective";
  const title = activeVolume
    ? `V${activeVolume.numberLabel} · ${activeVolume.title}`
    : "The Coherence Thesis";

  return (
    <Link href="/" className="brand-mark" aria-label={`${kicker} ${title} home`}>
      <span className="brand-kicker">{kicker}</span>
      <span className="brand-title">{title}</span>
    </Link>
  );
}
