"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Headphones, Pause, Play, Square } from "lucide-react";
import {
  defaultVoicePreference,
  queueFromSections,
  type AudioQueueItem,
  type AudioVoicePreference,
} from "@/lib/audio-queue";
import { loadReaderSections, type ReaderSectionData } from "@/lib/reader-data";

const voiceStorageKey = "coherence-audio-voice-v1";

function normalizePath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function loadPreference(): AudioVoicePreference {
  if (typeof window === "undefined") return defaultVoicePreference;
  try {
    return {
      ...defaultVoicePreference,
      ...JSON.parse(window.localStorage.getItem(voiceStorageKey) ?? "{}"),
    };
  } catch {
    return defaultVoicePreference;
  }
}

export function AudioPlayerIsland() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<ReaderSectionData[]>([]);
  const playbackSections = useMemo(() => {
    const currentPath = normalizePath(pathname);
    if (!currentPath.startsWith("/manuscripts/")) return [];

    const exactSectionIndex = sections.findIndex(
      (section) => normalizePath(section.href) === currentPath,
    );
    if (exactSectionIndex >= 0) return sections.slice(exactSectionIndex);

    return sections.filter((section) => normalizePath(section.href).startsWith(currentPath));
  }, [pathname, sections]);
  const queue = useMemo<AudioQueueItem[]>(
    () => queueFromSections(playbackSections),
    [playbackSections],
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [preference, setPreference] = useState<AudioVoicePreference>(
    () => defaultVoicePreference,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(true);
  const playbackTokenRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    loadReaderSections()
      .then((loadedSections) => {
        if (mounted) setSections(loadedSections);
      })
      .catch(() => {
        if (mounted) setSections([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      if (!("speechSynthesis" in window)) {
        setSupported(false);
        return;
      }
      setPreference(loadPreference());
      setVoices(window.speechSynthesis.getVoices());
    }, 0);

    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    }
    return () => {
      window.clearTimeout(hydrationTimer);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
      }
    };
  }, []);

  useEffect(() => {
    playbackTokenRef.current += 1;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const resetTimer = window.setTimeout(() => {
      setActiveIndex(0);
      setOpen(false);
      setPlaying(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(voiceStorageKey, JSON.stringify(preference));
  }, [preference]);

  function playIndex(index: number, token: number): void {
    const item = queue[index];
    if (!item || !supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${item.title}. ${item.text}`);
    utterance.rate = preference.rate;
    utterance.pitch = preference.pitch;
    utterance.voice =
      voices.find((voice) => voice.voiceURI === preference.voiceURI) ?? null;
    utterance.onend = () => {
      if (token !== playbackTokenRef.current) return;
      const nextIndex = index + 1;
      if (queue[nextIndex]) {
        setActiveIndex(nextIndex);
        playIndex(nextIndex, token);
      } else {
        setPlaying(false);
      }
    };
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }

  function speak(index = activeIndex): void {
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    playIndex(index, token);
  }

  function pause(): void {
    window.speechSynthesis.pause();
    setPlaying(false);
  }

  function stop(): void {
    playbackTokenRef.current += 1;
    window.speechSynthesis.cancel();
    setPlaying(false);
  }

  if (!supported || queue.length === 0) return null;

  const active = queue[activeIndex] ?? queue[0];

  return (
    <div className="audio-menu" ref={containerRef}>
      <button
        type="button"
        className="audio-menu-button"
        aria-expanded={open}
        aria-controls="audiobook-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Headphones aria-hidden="true" size={17} />
        <span className="nav-label">Listen</span>
        <ChevronDown aria-hidden="true" size={16} />
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
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
          <label className="range-field">
            Rate
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
