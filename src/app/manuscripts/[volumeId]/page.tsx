import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { catalog, volumeByRouteSegment } from "@/lib/manuscript-data";
import { loadCoherencePublisherApplication } from "@/publisher/application";

export const dynamicParams = false;

export function generateStaticParams() {
  const params = new Map<string, { volumeId: string }>();
  for (const volume of catalog.volumes) {
    const canonical = volume.href.split("/").filter(Boolean)[1] ?? volume.volumeId;
    params.set(canonical, { volumeId: canonical });
    params.set(volume.volumeId, { volumeId: volume.volumeId });
  }
  return [...params.values()];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ volumeId: string }>;
}): Promise<Metadata> {
  const { volumeId } = await params;
  const volume = volumeByRouteSegment(volumeId);
  return {
    title: volume?.title ?? "Manuscript",
    description: volume
      ? `${volume.title}, part of The Coherence Thesis.`
      : "The Coherence Thesis manuscript.",
    alternates: volume ? { canonical: volume.href } : undefined,
  };
}

export default async function VolumePage({
  params,
}: {
  params: Promise<{ volumeId: string }>;
}) {
  const { volumeId } = await params;
  const volume = volumeByRouteSegment(volumeId);
  if (!volume) notFound();
  if (`/manuscripts/${volumeId}/` !== volume.href) redirect(volume.href);

  const application = await loadCoherencePublisherApplication();
  const resolution = application.resolveRoute(
    volume.href.split("/").filter(Boolean),
  );
  if (resolution.status !== "resolved" || resolution.page.kind !== "work") {
    notFound();
  }
  return application.renderPage(resolution.page);
}
