import type { ReactNode } from "react";
import { copyrightYearLabel } from "@/lib/copyright";
import { CopyrightYearIsland } from "@/components/CopyrightYearIsland";
import { AudioPlayerIsland } from "@/components/AudioPlayerIsland";
import { MobilePageContextIsland } from "@/components/MobilePageContextIsland";
import { OfflineSupportIsland } from "@/components/OfflineSupportIsland";
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

// Small deterministic content hash so the overview audio id is stable across
// commits and only changes when the overview text itself changes (DOC-05).
// Using the git revision reset audio progress on every deploy.
function contentHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
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
  const yearLabel = copyrightYearLabel(copyrightStartYear);
  const overviewText = [
    catalog.overview.subtitle,
    ...catalog.overview.nodes.map((node) => `${node.title}. ${node.summary}`),
  ].join("\n\n");
  const overviewAudio = {
    sectionId: "overview",
    title: catalog.overview.title,
    text: overviewText,
    audioVersionId: `overview-${contentHash(overviewText)}`,
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <svg
        className="common-thread-texture"
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 1160 1700"
      >
        <path
          d="M400 0C396 76 360 122 362 206C366 350 522 374 486 520C454 648 650 650 692 764C756 944 520 1054 642 1198C766 1344 958 1302 992 1462C1012 1564 1060 1628 1098 1700"
          fill="none"
          stroke="currentColor"
          strokeDasharray="1 15"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <circle cx="400" cy="0" r="2.2" fill="currentColor" />
        <circle cx="1098" cy="1700" r="2.2" fill="currentColor" />
      </svg>
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
        <OfflineSupportIsland />
        <PageFadeIsland>{children}</PageFadeIsland>
      </main>
      <footer className="site-footer" aria-label="Site information">
        <p>
          ©{" "}
          <CopyrightYearIsland startYear={copyrightStartYear} fallback={yearLabel} />{" "}
          by the Providence Collective.
        </p>
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
