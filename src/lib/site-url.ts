// Single source of truth for the canonical public origin. Used by the root
// metadata (metadataBase), the sitemap, and robots so they cannot disagree on
// host or drift to a placeholder. Override with NEXT_PUBLIC_SITE_URL per
// environment; the fallback is the production domain, never a .local host.
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.coherence-thesis.com";

export const siteOrigin = new URL(siteUrl);

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}
