import { expect, test, type Page } from "@playwright/test";
import { audioVoiceStorageKey } from "../../src/lib/audio-preferences";
import { readerBookmarksStorageKey } from "../../src/lib/reader-bookmarks";
import { catalog } from "../../src/lib/manuscript-data";
import { highQualityVoicePreferenceId } from "./fixtures";

test.use({ serviceWorkers: "allow" });
test.setTimeout(180_000);

const offlineVolume = catalog.volumes.find(
  (volume) => volume.href === "/manuscripts/9/",
)!;
const hostedSection = catalog.sections.find(
  (section) => section.sectionId === "v09-providence",
)!;

async function selectFiveWords(page: Page): Promise<string> {
  return page.evaluate((sectionId) => {
    const words = [
      ...document.querySelectorAll(
        `[data-audio-word='true'][data-audio-section-id='${CSS.escape(sectionId)}']`,
      ),
    ].slice(1, 6);
    const range = document.createRange();
    range.setStartBefore(words[0]!);
    range.setEndAfter(words.at(-1)!);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection?.toString() ?? "";
  }, hostedSection.sectionId);
}

test("a downloaded manuscript supports cold offline reading, search, navigation, bookmarks, and word playback", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Playwright WebKit crashes internally when a service-worker context is switched offline.",
  );
  await context.route(
    "**/storage/v1/object/public/audio-clips/**",
    async (route) => {
      if (route.request().url().endsWith(".json")) {
        await route.fulfill({
          body: JSON.stringify({
            schemaVersion: 1,
            sectionId: hostedSection.sectionId,
            audioVersionId: hostedSection.audioVersionId,
            durationSeconds: 30,
            words: [
              { charStart: 0, charEnd: 10, startSeconds: 0, endSeconds: 1 },
            ],
          }),
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
        });
        return;
      }
      await route.fulfill({
        body: Buffer.from("offline-audio"),
        contentType: "audio/ogg",
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );

  await context.addInitScript(
    ({ preferenceId, storageKey }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ voiceURI: preferenceId, rate: 1, pitch: 1 }),
      );
      const sources: string[] = [];
      function FakeAudio(this: Record<string, unknown>) {
        this.preload = "";
        this.playbackRate = 1;
        this.paused = true;
        this.duration = 30;
        this.currentTime = 0;
        this.onended = null;
        this.onerror = null;
        this.onloadedmetadata = null;
        this.ontimeupdate = null;
        this._src = "";
      }
      Object.defineProperty(FakeAudio.prototype, "src", {
        configurable: true,
        get(this: Record<string, unknown>) {
          return this._src;
        },
        set(this: Record<string, unknown>, value: string) {
          this._src = value;
          if (value) sources.push(value);
        },
      });
      FakeAudio.prototype.play = function play(
        this: Record<string, unknown>,
      ): Promise<void> {
        if (
          typeof this._src === "string" &&
          this._src.startsWith("http") &&
          !navigator.onLine
        ) {
          return Promise.reject(new Error("Network unavailable"));
        }
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
      Object.defineProperty(window, "__offlineAudioSources", {
        configurable: true,
        get: () => sources,
      });
    },
    {
      preferenceId: highQualityVoicePreferenceId,
      storageKey: audioVoiceStorageKey,
    },
  );

  await page.goto(hostedSection.href);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolve(),
        {
          once: true,
        },
      );
    });
  });

  await page.getByRole("button", { name: "Audiobook menu" }).click();
  const download = page.getByRole("button", {
    name: `Download ${offlineVolume.title} for offline reading and playback`,
  });
  await expect(download).toBeEnabled();
  await download.click();
  await expect(
    page.getByRole("button", {
      name: `${offlineVolume.title} is available offline`,
    }),
  ).toBeVisible({ timeout: 120_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: hostedSection.title }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Search manuscripts" }).click();
  const search = page.getByPlaceholder("Search downloaded manuscripts");
  await expect(search).toBeVisible();
  await search.fill("A Note on the Register");
  const results = page.locator(".search-result");
  await expect(results.first()).toBeVisible();
  await expect(results.locator(".search-result-meta")).toContainText([
    offlineVolume.title,
  ]);

  await page.keyboard.press("Escape");
  await page.goto(hostedSection.href, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: hostedSection.title }),
  ).toBeVisible();
  const selected = await selectFiveWords(page);
  expect(selected.split(/\s+/).filter(Boolean)).toHaveLength(5);
  const bookmarkAction = page.getByRole("button", {
    name: "Click to bookmark",
  });
  await expect(bookmarkAction).toBeVisible();
  await bookmarkAction.evaluate((button) =>
    (button as HTMLButtonElement).click(),
  );
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  const targetWord = page
    .locator(
      `[data-audio-word='true'][data-audio-section-id='${hostedSection.sectionId}']`,
    )
    .first();
  await targetWord.scrollIntoViewIfNeeded();
  await targetWord.click();
  await page
    .getByRole("button", { name: "Click Again to start playback" })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause audiobook" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __offlineAudioSources: string[] })
            .__offlineAudioSources,
      ),
    )
    .toContainEqual(expect.stringMatching(/^blob:/));

  const previous = page.locator(".section-nav-link-previous");
  const previousHref = await previous.getAttribute("href");
  await previous.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(previousHref);
  await expect(page.locator(".manuscript-prose")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = window.localStorage.getItem(key);
        return value
          ? Object.keys(JSON.parse(value).bookmarks ?? {}).length
          : 0;
      }, readerBookmarksStorageKey),
    )
    .toBe(1);
});
