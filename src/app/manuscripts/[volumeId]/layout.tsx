import type { ReactNode } from "react";
import { CoherenceSiteFrame } from "@/components/CoherenceSiteFrame";
import { loadCoherencePublisherPreviewRuntime } from "@/publisher/preview-mode";

export default async function PublisherManuscriptLayout({
  children,
}: {
  children: ReactNode;
}) {
  const publisherRuntime = await loadCoherencePublisherPreviewRuntime();
  return (
    <CoherenceSiteFrame
      publisherOfflineAuthorityBuildId={
        publisherRuntime?.offlineAuthority.buildId ?? null
      }
    >
      {children}
    </CoherenceSiteFrame>
  );
}
