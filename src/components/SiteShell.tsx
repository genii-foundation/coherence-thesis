import type { ReactNode } from "react";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { OutlineMenuIsland } from "@/components/OutlineMenuIsland";
import { PageFadeIsland } from "@/components/PageFadeIsland";
import { SearchMenuIsland } from "@/components/SearchMenuIsland";
import { ToolbarBrandIsland } from "@/components/ToolbarBrandIsland";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { ToolbarProgressIsland } from "@/components/ToolbarProgressIsland";
import { toolbarOutline } from "@/lib/manuscript-data";

const copyrightStartYear = 2026;

function copyrightYearLabel() {
  const currentYear = new Date().getFullYear();

  if (currentYear <= copyrightStartYear) {
    return `${copyrightStartYear}`;
  }

  return `${copyrightStartYear} to ${currentYear}`;
}

export function SiteShell({ children }: { children: ReactNode }) {
  const outline = toolbarOutline();
  const yearLabel = copyrightYearLabel();

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
          <AudioPlayerIsland />
          <ToolbarProgressIsland />
        </nav>
      </header>
      <main id="main-content">
        <PageFadeIsland>{children}</PageFadeIsland>
      </main>
      <footer className="site-footer" aria-label="Site information">
        <p>© {yearLabel} by the Providence Collective.</p>
        <p>
          Licensing:{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="license">
            CC BY-SA 4.0
          </a>
        </p>
        <p>
          Custodians:{" "}
          <a href="https://www.instagram.com/allelseis">Robert James Ryan III</a>
          {" & "}
          <a href="https://aubreyfalconer.com">Aubrey Falconer</a>.
        </p>
      </footer>
    </div>
  );
}
