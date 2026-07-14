"use client";

import { normalizePath } from "@/lib/routes";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw,
} from "lucide-react";
import {
  emptyAudioClipManifest,
} from "@/lib/audio-manifest";
import {
  buildOfflineAudioPacks,
  cacheOfflineAudioPack,
  inspectOfflineAudioPack,
  type OfflineAudioDownloadProgress,
  type OfflineAudioPackStatus,
} from "@/lib/audio-offline-cache";
import {
  defaultVoicePreference,
  type AudioQueueItem,
  type AudioVoicePreference,
} from "@/lib/audio-queue";
import {
  audioVoiceMenuGroups,
  selectableVoiceIds,
} from "@/lib/audio-voices";
import {
  createDefaultAudioProvider,
  type AudioPlaybackProgress,
  type AudioPlaybackVoice,
} from "@/lib/audio-playback";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";
import { audioWordIdForCharIndex } from "@/lib/audio-word-anchors";
import {
  loadProgressSections,
  loadReaderSections,
  loadAudioClipManifest,
  loadToolbarOutline,
  type ProgressSectionData,
  type ToolbarOutlineData,
} from "@/lib/reader-data";
import { readerFragmentTarget } from "@/lib/reader-fragments";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  readStoredProgress,
  useReaderProgress,
  updateStoredProgress,
} from "@/lib/reader-progress-store";
import { isSectionRead, recordAudioSeconds } from "@/lib/reader-state";
import {
  readVoicePreference,
  writeVoicePreference,
} from "@/lib/audio-preferences";
import { useLoadedData } from "@/lib/use-loaded-data";

const emptyProgressSections: ProgressSectionData[] = [];
const emptyToolbarOutline: ToolbarOutlineData = {
  home: { title: "Home", href: "/" },
  overview: { title: "Overview", href: "/overview/" },
  volumes: [],
};
const emptyOfflineStatuses: Record<string, OfflineAudioPackStatus> = {};
const formatter = new Intl.NumberFormat("en-US");
const waveformInitialScales = [0.82, 1, 0.76, 0.9] as const;
const waveformCenters = [0.88, 0.88, 0.84, 0.91] as const;
const waveformAmplitudes = [0.221, 0.12, 0.1955, 0.2295] as const;
const waveformPhaseOffsets = [0, 1.9, 3.8, 5.1] as const;
const playbackShellTriangle = [
  16.8, 12.1, 17.5, 12.1, 18.2, 12.3, 19, 12.8, 34.5, 21.6, 37.2,
  23.1, 37.2, 24.9, 34.4, 26.6, 18.7, 35.4, 15.7, 37.1, 13.2, 35.6,
  13.1, 32.1, 13.4, 16.2, 13.5, 13.6, 14.9, 12.1, 16.8, 12.1,
] as const;
const playbackShellSquare = [
  17.2, 11.2, 14.22, 11.2, 11.8, 13.62, 11.8, 16.6, 11.8, 31.4, 11.8,
  34.38, 14.22, 36.8, 17.2, 36.8, 30.8, 36.8, 33.78, 36.8, 36.2,
  34.38, 36.2, 31.4, 36.2, 16.6, 36.2, 13.62, 33.78, 11.2, 30.8, 11.2,
] as const;
const playbackShellTriangleScale = 1.2;
const playbackShellSquareScale = 0.96;
const playbackShellCenter = 24;
const audioStartFromWordEventName = "coherence:audio-start-word";
const audioProgressEventName = "coherence:audio-progress";

type AudioStartFromWordEventDetail = {
  sectionId: string;
  charIndex: number;
  wordId: string;
};

type PlaybackLocation = {
  sectionId: string;
  bodyCharIndex: number;
  wordId?: string;
};

type ProgressAudioQueueItem = AudioQueueItem &
  Pick<ProgressSectionData, "contentHash">;

type SpeakAudio = (
  index?: number,
  playbackPreference?: AudioVoicePreference,
  queueItems?: AudioQueueItem[],
  startBodyCharIndex?: number,
  startWordId?: string,
) => Promise<void>;

function audioPreferencesEqual(
  left: AudioVoicePreference,
  right: AudioVoicePreference,
): boolean {
  return (
    left.voiceURI === right.voiceURI &&
    left.rate === right.rate &&
    left.pitch === right.pitch
  );
}

function scalePlaybackShellCoordinate(value: number, scale: number): number {
  return playbackShellCenter + (value - playbackShellCenter) * scale;
}

function playbackShellPath(progress: number): string {
  const values = playbackShellTriangle.map((start, index) => {
    const end = playbackShellSquare[index] ?? start;
    const scaledStart = scalePlaybackShellCoordinate(
      start,
      playbackShellTriangleScale,
    );
    const scaledEnd = scalePlaybackShellCoordinate(end, playbackShellSquareScale);
    return (scaledStart + (scaledEnd - scaledStart) * progress).toFixed(3);
  });
  return [
    `M${values[0]} ${values[1]}`,
    `C${values[2]} ${values[3]} ${values[4]} ${values[5]} ${values[6]} ${values[7]}`,
    `L${values[8]} ${values[9]}`,
    `C${values[10]} ${values[11]} ${values[12]} ${values[13]} ${values[14]} ${values[15]}`,
    `L${values[16]} ${values[17]}`,
    `C${values[18]} ${values[19]} ${values[20]} ${values[21]} ${values[22]} ${values[23]}`,
    `L${values[24]} ${values[25]}`,
    `C${values[26]} ${values[27]} ${values[28]} ${values[29]} ${values[30]} ${values[31]}`,
    "Z",
  ].join(" ");
}

function visibleAudioWordId(
  sectionId: string,
  charIndex: number,
): string | undefined {
  if (!("CSS" in window) || typeof CSS.escape !== "function") return undefined;
  const words = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-audio-word='true'][data-audio-section-id='${CSS.escape(sectionId)}']`,
    ),
  );
  const word = words.find((candidate) => {
    const start = Number.parseInt(candidate.dataset.audioCharStart ?? "", 10);
    const end = Number.parseInt(candidate.dataset.audioCharEnd ?? "", 10);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      charIndex >= start &&
      charIndex <= end
    );
  });
  return word?.dataset.audioWordId;
}

function playbackWordId(
  sectionId: string,
  text: string,
  charIndex: number,
): string | undefined {
  return (
    visibleAudioWordId(sectionId, charIndex) ??
    audioWordIdForCharIndex({ sectionId, text, charIndex })
  );
}

function waveformSample(now: number, index: number): number {
  const center = waveformCenters[index] ?? 0.9;
  const amplitude = waveformAmplitudes[index] ?? 0.24;
  const phase = waveformPhaseOffsets[index] ?? 0;
  return center + Math.sin(now * 0.006 + phase) * amplitude;
}

function usePlaybackWaveform(playing: boolean): number[] {
  const [scales, setScales] = useState<number[]>(() => [...waveformInitialScales]);
  const scalesRef = useRef<number[]>([...waveformInitialScales]);
  const holdRef = useRef<number[]>([...waveformInitialScales]);
  const amplitudeRef = useRef(0);
  const targetPlayingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const animateRef = useRef<(now: number) => void>(() => undefined);

  const publishScales = useCallback((next: number[]) => {
    scalesRef.current = next;
    setScales((current) =>
      current.some((value, index) => Math.abs(value - next[index]!) > 0.003)
        ? next
        : current,
    );
  }, []);

  const animate = useCallback(
    (now: number) => {
      const lastFrameAt = lastFrameAtRef.current ?? now;
      const delta = Math.min(64, Math.max(0, now - lastFrameAt));
      lastFrameAtRef.current = now;
      const targetAmplitude = targetPlayingRef.current ? 1 : 0;
      const rampDuration = targetPlayingRef.current ? 210 : 110;
      const ease = 1 - Math.exp(-delta / rampDuration);
      const amplitude =
        amplitudeRef.current + (targetAmplitude - amplitudeRef.current) * ease;
      amplitudeRef.current =
        !targetPlayingRef.current && amplitude < 0.012 ? 0 : amplitude;

      const hold = holdRef.current;
      const next = hold.map((value, index) => {
        const wave = waveformSample(now, index);
        return value + (wave - value) * amplitudeRef.current;
      });
      publishScales(amplitudeRef.current === 0 ? [...hold] : next);

      if (targetPlayingRef.current || amplitudeRef.current > 0) {
        frameRef.current = window.requestAnimationFrame(animateRef.current);
      } else {
        frameRef.current = null;
        lastFrameAtRef.current = null;
      }
    },
    [publishScales],
  );

  useEffect(() => {
    animateRef.current = animate;
  }, [animate]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    targetPlayingRef.current = playing;
    holdRef.current = [...scalesRef.current];
    if (reducedMotionRef.current) return;
    if (playing || amplitudeRef.current > 0) {
      frameRef.current ??= window.requestAnimationFrame(animate);
    }
  }, [animate, playing]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  return scales;
}

function usePlaybackShellProgress(playing: boolean): number {
  const [progress, setProgress] = useState(() => (playing ? 1 : 0));
  const progressRef = useRef(progress);
  const frameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  const publishProgress = useCallback((next: number) => {
    progressRef.current = next;
    setProgress((current) =>
      Math.abs(current - next) > 0.003 ? next : current,
    );
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  useEffect(() => {
    const target = playing ? 1 : 0;
    const start = progressRef.current;
    if (reducedMotionRef.current || Math.abs(start - target) < 0.001) {
      publishProgress(target);
      return;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    const startedAt = window.performance.now();
    const duration = 240;
    const animate = (now: number) => {
      const rawProgress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = 1 - (1 - rawProgress) ** 3;
      publishProgress(start + (target - start) * easedProgress);
      if (rawProgress < 1) {
        frameRef.current = window.requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = window.requestAnimationFrame(animate);
  }, [playing, publishProgress]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  return progress;
}

function PlaybackToolbarIcon({
  playing,
  waveformScales,
}: {
  playing: boolean;
  waveformScales: number[];
}) {
  const shellProgress = usePlaybackShellProgress(playing);
  const waveformX = 16 + 2.75 * shellProgress;

  return (
    <svg
      className={`audio-playback-icon${playing ? " is-playing" : ""}`}
      viewBox="0 0 48 48"
      width="48"
      height="48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="audio-playback-icon-shell"
        d={playbackShellPath(shellProgress)}
      />
      <g
        className="audio-waveform"
        transform={`translate(${waveformX.toFixed(3)} 16)`}
      >
        <rect
          className="audio-waveform-bar audio-waveform-bar-1"
          x="0.375"
          y="4.1"
          width="1.25"
          height="7.8"
          rx="0.625"
          style={{ "--audio-waveform-scale": waveformScales[0] ?? 1 } as CSSProperties}
        />
        <rect
          className="audio-waveform-bar audio-waveform-bar-2"
          x="3.125"
          y="0.85"
          width="1.25"
          height="13"
          rx="0.625"
          style={{ "--audio-waveform-scale": waveformScales[1] ?? 1 } as CSSProperties}
        />
        <rect
          className="audio-waveform-bar audio-waveform-bar-3"
          x="5.875"
          y="4.8"
          width="1.25"
          height="6.8"
          rx="0.625"
          style={{ "--audio-waveform-scale": waveformScales[2] ?? 1 } as CSSProperties}
        />
        <rect
          className="audio-waveform-bar audio-waveform-bar-4"
          x="8.625"
          y="3.55"
          width="1.25"
          height="8.9"
          rx="0.625"
          style={{ "--audio-waveform-scale": waveformScales[3] ?? 1 } as CSSProperties}
        />
      </g>
    </svg>
  );
}

export function AudioPlayerIsland({
  fallbackAudio,
  overviewAudio,
}: {
  fallbackAudio: ProgressAudioQueueItem;
  overviewAudio: AudioQueueItem;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const progress = useReaderProgress();
  const {
    rendered,
    setOpen,
    containerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>();
  // The queue is built from the slim per-section manifest (titles, ids — no body
  // text) so a page that never plays audio does not fetch the ~1.7MB text
  // payload. The full text is loaded lazily on first play (PERF-01).
  const sections = useLoadedData(loadProgressSections, emptyProgressSections);
  const outline = useLoadedData(loadToolbarOutline, emptyToolbarOutline);
  const audioManifest = useLoadedData(
    loadAudioClipManifest,
    emptyAudioClipManifest,
  );
  const [hash, setHash] = useState("");
  useEffect(() => {
    const readHash = () => setHash(window.location.hash);
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [pathname]);
  const offlinePacks = useMemo(
    () =>
      buildOfflineAudioPacks({
        volumes: outline.volumes,
        sections,
        manifest: audioManifest,
      }),
    [audioManifest, outline.volumes, sections],
  );
  const visibleQueue = useMemo<AudioQueueItem[]>(() => {
    const currentPath = normalizePath(pathname);
    if (currentPath === "/overview/") return [overviewAudio];
    if (!currentPath.startsWith("/manuscripts/")) return [];

    const hashSectionId = readerFragmentTarget(hash, sections)?.sectionId ?? "";
    const exactSectionIndex = sections.findIndex(
      (section) => normalizePath(section.href) === currentPath,
    );
    const anchoredChapterIndex = hashSectionId
      ? sections.findIndex(
          (section) =>
            section.sectionId === hashSectionId &&
            normalizePath(section.chapterHref) === currentPath,
        )
      : -1;
    const chapterIndex = sections.findIndex(
      (section) => normalizePath(section.chapterHref) === currentPath,
    );
    const startIndex =
      exactSectionIndex >= 0
        ? exactSectionIndex
        : anchoredChapterIndex >= 0
          ? anchoredChapterIndex
          : chapterIndex;
    const chosen =
      startIndex >= 0
        ? sections.slice(startIndex)
        : sections.filter((section) =>
            normalizePath(section.href).startsWith(currentPath),
          );
    return chosen.map((section) => ({
      sectionId: section.sectionId,
      continuityId: section.continuityId,
      legacyContinuityIds: section.legacyContinuityIds,
      progressContinuityGroups: section.progressContinuityGroups,
      contentHash: section.contentHash,
      title: section.title,
      text: "",
      audioVersionId: section.audioVersionId,
      href: section.href,
      chapterHref: section.chapterHref,
      readerHref: section.readerHref,
    }));
  }, [hash, overviewAudio, pathname, sections]);
  const sectionQueue = useMemo<ProgressAudioQueueItem[]>(
    () =>
      sections
        .filter((section) => Boolean(section.audioVersionId))
        .map((section) => ({
          sectionId: section.sectionId,
          title: section.title,
          text: "",
          contentHash: section.contentHash,
          audioVersionId: section.audioVersionId,
          href: section.href,
          chapterHref: section.chapterHref,
          readerHref: section.readerHref,
        })),
    [sections],
  );
  const fallbackQueue = useMemo<ProgressAudioQueueItem[]>(() => {
    if (sectionQueue.length === 0) return [fallbackAudio];

    const firstUnreadIndex = sectionQueue.findIndex((section) =>
      !isSectionRead(progress, section),
    );
    return firstUnreadIndex >= 0
      ? sectionQueue.slice(firstUnreadIndex)
      : sectionQueue;
  }, [fallbackAudio, progress, sectionQueue]);
  // Section text is resolved lazily on first play; the overview item already
  // carries its text.
  const sectionTextRef = useRef<Map<string, string> | null>(null);
  const ensureSectionText = useCallback(async (): Promise<Map<string, string>> => {
    if (sectionTextRef.current) return sectionTextRef.current;
    const full = await loadReaderSections();
    const map = new Map(full.map((section) => [section.sectionId, section.text]));
    sectionTextRef.current = map;
    return map;
  }, []);
  const provider = useMemo(
    () => createDefaultAudioProvider(audioManifest),
    [audioManifest],
  );
  const [voices, setVoices] = useState<AudioPlaybackVoice[]>([]);
  const [preference, setPreference] = useState<AudioVoicePreference>(
    () => defaultVoicePreference,
  );
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const voiceGroups = useMemo(
    () => audioVoiceMenuGroups({ voices, manifest: audioManifest }),
    [audioManifest, voices],
  );
  const voiceIds = useMemo(() => selectableVoiceIds(voiceGroups), [voiceGroups]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackQueue, setPlaybackQueue] = useState<AudioQueueItem[]>([]);
  const [playbackLocation, setPlaybackLocation] =
    useState<PlaybackLocation | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pendingFallbackPlayback, setPendingFallbackPlayback] = useState(false);
  const waveformScales = usePlaybackWaveform(playing);
  const [supported, setSupported] = useState(true);
  const [offlineStatuses, setOfflineStatuses] = useState(
    () => emptyOfflineStatuses,
  );
  const [offlineProgress, setOfflineProgress] = useState<
    Record<string, OfflineAudioDownloadProgress>
  >({});
  const [offlineError, setOfflineError] = useState<Record<string, string>>({});
  const [downloadingVolumeId, setDownloadingVolumeId] = useState<string | null>(
    null,
  );
  const playbackTokenRef = useRef(0);
  const audioStartedAtRef = useRef<number | null>(null);
  const audioItemRef = useRef<AudioQueueItem | null>(null);
  const audioPreferenceRef = useRef<AudioVoicePreference>(defaultVoicePreference);
  const handledListenRequestRef = useRef<string | null>(null);
  const playbackQueueRef = useRef<AudioQueueItem[]>([]);
  const visibleQueueRef = useRef<AudioQueueItem[]>([]);
  const activeIndexRef = useRef(0);
  const playingRef = useRef(false);
  const playbackLocationRef = useRef<PlaybackLocation | null>(null);
  const speakRef = useRef<SpeakAudio | null>(null);

  useEffect(() => {
    playbackQueueRef.current = playbackQueue;
  }, [playbackQueue]);

  useEffect(() => {
    visibleQueueRef.current = visibleQueue;
  }, [visibleQueue]);

  const navigateToFallbackPlayback = useCallback(() => {
    const latestProgress = readStoredProgress();
    const target =
      sectionQueue.find((section) => !isSectionRead(latestProgress, section)) ??
      sectionQueue[0] ??
      fallbackAudio;
    if (target.href) router.push(`${target.href}?listen=1`);
  }, [fallbackAudio, router, sectionQueue]);

  useEffect(() => {
    if (!pendingFallbackPlayback || sections.length === 0) return;
    setPendingFallbackPlayback(false);
    navigateToFallbackPlayback();
  }, [navigateToFallbackPlayback, pendingFallbackPlayback, sections.length]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    playbackLocationRef.current = playbackLocation;
  }, [playbackLocation]);

  const flushAudioSeconds = useCallback((): void => {
    const startedAt = audioStartedAtRef.current;
    const item = audioItemRef.current;
    if (!startedAt || !item) return;
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    audioStartedAtRef.current = null;
    if (seconds <= 0) return;
    updateStoredProgress((current) =>
      recordAudioSeconds(
        current,
        {
          sectionId: item.sectionId,
          continuityId: item.continuityId,
          legacyContinuityIds: item.legacyContinuityIds,
          progressContinuityGroups: item.progressContinuityGroups,
          contentHash: item.contentHash ?? item.audioVersionId,
        },
        seconds,
      ),
    );
    appendStoredEvent(
      createEngagementEvent("audio_seconds_listened", {
        sectionId: item.sectionId,
        contentHash: item.audioVersionId,
        route: pathname,
        payload: { seconds },
      }),
    );
  }, [pathname]);

  useEffect(() => {
    setPreferenceReady(false);
    setVoicesReady(false);
    const hydrationTimer = window.setTimeout(() => {
      if (!provider.isSupported()) {
        setSupported(false);
        setPreferenceReady(true);
        setVoicesReady(true);
        return;
      }
      setSupported(true);
      setPreference(readVoicePreference());
      setVoices(provider.getVoices());
      setPreferenceReady(true);
      setVoicesReady(true);
    }, 0);

    const unsubscribeVoices = provider.subscribeVoices(() => {
      setVoices(provider.getVoices());
      setVoicesReady(true);
    });
    return () => {
      window.clearTimeout(hydrationTimer);
      unsubscribeVoices();
      if (
        provider.isSupported() &&
        !playingRef.current &&
        !provider.isPaused()
      ) {
        flushAudioSeconds();
        provider.cancel();
      }
    };
  }, [flushAudioSeconds, provider]);

  useEffect(() => {
    let active = true;
    if (offlinePacks.length === 0) {
      setOfflineStatuses(emptyOfflineStatuses);
      return () => {
        active = false;
      };
    }
    Promise.all(
      offlinePacks.map((pack) =>
        inspectOfflineAudioPack(pack).then((status) => [pack.volumeId, status] as const),
      ),
    )
      .then((entries) => {
        if (!active) return;
        setOfflineStatuses(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [offlinePacks]);

  useEffect(() => {
    if (playingRef.current || provider.isPaused()) return;
    const resetTimer = window.setTimeout(() => {
      setPlaybackQueue(visibleQueue);
      setActiveIndex(0);
      setPlaybackLocation(null);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [provider, visibleQueue]);

  useEffect(() => {
    if (!preferenceReady) return;
    writeVoicePreference(preference);
  }, [preference, preferenceReady]);

  useEffect(() => {
    if (!preferenceReady || !voicesReady) return;
    if (!preference.voiceURI || voiceIds.has(preference.voiceURI)) return;
    const pendingPreferredVoice = voiceGroups.highQuality.some(
      (voice) => voice.disabled && voice.id === preference.voiceURI,
    );
    if (pendingPreferredVoice) return;
    setPreference((current) => ({ ...current, voiceURI: null }));
  }, [preference.voiceURI, preferenceReady, voiceGroups, voiceIds, voicesReady]);

  useEffect(() => {
    const onStartFromWord = (event: Event) => {
      const detail = (event as CustomEvent<AudioStartFromWordEventDetail>).detail;
      if (!detail?.sectionId || !Number.isFinite(detail.charIndex)) return;
      const sectionIndex = sections.findIndex(
        (section) => section.sectionId === detail.sectionId,
      );
      if (sectionIndex < 0) return;
      const queueItems = sections.slice(sectionIndex).map((section) => ({
        sectionId: section.sectionId,
        continuityId: section.continuityId,
        legacyContinuityIds: section.legacyContinuityIds,
        progressContinuityGroups: section.progressContinuityGroups,
        contentHash: section.contentHash,
        title: section.title,
      text: "",
      audioVersionId: section.audioVersionId,
      href: section.href,
      chapterHref: section.chapterHref,
      readerHref: section.readerHref,
    }));
      setOpen(true);
      setPlaybackLocation({
        sectionId: detail.sectionId,
        bodyCharIndex: detail.charIndex,
        wordId: detail.wordId,
      });
      void speakRef.current?.(
        0,
        preference,
        queueItems,
        detail.charIndex,
        detail.wordId,
      );
    };
    window.addEventListener(audioStartFromWordEventName, onStartFromWord);
    return () => {
      window.removeEventListener(audioStartFromWordEventName, onStartFromWord);
    };
  }, [preference, sections, setOpen]);

  async function ensurePlayableAudio(
    index: number,
    queueItems: AudioQueueItem[] = playbackQueueRef.current,
  ): Promise<void> {
    const item = queueItems[index];
    if (item && !item.text) await ensureSectionText();
  }

  function playIndex(
    index: number,
    token: number,
    playbackPreference: AudioVoicePreference = preference,
    queueItems: AudioQueueItem[] = playbackQueueRef.current,
    startBodyCharIndex?: number,
    startWordId?: string,
  ): void {
    const item = queueItems[index];
    if (!item || !supported) return;
    flushAudioSeconds();
    setPlaybackQueue(queueItems);
    audioStartedAtRef.current = Date.now();
    audioItemRef.current = item;
    audioPreferenceRef.current = playbackPreference;
    appendStoredEvent(
      createEngagementEvent("audio_started", {
        sectionId: item.sectionId,
        contentHash: item.audioVersionId,
        route: pathname,
      }),
    );
    const text = item.text || sectionTextRef.current?.get(item.sectionId) || "";
    const prefix = `${item.title}. `;
    const bodyStartCharIndex =
      typeof startBodyCharIndex === "number"
        ? Math.max(0, Math.min(text.length, startBodyCharIndex))
        : 0;
    const fullStartCharIndex = prefix.length + bodyStartCharIndex;
    const updatePlaybackProgress = (progress: AudioPlaybackProgress) => {
      if (token !== playbackTokenRef.current) return;
      const bodyCharIndex =
        typeof progress.charIndex === "number"
          ? Math.max(0, progress.charIndex - prefix.length)
          : bodyStartCharIndex;
      const wordId = playbackWordId(item.sectionId, text, bodyCharIndex);
      const location = {
        sectionId: item.sectionId,
        bodyCharIndex,
        wordId,
      };
      setPlaybackLocation(location);
      window.dispatchEvent(
        new CustomEvent(audioProgressEventName, {
          detail: {
            sectionId: item.sectionId,
            charIndex: bodyCharIndex,
          },
        }),
      );
    };
    setPlaybackLocation({
      sectionId: item.sectionId,
      bodyCharIndex: bodyStartCharIndex,
      wordId:
        startWordId ?? playbackWordId(item.sectionId, text, bodyStartCharIndex),
    });
    provider.speak({
      text: `${prefix}${text}`,
      voiceId: playbackPreference.voiceURI,
      rate: playbackPreference.rate,
      pitch: playbackPreference.pitch,
      startCharIndex: fullStartCharIndex,
      onProgress: updatePlaybackProgress,
      onEnd: () => {
        if (token !== playbackTokenRef.current) return;
        flushAudioSeconds();
        appendStoredEvent(
          createEngagementEvent("audio_completed", {
            sectionId: item.sectionId,
            contentHash: item.audioVersionId,
            route: pathname,
          }),
        );
        const nextIndex = index + 1;
        if (queueItems[nextIndex]) {
          setActiveIndex(nextIndex);
          playIndex(nextIndex, token, playbackPreference, queueItems);
        } else {
          setPlaying(false);
        }
      },
      sectionId: item.sectionId,
      audioVersionId: item.audioVersionId,
      // Without this, a synthesis error (voice unavailable, engine
      // interruption) leaves `playing` true forever: onEnd never fires, the
      // queue stalls, and listen-seconds keep accumulating as if audio were
      // still playing.
      onError: () => {
        if (token !== playbackTokenRef.current) return;
        flushAudioSeconds();
        setPlaying(false);
      },
    });
    setPlaying(true);
  }

  async function downloadOfflinePack(volumeId: string): Promise<void> {
    const pack = offlinePacks.find((candidate) => candidate.volumeId === volumeId);
    if (!pack || downloadingVolumeId) return;
    setOfflineError((current) => ({ ...current, [volumeId]: "" }));
    setDownloadingVolumeId(volumeId);
    try {
      const status = await cacheOfflineAudioPack(pack, (progress) => {
        setOfflineProgress((current) => ({ ...current, [volumeId]: progress }));
      });
      setOfflineStatuses((current) => ({ ...current, [volumeId]: status }));
    } catch (error) {
      setOfflineError((current) => ({
        ...current,
        [volumeId]:
          error instanceof Error
            ? error.message
            : "Download failed. Please try again.",
      }));
    } finally {
      setDownloadingVolumeId(null);
    }
  }

  async function speak(
    index = activeIndexRef.current,
    playbackPreference: AudioVoicePreference = preference,
    queueItems: AudioQueueItem[] = visibleQueueRef.current,
    startBodyCharIndex?: number,
    startWordId?: string,
  ): Promise<void> {
    const item = queueItems[index];
    const sameVisibleSection =
      audioItemRef.current &&
      visibleQueueRef.current.some(
        (candidate) => candidate.sectionId === audioItemRef.current?.sectionId,
      );
    if (
      provider.isPaused() &&
      audioItemRef.current &&
      sameVisibleSection &&
      audioPreferencesEqual(audioPreferenceRef.current, playbackPreference)
    ) {
      audioStartedAtRef.current = Date.now();
      provider.resume();
      setPlaying(true);
      appendStoredEvent(
        createEngagementEvent("audio_resumed", {
          sectionId: audioItemRef.current.sectionId,
          contentHash: audioItemRef.current.audioVersionId,
          route: pathname,
        }),
      );
      return;
    }

    if (!item) return;
    // Hosted clips still need full text loaded before playback so browser
    // speech can recover with the complete section if network media fails.
    await ensurePlayableAudio(index, queueItems);
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    flushAudioSeconds();
    provider.cancel();
    setActiveIndex(index);
    playIndex(
      index,
      token,
      playbackPreference,
      queueItems,
      startBodyCharIndex,
      startWordId,
    );
  }

  useEffect(() => {
    speakRef.current = speak;
  });

  async function restartActivePlayback(
    playbackPreference: AudioVoicePreference,
  ): Promise<void> {
    if (!playing) return;
    const index = activeIndexRef.current;
    const queueItems = playbackQueueRef.current;
    const item = queueItems[index];
    if (!item) return;
    const bodyCharIndex =
      playbackLocationRef.current?.sectionId === item.sectionId
        ? playbackLocationRef.current.bodyCharIndex
        : 0;
    await ensurePlayableAudio(index, queueItems);
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    flushAudioSeconds();
    provider.cancel();
    playIndex(index, token, playbackPreference, queueItems, bodyCharIndex);
  }

  function pause(): void {
    const item = audioItemRef.current;
    flushAudioSeconds();
    if (item) {
      appendStoredEvent(
        createEngagementEvent("audio_paused", {
          sectionId: item.sectionId,
          contentHash: item.audioVersionId,
          route: pathname,
        }),
      );
    }
    provider.pause();
    setPlaying(false);
  }

  function handleToolbarButtonClick(): void {
    if (playing) {
      setOpen(true);
      pause();
      return;
    }
    if (visibleQueueRef.current.length === 0) {
      if (sections.length === 0) {
        setPendingFallbackPlayback(true);
        return;
      }
      navigateToFallbackPlayback();
      return;
    }
    setOpen(true);
    void speak(0, preference, visibleQueueRef.current);
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("listen") !== "1") return;
    if (
      !preferenceReady ||
      !voicesReady ||
      !supported ||
      visibleQueue.length === 0
    ) {
      return;
    }
    const requestKey = `${pathname}?${searchParams.toString()}`;
    if (handledListenRequestRef.current === requestKey) return;
    handledListenRequestRef.current = requestKey;
    setOpen(true);
    void speakRef.current?.(0);
    const remainingParams = new URLSearchParams(searchParams.toString());
    remainingParams.delete("listen");
    const nextSearch = remainingParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
    );
  }, [
    pathname,
    preferenceReady,
    setOpen,
    supported,
    visibleQueue.length,
    voicesReady,
  ]);

  function handleVoiceChange(voiceURI: string | null): void {
    const nextPreference = {
      ...preference,
      voiceURI,
      useSystemVoice: voiceURI === null,
    };
    setPreference(nextPreference);
    void restartActivePlayback(nextPreference);
  }

  function handleSpeedChange(rate: number): void {
    const nextPreference = {
      ...preference,
      rate,
    };
    setPreference(nextPreference);
    void restartActivePlayback(nextPreference);
  }

  function resetVoice(): void {
    const nextPreference = {
      ...preference,
      voiceURI: defaultVoicePreference.voiceURI,
      useSystemVoice: defaultVoicePreference.useSystemVoice,
    };
    setPreference(nextPreference);
    void restartActivePlayback(nextPreference);
  }

  function resetSpeed(): void {
    const nextPreference = {
      ...preference,
      rate: defaultVoicePreference.rate,
    };
    setPreference(nextPreference);
    void restartActivePlayback(nextPreference);
  }

  const availableQueue =
    visibleQueue.length > 0 ? visibleQueue : fallbackQueue;
  const activeQueue = playbackQueue.length > 0 ? playbackQueue : availableQueue;
  if (activeQueue.length === 0) return null;

  // activeQueue is non-empty here, so activeQueue[0] is defined.
  const active = activeQueue[activeIndex] ?? activeQueue[0]!;
  const jumpHref =
    playbackLocation?.wordId && active.href
      ? `${active.href}#${playbackLocation.wordId}`
      : active.href;
  const voiceIsDefault =
    preference.voiceURI === defaultVoicePreference.voiceURI &&
    preference.useSystemVoice !== true;
  const speedIsDefault = preference.rate === defaultVoicePreference.rate;

  return (
    <div className="audio-menu" ref={containerRef}>
      <button
        {...triggerProps}
        type="button"
        className={`audio-menu-button${playing ? " is-playing" : ""}`}
        aria-controls="audiobook-menu"
        aria-label={playing ? "Pause audiobook" : "Listen"}
        onClick={handleToolbarButtonClick}
      >
        <PlaybackToolbarIcon playing={playing} waveformScales={waveformScales} />
      </button>
      {rendered && (
        <section
          {...popoverProps}
          id="audiobook-menu"
          className="audio-player audio-popover"
          aria-label="Audiobook controls"
        >
          <div className="audio-player-title">
            <span className="eyebrow">Listen</span>
            <div className="audio-player-title-row">
              <strong>{active.title}</strong>
              {jumpHref ? (
                <a className="audio-location-link" href={jumpHref}>
                  Jump to playback location
                </a>
              ) : null}
            </div>
          </div>
          <div className="audio-controls">
            <div className="audio-control-fields">
              <div className="settings-control audio-setting-control voice-field">
                <div className="settings-control-row">
                  <label htmlFor="audio-voice-select">Voice</label>
                  <button
                    type="button"
                    className="settings-reset-button"
                    aria-label="Reset voice"
                    disabled={voiceIsDefault}
                    onClick={resetVoice}
                  >
                    <RotateCcw aria-hidden="true" size={14} />
                  </button>
                </div>
                <select
                  id="audio-voice-select"
                  aria-label="Voice"
                  value={preference.voiceURI ?? ""}
                  onChange={(event) =>
                    handleVoiceChange(event.target.value || null)
                  }
                >
                  <optgroup label="High quality voices">
                    {voiceGroups.highQuality.map((voice) => (
                      <option key={voice.id} value={voice.id} disabled={voice.disabled}>
                        {voice.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="System voices">
                    {voiceGroups.system.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="settings-control audio-setting-control range-field">
                <div className="settings-control-row">
                  <label htmlFor="audio-speed">Speed</label>
                  <button
                    type="button"
                    className="settings-reset-button"
                    aria-label="Reset speed"
                    disabled={speedIsDefault}
                    onClick={resetSpeed}
                  >
                    <RotateCcw aria-hidden="true" size={14} />
                  </button>
                </div>
                <input
                  id="audio-speed"
                  type="range"
                  min="0.75"
                  max="1.4"
                  step="0.05"
                  value={preference.rate}
                  aria-label="Speed"
                  onChange={(event) =>
                    handleSpeedChange(Number(event.target.value))
                  }
                />
              </div>
            </div>
          </div>
          <div className="audio-offline" aria-label="Offline audiobook downloads">
            <div className="audio-offline-title">
              <span className="eyebrow">Offline playback</span>
              <strong>Pre-download manuscripts</strong>
            </div>
            <div className="audio-offline-list">
              {offlinePacks.map((pack) => {
                const status = offlineStatuses[pack.volumeId];
                const progress = offlineProgress[pack.volumeId] ?? status;
                const cachedCount = progress?.cachedCount ?? 0;
                const totalCount = progress?.totalCount ?? pack.urls.length;
                const complete = Boolean(status?.complete);
                const downloading = downloadingVolumeId === pack.volumeId;
                const clipsPending = pack.audioClipCount === 0;
                const percent =
                  totalCount > 0
                    ? Math.round((cachedCount / totalCount) * 100)
                    : 0;
                const helper = clipsPending
                  ? "Audio clips pending"
                  : complete
                    ? "Available offline"
                    : downloading
                      ? `${percent.toLocaleString()}% downloaded`
                      : `${formatter.format(pack.sectionCount)} sections, ${formatter.format(pack.audioClipCount)} clips`;
                return (
                  <div className="audio-offline-item" key={pack.volumeId}>
                    <span className="audio-offline-number" aria-hidden="true">
                      {pack.numberLabel}
                    </span>
                    <div className="audio-offline-copy">
                      <span>{pack.title}</span>
                      <small>{helper}</small>
                    </div>
                    <button
                      type="button"
                      className="audio-offline-button"
                      onClick={() => void downloadOfflinePack(pack.volumeId)}
                      disabled={downloadingVolumeId !== null || clipsPending || complete}
                      aria-label={
                        complete
                          ? `${pack.title} is available offline`
                          : `Download ${pack.title} for offline playback`
                      }
                    >
                      {complete ? (
                        <CheckCircle2 aria-hidden="true" size={17} />
                      ) : clipsPending ? (
                        <AlertTriangle aria-hidden="true" size={17} />
                      ) : (
                        <Download aria-hidden="true" size={17} />
                      )}
                    </button>
                    {clipsPending ? null : (
                      <div
                        className="audio-offline-meter"
                        aria-hidden="true"
                        style={
                          {
                            "--audio-offline-progress": `${percent}%`,
                          } as CSSProperties
                        }
                      />
                    )}
                    {offlineError[pack.volumeId] ? (
                      <small className="audio-offline-error">
                        {offlineError[pack.volumeId]}
                      </small>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
