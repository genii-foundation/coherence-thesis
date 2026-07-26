import { expect, test, type Page } from "@playwright/test";
import {
  emptyBookmarks,
  readerBookmarksStorageKey,
  serializeBookmarks,
  addBookmark,
} from "../../src/lib/reader-bookmarks";
import { expectMenuFitsViewport, firstSection } from "./fixtures";

// Select `words` words the way the device under test actually would.
//
// On a pointer device that means a real mouse drag: a synthetic pointerup
// dispatched at the document does not drive the island in Chromium, and
// testing the shortcut rather than the gesture would have hidden that. The drag
// starts at the second word so the decorative drop cap on the opening
// paragraph cannot swallow the first press.
//
// On a touch device there is no drag that selects text. The platform takes over
// on long press and moves its own handles, which Playwright cannot drive, so
// the selection is set through the Selection API. That is a fair stand-in
// because the island keys off selectionchange, which is exactly what the
// platform emits when those handles move.
async function selectWords(
  page: Page,
  words: number,
  hasTouch: boolean,
): Promise<string> {
  const boxes = await page
    .locator(".manuscript-prose p .audio-word")
    .evaluateAll(
      (elements, count) =>
        elements.slice(1, count + 1).map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
      words,
    );

  if (!hasTouch) {
    const first = boxes[0]!;
    const last = boxes[boxes.length - 1]!;
    await page.mouse.move(first.x + 1, first.y + first.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
  } else {
    await page.evaluate((count) => {
      const spans = [
        ...document.querySelectorAll(".manuscript-prose p .audio-word"),
      ].slice(1, count + 1);
      const range = document.createRange();
      range.setStartBefore(spans[0]!);
      range.setEndAfter(spans[spans.length - 1]!);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, words);
  }

  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

async function storedBookmarks(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : { bookmarks: {} };
  }, readerBookmarksStorageKey);
}

test("selecting three or more words offers a bookmark, and saves it", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);

  const selected = await selectWords(page, 5, hasTouch);
  expect(selected.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(3);

  const bubble = page.getByRole("button", { name: "Click to bookmark" });
  await expect(bubble).toBeVisible();
  await bubble.click();

  await expect(page.getByText("Bookmark saved")).toBeVisible();

  const stored = await storedBookmarks(page);
  const saved = Object.values(stored.bookmarks) as Array<
    Record<string, unknown>
  >;
  expect(saved).toHaveLength(1);
  // The durable half of the anchor: a content-addressed paragraph id, its bare
  // hash, and offsets into that block's visible text.
  expect(saved[0]!.paragraphAnchor).toMatch(/^p-h[0-9a-f]{16}(-\d+)?$/);
  expect(saved[0]!.paragraphContentHash).toMatch(/^[0-9a-f]{16}$/);
  expect(saved[0]!.sectionId).toBe(firstSection.sectionId);
  expect(saved[0]!.quote).toBe(selected.trim());
  expect(saved[0]!.progressKey).toBe(
    firstSection.continuityId || firstSection.sectionId,
  );
});

test("a selection under three words offers nothing", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  await selectWords(page, 2, hasTouch);
  await expect(
    page.getByRole("button", { name: "Click to bookmark" }),
  ).toBeHidden();
});

test("saved bookmarks survive a reload and filter in the toolbar", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /^Bookmarks, / }).click();

  const panel = page.getByRole("region", { name: "Bookmarks" }).or(
    page.locator(".bookmarks-popover"),
  );
  await expect(panel.locator(".bookmark-row")).toHaveCount(1);

  const filter = page.getByPlaceholder("Filter bookmarks");
  await filter.fill("zzzz-no-such-passage");
  await expect(panel.locator(".bookmark-row")).toHaveCount(0);
  await expect(page.getByText("No bookmarks match that filter.")).toBeVisible();

  await filter.fill("");
  await expect(panel.locator(".bookmark-row")).toHaveCount(1);

  await expectMenuFitsViewport(
    page,
    ".bookmarks-popover",
    ".bookmarks-scroll",
  );
});

test("removing a bookmark leaves a tombstone rather than deleting it", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  await page.getByRole("button", { name: /^Bookmarks, / }).click();
  await page.getByRole("button", { name: /^Remove bookmark:/ }).click();

  await expect(page.locator(".bookmark-row")).toHaveCount(0);

  const stored = await storedBookmarks(page);
  const entries = Object.values(stored.bookmarks) as Array<
    Record<string, unknown>
  >;
  // The record survives so other devices learn about the deletion instead of
  // merging their still-live copy back in.
  expect(entries).toHaveLength(1);
  expect(entries[0]!.removedAt).toEqual(expect.any(Number));
  expect(entries[0]!.quote).toBe("");
});

test("the empty panel explains how to make a bookmark", async ({ page }) => {
  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: "Bookmarks, none saved" }).click();
  await expect(
    page.getByText(/Select three or more words in the manuscript/),
  ).toBeVisible();
});

test("seven toolbar controls stay clear of the brand at 320px", async ({
  page,
}) => {
  // The Playwright projects run at 393px and desktop, so the tightest real
  // phone width is otherwise untested. Adding a seventh control put the
  // leftmost button under the brand mark here until the control size dropped.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(firstSection.readerHref);

  const metrics = await page.evaluate(() => {
    const search = document
      .querySelector(".search-menu-button")
      ?.getBoundingClientRect();
    const brand = document
      .querySelector(".site-header > .brand-mark")
      ?.getBoundingClientRect();
    const progress = document
      .querySelector(".progress-menu-button")
      ?.getBoundingClientRect();
    return {
      brandRight: brand?.right ?? 0,
      searchLeft: search?.left ?? 0,
      progressRight: progress?.right ?? 0,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      controlCount: document.querySelectorAll(".site-nav > * > button").length,
    };
  });

  expect(metrics.controlCount).toBe(7);
  expect(metrics.brandRight).toBeLessThanOrEqual(metrics.searchLeft);
  expect(metrics.progressRight).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

test("a bookmark on a revised paragraph is reported as stale", async ({
  page,
}) => {
  // Seed a bookmark whose paragraph anchor no longer exists in the manuscript.
  // Resolution falls to the bottom rung and the panel has to say so rather than
  // silently sending the reader to the top of the section.
  const seeded = addBookmark(
    emptyBookmarks(),
    {
      section: {
        sectionId: firstSection.sectionId,
        contentHash: firstSection.contentHash,
        continuityId: firstSection.continuityId,
      },
      paragraphAnchor: "p-h0000000000000000",
      quote: "a passage that has since been rewritten",
      startOffset: 0,
      endOffset: 39,
    },
    1_700_000_000_000,
    "stale-1",
  );

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: readerBookmarksStorageKey, value: serializeBookmarks(seeded) },
  );
  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: /^Bookmarks, / }).click();

  await expect(page.getByText("revised since you saved it")).toBeVisible();
});

test("the reading map marks and counts cells that hold a bookmark", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  await page.goto("/progress/");

  const marked = page.locator(".progress-heatmap-cell-bookmarked");
  await expect(marked.first()).toBeVisible();
  await expect(page.getByText("bookmarked section", { exact: false })).toBeVisible();

  const geometry = await marked.first().evaluate((cell) => {
    const style = window.getComputedStyle(cell);
    const rect = cell.getBoundingClientRect();
    return {
      clipPath: style.clipPath,
      width: rect.width,
      height: rect.height,
      radius: Number.parseFloat(style.borderTopLeftRadius),
      label: cell.getAttribute("aria-label") ?? "",
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  // The mark is a silhouette, so it must not disturb a single box metric the
  // grid's own assertions depend on.
  expect(geometry.clipPath).toContain("polygon");
  expect(Math.abs(geometry.width - geometry.height)).toBeLessThanOrEqual(1);
  expect(geometry.radius).toBeGreaterThanOrEqual(geometry.width / 2 - 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  // One accessible name, not two labelled children.
  expect(geometry.label).toContain("bookmarked");
});

test("search lifts a section that holds a bookmark", async ({ page }) => {
  const query = "coherence";

  const resultHrefs = async () => {
    await page.getByRole("button", { name: "Search manuscripts" }).click();
    const input = page.getByPlaceholder("Search all manuscripts");
    await input.fill(query);
    // The index is about 1.5 MB and is fetched on first open, so the first
    // result legitimately takes longer than the default expect budget on a
    // loaded machine. This waits for the fetch, not for a race.
    await expect(page.locator(".search-result").first()).toBeVisible({
      timeout: 15_000,
    });
    return page
      .locator(".search-result")
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
  };

  await page.goto(firstSection.readerHref);
  const before = await resultHrefs();
  expect(before.length).toBeGreaterThan(2);

  // Bookmark whatever currently ranks last, so the assertion is about the
  // boost rather than about one hand-picked section.
  const target = before[before.length - 1]!;
  const seeded = await page.evaluate(
    async ({ href, storageKey }) => {
      const sections = await fetch("/data/progress-sections.json").then(
        (response) => response.json(),
      );
      const section = sections.find(
        (candidate: { readerHref: string }) => candidate.readerHref === href,
      );
      if (!section) return null;
      const now = Date.now();
      const bookmark = {
        id: "search-boost-1",
        progressKey: section.continuityId || section.sectionId,
        sectionId: section.sectionId,
        paragraphAnchor: section.paragraphs[0].anchor,
        paragraphContentHash: section.paragraphs[0].contentHash,
        quote: "coherence",
        quoteOrdinal: 0,
        prefix: "",
        suffix: "",
        startOffset: 0,
        endOffset: 9,
        sectionContentHash: section.contentHash,
        createdAt: now,
        updatedAt: now,
      };
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ bookmarks: { "search-boost-1": bookmark } }),
      );
      return section.sectionId;
    },
    { href: target, storageKey: readerBookmarksStorageKey },
  );
  expect(seeded).not.toBeNull();

  await page.reload();
  const after = await resultHrefs();

  expect(after.indexOf(target)).toBeGreaterThanOrEqual(0);
  expect(after.indexOf(target)).toBeLessThan(before.indexOf(target));
});

test("bookmark highlights are off until the reader turns them on", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  const highlightState = () =>
    page.evaluate(() => ({
      supported:
        typeof CSS !== "undefined" &&
        "highlights" in CSS &&
        typeof Highlight === "function",
      preference: document.documentElement.dataset.readerHighlights,
      painted:
        typeof CSS !== "undefined" && "highlights" in CSS
          ? (CSS.highlights.get("coherence-bookmark")?.size ?? 0)
          : 0,
    }));

  const off = await highlightState();
  test.skip(!off.supported, "CSS Custom Highlight API is unavailable");
  // Painting reader marks over the manuscript is opt in, so a fresh reader with
  // a saved bookmark still sees untouched prose.
  expect(off.preference).toBe("off");
  expect(off.painted).toBe(0);

  await page.getByRole("button", { name: "Reader settings" }).click();
  // The radio input is visually clipped, so the label is the real target, the
  // same way settings.spec.ts drives the animations group.
  await page
    .locator(".settings-radio-section")
    .filter({ hasText: "Bookmark highlights" })
    .locator(".settings-radio-option")
    .filter({ hasText: "Shown" })
    .click();

  await expect
    .poll(async () => (await highlightState()).painted)
    .toBeGreaterThan(0);
  expect((await highlightState()).preference).toBe("on");

  // And it survives a reload, through the pre-paint bootstrap.
  await page.reload();
  await expect
    .poll(async () => (await highlightState()).painted)
    .toBeGreaterThan(0);
});
