"use client";

import { usePathname } from "next/navigation";
import { ProgressCloudBadge } from "@/components/ProgressCloudBadge";

const toolbarCloudValues = [1, 25, 50, 100];

export function ProgressToolbarPreviewIsland() {
  const pathname = usePathname();
  if (pathname !== "/progress-preview" && pathname !== "/progress-preview/") {
    return null;
  }

  return (
    <aside
      className="progress-preview-toolbar-clouds"
      aria-label="Temporary toolbar cloud previews"
    >
      {toolbarCloudValues.map((percent) => (
        <ProgressCloudBadge connected key={percent} percent={percent} />
      ))}
    </aside>
  );
}
