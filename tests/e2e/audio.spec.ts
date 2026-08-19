import { expect, test } from "@playwright/test";
import { audioVoiceStorageKey } from "../../src/lib/audio-preferences";
import {
  firstSection,
  highQualityVoicePreferenceId,
  hostedAudioSection,
} from "./fixtures";

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
      const playsWithUserActivation: boolean[] = [];
      const clipDuration = 60;

      // iOS only permits a media element to start while a user gesture is
      // active. Recording activation at play() time is the portable proxy for
      // that rule: headless browsers do not enforce it, but a play() issued
      // synchronously inside the click handler satisfies it everywhere.
      let clickDispatchDepth = 0;
      window.addEventListener(
        "click",
        () => {
          clickDispatchDepth += 1;
          window.setTimeout(() => {
            clickDispatchDepth -= 1;
          }, 0);
        },
        true,
      );

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
        playsWithUserActivation.push(
          navigator.userActivation?.isActive ?? clickDispatchDepth > 0,
        );
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
      Object.defineProperty(window, "__playsWithUserActivation", {
        configurable: true,
        get: () => playsWithUserActivation,
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
  await page.goto(hostedAudioSection.readerHref);
  await manifestLoaded;
  await sectionsLoaded;
  await page.evaluate(() => new Promise(requestAnimationFrame));

  await page.getByRole("button", { name: "Audiobook menu" }).click();
  await page.getByRole("button", { name: "Play audiobook" }).click();

  const playerTitle = page.locator(".audio-transport-title-row strong");
  await expect(playerTitle).toHaveText(hostedAudioSection.title);
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

  await expect(playerTitle).toHaveText(hostedAudioSection.title);
  expect(new URL(page.url()).pathname).toBe(
    new URL(hostedAudioSection.readerHref, "http://127.0.0.1").pathname,
  );

  const requestedSources = await page.evaluate(
    () =>
      (window as unknown as { __requestedAudioSources: string[] })
        .__requestedAudioSources,
  );
  expect(requestedSources).toHaveLength(1);

  // The clip must be started by the gesture itself, not by a callback after an
  // await. iOS rejects the latter and drops the audiobook to the system voice.
  const playsWithUserActivation = await page.evaluate(
    () =>
      (window as unknown as { __playsWithUserActivation: boolean[] })
        .__playsWithUserActivation,
  );
  expect(playsWithUserActivation).toEqual([true]);

  expect(pageErrors).toEqual([]);
});

test("offline volume numbers use the readable theme color", async ({ page }) => {
  await page.goto(firstSection.href);
  await page.getByRole("button", { name: "Audiobook menu" }).click();

  const volumeNumber = page.locator(".audio-offline-number").first();
  await expect(volumeNumber).toBeVisible();

  for (const theme of ["textured", "light", "dark", "black"] as const) {
    await page.evaluate((readerTheme) => {
      document.documentElement.dataset.readerTheme = readerTheme;
    }, theme);

    const colors = await volumeNumber.evaluate((number) => {
      const styles = getComputedStyle(number);
      const expectedColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--bronze-deep")
        .trim();
      const probe = document.createElement("span");
      probe.style.color = expectedColor;
      document.body.append(probe);
      const normalizedExpected = getComputedStyle(probe).color;
      probe.remove();
      return {
        actual: styles.color,
        expected: normalizedExpected,
      };
    });

    expect(colors.actual, theme).toBe(colors.expected);
  }
});

// The tooltip lives inside its word so layout moves both in the same browser
// pass. A body portal driven by scroll measurements always trails the prose by
// at least one frame, even when it eventually reaches the right coordinates.
test("the word playback tooltip moves with its word in the scroll frame", async ({
  page,
}) => {
  await page.goto(firstSection.href);

  const targetWord = page.locator(".manuscript-prose p .audio-word").first();
  await expect(targetWord).toBeVisible();
  await targetWord.hover();
  await targetWord.click();

  const tooltip = page.getByRole("button", {
    name: "Click Again to start playback",
  });
  await expect(tooltip).toBeVisible();

  const offsetFromWord = () =>
    page.evaluate(() => {
      const word = document.querySelector(".audio-word.is-audio-focused");
      const bubble = document.querySelector(".audio-word-tooltip");
      if (!word || !bubble) return null;
      const wordBox = word.getBoundingClientRect();
      const bubbleBox = bubble.getBoundingClientRect();
      return {
        horizontal:
          bubbleBox.left +
          bubbleBox.width / 2 -
          (wordBox.left + wordBox.width / 2),
        vertical: wordBox.top - bubbleBox.bottom,
      };
    });

  const anchored = await offsetFromWord();
  expect(anchored).not.toBeNull();
  await expect
    .poll(() =>
      tooltip.evaluate((bubble) =>
        bubble.parentElement?.parentElement?.matches(
          ".audio-word.is-audio-focused",
        ),
      ),
    )
    .toBe(true);

  // Read the geometry in the same task that scrolls. Scroll listeners, animation
  // frames, and React commits cannot run between the scroll and this sample, so
  // a manually positioned body portal fails here even if polling would let it
  // catch up later.
  await page.mouse.move(0, 0);
  const afterScroll = await page.evaluate(() => {
    const word = document.querySelector(".audio-word.is-audio-focused");
    const bubble = document.querySelector(".audio-word-tooltip");
    const header = document.querySelector(".site-header");
    if (!word || !bubble || !header) return null;
    const clearance =
      word.getBoundingClientRect().top -
      header.getBoundingClientRect().bottom;
    if (clearance <= 2) return null;
    window.scrollBy({ top: Math.floor(clearance / 2), behavior: "instant" });
    const wordBox = word.getBoundingClientRect();
    const bubbleBox = bubble.getBoundingClientRect();
    return {
      horizontal:
        bubbleBox.left +
        bubbleBox.width / 2 -
        (wordBox.left + wordBox.width / 2),
      vertical: wordBox.top - bubbleBox.bottom,
    };
  });
  expect(afterScroll).not.toBeNull();
  expect(afterScroll!.horizontal).toBeCloseTo(anchored!.horizontal, 0);
  expect(afterScroll!.vertical).toBeCloseTo(anchored!.vertical, 0);

  // Scrolling the word away carries the bubble out of the viewport in the same
  // layout operation. It remains mounted inside the focused word so returning
  // to it needs no geometry subscription or remount.
  const wordLeftViewport = await page.evaluate(() => {
    const word = document.querySelector(".audio-word.is-audio-focused");
    if (!word) return null;
    window.scrollBy({
      top: word.getBoundingClientRect().bottom + 40,
      behavior: "instant",
    });
    return word.getBoundingClientRect().bottom <= 0;
  });
  expect(wordLeftViewport).toBe(true);
  await expect(tooltip).not.toBeInViewport();

  // Scrolling back brings both home, still anchored, without another click.
  await page.evaluate(() =>
    window.scrollTo({ top: 0, behavior: "instant" }),
  );
  await expect(tooltip).toBeVisible();
  const returned = await offsetFromWord();
  expect(returned).not.toBeNull();
  expect(returned!.horizontal).toBeCloseTo(anchored!.horizontal, 0);
  expect(returned!.vertical).toBeCloseTo(anchored!.vertical, 0);

  // The sticky header has a higher stacking level, so the tooltip travels under
  // it with the word instead of covering the navigation.
  const stacking = await page.evaluate(() => {
    const word = document.querySelector(".audio-word.is-audio-focused");
    const bubble = document.querySelector(".audio-word-tooltip");
    const header = document.querySelector(".site-header");
    if (!word || !bubble || !header) return null;
    return {
      bubble: Number.parseInt(getComputedStyle(bubble).zIndex, 10),
      header: Number.parseInt(getComputedStyle(header).zIndex, 10),
    };
  });
  expect(stacking).not.toBeNull();
  expect(stacking!.header).toBeGreaterThan(stacking!.bubble);
});

// Bold is wider than regular, so marking the spoken word with weight reflowed
// the line on every word boundary and shoved the paragraph around underneath
// the reader. The marker is an underline now, which costs no inline space.
test("the spoken word marker does not move the text", async ({ page }) => {
  await page.goto(firstSection.href);

  const words = page.locator(".manuscript-prose p .audio-word");
  // "Coherence" and "Thesis" stay beside each other at both supported
  // viewports, so a width change in the first word has an observable neighbor.
  const target = words.nth(1);
  await expect(target).toBeVisible();
  // Wait for the interaction island to hydrate before mutating a word class.
  // Otherwise the test can race React's first client pass and manufacture a
  // hydration warning that the product never emits.
  await target.hover();
  const tooltip = page.getByRole("button", { name: "Click Here to Play" });
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  const nextWordLeft = () =>
    page.evaluate(() => {
      const words = document.querySelectorAll(
        ".manuscript-prose p .audio-word",
      );
      const target = words[1];
      const next = words[2];
      if (!target || !next) return null;
      const targetBox = target.getBoundingClientRect();
      const nextBox = next.getBoundingClientRect();
      return targetBox.top === nextBox.top ? nextBox.left : null;
    });

  const before = await nextWordLeft();
  expect(before).not.toBeNull();

  const marked = await page.evaluate(() => {
    const word = document.querySelectorAll(".manuscript-prose p .audio-word")[1];
    word?.classList.add("is-audio-current");
    const style = window.getComputedStyle(word!);
    return style.textDecorationLine;
  });

  expect(marked).toContain("underline");
  // The old marker transitioned to font-weight: 800 over 140ms. Measuring only
  // the first frame saw the unbolded starting value and let the broken rule
  // pass, so inspect the settled state too.
  await page.waitForTimeout(180);
  // Whatever weight the surrounding prose uses, the marker must not add to it.
  const settledWeights = await page.evaluate(() => {
    const words = document.querySelectorAll(
      ".manuscript-prose p .audio-word",
    );
    return {
      marked: window.getComputedStyle(words[1]!).fontWeight,
      unmarked: window.getComputedStyle(words[2]!).fontWeight,
    };
  });
  expect(settledWeights.marked).toBe(settledWeights.unmarked);

  expect(await nextWordLeft()).toBeCloseTo(before!, 1);
});
