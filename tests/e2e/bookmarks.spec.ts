import { expect, test, type Page } from "@playwright/test";
import {
  emptyBookmarks,
  readerBookmarksStorageKey,
  serializeBookmarks,
  addBookmark,
  maxLiveBookmarks,
  type ReaderBookmarksState,
} from "../../src/lib/reader-bookmarks";
import sectionLineage from "../../publishing/continuity/section-lineage.json";
import {
  catalog,
  chapterWithNeighbors,
  expectMenuFitsViewport,
  firstSection,
  readerPreferencesStorageKey,
} from "./fixtures";

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
      const selection = window.getSelection();
      if (!selection) return;
      const last = spans[spans.length - 1]!;

      // Grow an existing selection with extend(), the way dragging a platform
      // selection handle does. Tearing the range down and rebuilding it would
      // collapse the selection first, which no real gesture does and which
      // would make a growing selection look like a series of new ones.
      if (!selection.isCollapsed && selection.rangeCount > 0) {
        selection.extend(last, last.childNodes.length);
        return;
      }
      const range = document.createRange();
      range.setStartBefore(spans[0]!);
      range.setEndAfter(last);
      selection.removeAllRanges();
      selection.addRange(range);
    }, words);
  }

  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

async function selectAcrossParagraphs(
  page: Page,
  paragraphCount: number,
): Promise<string> {
  return page.evaluate((count) => {
    const paragraphs = [
      ...document.querySelectorAll<HTMLElement>(
        ".manuscript-prose p[data-paragraph-anchor]",
      ),
    ].slice(0, count);
    const firstWord = paragraphs[0]?.querySelector(".audio-word");
    const lastWords = paragraphs.at(-1)?.querySelectorAll(".audio-word");
    const lastWord = lastWords?.[Math.min(4, lastWords.length - 1)];
    if (!firstWord || !lastWord) return "";

    const range = document.createRange();
    range.setStartBefore(firstWord);
    range.setEndAfter(lastWord);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return selection?.toString() ?? "";
  }, paragraphCount);
}

async function storedBookmarks(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : { bookmarks: {} };
  }, readerBookmarksStorageKey);
}

test("bookmark paragraph data loads only when the menu opens", async ({
  page,
}) => {
  await page.goto(firstSection.readerHref);
  const loadedBeforeOpen = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .some((entry) => entry.name.endsWith("/data/bookmark-sections.json")),
  );
  expect(loadedBeforeOpen).toBe(false);

  const manifestResponse = page.waitForResponse((response) =>
    response.url().endsWith("/data/bookmark-sections.json"),
  );
  await page.getByRole("button", { name: "Bookmarks, none saved" }).click();
  expect((await manifestResponse).ok()).toBe(true);

  const manifests = await page.evaluate(async () => {
    const [progress, bookmarks] = await Promise.all([
      fetch("/data/progress-sections.json").then((response) => response.json()),
      fetch("/data/bookmark-sections.json").then((response) => response.json()),
    ]);
    return { progress, bookmarks };
  });
  expect(manifests.progress[0]).not.toHaveProperty("paragraphs");
  expect(manifests.bookmarks[0]).toMatchObject({
    sectionId: expect.any(String),
    paragraphs: expect.arrayContaining([
      expect.objectContaining({
        anchor: expect.any(String),
        contentHash: expect.any(String),
      }),
    ]),
  });
});

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
  // A single-paragraph selection is represented by equal durable endpoints.
  const range = saved[0]!.range as {
    start: Record<string, unknown>;
    end: Record<string, unknown>;
  };
  expect(range.start.paragraphAnchor).toMatch(/^p-h[0-9a-f]{16}(-\d+)?$/);
  expect(range.start.paragraphContentHash).toMatch(/^[0-9a-f]{16}$/);
  expect(range.end.paragraphAnchor).toBe(range.start.paragraphAnchor);
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

test("one bookmark spans, restores, and identifies a multi-paragraph passage", async ({
  page,
}) => {
  await page.goto(firstSection.readerHref);

  await selectAcrossParagraphs(page, 3);
  const bubble = page.getByRole("button", { name: "Click to bookmark" });
  await expect(bubble).toBeVisible();
  await bubble.click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  const stored = await storedBookmarks(page);
  const saved = Object.values(stored.bookmarks)[0] as {
    quote: string;
    range: {
      start: { paragraphAnchor: string };
      end: { paragraphAnchor: string };
    };
  };
  expect(saved.range.start.paragraphAnchor).not.toBe(
    saved.range.end.paragraphAnchor,
  );
  expect(saved.quote.split("\n\n")).toHaveLength(3);

  await page.getByRole("button", { name: /^Bookmarks, / }).click();
  await expect(page.getByText("3 paragraphs", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  const marker = page.locator('[data-bookmark-highlight="true"]');
  await expect(marker).toHaveAttribute(
    "data-paragraph-anchor",
    saved.range.start.paragraphAnchor,
  );
  await expect(marker).toHaveAttribute(
    "data-end-paragraph-anchor",
    saved.range.end.paragraphAnchor,
  );
  const heightBeforeReload = await marker.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(heightBeforeReload).toBeGreaterThan(100);

  await page.reload();
  await expect(page.locator('[data-bookmark-highlight="true"]')).toBeVisible();
});

test("a selection crossing reader sections is not bookmarkable", async ({
  page,
}) => {
  await page.goto(chapterWithNeighbors.href);
  const selectedAcrossSections = await page.evaluate(() => {
    const sections = [
      ...document.querySelectorAll<HTMLElement>(
        ".chapter-reader-section[data-reader-section-id]",
      ),
    ];
    const first = sections[0]?.querySelector<HTMLElement>(
      ".manuscript-prose p[data-paragraph-anchor]",
    );
    const second = sections[1]?.querySelector<HTMLElement>(
      ".manuscript-prose p[data-paragraph-anchor]",
    );
    if (!first || !second) return false;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(second, second.childNodes.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  });
  expect(selectedAcrossSections).toBe(true);

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
  const quotePreview = panel.locator(".bookmark-quote");
  await expect(quotePreview).toHaveCSS("-webkit-line-clamp", "3");
  await expect(quotePreview).toHaveCSS("white-space", "pre-line");

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
  const selected = await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  await page.getByRole("button", { name: /^Bookmarks, / }).click();
  const removeButton = page.getByRole("button", {
    name: /^Remove bookmark:/,
  });
  await removeButton.click();

  const confirmation = page.getByRole("dialog", {
    name: "Delete this bookmark?",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(selected.trim());
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);

  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(removeButton).toBeFocused();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);

  await removeButton.click();
  await page
    .getByRole("dialog", { name: "Delete this bookmark?" })
    .getByRole("button", { name: "Delete bookmark" })
    .click();

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

test("deleting all bookmarks requires typed confirmation", async ({ page }) => {
  const section = {
    sectionId: firstSection.sectionId,
    contentHash: firstSection.contentHash,
    continuityId: firstSection.continuityId,
  };
  const firstBookmark = addBookmark(
    emptyBookmarks(),
    {
      section,
      paragraphAnchor: firstSection.paragraphs[0]!.anchor,
      quote: "the first passage saved for bulk deletion",
      startOffset: 0,
      endOffset: 41,
    },
    1_700_000_000_000,
    "bulk-delete-1",
  );
  const seeded = addBookmark(
    firstBookmark,
    {
      section,
      paragraphAnchor: firstSection.paragraphs[1]!.anchor,
      quote: "the second passage saved for bulk deletion",
      startOffset: 0,
      endOffset: 42,
    },
    1_700_000_000_001,
    "bulk-delete-2",
  );
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: readerBookmarksStorageKey, value: serializeBookmarks(seeded) },
  );

  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: /^Bookmarks, / }).click();
  const deleteAll = page.getByRole("button", { name: "Delete all" });
  await expect(deleteAll).toBeVisible();
  await deleteAll.click();

  const confirmation = page.getByRole("dialog", {
    name: "Delete all bookmarks?",
  });
  const entry = confirmation.getByLabel("Type DELETE ALL to confirm");
  const confirmButton = confirmation.getByRole("button", {
    name: "Delete all bookmarks",
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(
    "This removes all 2 bookmarks and their notes.",
  );
  await expect(entry).toBeFocused();
  await expect(confirmButton).toBeDisabled();

  await entry.fill("DELETE");
  await expect(confirmButton).toBeDisabled();
  await entry.fill("DELETE ALL");
  await expect(confirmButton).toBeEnabled();

  const modalGeometry = await confirmation.evaluate((dialog) => {
    const backdrop = dialog.parentElement;
    const box = dialog.getBoundingClientRect();
    return {
      parentTag: backdrop?.parentElement?.tagName ?? "",
      backdropPosition: backdrop
        ? window.getComputedStyle(backdrop).position
        : "",
      top: box.top,
      left: box.left,
      right: box.right,
      bottom: box.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
    };
  });
  expect(modalGeometry.parentTag).toBe("BODY");
  expect(modalGeometry.backdropPosition).toBe("fixed");
  expect(modalGeometry.top).toBeGreaterThanOrEqual(-1);
  expect(modalGeometry.left).toBeGreaterThanOrEqual(-1);
  expect(modalGeometry.right).toBeLessThanOrEqual(
    modalGeometry.viewportWidth + 1,
  );
  expect(modalGeometry.bottom).toBeLessThanOrEqual(
    modalGeometry.viewportHeight + 1,
  );

  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(deleteAll).toBeFocused();
  await expect(page.locator(".bookmark-row")).toHaveCount(2);

  await deleteAll.click();
  const reopened = page.getByRole("dialog", {
    name: "Delete all bookmarks?",
  });
  await reopened.getByLabel("Type DELETE ALL to confirm").fill("DELETE ALL");
  await reopened.getByRole("button", { name: "Delete all bookmarks" }).click();

  await expect(reopened).toHaveCount(0);
  await expect(page.locator(".bookmark-row")).toHaveCount(0);
  await expect(page.getByText(/Keep what finds you/)).toBeVisible();

  const stored = await storedBookmarks(page);
  const entries = Object.values(stored.bookmarks) as Array<
    Record<string, unknown>
  >;
  expect(entries).toHaveLength(2);
  for (const bookmark of entries) {
    expect(bookmark.removedAt).toEqual(expect.any(Number));
    expect(bookmark.quote).toBe("");
  }
});

test("the empty panel explains how to make a bookmark", async ({ page }) => {
  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: "Bookmarks, none saved" }).click();
  await expect(
    page.getByText(
      "Keep what finds you. Select three or more words, then choose Bookmark.",
    ),
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

test("a bookmark saved under a historical section id resolves to the renamed section", async ({
  page,
}) => {
  // The committed lineage ledger records that this historical id now publishes
  // as v01-the-work-behind-the-book. A reader who bookmarked before the rename
  // holds exactly this record, and the toolbar row must stay a working link.
  const historicalId = "v01-on-form-timing-and-why-this-book-exists";
  const lineageEntry = sectionLineage.sections.find((entry) =>
    entry.historicalSectionIds.includes(historicalId),
  )!;
  expect(lineageEntry).toBeDefined();
  const renamedSection = catalog.sections.find(
    (section) => section.sectionId === lineageEntry.currentSectionId,
  )!;
  expect(renamedSection.sectionId).not.toBe(historicalId);

  const paragraph = renamedSection.paragraphs[0]!;
  const seeded = addBookmark(
    emptyBookmarks(),
    {
      // The identity an old client would have written: the then-current
      // sectionId, with the same value as its progress key.
      section: {
        sectionId: historicalId,
        contentHash: renamedSection.contentHash,
        continuityId: historicalId,
      },
      paragraphAnchor: paragraph.anchor,
      quote: "a passage saved before the section was renamed",
      startOffset: 0,
      endOffset: 46,
    },
    1_700_000_000_000,
    "pre-rename-1",
  );
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: readerBookmarksStorageKey, value: serializeBookmarks(seeded) },
  );

  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: /^Bookmarks, / }).click();

  const row = page.locator(".bookmark-row");
  await expect(row).toHaveCount(1);
  // A real link to the renamed section's route, not an unlinkable span.
  const quoteLink = row.locator("a.bookmark-quote");
  await expect(quoteLink).toBeVisible();
  await expect(quoteLink).toHaveAttribute(
    "href",
    `${renamedSection.readerHref}#${paragraph.anchor}`,
  );
  // The paragraph survives, so nothing about this bookmark is stale.
  await expect(page.getByText("revised since you saved it")).toBeHidden();
  await expect(row.locator(".bookmark-trail")).toContainText(
    renamedSection.title,
  );
});

test("a bookmark whose section id resolves nowhere is reported as stale", async ({
  page,
}) => {
  const seeded = addBookmark(
    emptyBookmarks(),
    {
      section: {
        sectionId: "a-section-that-never-existed",
        contentHash: "gone-hash",
        continuityId: "a-section-that-never-existed",
      },
      paragraphAnchor: "p-h0000000000000000",
      quote: "a passage whose section cannot be found",
      startOffset: 0,
      endOffset: 39,
    },
    1_700_000_000_000,
    "orphaned-1",
  );
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: readerBookmarksStorageKey, value: serializeBookmarks(seeded) },
  );

  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: /^Bookmarks, / }).click();

  const row = page.locator(".bookmark-row");
  await expect(row).toHaveCount(1);
  // No destination exists, so the quote must not pretend to be a link, and the
  // row must carry the stale tag rather than reading as healthy.
  await expect(row.locator("a.bookmark-quote")).toHaveCount(0);
  await expect(row.locator("span.bookmark-quote")).toBeVisible();
  await expect(page.getByText("revised since you saved it")).toBeVisible();
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

test("bookmark text and notes produce first-class search results", async ({
  page,
}) => {
  await page.goto(firstSection.readerHref);
  const anchor = firstSection.paragraphs[0]!.anchor;
  const paragraphContentHash = firstSection.paragraphs[0]!.contentHash;
  const now = Date.now();
  await page.evaluate(
    ({ section, paragraphAnchor, paragraphHash, storageKey, timestamp }) => {
      const bookmark = {
        id: "search-bookmark-1",
        progressKey: section.continuityId || section.sectionId,
        sectionId: section.sectionId,
        paragraphAnchor,
        paragraphContentHash: paragraphHash,
        quote:
          "The future of civilization will not be decided by technology or ideology, but by whether we learn to organize society around the biological conditions that make intelligence, trust, and coordination possible at planetary scale.",
        quoteOrdinal: 0,
        prefix: "",
        suffix: "",
        startOffset: 0,
        endOffset: 213,
        sectionContentHash: section.contentHash,
        note: "private retrieval phrase",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ bookmarks: { "search-bookmark-1": bookmark } }),
      );
    },
    {
      section: firstSection,
      paragraphAnchor: anchor,
      paragraphHash: paragraphContentHash,
      storageKey: readerBookmarksStorageKey,
      timestamp: now,
    },
  );

  await page.reload();
  await page.getByRole("button", { name: "Search manuscripts" }).click();
  const input = page.getByPlaceholder("Search all manuscripts");
  await expect(page.locator(".search-result")).toHaveCount(0);
  await input.fill("techno");
  const results = page.locator(".search-result");
  await expect(results.first()).toBeVisible({ timeout: 15_000 });
  await expect(results.first()).toHaveAttribute(
    "data-search-result-kind",
    "bookmark",
  );
  await expect(results.first()).toHaveAttribute(
    "href",
    `${firstSection.readerHref}#${anchor}`,
  );
  await expect(
    results.first().locator(".search-result-bookmark-icon"),
  ).toBeVisible();
  await expect(
    results.first().locator(".search-result-snippet"),
  ).toContainText(
    "Bookmarked passage: The future of civilization will not be decided by technology or ideology",
  );
  const searchPreview = await results
    .first()
    .locator(".search-result-snippet")
    .evaluate((snippet) => {
      const style = window.getComputedStyle(snippet);
      return {
        lineClamp: style.getPropertyValue("-webkit-line-clamp"),
        whiteSpace: style.whiteSpace,
      };
    });
  expect(searchPreview).toEqual({ lineClamp: "3", whiteSpace: "normal" });

  await input.fill("private retrieval phrase");
  const noteResults = page.locator(".search-result");
  await expect(noteResults.first()).toBeVisible();
  await expect(noteResults.first()).toHaveAttribute(
    "data-search-result-kind",
    "bookmark",
  );
  await expect(
    noteResults.first().locator(".search-result-snippet"),
  ).toContainText("Bookmark note: private retrieval phrase");
});

test("bookmark margin highlights are shown by default and can be hidden", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, readerPreferencesStorageKey);
  await page.reload();
  const selected = await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  const marker = page.locator('[data-bookmark-highlight="true"]');
  await expect(marker).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.dataset.readerHighlights,
    ),
  ).toBe("on");

  const markerGeometry = await marker.evaluate((element) => {
    const markerBox = element.getBoundingClientRect();
    const paragraphAnchor = (element as HTMLElement).dataset.paragraphAnchor;
    const block = paragraphAnchor
      ? document.querySelector(
          `.manuscript-prose [data-paragraph-anchor="${CSS.escape(paragraphAnchor)}"]`,
        )
      : null;
    const prose = block?.closest(".manuscript-prose");
    const proseBox = prose?.getBoundingClientRect();
    const icon = element.querySelector<HTMLElement>(
      ".reader-bookmark-highlight-icon",
    );
    const line = element.querySelector<HTMLElement>(
      ".reader-bookmark-highlight-line",
    );
    const iconBox = icon?.getBoundingClientRect();
    const lineBox = line?.getBoundingClientRect();
    const markerStyle = getComputedStyle(element);
    const iconStyle = icon ? getComputedStyle(icon) : null;
    const lineStyle = line ? getComputedStyle(line) : null;

    return {
      hasBookmarkIcon: Boolean(element.querySelector("svg")),
      iconBackground: iconStyle?.backgroundColor ?? "",
      iconToLineGap:
        iconBox && lineBox ? Math.round(lineBox.top - iconBox.bottom) : -1,
      lineColor: lineStyle?.backgroundColor ?? "",
      lineWidth: Number.parseFloat(lineStyle?.width ?? "0"),
      markerBackground: markerStyle.backgroundColor,
      markerHeight: markerBox.height,
      markerRight: markerBox.right,
      proseLeft: proseBox?.left ?? 0,
      textHighlightCount:
        typeof CSS !== "undefined" && "highlights" in CSS
          ? (CSS.highlights.get("coherence-bookmark")?.size ?? 0)
          : 0,
    };
  });

  expect(markerGeometry.hasBookmarkIcon).toBe(true);
  expect(markerGeometry.iconBackground).toBe("rgba(0, 0, 0, 0)");
  expect(markerGeometry.iconToLineGap).toBeGreaterThanOrEqual(1);
  expect(markerGeometry.lineWidth).toBe(3);
  expect(markerGeometry.lineColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(markerGeometry.markerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(markerGeometry.markerHeight).toBeGreaterThanOrEqual(44);
  expect(markerGeometry.markerRight).toBeLessThanOrEqual(
    markerGeometry.proseLeft,
  );
  expect(markerGeometry.textHighlightCount).toBe(0);

  await marker.hover();
  const details = page.getByRole("dialog", { name: "Bookmark details" });
  await expect(details).toBeVisible();
  await expect(
    details.locator(".reader-bookmark-highlight-quote"),
  ).toContainText(selected.trim());
  await expect(details.getByRole("button", { name: "Add a note" })).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Remove bookmark" }),
  ).toBeVisible();
  expect(
    await details.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(340);
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();

  await page.getByRole("button", { name: "Reader settings" }).click();
  await page
    .locator(".settings-radio-section")
    .filter({ hasText: "Bookmark highlights" })
    .locator(".settings-radio-option")
    .filter({ hasText: "Hidden" })
    .click();

  await expect(marker).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.dataset.readerHighlights,
    ),
  ).toBe("off");

  // An intentional Hidden choice survives reload under the new preference
  // schema, while legacy default-off values migrate to Shown.
  await page.reload();
  await expect(marker).toHaveCount(0);
});

test("the bookmarks panel is an opaque surface that contains its content", async ({
  page,
  isMobile,
}) => {
  // This shipped broken once. The popover base rule supplies only position,
  // size, and the height transition; the surface belongs to the panel's own
  // class. Without it the panel was transparent and its content spilled over
  // the prose, while every geometry assertion still passed.
  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: /^Bookmarks, / }).click();

  const panel = page.locator(".bookmarks-popover");
  await expect(panel).toBeVisible();

  const surface = await panel.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const header = document.querySelector(".site-header");
    return {
      background: style.backgroundColor,
      headerBackground: header
        ? window.getComputedStyle(header).backgroundColor
        : "",
      overflowY: style.overflowY,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      hasShadow: style.boxShadow !== "none",
      height: element.getBoundingClientRect().height,
    };
  });

  // Opaque means neither the keyword nor a zero-alpha colour. This is the part
  // that was actually missing, and it holds at every width.
  expect(surface.background).not.toBe("transparent");
  expect(surface.background).not.toMatch(/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/);
  // Either clips or scrolls, never lets content escape onto the prose.
  // Deliberately not comparing the scroller's box to the panel's: the panel
  // bounds by paint, and the inner scroller keeps its natural layout height,
  // so a box comparison would fail on a correct panel.
  expect(surface.overflowY).not.toBe("visible");
  expect(surface.hasShadow).toBe(true);
  expect(surface.height).toBeGreaterThan(0);

  if (isMobile) {
    // Below 860px the menu reads as the toolbar extending downward, so it takes
    // the header's own colour and drops the border that would seam it.
    expect(surface.background).toBe(surface.headerBackground);
    expect(surface.borderWidth).toBe(0);
  } else {
    expect(surface.borderWidth).toBeGreaterThan(0);
  }
});

test("the bookmark count follows the bookmark list without a divider", async ({
  page,
}) => {
  const seeded = addBookmark(
    emptyBookmarks(),
    {
      section: {
        sectionId: firstSection.sectionId,
        contentHash: firstSection.contentHash,
        continuityId: firstSection.continuityId,
      },
      paragraphAnchor: firstSection.paragraphs[0]!.anchor,
      quote: "a passage saved to verify the bookmark count",
      startOffset: 0,
      endOffset: 46,
    },
    1_700_000_000_000,
    "count-placement-1",
  );
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: readerBookmarksStorageKey, value: serializeBookmarks(seeded) },
  );
  await page.goto(firstSection.readerHref);
  await page.getByRole("button", { name: /^Bookmarks, / }).click();

  const scroll = page.locator(".bookmarks-scroll");
  const summary = scroll.locator(".bookmarks-summary");
  await expect(summary).toBeVisible();

  const layout = await scroll.evaluate((element) => {
    const summaryElement = element.querySelector(".bookmarks-summary");
    const deleteAll = summaryElement?.querySelector(".bookmark-delete-all");
    const rows = [...element.querySelectorAll(".bookmark-row")];
    const summaryStyle = summaryElement
      ? window.getComputedStyle(summaryElement)
      : null;
    const summaryBox = summaryElement?.getBoundingClientRect();
    const deleteAllBox = deleteAll?.getBoundingClientRect();
    return {
      isLastElement: element.lastElementChild === summaryElement,
      deleteAllIsLast: summaryElement?.lastElementChild === deleteAll,
      deleteAllRightGap: (summaryBox?.right ?? 0) - (deleteAllBox?.right ?? 0),
      rowCount: rows.length,
      summaryTop: summaryElement?.getBoundingClientRect().top ?? 0,
      lastRowBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? 0,
      borderBottomWidth: Number.parseFloat(
        summaryStyle?.borderBottomWidth ?? "0",
      ),
    };
  });

  expect(layout.rowCount).toBeGreaterThan(0);
  expect(layout.isLastElement).toBe(true);
  expect(layout.deleteAllIsLast).toBe(true);
  expect(Math.abs(layout.deleteAllRightGap)).toBeLessThanOrEqual(1);
  expect(layout.summaryTop).toBeGreaterThanOrEqual(layout.lastRowBottom);
  expect(layout.borderBottomWidth).toBe(0);
});

test("a full 1,000-bookmark collection remains a contained scroll surface", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The desktop run protects the collection-size contract.");

  const records: ReaderBookmarksState["bookmarks"] = Object.create(null);
  const now = 1_700_000_000_000;
  for (let index = 0; index < maxLiveBookmarks; index += 1) {
    const id = `stress-${index}`;
    const paragraph =
      firstSection.paragraphs[index % firstSection.paragraphs.length]!;
    const quote = `Sample passage ${index + 1} preserves enough manuscript context to make a full bookmark collection representative.`;
    records[id] = {
      id,
      progressKey: firstSection.continuityId || firstSection.sectionId,
      sectionId: firstSection.sectionId,
      range: {
        start: {
          paragraphAnchor: paragraph.anchor,
          paragraphContentHash: paragraph.contentHash,
          offset: 0,
        },
        end: {
          paragraphAnchor: paragraph.anchor,
          paragraphContentHash: paragraph.contentHash,
          offset: quote.length,
        },
      },
      quote,
      quoteOrdinal: 0,
      prefix: "",
      suffix: "",
      sectionContentHash: firstSection.contentHash,
      createdAt: now - index,
      updatedAt: now - index,
    };
  }

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: readerBookmarksStorageKey,
      value: serializeBookmarks({ bookmarks: records }),
    },
  );
  await page.goto(firstSection.readerHref);
  await page
    .getByRole("button", { name: "Bookmarks, 1,000 saved" })
    .click();

  const panel = page.locator(".bookmarks-popover");
  const scroll = panel.locator(".bookmarks-scroll");
  await expect(scroll.locator(".bookmarks-summary-count")).toHaveText(
    "1,000 bookmarks",
  );
  await expectMenuFitsViewport(page, ".bookmarks-popover", ".bookmarks-scroll");

  const virtualization = await scroll.evaluate((element) => {
    const rows = element.querySelectorAll(".bookmark-row");
    const virtualList = element.querySelector(".bookmarks-virtual-list");
    const virtualRow = element.querySelector(".bookmark-virtual-row");
    const summary = element.querySelector(".bookmarks-summary");
    return {
      renderedRowCount: rows.length,
      totalHeight: virtualList?.getBoundingClientRect().height ?? 0,
      virtualRowPosition: virtualRow
        ? window.getComputedStyle(virtualRow).position
        : "",
      summaryIsLast: element.lastElementChild === summary,
    };
  });
  expect(virtualization.renderedRowCount).toBeGreaterThan(0);
  expect(virtualization.renderedRowCount).toBeLessThan(maxLiveBookmarks / 10);
  expect(virtualization.totalHeight).toBeGreaterThan(100_000);
  expect(virtualization.virtualRowPosition).toBe("absolute");
  expect(virtualization.summaryIsLast).toBe(true);

  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    panel.getByText("Sample passage 1000", { exact: false }),
  ).toBeVisible();
});

test("the toolbar control turns for an offer and again for a save", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  const trigger = page.locator(".bookmarks-menu-button");
  const card = trigger.locator(".bookmark-card");
  const back = trigger.locator(".bookmark-face-back svg");

  await expect(trigger).not.toHaveClass(/is-bookmark-/);

  // Selecting a passage is an invitation. It turns, but the back stays an
  // outline: nothing has been saved, so the glyph must not claim otherwise.
  await selectWords(page, 5, hasTouch);
  await expect(trigger).toHaveClass(/is-bookmark-offered/);
  expect(
    await card.evaluate((el) => window.getComputedStyle(el).animationName),
  ).toBe("bookmark-turn");
  expect(await back.evaluate((el) => window.getComputedStyle(el).fill)).toBe(
    "none",
  );

  await expect(trigger).not.toHaveClass(/is-bookmark-offered/, {
    timeout: 5_000,
  });

  // Saving turns it over the solid, so the fill is revealed by the motion.
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(trigger).toHaveClass(/is-bookmark-saved/);
  expect(
    await card.evaluate((el) => window.getComputedStyle(el).animationName),
  ).toBe("bookmark-turn");
  expect(
    await back.evaluate((el) => window.getComputedStyle(el).fill),
  ).not.toBe("none");

  // Both settle rather than becoming permanent chrome.
  await expect(trigger).not.toHaveClass(/is-bookmark-/, { timeout: 5_000 });
});

test("extending a selection does not re-offer on every change", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  const trigger = page.locator(".bookmarks-menu-button");

  // Hydrate first, and prove the island is listening, so what follows measures
  // the guard rather than a race.
  await selectWords(page, 4, hasTouch);
  await expect(trigger).toHaveClass(/is-bookmark-offered/);
  await expect(trigger).not.toHaveClass(/is-bookmark-offered/, {
    timeout: 5_000,
  });

  await page.evaluate(() => {
    const store = { count: 0 };
    (window as unknown as Record<string, unknown>).__offers = store;
    window.addEventListener("coherence:reader-bookmark-offered", () => {
      store.count += 1;
    });
  });

  // One continuous gesture that keeps growing. Every intermediate move emits a
  // selectionchange and re-reads the anchor, so this is where a naive
  // implementation would turn the control over a dozen times.
  const boxes = await page
    .locator(".manuscript-prose p .audio-word")
    .evaluateAll((els) =>
      els.slice(1, 10).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );

  if (!hasTouch) {
    const first = boxes[0]!;
    await page.mouse.move(first.x + 1, first.y + first.height / 2);
    await page.mouse.down();
    for (const box of boxes.slice(1)) {
      await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
  } else {
    // Touch has no drag that selects; the platform moves its own handles, and
    // extend() is the primitive that models it.
    for (const index of [4, 6, 8]) {
      await page.evaluate((count) => {
        const spans = [
          ...document.querySelectorAll(".manuscript-prose p .audio-word"),
        ].slice(1, count + 1);
        const last = spans[spans.length - 1]!;
        window.getSelection()?.extend(last, last.childNodes.length);
      }, index);
      await page.waitForTimeout(120);
    }
  }

  await page.waitForTimeout(700);
  const offers = await page.evaluate(
    () =>
      ((window as unknown as Record<string, { count: number }>).__offers ?? {
        count: -1,
      }).count,
  );
  // At most one for the whole gesture. Pressing again is a new gesture and is
  // allowed to offer again; growing without releasing is not.
  expect(offers).toBeLessThanOrEqual(1);
});

test("account tools export the production reader report contract", async ({
  page,
  hasTouch,
}) => {
  await page.goto(firstSection.readerHref);
  const selectedQuote = await selectWords(page, 5, hasTouch);
  await page.getByRole("button", { name: "Click to bookmark" }).click();
  await expect(page.getByText("Bookmark saved")).toBeVisible();

  // Export belongs with the account controls, not inside the bookmarks panel.
  await page.getByRole("button", { name: /^Bookmarks, / }).click();
  await expect(page.locator(".bookmarks-export")).toHaveCount(0);
  await page.getByRole("button", { name: "Add a note" }).click();
  const note = [
    "Review this before continuing.",
    "## Reading activity",
  ].join("\n");
  const noteField = page.getByRole("textbox", { name: "Bookmark note" });
  await noteField.fill(note);
  await noteField.press("Tab");
  await expect(noteField).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Progress/ }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export reading statistics and bookmarks" })
    .click();
  const file = await download;

  expect(file.suggestedFilename()).toBe("coherence-thesis-reader-data.md");
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const markdown = Buffer.concat(chunks).toString("utf8");

  expect(markdown).toContain("# Your Coherence Thesis reader data");
  expect(markdown).toContain("Export format version: 2.");
  expect(markdown).toContain("## Summary");
  expect(markdown).toContain("Bookmarks saved: 1");
  expect(markdown).toContain(selectedQuote.trim());
  expect(markdown).toContain(
    [
      "Note:",
      "",
      "> Review this before continuing.",
      "> ## Reading activity",
    ].join("\n"),
  );
  expect(markdown).toContain("## Reading activity");
  expect(markdown).toContain("## Activity records");
  expect(markdown).toContain("## Your settings");
  // The reader is owed a plain answer about where their data lives.
  expect(markdown).toContain("## Where this is stored");
  expect(markdown).toContain("not currently signed in");
  expect(markdown).toContain(
    "cannot determine whether a previous signed-in session synchronized",
  );
  expect(markdown).toContain(firstSection.title);
  expect(markdown.match(/^## .+$/gm)).toEqual([
    "## Summary",
    "## Bookmarks",
    "## Reading activity",
    "## Activity records",
    "## Your settings",
    "## Where this is stored",
  ]);
});
