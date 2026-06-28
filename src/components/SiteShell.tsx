import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ListTree } from "lucide-react";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { ToolbarProgressIsland } from "@/components/ToolbarProgressIsland";

export function SiteShell({ children }: { children: ReactNode }) {
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
          <Link href="/overview/">
            <ListTree aria-hidden="true" size={17} />
            <span className="nav-label">Overview</span>
          </Link>
          <Link href="/manuscripts/">
            <BookOpen aria-hidden="true" size={17} />
            <span className="nav-label">Manuscripts</span>
          </Link>
          <AudioPlayerIsland />
          <ToolbarProgressIsland />
        </nav>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
