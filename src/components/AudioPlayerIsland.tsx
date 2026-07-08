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
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
} from "lucide-react";
import {
  emptyAudioClipManifest,
  findAudioClip,
  parseClipVoicePreferenceId,
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
  type AudioPlaybackVoice,
} from "@/lib/audio-playback";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";
import {
  loadProgressSections,
  loadReaderSections,
  loadAudioClipManifest,
  loadToolbarOutline,
  type ProgressSectionData,
  type ToolbarOutlineData,
} from "@/lib/reader-data";
import { createEngagementEvent } from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  updateStoredProgress,
} from "@/lib/reader-progress-store";
import { recordAudioSeconds } from "@/lib/reader-state";
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
        frameRef.current = window.requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
        lastFrameAtRef.current = null;
      }
    },
    [publishScales],
  );

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
          x="0"
          y="4.1"
          width="2"
          height="7.8"
          rx="1"
          style={{ "--audio-waveform-scale": waveformScales[0] ?? 1 } as CSSProperties}
        />
        <rect
          className="audio-waveform-bar audio-waveform-bar-2"
          x="2.75"
          y="0.85"
          width="2"
          height="13"
          rx="1"
          style={{ "--audio-waveform-scale": waveformScales[1] ?? 1 } as CSSProperties}
        />
        <rect
          className="audio-waveform-bar audio-waveform-bar-3"
          x="5.5"
          y="4.8"
          width="2"
          height="6.8"
          rx="1"
          style={{ "--audio-waveform-scale": waveformScales[2] ?? 1 } as CSSProperties}
        />
        <rect
          className="audio-waveform-bar audio-waveform-bar-4"
          x="8.25"
          y="3.55"
          width="2"
          height="8.9"
          rx="1"
          style={{ "--audio-waveform-scale": waveformScales[3] ?? 1 } as CSSProperties}
        />
      </g>
    </svg>
  );
}

export function AudioPlayerIsland({
  overviewAudio,
}: {
  overviewAudio: AudioQueueItem;
}) {
  const pathname = usePathname();
  const { open, setOpen, containerRef, triggerProps } =
    useToolbarMenu<HTMLDivElement>();
  // The queue is built from the slim per-section manifest (titles, ids — no body
  // text) so a page that never plays audio does not fetch the ~1.7MB text
  // payload. The full text is loaded lazily on first play (PERF-01).
  const sections = useLoadedData(loadProgressSections, emptyProgressSections);
  const outline = useLoadedData(loadToolbarOutline, emptyToolbarOutline);
  const audioManifest = useLoadedData(
    loadAudioClipManifest,
    emptyAudioClipManifest,
  );
  const offlinePacks = useMemo(
    () =>
      buildOfflineAudioPacks({
        volumes: outline.volumes,
        sections,
        manifest: audioManifest,
      }),
    [audioManifest, outline.volumes, sections],
  );
  const queue = useMemo<AudioQueueItem[]>(() => {
    const currentPath = normalizePath(pathname);
    if (currentPath === "/overview/") return [overviewAudio];
    if (!currentPath.startsWith("/manuscripts/")) return [];

    const exactSectionIndex = sections.findIndex(
      (section) => normalizePath(section.href) === currentPath,
    );
    const chosen =
      exactSectionIndex >= 0
        ? sections.slice(exactSectionIndex)
        : sections.filter((section) =>
            normalizePath(section.href).startsWith(currentPath),
          );
    return chosen.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      text: "",
      audioVersionId: section.audioVersionId,
    }));
  }, [overviewAudio, pathname, sections]);
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
  const voiceGroups = useMemo(
    () => audioVoiceMenuGroups({ voices, manifest: audioManifest }),
    [audioManifest, voices],
  );
  const voiceIds = useMemo(() => selectableVoiceIds(voiceGroups), [voiceGroups]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
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
        { sectionId: item.sectionId, contentHash: item.audioVersionId },
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
    const hydrationTimer = window.setTimeout(() => {
      if (!provider.isSupported()) {
        setSupported(false);
        return;
      }
      setSupported(true);
      setPreference(readVoicePreference());
      setVoices(provider.getVoices());
    }, 0);

    const unsubscribeVoices = provider.subscribeVoices(() =>
      setVoices(provider.getVoices()),
    );
    return () => {
      window.clearTimeout(hydrationTimer);
      unsubscribeVoices();
      if (provider.isSupported()) {
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
    playbackTokenRef.current += 1;
    if (provider.isSupported()) {
      flushAudioSeconds();
      provider.cancel();
    }
    const resetTimer = window.setTimeout(() => {
      setActiveIndex(0);
      setOpen(false);
      setPlaying(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [flushAudioSeconds, pathname, provider, setOpen]);


  useEffect(() => {
    writeVoicePreference(preference);
  }, [preference]);

  useEffect(() => {
    if (!preference.voiceURI || voiceIds.has(preference.voiceURI)) return;
    setPreference((current) => ({ ...current, voiceURI: null }));
  }, [preference.voiceURI, voiceIds]);

  async function ensurePlayableAudio(
    index: number,
    playbackPreference: AudioVoicePreference,
  ): Promise<void> {
    const item = queue[index];
    const clipVoiceId = parseClipVoicePreferenceId(playbackPreference.voiceURI);
    const hasHostedClip =
      item && clipVoiceId
        ? findAudioClip(
            audioManifest,
            clipVoiceId,
            item.sectionId,
            item.audioVersionId,
          ) !== null
        : false;
    if (item && !item.text && !hasHostedClip) await ensureSectionText();
  }

  function playIndex(
    index: number,
    token: number,
    playbackPreference: AudioVoicePreference = preference,
  ): void {
    const item = queue[index];
    if (!item || !supported) return;
    flushAudioSeconds();
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
    provider.speak({
      text: `${item.title}. ${text}`,
      voiceId: playbackPreference.voiceURI,
      rate: playbackPreference.rate,
      pitch: playbackPreference.pitch,
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
        if (queue[nextIndex]) {
          setActiveIndex(nextIndex);
          playIndex(nextIndex, token, playbackPreference);
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
    index = activeIndex,
    playbackPreference: AudioVoicePreference = preference,
  ): Promise<void> {
    if (
      provider.isPaused() &&
      audioItemRef.current &&
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

    // Load the section text on first play if the item does not already carry it
    // and no hosted clip can satisfy the request. Fish clips only need the
    // stable section id and audio hash, so they can start inside the click
    // gesture instead of waiting on the full text payload.
    await ensurePlayableAudio(index, playbackPreference);
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    playIndex(index, token, playbackPreference);
  }

  async function restartActivePlayback(
    playbackPreference: AudioVoicePreference,
  ): Promise<void> {
    if (!playing) return;
    const index = activeIndex;
    if (!queue[index]) return;
    await ensurePlayableAudio(index, playbackPreference);
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    flushAudioSeconds();
    provider.cancel();
    playIndex(index, token, playbackPreference);
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
    setOpen(true);
    if (playing) {
      pause();
      return;
    }
    void speak();
  }

  function handleVoiceChange(voiceURI: string | null): void {
    const nextPreference = { ...preference, voiceURI };
    setPreference(nextPreference);
    void restartActivePlayback(nextPreference);
  }

  if (!supported || queue.length === 0) return null;

  // queue is non-empty here, so queue[0] is defined.
  const active = queue[activeIndex] ?? queue[0]!;

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
      {open && (
        <section
          id="audiobook-menu"
          className="audio-player audio-popover"
          aria-label="Audiobook controls"
        >
          <div className="audio-player-title">
            <span className="eyebrow">Listen</span>
            <strong>{active.title}</strong>
          </div>
          <div className="audio-controls">
            <div className="audio-control-fields">
              <label className="audio-field voice-field">
                <span>Voice</span>
                <select
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
                    <option value="">Automatic system voice</option>
                    {voiceGroups.system.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="audio-field range-field">
                <span>Speed</span>
                <input
                  type="range"
                  min="0.75"
                  max="1.4"
                  step="0.05"
                  value={preference.rate}
                  onChange={(event) =>
                    setPreference((current) => ({
                      ...current,
                      rate: Number(event.target.value),
                    }))
                  }
                />
              </label>
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
