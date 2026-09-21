import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { OfflineAudioRuntimeMode } from "@/lib/audio-offline-cache";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/audio-playback", () => ({
  createDefaultAudioProvider: () => ({
    cancel: vi.fn(),
    getVoices: () => [],
    isPaused: () => false,
    isSupported: () => true,
    pause: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn(),
    subscribeVoices: () => () => undefined,
  }),
}));
vi.mock("@/lib/reader-progress-store", () => ({
  appendStoredEvent: vi.fn(),
  updateStoredProgress: vi.fn(),
  useReaderProgress: () => ({ sections: {} }),
}));
vi.mock("@/lib/use-loaded-data", () => ({
  useLoadedData: (_loader: unknown, fallback: unknown) => fallback,
}));
vi.mock("@/lib/use-toolbar-menu", () => ({
  useToolbarMenu: () => ({
    containerRef: { current: null },
    popoverProps: {
      "data-menu-state": "open",
      ref: vi.fn(),
      style: { "--toolbar-menu-height": "0px" },
    },
    rendered: true,
    setOpen: vi.fn(),
    toggle: vi.fn(),
    triggerProps: {
      "aria-expanded": true,
      "data-toolbar-menu-trigger": "true",
      ref: { current: null },
    },
  }),
}));

import { AudioPlayerIsland } from "./AudioPlayerIsland";

const fallbackAudio = {
  audioVersionId: "fallback-audio",
  chapterHref: "/manuscripts/one/chapter/",
  contentHash: "0123456789abcdef",
  href: "/manuscripts/one/chapter/section/",
  readerHref: "/manuscripts/one/chapter/#section",
  sectionId: "section",
  text: "",
  title: "Fallback",
};
const overviewAudio = {
  audioVersionId: "overview-audio",
  href: "/overview/",
  sectionId: "overview",
  text: "Overview",
  title: "Overview",
};

function renderAudio(mode: OfflineAudioRuntimeMode): string {
  return renderToStaticMarkup(
    <AudioPlayerIsland
      fallbackAudio={fallbackAudio}
      offlineRuntimeMode={mode}
      overviewAudio={overviewAudio}
    />,
  );
}

describe("Audio Player offline authority UI", () => {
  it("omits the download panel when embedded authority is unavailable", () => {
    const markup = renderAudio({ kind: "unavailable" });

    expect(markup).not.toContain("Offline manuscript downloads");
    expect(markup).not.toContain("Download manuscripts");
  });

  it.each<OfflineAudioRuntimeMode>([
    { kind: "coherence-reader" },
    {
      buildId:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "publisher-embedded",
    },
  ])("retains the download panel for $kind mode", (mode) => {
    const markup = renderAudio(mode);

    expect(markup).toContain('aria-label="Offline manuscript downloads"');
    expect(markup).toContain("Download manuscripts");
  });
});
