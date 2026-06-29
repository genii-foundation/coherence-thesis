import type { ReactNode } from "react";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { OutlineMenuIsland } from "@/components/OutlineMenuIsland";
import { PageFadeIsland } from "@/components/PageFadeIsland";
import { SearchMenuIsland } from "@/components/SearchMenuIsland";
import { ToolbarBrandIsland } from "@/components/ToolbarBrandIsland";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { ToolbarProgressIsland } from "@/components/ToolbarProgressIsland";
import { ToolbarSettingsIsland } from "@/components/ToolbarSettingsIsland";
import { toolbarOutline } from "@/lib/manuscript-data";

export function SiteShell({ children }: { children: ReactNode }) {
  const outline = toolbarOutline();

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <ToolbarBrandIsland volumes={outline.volumes} />
        <ToolbarBreadcrumbs />
        <nav className="site-nav" aria-label="Primary">
          <SearchMenuIsland />
          <OutlineMenuIsland outline={outline} />
          <ToolbarSettingsIsland />
          <AudioPlayerIsland />
          <ToolbarProgressIsland />
        </nav>
      </header>
      <main id="main-content">
        <PageFadeIsland>{children}</PageFadeIsland>
      </main>
    </div>
  );
}
