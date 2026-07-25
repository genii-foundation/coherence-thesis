import { normalizePath } from "@/lib/routes";

export type BrandVolume = {
  href: string;
  numberLabel: string;
  title: string;
};

export type BrandIdentity = {
  activeVolume: BrandVolume | undefined;
  hasActiveVolume: boolean;
  kicker: string;
  title: string;
  mobileTitle: string | undefined;
};

// The active volume and the "Volume N · Title" wording were derived
// independently in ToolbarBrandIsland and MobilePageContextIsland (DUP-08), so a
// branding change had to be applied in two places to stay consistent across
// widths. This is the single source.
export function brandIdentity(
  volumes: BrandVolume[],
  currentPath: string,
): BrandIdentity {
  const activeVolume = volumes.find((volume) =>
    currentPath.startsWith(normalizePath(volume.href)),
  );
  return {
    activeVolume,
    hasActiveVolume: Boolean(activeVolume),
    kicker: activeVolume ? "The Coherence Thesis" : "GENII Foundation",
    title: activeVolume
      ? `Volume ${activeVolume.numberLabel} · ${activeVolume.title}`
      : "The Coherence Thesis",
    mobileTitle: activeVolume ? `Volume ${activeVolume.numberLabel}` : undefined,
  };
}
