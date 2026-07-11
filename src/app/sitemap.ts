import type { MetadataRoute } from "next";
import { catalog } from "@/lib/manuscript-data";
import { siteUrl } from "@/lib/site-url";
import {
  getUpdatesPageHref,
  getUpdatesPaginationStaticParams,
  type UpdatesMode,
} from "@/lib/updates-pagination";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const updateModes: UpdatesMode[] = ["all", "literary"];
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/overview/`,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    ...updateModes.flatMap((mode) => [
      {
        url: `${siteUrl}${getUpdatesPageHref(1, mode)}`,
        changeFrequency: "daily" as const,
        priority: mode === "all" ? 0.5 : 0.45,
      },
      ...getUpdatesPaginationStaticParams(mode).map(({ page }) => ({
        url: `${siteUrl}${getUpdatesPageHref(Number.parseInt(page, 10), mode)}`,
        changeFrequency: "daily" as const,
        priority: mode === "all" ? 0.4 : 0.35,
      })),
    ]),
  ];

  const manuscriptRoutes: MetadataRoute.Sitemap = [
    ...catalog.volumes.map((volume) => ({
      url: `${siteUrl}${volume.href}`,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    })),
    ...catalog.volumes.flatMap((volume) =>
      volume.parts.map((part) => ({
        url: `${siteUrl}${part.href}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ),
    ...catalog.volumes.flatMap((volume) =>
      volume.parts.flatMap((part) =>
        part.chapters.map((chapter) => ({
          url: `${siteUrl}${chapter.href}`,
          changeFrequency: "weekly" as const,
          priority: 0.72,
        })),
      ),
    ),
    ...catalog.sections
      .filter((section) => section.href === section.readerHref)
      .map((section) => ({
        url: `${siteUrl}${section.href}`,
        changeFrequency: "weekly" as const,
        priority: 0.64,
      })),
    // Alias routes render as duplicate copies whose canonical points at the real
    // section, so they are intentionally excluded from the sitemap.
  ];

  return [...staticRoutes, ...manuscriptRoutes];
}
