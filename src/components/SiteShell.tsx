import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ListTree } from "lucide-react";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { ToolbarProgressIsland } from "@/components/ToolbarProgressIsland";
import { allSections, breadcrumbRoutes, catalog, progressSections } from "@/lib/manuscript-data";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <Link href="/" className="brand-mark" aria-label="The Coherence Thesis home">
          <span className="brand-kicker">The Coherence Thesis</span>
          <span className="brand-title">Providence Imperative</span>
        </Link>
        <ToolbarBreadcrumbs routes={breadcrumbRoutes()} />
        <nav className="site-nav" aria-label="Primary">
          <Link href="/overview/">
            <ListTree aria-hidden="true" size={17} />
            <span className="nav-label">Overview</span>
          </Link>
          <Link href={catalog.volumes[0]?.href ?? "/manuscripts/providence-imperative/"}>
            <BookOpen aria-hidden="true" size={17} />
            <span className="nav-label">Manuscript</span>
          </Link>
          <AudioPlayerIsland sections={allSections()} />
          <ToolbarProgressIsland allSections={progressSections()} />
        </nav>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
