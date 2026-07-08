"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, RotateCcw, Settings } from "lucide-react";
import {
  applyReaderPreferences,
  defaultReaderPreferences,
  fontOptionById,
  parseReaderPreferences,
  readerAnimationOptions,
  readerFontOptions,
  readerFontSizeMax,
  readerFontSizeMin,
  readerFontSizeStep,
  readerPreferencesStorageKey,
  readerThemeOptions,
  serializeReaderPreferences,
  type ReaderAnimations,
  type ReaderFontId,
  type ReaderPreferences,
  type ReaderTheme,
} from "@/lib/reader-preferences";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";

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

type FontMenuPosition = {
  left: number;
  maxHeight: number;
  ready: boolean;
  top: number;
  width: number;
};

const floatingMenuOffset = 8;
const floatingMenuViewportPadding = 12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function animationLabel(animations: ReaderAnimations): string {
  if (animations === "balanced") return "Balanced";
  return "None";
}

export function ToolbarSettingsIsland() {
  const pathname = usePathname();
  const fontButtonRef = useRef<HTMLButtonElement | null>(null);
  const fontOptionsRef = useRef<HTMLDivElement | null>(null);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [fontMenuPosition, setFontMenuPosition] = useState<FontMenuPosition>({
    left: 0,
    maxHeight: 320,
    ready: false,
    top: 0,
    width: 280,
  });
  const {
    open,
    rendered,
    setOpen,
    toggle,
    containerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>({
    floatingRefs: [fontOptionsRef],
    onDismiss: () => setFontMenuOpen(false),
    onEscape: () => {
      if (!fontMenuOpen) return true;
      setFontMenuOpen(false);
      return false;
    },
  });
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
  }, [pathname, setOpen]);

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

  function toggleFontMenu(): void {
    setFontMenuPosition((current) => ({ ...current, ready: false }));
    setFontMenuOpen((current) => !current);
  }

  useLayoutEffect(() => {
    if (!fontMenuOpen) return;

    let frame = 0;

    const updatePosition = () => {
      const button = fontButtonRef.current;
      const options = fontOptionsRef.current;
      if (!button || !options) return;

      const buttonRect = button.getBoundingClientRect();
      const optionsHeight = options.scrollHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(
        buttonRect.width,
        viewportWidth - floatingMenuViewportPadding * 2,
      );
      const left = clamp(
        buttonRect.left,
        floatingMenuViewportPadding,
        Math.max(
          floatingMenuViewportPadding,
          viewportWidth - width - floatingMenuViewportPadding,
        ),
      );
      const belowSpace =
        viewportHeight -
        buttonRect.bottom -
        floatingMenuOffset -
        floatingMenuViewportPadding;
      const aboveSpace =
        buttonRect.top - floatingMenuOffset - floatingMenuViewportPadding;
      const placeBelow =
        belowSpace >= Math.min(optionsHeight, 180) ||
        belowSpace >= aboveSpace;
      const availableSpace = Math.max(
        placeBelow ? belowSpace : aboveSpace,
        120,
      );
      const maxHeight = Math.min(optionsHeight, availableSpace);
      const top = placeBelow
        ? buttonRect.bottom + floatingMenuOffset
        : buttonRect.top - maxHeight - floatingMenuOffset;

      setFontMenuPosition({
        left,
        maxHeight,
        ready: true,
        top: clamp(
          top,
          floatingMenuViewportPadding,
          Math.max(
            floatingMenuViewportPadding,
            viewportHeight - maxHeight - floatingMenuViewportPadding,
          ),
        ),
        width,
      });
    };

    const requestUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };

    requestUpdate();
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("scroll", requestUpdate, true);

    const resizeObserver = new ResizeObserver(requestUpdate);
    if (fontButtonRef.current) resizeObserver.observe(fontButtonRef.current);
    if (fontOptionsRef.current) resizeObserver.observe(fontOptionsRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("scroll", requestUpdate, true);
      resizeObserver.disconnect();
    };
  }, [fontMenuOpen]);

  const selectedFont = fontOptionById(preferences.fontFamily);
  const fontSizeIsDefault =
    preferences.fontSize === defaultReaderPreferences.fontSize;
  const fontFamilyIsDefault =
    preferences.fontFamily === defaultReaderPreferences.fontFamily;
  const themeIsDefault = preferences.theme === defaultReaderPreferences.theme;
  const fontOptions =
    fontMenuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={fontOptionsRef}
            id="reader-font-options"
            className="font-select-options"
            aria-label="Reader font options"
            style={
              {
                left: `${fontMenuPosition.left}px`,
                maxHeight: `${fontMenuPosition.maxHeight}px`,
                opacity: fontMenuPosition.ready ? 1 : 0,
                top: `${fontMenuPosition.top}px`,
                width: `${fontMenuPosition.width}px`,
              } as CSSProperties
            }
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="settings-menu" ref={containerRef}>
      <button
        {...triggerProps}
        type="button"
        className="settings-menu-button"
        aria-label="Reader settings"
        aria-controls="reader-settings-menu"
        onClick={() => {
          if (open) setFontMenuOpen(false);
          toggle();
        }}
      >
        <Settings aria-hidden="true" size={17} />
      </button>
      {rendered && (
        <section
          {...popoverProps}
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
                disabled={fontSizeIsDefault}
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
                disabled={fontFamilyIsDefault}
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
                ref={fontButtonRef}
                type="button"
                className="font-select-button"
                aria-controls="reader-font-options"
                aria-expanded={fontMenuOpen}
                aria-label="Reader font"
                onClick={toggleFontMenu}
              >
                <span style={{ fontFamily: selectedFont.stack }}>
                  {selectedFont.label}
                </span>
                <ChevronDown aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
          <div className="settings-control">
            <div className="settings-control-row">
              <span>Theme</span>
              <button
                type="button"
                className="settings-reset-button"
                aria-label="Reset theme"
                disabled={themeIsDefault}
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
          <fieldset className="settings-control settings-radio-section">
            <legend>Animations</legend>
            <div className="settings-radio-group">
              {readerAnimationOptions.map((animations) => (
                <label key={animations} className="settings-radio-option">
                  <input
                    type="radio"
                    name="reader-animations"
                    value={animations}
                    checked={preferences.animations === animations}
                    onChange={() => updatePreferences({ animations })}
                  />
                  <span>{animationLabel(animations)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      )}
      {fontOptions}
    </div>
  );
}
