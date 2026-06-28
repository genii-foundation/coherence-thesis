import Link from "next/link";
import type { ReactNode } from "react";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { OutlineMenuIsland } from "@/components/OutlineMenuIsland";
import { PageFadeIsland } from "@/components/PageFadeIsland";
import { SearchMenuIsland } from "@/components/SearchMenuIsland";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { ToolbarProgressIsland } from "@/components/ToolbarProgressIsland";
import { toolbarOutline } from "@/lib/manuscript-data";

export function SiteShell({ children }: { children: ReactNode }) {
  const outline = toolbarOutline();

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <Link href="/" className="brand-mark" aria-label="The Coherence Thesis home">
          <span className="brand-kicker">The Coherence Thesis</span>
          <span className="brand-title">The Coherence Thesis</span>
        </Link>
        <ToolbarBreadcrumbs />
        <nav className="site-nav" aria-label="Primary">
          <SearchMenuIsland />
          <OutlineMenuIsland outline={outline} />
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
