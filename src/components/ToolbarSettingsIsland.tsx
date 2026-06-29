"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Settings } from "lucide-react";
import {
  applyReaderPreferences,
  defaultReaderPreferences,
  fontOptionById,
  parseReaderPreferences,
  readerFontOptions,
  readerFontSizeMax,
  readerFontSizeMin,
  readerFontSizeStep,
  readerPreferencesStorageKey,
  readerThemeOptions,
  serializeReaderPreferences,
  type ReaderFontId,
  type ReaderPreferences,
  type ReaderTheme,
} from "@/lib/reader-preferences";

function readStoredPreferences(): ReaderPreferences {
  if (typeof window === "undefined") return defaultReaderPreferences;
  return parseReaderPreferences(
    window.localStorage.getItem(readerPreferencesStorageKey),
  );
}

function writeStoredPreferences(preferences: ReaderPreferences): void {
  window.localStorage.setItem(
    readerPreferencesStorageKey,
    serializeReaderPreferences(preferences),
  );
}

function themeLabel(theme: ReaderTheme): string {
  if (theme === "textured") return "Textured";
  if (theme === "light") return "Light";
  return "Dark";
}

export function ToolbarSettingsIsland() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [preferences, setPreferences] = useState<ReaderPreferences>(
    () => defaultReaderPreferences,
  );

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const storedPreferences = readStoredPreferences();
      setPreferences(storedPreferences);
      applyReaderPreferences(storedPreferences, document.documentElement);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(closeTimer);
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
    if (!hydrated) return;
    applyReaderPreferences(preferences, document.documentElement);
    writeStoredPreferences(preferences);
  }, [hydrated, preferences]);

  function updatePreferences(nextPreferences: Partial<ReaderPreferences>): void {
    setPreferences((current) => ({
      ...current,
      ...nextPreferences,
    }));
  }

  return (
    <div className="settings-menu" ref={containerRef}>
      <button
        type="button"
        className="settings-menu-button"
        aria-label="Reader settings"
        aria-expanded={open}
        aria-controls="reader-settings-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings aria-hidden="true" size={17} />
        <span className="nav-label">Settings</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open && (
        <section
          id="reader-settings-menu"
          className="reader-settings settings-popover"
          aria-label="Reader settings"
        >
          <div className="settings-heading">
            <p className="eyebrow">Reading settings</p>
            <strong>{preferences.fontSize}% text</strong>
          </div>
          <label className="settings-field">
            <span>Font size</span>
            <input
              type="range"
              min={readerFontSizeMin}
              max={readerFontSizeMax}
              step={readerFontSizeStep}
              value={preferences.fontSize}
              aria-label="Font size"
              onChange={(event) =>
                updatePreferences({ fontSize: Number(event.target.value) })
              }
            />
          </label>
          <label className="settings-field">
            <span>Font</span>
            <select
              value={preferences.fontFamily}
              aria-label="Reader font"
              onChange={(event) =>
                updatePreferences({
                  fontFamily: event.target.value as ReaderFontId,
                })
              }
            >
              {readerFontOptions.map((fontOption) => (
                <option key={fontOption.id} value={fontOption.id}>
                  {fontOption.label}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-theme-group" aria-label="Reader theme">
            {readerThemeOptions.map((theme) => (
              <button
                key={theme}
                type="button"
                className={`theme-choice theme-choice-${theme}`}
                aria-pressed={preferences.theme === theme}
                onClick={() => updatePreferences({ theme })}
              >
                <span className="theme-swatch" aria-hidden="true" />
                <span>{themeLabel(theme)}</span>
              </button>
            ))}
          </div>
          <p className="quiet-copy">
            Saved in this browser. Current font is {fontOptionById(preferences.fontFamily).label}.
          </p>
        </section>
      )}
    </div>
  );
}
