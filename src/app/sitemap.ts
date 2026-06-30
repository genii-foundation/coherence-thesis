import type { MetadataRoute } from "next";
import { catalog } from "@/lib/manuscript-data";

export const dynamic = "force-static";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://coherence-thesis.local";

export default function sitemap(): MetadataRoute.Sitemap {
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
    ...catalog.sections.map((section) => ({
      url: `${siteUrl}${section.href}`,
      changeFrequency: "weekly" as const,
      priority: 0.64,
    })),
    ...catalog.aliases.map((alias) => ({
      url: `${siteUrl}${alias.sourceHref}`,
      changeFrequency: "monthly" as const,
      priority: 0.32,
    })),
  ];

  return [...staticRoutes, ...manuscriptRoutes];
}
