"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, RotateCcw, Settings } from "lucide-react";
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
  if (theme === "textured") return "Parchment";
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "Black";
}

export function ToolbarSettingsIsland() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
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
      setFontMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setFontMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (fontMenuOpen) {
          setFontMenuOpen(false);
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fontMenuOpen, open]);

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

  const selectedFont = fontOptionById(preferences.fontFamily);

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
      </button>
      {open && (
        <section
          id="reader-settings-menu"
          className="reader-settings settings-popover"
          aria-label="Reader settings"
        >
          <div className="settings-heading">
            <p className="eyebrow">Reading settings</p>
          </div>
          <div className="settings-control">
            <div className="settings-control-row">
              <label htmlFor="reader-font-size">Font size</label>
              <button
                type="button"
                className="settings-reset-button"
                aria-label="Reset font size"
                onClick={() =>
                  updatePreferences({
                    fontSize: defaultReaderPreferences.fontSize,
                  })
                }
              >
                <RotateCcw aria-hidden="true" size={14} />
              </button>
            </div>
            <input
              id="reader-font-size"
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
          </div>
          <div className="settings-control">
            <div className="settings-control-row">
              <span id="reader-font-label">Font</span>
              <button
                type="button"
                className="settings-reset-button"
                aria-label="Reset font"
                onClick={() =>
                  updatePreferences({
                    fontFamily: defaultReaderPreferences.fontFamily,
                  })
                }
              >
                <RotateCcw aria-hidden="true" size={14} />
              </button>
            </div>
            <div className="font-select">
              <button
                type="button"
                className="font-select-button"
                aria-controls="reader-font-options"
                aria-expanded={fontMenuOpen}
                aria-label="Reader font"
                onClick={() => setFontMenuOpen((current) => !current)}
              >
                <span style={{ fontFamily: selectedFont.stack }}>
                  {selectedFont.label}
                </span>
                <ChevronDown aria-hidden="true" size={16} />
              </button>
              {fontMenuOpen && (
                <div
                  id="reader-font-options"
                  className="font-select-options"
                  aria-label="Reader font options"
                >
                  {readerFontOptions.map((fontOption) => (
                    <button
                      key={fontOption.id}
                      type="button"
                      aria-pressed={preferences.fontFamily === fontOption.id}
                      className="font-select-option"
                      style={{ fontFamily: fontOption.stack }}
                      onClick={() => {
                        updatePreferences({
                          fontFamily: fontOption.id as ReaderFontId,
                        });
                        setFontMenuOpen(false);
                      }}
                    >
                      <span>{fontOption.label}</span>
                      {preferences.fontFamily === fontOption.id && (
                        <Check aria-hidden="true" size={15} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="settings-control">
            <div className="settings-control-row">
              <span>Theme</span>
              <button
                type="button"
                className="settings-reset-button"
                aria-label="Reset theme"
                onClick={() =>
                  updatePreferences({
                    theme: defaultReaderPreferences.theme,
                  })
                }
              >
                <RotateCcw aria-hidden="true" size={14} />
              </button>
            </div>
            <div
              className="settings-theme-group"
              role="group"
              aria-label="Reader theme"
            >
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
          </div>
        </section>
      )}
    </div>
  );
}
