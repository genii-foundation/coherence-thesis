import { expect, test } from "@playwright/test";
import { catalog, partById } from "../../src/lib/manuscript-data";
import { readerProgressStorageKey } from "../../src/lib/reader-state";

const firstSection = catalog.sections[0];
const firstSectionVersionDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(firstSection.versionDate));
const firstOverviewReference = catalog.overview.nodes.flatMap(
  (node) => node.references,
)[0]!;
const firstOverviewSection = catalog.sections.find(
  (section) => section.sectionId === firstOverviewReference.sectionId,
)!;
const searchTargetSection = catalog.sections.find((section) =>
  section.title.includes("Federated Footprint"),
)!;
const wieldingVolume = catalog.volumes.find(
  (volume) => volume.volumeId === "wielding-intelligence",
)!;
const wieldingFrontMatter = wieldingVolume.parts.find(
  (part) => part.partId === "front-matter",
)!;
const wieldingSection = catalog.sections.find(
  (section) => section.volumeId === "wielding-intelligence",
)!;
const singleSectionChapterTarget = catalog.sections.find(
  (section) =>
    section.href ===
    "/manuscripts/providence-imperative/the-living-reality/the-second-link-perception-makes-new-coordination-possible/v03-the-second-link-perception-makes-new-coordination-possible/",
)!;
const singleSectionPart = partById(
  singleSectionChapterTarget.volumeId,
  singleSectionChapterTarget.partId,
)!;
const singleSectionChapter = singleSectionPart.chapters.find(
  (chapter) => chapter.chapterId === singleSectionChapterTarget.chapterId,
)!;

const currentYear = new Date().getFullYear();
const copyrightYearLabel =
  currentYear > 2026 ? `2026 to ${currentYear}` : "2026";

test("home page presents the overview and manuscript entry points", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The Coherence Thesis" })).toBeVisible();
  await expect(page.locator(".brand-kicker")).toHaveText("Providence Collective");
  await expect(page.locator(".brand-title")).toHaveText("The Coherence Thesis");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://www.coherence-thesis.com/art/coherence-thesis-hero.png",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1024",
  );
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
    "content",
    "1536",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.getByRole("link", { name: /Read the overview/ })).toHaveAttribute(
    "href",
    "/overview/",
  );
  await expect(page.getByRole("link", { name: /Browse manuscripts/ })).toHaveAttribute(
    "href",
    "/manuscripts/",
  );
  await expect(page.getByText("Nine volume series")).toBeVisible();
  await expect(page.locator(".overview-map")).toHaveCount(0);
  await expect(page.getByText("Ready for the full body")).toHaveCount(0);
  await expect(page.locator(".manuscript-cover-card")).toHaveCount(
    catalog.volumes.length,
  );
  expect(catalog.volumes.map((volume) => volume.coverImage)).toEqual(
    catalog.volumes.map(
      (volume) => `/art/coherence-thesis-vol${volume.order}-cover.png`,
    ),
  );
  await expect(page.locator(".hero-art img")).toHaveAttribute(
    "src",
    "/art/coherence-thesis-hero.png",
  );
  const footer = page.getByRole("contentinfo", { name: "Site information" });
  await expect(footer).toBeVisible();
  await expect(footer).toHaveCSS("border-top-width", "0px");
  await expect(
    footer.getByText(`© ${copyrightYearLabel} by the Providence Collective.`),
  ).toBeVisible();
  await expect(footer.getByText("Licensing: CC BY-SA 4.0.")).toBeVisible();
  const licenseLink = footer.getByRole("link", { name: "CC BY-SA 4.0" });
  await expect(licenseLink).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by-sa/4.0/",
  );
  await expect(licenseLink).toHaveAttribute("target", "_blank");
  await expect(licenseLink).toHaveAttribute("rel", "license");
  const robertLink = footer.getByRole("link", { name: "Robert James Ryan III" });
  await expect(robertLink).toHaveAttribute(
    "href",
    "https://www.instagram.com/allelseis",
  );
  await expect(robertLink).toHaveAttribute("target", "_blank");
  await expect(robertLink).toHaveAttribute("rel", "author");
  const aubreyLink = footer.getByRole("link", { name: "Aubrey Falconer" });
  await expect(aubreyLink).toHaveAttribute(
    "href",
    "https://aubreyfalconer.com",
  );
  await expect(aubreyLink).toHaveAttribute("target", "_blank");
  await expect(aubreyLink).toHaveAttribute("rel", "author");

  const homepageSpacing = await page.evaluate(() => {
    const hero = document.querySelector(".hero-section")?.getBoundingClientRect();
    const stats = document.querySelector(".stats-band")?.getBoundingClientRect();
    return {
      gap: hero && stats ? stats.top - hero.bottom : 0,
      heroHeight: hero?.height ?? 0,
    };
  });
  expect(homepageSpacing.gap).toBeGreaterThanOrEqual(24);
  if (testInfo.project.name === "desktop") {
    expect(homepageSpacing.heroHeight).toBeLessThanOrEqual(1000);
  }

  const homepageCoverShadows = await page.evaluate(() => {
    const heroImage = document.querySelector(".hero-art img");
    const coverCard = document.querySelector(".manuscript-cover-card");
    return {
      hero: heroImage ? getComputedStyle(heroImage).boxShadow : "",
      card: coverCard ? getComputedStyle(coverCard).boxShadow : "",
    };
  });
  expect(homepageCoverShadows.hero).toBe(homepageCoverShadows.card);
  expect(homepageCoverShadows.hero).not.toBe("none");

  const wieldingCard = page.getByRole("link", { name: "Open Wielding Intelligence" });
  const wieldingPanel = wieldingCard.locator(".manuscript-card-panel");
  await expect(wieldingCard.locator("img")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(wieldingPanel).toBeHidden();
    await wieldingCard.hover();
  }
  await expect(wieldingPanel).toBeVisible();
  await expect(wieldingPanel.getByText("Wielding Intelligence")).toBeVisible();
  await expect(
    wieldingPanel.getByText(`${wieldingVolume.wordCount.toLocaleString()} words`),
  ).toBeVisible();
});

test("overview links into canonical manuscript sections", async ({ page }) => {
  await page.goto("/overview/");

  await expect(page.getByRole("heading", { name: "The Coherence Thesis" })).toBeVisible();
  await expect(page.getByRole("link", { name: /The seed/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /The seed/ }).first().click();
  await expect(page).toHaveURL(/\/manuscripts\/humanitys-most-viable-future\//);
});

test("overview references show local read checkmarks", async ({ page }) => {
  await page.addInitScript(
    ({ contentHash, key, sectionId }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          sections: {
            [sectionId]: {
              sectionId,
              contentHash,
              readAt: Date.now(),
              percent: 100,
            },
          },
        }),
      );
    },
    {
      contentHash: firstOverviewSection.contentHash,
      key: readerProgressStorageKey,
      sectionId: firstOverviewSection.sectionId,
    },
  );

  await page.goto("/overview/");

  const label = firstOverviewReference.label ?? firstOverviewSection.title;
  const readReference = page.locator(".reference-grid a", { hasText: label }).first();
  await expect(readReference.locator('[data-read-checkmark="true"]')).toBeVisible();
});

test("manuscript volume heading does not overlap its stats line", async ({ page }) => {
  const volume = catalog.volumes[0];
  expect(volume).toBeDefined();

  await page.goto(volume!.href);

  const heading = page.locator(".volume-heading h1");
  const stats = page.locator(".volume-heading p").last();
  await expect(heading).toBeVisible();
  await expect(stats).toBeVisible();

  const headingBox = await heading.boundingBox();
  const statsBox = await stats.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(statsBox).not.toBeNull();

  if (headingBox && statsBox) {
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(statsBox.y - 1);
  }
});

test("single-section chapter cards open reader content directly", async ({ page }) => {
  await page.goto(singleSectionPart.href);

  const chapterCard = page.getByRole("link", {
    name: new RegExp(singleSectionChapterTarget.title),
  });
  await expect(chapterCard).toHaveAttribute("href", singleSectionChapterTarget.href);
  await chapterCard.click();

  await expect(page).toHaveURL(singleSectionChapterTarget.href);
  await expect(
    page.getByRole("heading", { name: singleSectionChapterTarget.title }),
  ).toBeVisible();
  await expect(page.locator(".section-index")).toHaveCount(0);

  await page.goto(singleSectionChapter.href);
  await expect(page).toHaveURL(singleSectionChapter.href);
  await expect(
    page.getByRole("heading", { name: singleSectionChapterTarget.title }),
  ).toBeVisible();
  await expect(page.locator(".section-index")).toHaveCount(0);
});

test("mobile toolbar and progress menu stay within the viewport", async ({ page }) => {
  await page.goto("/");

  const layout = await page.evaluate(() => {
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      headerHeight: header?.height ?? 0,
      headerLeft: header?.left ?? 0,
      headerRight: header?.right ?? 0,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.headerLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.headerRight).toBeLessThanOrEqual(layout.clientWidth + 1);

  if (layout.clientWidth <= 540) {
    expect(layout.headerHeight).toBeLessThanOrEqual(128);
  }

  const searchButton = page.getByRole("button", { name: "Search manuscripts" });
  const outlineButton = page.getByRole("button", { name: /Outline/ });
  const progressButton = page.getByRole("button", { name: /Progress/ });
  await expect(searchButton).toBeVisible();
  await expect(outlineButton).toBeVisible();
  await expect(progressButton).toBeVisible();

  const toolbarMetrics = await page.evaluate(() => {
    const search = document
      .querySelector(".search-menu-button")
      ?.getBoundingClientRect();
    const outline = document
      .querySelector(".outline-menu-button")
      ?.getBoundingClientRect();
    const progress = document
      .querySelector(".progress-menu-button")
      ?.getBoundingClientRect();
    const progressLabel = document.querySelector(
      ".progress-menu-button .nav-label",
    );
    const progressLabelStyle = progressLabel
      ? window.getComputedStyle(progressLabel)
      : null;
    return {
      searchLeft: search?.left ?? 0,
      outlineLeft: outline?.left ?? 0,
      searchWidth: search?.width ?? 0,
      outlineWidth: outline?.width ?? 0,
      progressWidth: progress?.width ?? 0,
      progressLabelWidth: progressLabel?.getBoundingClientRect().width ?? 0,
      progressLabelClipped: progressLabelStyle?.clip ?? "",
    };
  });

  expect(toolbarMetrics.searchLeft).toBeLessThan(toolbarMetrics.outlineLeft);
  if (layout.clientWidth <= 540) {
    expect(
      Math.abs(toolbarMetrics.searchWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.progressWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(toolbarMetrics.progressLabelWidth).toBeGreaterThan(1);
    expect(toolbarMetrics.progressLabelClipped).toBe("auto");
  }

  await outlineButton.click();
  const outlineMenu = page.getByRole("region", { name: "Site outline" });
  await expect(outlineMenu).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Filter outline" })).toBeVisible();
  await expect(outlineMenu.locator(".outline-volume-link").first()).toBeVisible();

  const outlineBox = await outlineMenu.boundingBox();
  const outlineViewport = page.viewportSize();
  expect(outlineBox).not.toBeNull();
  expect(outlineViewport).not.toBeNull();

  if (outlineBox && outlineViewport) {
    expect(outlineBox.x).toBeGreaterThanOrEqual(-1);
    expect(outlineBox.x + outlineBox.width).toBeLessThanOrEqual(
      outlineViewport.width + 1,
    );
  }

  await page.getByRole("searchbox", { name: "Filter outline" }).fill("wielding");
  await expect(
    outlineMenu.locator("details.outline-part[open]", {
      hasText: "Wielding Intelligence",
    }),
  ).toBeVisible();
  await expect(
    outlineMenu.locator(".outline-chapters").getByRole("link", {
      name: /^Wielding Intelligence/,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(outlineMenu).toHaveCount(0);

  await searchButton.click();
  const searchMenu = page.getByRole("region", { name: "Manuscript search" });
  await expect(searchMenu).toBeVisible();
  const searchInput = page.getByRole("searchbox", {
    name: "Search all manuscripts",
  });
  await searchInput.fill("federated footprint");
  const searchResult = searchMenu.getByRole("link", {
    name: new RegExp(searchTargetSection.title),
  });
  await expect(searchResult).toBeVisible();
  const searchResults = searchMenu.locator(".search-result");
  const firstSearchResult = searchResults.first();
  await expect(firstSearchResult).toBeVisible();

  const searchResultLayout = await firstSearchResult.evaluate((element) => {
    const title = element.querySelector(".search-result-title");
    const meta = element.querySelector(".search-result-meta");
    const snippet = element.querySelector(".search-result-snippet");
    const cardStyle = window.getComputedStyle(element);
    const titleStyle = title ? window.getComputedStyle(title) : null;
    const metaStyle = meta ? window.getComputedStyle(meta) : null;
    const snippetStyle = snippet ? window.getComputedStyle(snippet) : null;
    const titleBox = title?.getBoundingClientRect();
    const contentWidth =
      element.clientWidth -
      Number.parseFloat(cardStyle.paddingLeft) -
      Number.parseFloat(cardStyle.paddingRight);

    return {
      contentWidth,
      rowClasses: Array.from(element.children).map((child) => child.className),
      titleOverflow: titleStyle?.overflow ?? "",
      titleWhiteSpace: titleStyle?.whiteSpace ?? "",
      titleWidth: titleBox?.width ?? 0,
      metaWhiteSpace: metaStyle?.whiteSpace ?? "",
      snippetWhiteSpace: snippetStyle?.whiteSpace ?? "",
    };
  });

  expect(searchResultLayout.rowClasses).toEqual([
    "search-result-title",
    "search-result-meta",
    "search-result-snippet",
  ]);
  expect(searchResultLayout.titleWhiteSpace).toBe("normal");
  expect(searchResultLayout.titleOverflow).toBe("visible");
  expect(searchResultLayout.titleWidth).toBeGreaterThanOrEqual(
    searchResultLayout.contentWidth - 1,
  );
  expect(searchResultLayout.metaWhiteSpace).toBe("nowrap");
  expect(searchResultLayout.snippetWhiteSpace).toBe("nowrap");

  const searchBox = await searchMenu.boundingBox();
  const searchViewport = page.viewportSize();
  expect(searchBox).not.toBeNull();
  expect(searchViewport).not.toBeNull();

  if (searchBox && searchViewport) {
    expect(searchBox.x).toBeGreaterThanOrEqual(-1);
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(searchViewport.width + 1);
  }

  await searchInput.focus();
  await page.keyboard.press("ArrowDown");
  await expect(firstSearchResult).toBeFocused();
  const searchResultCount = await searchResults.count();
  if (searchResultCount > 1) {
    await page.keyboard.press("ArrowDown");
    await expect(searchResults.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(firstSearchResult).toBeFocused();
  }
  await page.keyboard.press("End");
  await expect(searchResults.nth(searchResultCount - 1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(searchInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(searchMenu).toHaveCount(0);
  await expect(searchButton).toBeFocused();

  await searchButton.click();
  const reopenedSearchInput = page.getByRole("searchbox", {
    name: "Search all manuscripts",
  });
  await reopenedSearchInput.fill("federated footprint");
  await reopenedSearchInput.press("Enter");
  await expect(page).toHaveURL(searchTargetSection.href);

  await page.goto("/");

  await expect
    .poll(async () => {
      if ((await progressButton.getAttribute("aria-expanded")) !== "true") {
        await progressButton.click();
      }
      return progressButton.getAttribute("aria-expanded");
    })
    .toBe("true");
  const popover = page.getByRole("region", { name: "Reader progress" });
  await expect(popover).toBeVisible();

  const popoverBox = await popover.boundingBox();
  const viewport = page.viewportSize();
  expect(popoverBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (popoverBox && viewport) {
    expect(popoverBox.x).toBeGreaterThanOrEqual(-1);
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const progressCopy = popover.getByText(
    "Stored only in this browser. No account, no server reading history.",
  );
  await expect(progressCopy).toBeVisible();
  const firstRecommendation = popover.locator(".recommendations a").first();
  await expect(firstRecommendation).toBeVisible();
  await firstRecommendation.hover();

  const progressMenuMetrics = await popover.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const copy = element.querySelector(".quiet-copy");
    const copyStyle = copy ? window.getComputedStyle(copy) : null;
    const recommendation = element.querySelector(".recommendations a");
    const recommendationBox = recommendation?.getBoundingClientRect();
    const recommendationStyle = recommendation
      ? window.getComputedStyle(recommendation)
      : null;
    return {
      copyFontSize: copyStyle ? Number.parseFloat(copyStyle.fontSize) : 0,
      copyTextAlign: copyStyle?.textAlign ?? "",
      recommendationLeft: recommendationBox?.left ?? 0,
      recommendationRight: recommendationBox?.right ?? 0,
      recommendationTextAlign: recommendationStyle?.textAlign ?? "",
      recommendationWhiteSpace: recommendationStyle?.whiteSpace ?? "",
      panelLeft: panel.left,
      panelRight: panel.right,
    };
  });

  expect(progressMenuMetrics.copyFontSize).toBeLessThanOrEqual(18);
  expect(progressMenuMetrics.copyTextAlign).toBe("left");
  expect(progressMenuMetrics.recommendationTextAlign).toBe("left");
  expect(progressMenuMetrics.recommendationWhiteSpace).toBe("nowrap");
  expect(progressMenuMetrics.recommendationLeft).toBeGreaterThanOrEqual(
    progressMenuMetrics.panelLeft,
  );
  expect(progressMenuMetrics.recommendationRight).toBeLessThanOrEqual(
    progressMenuMetrics.panelRight + 1,
  );
});

test("reader route exposes progress and audio controls", async ({ page }) => {
  await page.addInitScript(() => {
    class TestSpeechSynthesisUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        cancel: () => undefined,
        getVoices: () => [],
        pause: () => undefined,
        removeEventListener: () => undefined,
        speak: () => undefined,
      },
    });
  });
  await page.goto(firstSection.href);

  await expect(page.getByRole("heading", { name: firstSection.title })).toBeVisible();
  await expect(page.getByText(`Version ${firstSection.versionHash}`)).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Codified ${firstSectionVersionDate}` }),
  ).toHaveAttribute("href", firstSection.versionUrl);
  await expect(
    page.getByText(
      `${firstSection.volumeTitle} / ${firstSection.partTitle} / ${firstSection.chapterTitle}`,
    ),
  ).toHaveCount(0);
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
    firstSection.title,
  );
  await expect(breadcrumbs.getByText("Manuscripts")).toHaveCount(0);
  await expect(breadcrumbs.getByText("Humanity's Most Viable Future")).toHaveCount(0);
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 540) {
    await expect(breadcrumbs.getByText("Home")).toHaveCount(0);
  }
  const readerLayout = await page.evaluate(() => {
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    const frame = document
      .querySelector(".page-frame.reader-layout")
      ?.getBoundingClientRect();
    const reader = document.querySelector(".reader-main")?.getBoundingClientRect();
    const frameStyle = frame
      ? window.getComputedStyle(document.querySelector(".page-frame.reader-layout")!)
      : null;
    const viewportWidth = document.documentElement.clientWidth;

    return {
      framePaddingLeft: frameStyle ? Number.parseFloat(frameStyle.paddingLeft) : 0,
      framePaddingRight: frameStyle ? Number.parseFloat(frameStyle.paddingRight) : 0,
      framePaddingTop: frameStyle ? Number.parseFloat(frameStyle.paddingTop) : 0,
      readerLeft: reader?.left ?? 0,
      readerRight: reader ? viewportWidth - reader.right : 0,
      topInset: header && reader ? reader.top - header.bottom : 0,
    };
  });
  expect(
    Math.abs(readerLayout.framePaddingLeft - readerLayout.framePaddingRight),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(readerLayout.framePaddingLeft - readerLayout.framePaddingTop),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(readerLayout.readerLeft - readerLayout.readerRight),
  ).toBeLessThanOrEqual(2);
  expect(readerLayout.readerLeft).toBeGreaterThanOrEqual(readerLayout.topInset - 2);
  const progressButton = page.getByRole("button", { name: /Progress/ });
  await expect(progressButton).toBeVisible();
  await expect
    .poll(async () => {
      if ((await progressButton.getAttribute("aria-expanded")) !== "true") {
        await progressButton.click();
      }
      return progressButton.getAttribute("aria-expanded");
    })
    .toBe("true");
  const markReadButton = page.getByRole("button", { name: /Mark read|Read/ });
  await expect(markReadButton).toBeVisible();
  const markReadButtonStyle = await markReadButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      justifyContent: style.justifyContent,
      textAlign: style.textAlign,
    };
  });
  expect(markReadButtonStyle.justifyContent).toBe("flex-start");
  expect(markReadButtonStyle.textAlign).toBe("left");
  const listenButton = page.getByRole("button", { name: /Listen/ });
  await expect(listenButton).toBeVisible();
  await listenButton.click();
  const audioPanel = page.getByLabel("Audiobook controls");
  await expect(audioPanel).toBeVisible();
  const playButton = page.getByRole("button", { name: "Play audiobook" });
  await expect(playButton).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice" })).toBeVisible();
  await playButton.click();

  const activeListenButton = page.getByRole("button", {
    name: "Audiobook playing, open controls",
  });
  await expect(activeListenButton).toBeVisible();
  await expect(activeListenButton.locator(".audio-waveform")).toBeVisible();
  await expect(activeListenButton.locator(".nav-label")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(audioPanel).toHaveCount(0);
  await activeListenButton.click();
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  const footer = page.getByRole("contentinfo", { name: "Site information" });
  await expect(footer).toBeVisible();
  await expect(
    footer.getByText(`© ${copyrightYearLabel} by the Providence Collective.`),
  ).toBeVisible();
});

test("reader shows subtle revision status for previously read sections", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, section }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          sections: {
            [section.sectionId]: {
              sectionId: section.sectionId,
              contentHash: "older-section-hash",
              paragraphs: section.paragraphs.map(
                (paragraph: { paragraphId: string; contentHash: string }, index: number) => ({
                  paragraphId: paragraph.paragraphId,
                  contentHash:
                    index === 0 ? `older-${paragraph.contentHash}` : paragraph.contentHash,
                }),
              ),
              readAt: Date.now() - 1000,
              percent: 100,
            },
          },
        }),
      );
    },
    {
      key: readerProgressStorageKey,
      section: firstSection,
    },
  );

  await page.goto(firstSection.href);

  const revisionNotice = page.getByLabel("Updated section notice");
  await expect(revisionNotice).toBeVisible();
  await expect(revisionNotice).toContainText("Revised since you read this.");
  await expect(
    revisionNotice.getByRole("link", { name: "Jump to the first changed passage" }),
  ).toHaveAttribute("href", `${firstSection.href}#${firstSection.paragraphs[0].anchor}`);

  await page.goto(`/manuscripts/${firstSection.volumeId}/${firstSection.partId}/`);
  const chapterCard = page.locator(".chapter-card", {
    hasText: firstSection.chapterTitle,
  });
  await expect(chapterCard.locator('[data-updated-marker="true"]')).toBeVisible();
  await expect(chapterCard.locator('[data-read-checkmark="true"]')).toHaveCount(0);
});

test("toolbar brand owns the active manuscript identity", async ({ page }) => {
  await page.goto("/");
  const brand = page.locator(".brand-mark");
  await expect(brand).toHaveAttribute(
    "aria-label",
    "Providence Collective The Coherence Thesis home",
  );
  await expect(brand.locator(".brand-kicker")).toHaveText("Providence Collective");
  await expect(brand.locator(".brand-title")).toHaveText("The Coherence Thesis");

  await page.goto(wieldingVolume.href);
  await expect(brand).toHaveAttribute(
    "aria-label",
    `The Coherent Thesis V${wieldingVolume.numberLabel} · ${wieldingVolume.title} home`,
  );
  await expect(brand.locator(".brand-kicker")).toHaveText("The Coherent Thesis");
  await expect(brand.locator(".brand-title")).toHaveText(
    `V${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);

  const brandStyles = await brand.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    titleBorder: window.getComputedStyle(
      element.querySelector(".brand-title")!,
    ).borderBottomColor,
  }));
  await brand.hover();
  await page.waitForTimeout(200);
  const brandHoverStyles = await brand.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    titleBorder: window.getComputedStyle(
      element.querySelector(".brand-title")!,
    ).borderBottomColor,
  }));
  expect(brandHoverStyles.background).toBe(brandStyles.background);
  expect(brandHoverStyles.titleBorder).not.toBe(brandStyles.titleBorder);

  await page.goto(wieldingFrontMatter.href);
  await expect(brand.locator(".brand-kicker")).toHaveText("The Coherent Thesis");
  await expect(brand.locator(".brand-title")).toHaveText(
    `V${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs.getByText("Manuscripts")).toHaveCount(0);
  await expect(breadcrumbs.getByText("Wielding Intelligence")).toHaveCount(0);
  await expect(breadcrumbs.locator("li")).toHaveCount(1);
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText("Front Matter");

  await page.goto(wieldingSection.href);
  const firstBreadcrumbLink = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .locator("a")
    .first();
  await expect(firstBreadcrumbLink).toBeVisible();
  const breadcrumbStyles = await firstBreadcrumbLink.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    border: window.getComputedStyle(element).borderBottomColor,
  }));
  await firstBreadcrumbLink.hover();
  await page.waitForTimeout(200);
  const breadcrumbHoverStyles = await firstBreadcrumbLink.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    border: window.getComputedStyle(element).borderBottomColor,
  }));
  expect(breadcrumbHoverStyles.background).toBe(breadcrumbStyles.background);
  expect(breadcrumbHoverStyles.border).not.toBe(breadcrumbStyles.border);
});
