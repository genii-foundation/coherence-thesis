"use client";

import { normalizePath } from "@/lib/routes";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Headphones, Pause, Play, Square } from "lucide-react";
import {
  defaultVoicePreference,
  queueFromSections,
  type AudioQueueItem,
  type AudioVoicePreference,
} from "@/lib/audio-queue";
import {
  createDefaultAudioProvider,
  type AudioPlaybackVoice,
} from "@/lib/audio-playback";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";
import { loadReaderSections, type ReaderSectionData } from "@/lib/reader-data";
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

const emptyReaderSections: ReaderSectionData[] = [];

export function AudioPlayerIsland({
  overviewAudio,
}: {
  overviewAudio: AudioQueueItem;
}) {
  const pathname = usePathname();
  const { open, setOpen, toggle, containerRef, triggerRef } =
    useToolbarMenu<HTMLDivElement>();
  // The audio island renders nothing until it knows the current page's queue, so
  // it loads reader-sections eagerly. The module-level cache is shared with
  // ToolbarProgressIsland, so this is not an extra network fetch.
  const sections = useLoadedData(loadReaderSections, emptyReaderSections);
  const playbackSections = useMemo(() => {
    const currentPath = normalizePath(pathname);
    if (currentPath === "/overview/") return [overviewAudio];
    if (!currentPath.startsWith("/manuscripts/")) return [];

    const exactSectionIndex = sections.findIndex(
      (section) => normalizePath(section.href) === currentPath,
    );
    if (exactSectionIndex >= 0) return sections.slice(exactSectionIndex);

    return sections.filter((section) => normalizePath(section.href).startsWith(currentPath));
  }, [overviewAudio, pathname, sections]);
  const queue = useMemo<AudioQueueItem[]>(
    () => queueFromSections(playbackSections),
    [playbackSections],
  );
  const provider = useMemo(() => createDefaultAudioProvider(), []);
  const [voices, setVoices] = useState<AudioPlaybackVoice[]>([]);
  const [preference, setPreference] = useState<AudioVoicePreference>(
    () => defaultVoicePreference,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(true);
  const playbackTokenRef = useRef(0);
  const audioStartedAtRef = useRef<number | null>(null);
  const audioItemRef = useRef<AudioQueueItem | null>(null);

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

  function playIndex(index: number, token: number): void {
    const item = queue[index];
    if (!item || !supported) return;
    flushAudioSeconds();
    audioStartedAtRef.current = Date.now();
    audioItemRef.current = item;
    appendStoredEvent(
      createEngagementEvent("audio_started", {
        sectionId: item.sectionId,
        contentHash: item.audioVersionId,
        route: pathname,
      }),
    );
    provider.speak({
      text: `${item.title}. ${item.text}`,
      voiceId: preference.voiceURI,
      rate: preference.rate,
      pitch: preference.pitch,
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
          playIndex(nextIndex, token);
        } else {
          setPlaying(false);
        }
      },
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

  function speak(index = activeIndex): void {
    if (provider.isPaused() && audioItemRef.current) {
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

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    playIndex(index, token);
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

  function stop(): void {
    flushAudioSeconds();
    playbackTokenRef.current += 1;
    provider.cancel();
    setPlaying(false);
  }

  if (!supported || queue.length === 0) return null;

  const active = queue[activeIndex] ?? queue[0];

  return (
    <div className="audio-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`audio-menu-button${playing ? " is-playing" : ""}`}
        aria-expanded={open}
        aria-controls="audiobook-menu"
        aria-label={playing ? "Audiobook playing, open controls" : "Listen"}
        onClick={toggle}
      >
        {playing ? (
          <>
            <span className="audio-menu-button-sizer" aria-hidden="true">
              <Headphones aria-hidden="true" size={17} />
              <span>Listen</span>
              <ChevronDown className="audio-menu-chevron" aria-hidden="true" size={16} />
            </span>
            <span className="audio-playing-indicator" aria-hidden="true">
              <span className="audio-waveform">
                <span />
                <span />
                <span />
              </span>
              <Pause aria-hidden="true" size={15} />
            </span>
          </>
        ) : (
          <Headphones aria-hidden="true" size={17} />
        )}
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
            <button
              type="button"
              className="round-button"
              onClick={() => (playing ? pause() : speak())}
              aria-label={playing ? "Pause audiobook" : "Play audiobook"}
            >
              {playing ? <Pause aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} />}
            </button>
            <button type="button" className="round-button subtle" onClick={stop} aria-label="Stop audiobook">
              <Square aria-hidden="true" size={18} />
            </button>
            <select
              aria-label="Voice"
              value={preference.voiceURI ?? ""}
              onChange={(event) =>
                setPreference((current) => ({
                  ...current,
                  voiceURI: event.target.value || null,
                }))
              }
            >
              <option value="">System voice</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </div>
          <label className="range-field">
            Speed
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
        </section>
      )}
    </div>
  );
}
