import { expect, test } from "@playwright/test";
import { audioVoiceStorageKey } from "../../src/lib/audio-preferences";
import { highQualityVoicePreferenceId, wieldingSection } from "./fixtures";

// Pressing play in the toolbar used to tear through the whole book in silence.
// The hosted provider seeks by character ratio when a clip carries no word
// timings, but the toolbar starts a clip during the original user gesture while
// the canonical body text is still loading, so `text` held only the title. The
// body offset is longer than that placeholder, the ratio cleared 1, and every
// clip seeked past its own end. `ended` fired at once, the island advanced, and
// the player title cycled several times a second with no audio.
//
// The fake media element below models the one browser behaviour that made the
// bug visible: seeking to or past the duration ends the clip.
test("toolbar play stays on the section it started", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.addInitScript(
    ({
      preferenceId,
      storageKey,
    }: {
      preferenceId: string;
      storageKey: string;
    }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ voiceURI: preferenceId, rate: 1, pitch: 1 }),
      );

      const requestedSources: string[] = [];
      const clipDuration = 60;

      function FakeAudio(this: Record<string, unknown>) {
        this.preload = "";
        this.playbackRate = 1;
        this.paused = true;
        this.duration = clipDuration;
        this.onended = null;
        this.onerror = null;
        this.onloadedmetadata = null;
        this.ontimeupdate = null;
        this._src = "";
        this._currentTime = 0;
      }

      Object.defineProperties(FakeAudio.prototype, {
        src: {
          configurable: true,
          get(this: Record<string, unknown>) {
            return this._src;
          },
          set(this: Record<string, unknown>, value: string) {
            this._src = value;
            if (value) requestedSources.push(value);
          },
        },
        currentTime: {
          configurable: true,
          get(this: Record<string, unknown>) {
            return this._currentTime;
          },
          // A real media element that is seeked to or past its duration
          // finishes immediately. That is the behaviour which turned a bad
          // proportional seek into a runaway queue.
          set(this: Record<string, unknown>, value: number) {
            this._currentTime = value;
            if (value >= clipDuration) {
              window.setTimeout(
                () => (this.onended as (() => void) | null)?.(),
                0,
              );
            }
          },
        },
      });

      FakeAudio.prototype.play = function play(
        this: Record<string, unknown>,
      ): Promise<void> {
        this.paused = false;
        window.setTimeout(
          () => (this.onloadedmetadata as (() => void) | null)?.(),
          0,
        );
        return Promise.resolve();
      };
      FakeAudio.prototype.pause = function pause(
        this: Record<string, unknown>,
      ): void {
        this.paused = true;
      };
      FakeAudio.prototype.removeAttribute = function removeAttribute(
        this: Record<string, unknown>,
        name: string,
      ): void {
        if (name === "src") this._src = "";
      };
      FakeAudio.prototype.load = function load(): void {};

      Object.defineProperty(window, "Audio", {
        configurable: true,
        value: FakeAudio,
      });
      Object.defineProperty(window, "__requestedAudioSources", {
        configurable: true,
        get: () => requestedSources,
      });
    },
    {
      preferenceId: highQualityVoicePreferenceId,
      storageKey: audioVoiceStorageKey,
    },
  );

  const manifestLoaded = page.waitForResponse((response) =>
    response.url().endsWith("/data/audio-manifest.json"),
  );
  const sectionsLoaded = page.waitForResponse((response) =>
    response.url().endsWith("/data/progress-sections.json"),
  );
  await page.goto(wieldingSection.href);
  await manifestLoaded;
  await sectionsLoaded;
  await page.evaluate(() => new Promise(requestAnimationFrame));

  await page.getByRole("button", { name: "Listen" }).click();

  const playerTitle = page.locator(".audio-player-title-row strong");
  await expect(playerTitle).toHaveText(wieldingSection.title);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __requestedAudioSources: string[] })
            .__requestedAudioSources.length,
      ),
    )
    .toBe(1);

  // Long enough for a runaway queue to burn through many sections.
  await page.waitForTimeout(1_500);

  await expect(playerTitle).toHaveText(wieldingSection.title);
  expect(new URL(page.url()).pathname).toBe(
    new URL(wieldingSection.href, "http://127.0.0.1").pathname,
  );

  const requestedSources = await page.evaluate(
    () =>
      (window as unknown as { __requestedAudioSources: string[] })
        .__requestedAudioSources,
  );
  expect(requestedSources).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
