import type { ReactNode } from "react";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { MobilePageContextIsland } from "@/components/MobilePageContextIsland";
import { OutlineMenuIsland } from "@/components/OutlineMenuIsland";
import { PageFadeIsland } from "@/components/PageFadeIsland";
import { SearchMenuIsland } from "@/components/SearchMenuIsland";
import { ToolbarBrandIsland } from "@/components/ToolbarBrandIsland";
import { ToolbarBreadcrumbs } from "@/components/ToolbarBreadcrumbs";
import { ToolbarProgressIsland } from "@/components/ToolbarProgressIsland";
import { ToolbarSettingsIsland } from "@/components/ToolbarSettingsIsland";
import { ToolbarShareIsland } from "@/components/ToolbarShareIsland";
import { catalog, toolbarOutline } from "@/lib/manuscript-data";

const copyrightStartYear = 2026;

function copyrightYearLabel() {
  const currentYear = new Date().getFullYear();

  if (currentYear <= copyrightStartYear) {
    return `${copyrightStartYear}`;
  }

  return `${copyrightStartYear} to ${currentYear}`;
}

export function SiteShell({ children }: { children: ReactNode }) {
  // Only the slim volume identity (title, href, number) is serialized into every
  // page for the brand and mobile-context islands. The full outline tree is
  // fetched on demand when the outline menu opens (PERF-05).
  const brandVolumes = toolbarOutline().volumes.map((volume) => ({
    title: volume.title,
    href: volume.href,
    numberLabel: volume.numberLabel,
  }));
  const yearLabel = copyrightYearLabel();
  const overviewAudio = {
    sectionId: "overview",
    title: catalog.overview.title,
    text: [
      catalog.overview.subtitle,
      ...catalog.overview.nodes.map((node) => `${node.title}. ${node.summary}`),
    ].join("\n\n"),
    audioVersionId: `overview-${catalog.gitRevision}`,
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <ToolbarBrandIsland volumes={brandVolumes} />
        <ToolbarBreadcrumbs />
        <nav className="site-nav" aria-label="Primary">
          <SearchMenuIsland />
          <OutlineMenuIsland />
          <ToolbarSettingsIsland />
          <ToolbarShareIsland />
          <AudioPlayerIsland overviewAudio={overviewAudio} />
          <ToolbarProgressIsland />
        </nav>
      </header>
      <main id="main-content">
        <MobilePageContextIsland volumes={brandVolumes} />
        <PageFadeIsland>{children}</PageFadeIsland>
      </main>
      <footer className="site-footer" aria-label="Site information">
        <p>© {yearLabel} by the Providence Collective.</p>
        <p>
          Licensing:{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            rel="license"
            target="_blank"
          >
            CC BY-SA 4.0
          </a>
          .
        </p>
        <p>
          Custodians:{" "}
          <a
            href="https://www.instagram.com/allelseis"
            rel="author"
            target="_blank"
          >
            Robert James Ryan III
          </a>
          {" & "}
          <a
            href="https://aubreyfalconer.com"
            rel="author"
            target="_blank"
          >
            Aubrey Falconer
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
