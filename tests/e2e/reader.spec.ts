import { expect, test } from "@playwright/test";
import { catalog } from "../../src/lib/manuscript-data";
import { readerProgressStorageKey } from "../../src/lib/reader-state";

const firstSection = catalog.sections[0];
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
const wieldingSection = catalog.sections.find(
  (section) => section.volumeId === "wielding-intelligence",
)!;

test("home page presents the overview and manuscript entry points", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The Coherence Thesis" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://www.coherence-thesis.com/share/coherence-thesis-og.jpg",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1200",
  );
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
    "content",
    "630",
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
  await page.getByRole("searchbox", { name: "Search all manuscripts" }).fill(
    "federated footprint",
  );
  const searchResult = searchMenu.getByRole("link", {
    name: new RegExp(searchTargetSection.title),
  });
  await expect(searchResult).toBeVisible();

  const searchBox = await searchMenu.boundingBox();
  const searchViewport = page.viewportSize();
  expect(searchBox).not.toBeNull();
  expect(searchViewport).not.toBeNull();

  if (searchBox && searchViewport) {
    expect(searchBox.x).toBeGreaterThanOrEqual(-1);
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(searchViewport.width + 1);
  }

  await searchResult.click();
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
  await page.goto(firstSection.href);

  await expect(page.getByRole("heading", { name: firstSection.title })).toBeVisible();
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
  await expect(breadcrumbs.getByText("Humanity's Most Viable Future")).toBeVisible();
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 540) {
    await expect(breadcrumbs.getByText("Home")).toHaveCount(0);
  }
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
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play audiobook" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice" })).toBeVisible();
});

test("breadcrumb root follows the active manuscript", async ({ page }) => {
  await page.goto(wieldingSection.href);

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs.getByText("Manuscripts")).toHaveCount(0);
  await expect(breadcrumbs.getByText("Wielding Intelligence")).toBeVisible();
  await expect(breadcrumbs.locator("li").first()).toContainText(
    "Wielding Intelligence",
  );
});
