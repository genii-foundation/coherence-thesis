import { expect, test } from "@playwright/test";
import { catalog, partById } from "../../src/lib/manuscript-data";
import { readerPreferencesStorageKey } from "../../src/lib/reader-preferences";
import { readerProgressStorageKey } from "../../src/lib/reader-state";
import { formatReadingDurationForWords } from "../../src/lib/reading-time";

const firstSection = catalog.sections[0];
const firstSectionVolume = catalog.volumes.find(
  (volume) => volume.volumeId === firstSection.volumeId,
)!;
const firstSectionPdfFileName = "The Coherence Thesis - 01.001 - Orientation.pdf";
const firstManuscriptPdfFileName =
  "The Coherence Thesis - 01 - Humanity's Most Viable Future.pdf";
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
const wieldingDiagnosis = wieldingVolume.parts.find(
  (part) => part.partId === "the-diagnosis",
)!;
const volumeWithNeighborsIndex = catalog.volumes.findIndex(
  (_volume, index) => index > 0 && index < catalog.volumes.length - 1,
);
const volumeWithNeighbors = catalog.volumes[volumeWithNeighborsIndex]!;
const previousVolume = catalog.volumes[volumeWithNeighborsIndex - 1]!;
const nextVolume = catalog.volumes[volumeWithNeighborsIndex + 1]!;
const partNavigationVolume = catalog.volumes.find((volume) => volume.parts.length > 2)!;
const partWithNeighborsIndex = partNavigationVolume.parts.findIndex(
  (_part, index) => index > 0 && index < partNavigationVolume.parts.length - 1,
);
const partWithNeighbors = partNavigationVolume.parts[partWithNeighborsIndex]!;
const previousPart = partNavigationVolume.parts[partWithNeighborsIndex - 1]!;
const nextPart = partNavigationVolume.parts[partWithNeighborsIndex + 1]!;
const chapterNavigationContext = catalog.volumes
  .flatMap((volume) =>
    volume.parts.map((part) => ({
      volume,
      part,
      chapterIndex: part.chapters.findIndex(
        (chapter, index) =>
          index > 0 &&
          index < part.chapters.length - 1 &&
          chapter.sectionIds.length > 1,
      ),
    })),
  )
  .find((context) => context.chapterIndex > 0)!;
const chapterWithNeighbors =
  chapterNavigationContext.part.chapters[chapterNavigationContext.chapterIndex]!;
const previousChapter =
  chapterNavigationContext.part.chapters[chapterNavigationContext.chapterIndex - 1]!;
const nextChapter =
  chapterNavigationContext.part.chapters[chapterNavigationContext.chapterIndex + 1]!;
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
const centralWoundSection = catalog.sections.find(
  (section) =>
    section.href ===
    "/manuscripts/providence-imperative/the-reckoning/the-central-wound/v03-the-central-wound/",
)!;
const centralWoundPart = partById(
  centralWoundSection.volumeId,
  centralWoundSection.partId,
)!;
const sectionWithNeighbors = catalog.sections.find(
  (section) => {
    const chapter = partById(section.volumeId, section.partId)?.chapters.find(
      (candidate) => candidate.chapterId === section.chapterId,
    );
    return Boolean(
      section.previousSectionId &&
        section.nextSectionId &&
        chapter &&
        chapter.sectionIds.length > 1,
    );
  },
)!;
const previousSection = catalog.sections.find(
  (section) => section.sectionId === sectionWithNeighbors.previousSectionId,
)!;
const nextSection = catalog.sections.find(
  (section) => section.sectionId === sectionWithNeighbors.nextSectionId,
)!;
const parentChapter = catalog.volumes
  .find((volume) => volume.volumeId === sectionWithNeighbors.volumeId)!
  .parts.find((part) => part.partId === sectionWithNeighbors.partId)!
  .chapters.find((chapter) => chapter.chapterId === sectionWithNeighbors.chapterId)!;

const currentYear = new Date().getFullYear();
const copyrightYearLabel =
  currentYear > 2026 ? `2026 to ${currentYear}` : "2026";

function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgb(${red}, ${green}, ${blue})`;
}

function pdfObjectCount(bytes: Buffer, pattern: RegExp): number {
  return (bytes.toString("latin1").match(pattern) ?? []).length;
}

function pdfPageCount(bytes: Buffer): number {
  return pdfObjectCount(bytes, /^\/Type \/Page$/gm);
}

function pdfImageCount(bytes: Buffer): number {
  return pdfObjectCount(bytes, /^\/Subtype \/Image$/gm);
}

test("home page presents the overview and manuscript entry points", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "The Coherence Thesis" }),
  ).toBeVisible();
  await expect(page.locator(".brand-kicker")).toHaveText(
    "Providence Collective",
  );
  await expect(page.locator(".brand-title")).toHaveText("The Coherence Thesis");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://www.coherence-thesis.com/art/coherence-thesis-hero.png",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1024",
  );
  await expect(
    page.locator('meta[property="og:image:height"]'),
  ).toHaveAttribute("content", "1536");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f4ead7",
  );
  const toolbarColors = await page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const themeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );

    return {
      headerBackground: header ? getComputedStyle(header).backgroundColor : "",
      themeColor: themeMeta?.content ?? "",
    };
  });
  expect(toolbarColors.headerBackground).toBe(
    hexToRgb(toolbarColors.themeColor),
  );
  await expect(
    page.getByRole("link", { name: /Read the overview/ }),
  ).toHaveAttribute("href", "/overview/");
  await expect(
    page.getByRole("link", { name: /Browse manuscripts/ }),
  ).toHaveAttribute("href", "#manuscripts");
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
    const hero = document
      .querySelector(".hero-section")
      ?.getBoundingClientRect();
    const stats = document
      .querySelector(".stats-band")
      ?.getBoundingClientRect();
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

  const wieldingCard = page.getByRole("link", {
    name: "Open Wielding Intelligence",
  });
  const wieldingPanel = wieldingCard.locator(".manuscript-card-panel");
  await expect(wieldingCard.locator("img")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(wieldingPanel).toBeHidden();
    await wieldingCard.hover();
  }
  await expect(wieldingPanel).toBeVisible();
  await expect(wieldingPanel.getByText("Wielding Intelligence")).toBeVisible();
  await expect(
    wieldingPanel.getByText(formatReadingDurationForWords(wieldingVolume.wordCount)),
  ).toBeVisible();
});

test("overview links into canonical manuscript sections", async ({ page }) => {
  await page.addInitScript(() => {
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
  await page.goto("/overview/");

  await expect(
    page.getByRole("heading", { name: "The Coherence Thesis" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /The seed/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /The seed/ })
    .first()
    .click();
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
  const readReference = page
    .locator(".reference-grid a", { hasText: label })
    .first();
  await expect(
    readReference.locator('[data-read-checkmark="true"]'),
  ).toBeVisible();
});

test("manuscript volume heading does not overlap its stats line", async ({
  page,
}) => {
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
    expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(
      statsBox.y - 1,
    );
  }
});

test("single-section chapter cards open reader content directly", async ({
  page,
}) => {
  await page.goto(singleSectionPart.href);

  const chapterCard = page.getByRole("link", {
    name: new RegExp(singleSectionChapterTarget.title),
  });
  await expect(chapterCard).toHaveAttribute(
    "href",
    singleSectionChapterTarget.href,
  );
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

test("singleton chapter section navigation points up to the part", async ({
  page,
}) => {
  await page.goto(centralWoundSection.href);

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs.locator("li")).toHaveCount(2);
  await expect(breadcrumbs.locator(".breadcrumb-label")).toHaveText([
    centralWoundPart.title,
    centralWoundSection.title,
  ]);
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
    centralWoundSection.title,
  );

  const footerNav = page.getByRole("navigation", { name: "Page navigation" });
  const parentLink = footerNav.locator(".section-nav-link-parent");
  await expect(parentLink).toHaveAttribute("href", centralWoundPart.href);
  await expect(parentLink.locator("strong")).toHaveText(centralWoundPart.title);
});

test("mobile toolbar and progress menu stay within the viewport", async ({
  page,
}) => {
  await page.addInitScript(() => {
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

  await page.goto(wieldingSection.href);

  const layout = await page.evaluate(() => {
    const header = document
      .querySelector(".site-header")
      ?.getBoundingClientRect();
    const headerElement = document.querySelector(".site-header");
    const headerStyle = headerElement
      ? window.getComputedStyle(headerElement)
      : null;
    return {
      clientWidth: document.documentElement.clientWidth,
      headerHeight: header?.height ?? 0,
      headerLeft: header?.left ?? 0,
      headerRight: header?.right ?? 0,
      headerPaddingTop: Number.parseFloat(headerStyle?.paddingTop ?? "0"),
      headerPaddingRight: Number.parseFloat(headerStyle?.paddingRight ?? "0"),
      headerPaddingLeft: Number.parseFloat(headerStyle?.paddingLeft ?? "0"),
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.headerLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.headerRight).toBeLessThanOrEqual(layout.clientWidth + 1);

  if (layout.clientWidth <= 540) {
    expect(layout.headerHeight).toBeLessThanOrEqual(72);
  }
  if (layout.clientWidth > 860) {
    expect(layout.headerPaddingLeft).toBeCloseTo(layout.headerPaddingTop, 1);
    expect(layout.headerPaddingRight).toBeCloseTo(layout.headerPaddingTop, 1);
  }

  const homeButton = page.locator(".site-nav .mobile-home-link");
  const searchButton = page.getByRole("button", { name: "Search manuscripts" });
  const outlineButton = page.getByRole("button", { name: /Outline/ });
  const settingsButton = page.getByRole("button", { name: "Reader settings" });
  const audioButton = page.getByRole("button", { name: /Listen/ });
  const progressButton = page.getByRole("button", { name: /Progress/ });
  if (layout.clientWidth <= 860) {
    await expect(homeButton).toBeVisible();
  } else {
    await expect(homeButton).toBeHidden();
  }
  await expect(searchButton).toBeVisible();
  await expect(outlineButton).toBeVisible();
  await expect(settingsButton).toBeVisible();
  await expect(audioButton).toBeVisible();
  await expect(progressButton).toBeVisible();

  const toolbarMetrics = await page.evaluate(() => {
    const search = document
      .querySelector(".search-menu-button")
      ?.getBoundingClientRect();
    const home = document
      .querySelector(".mobile-home-menu")
      ?.getBoundingClientRect();
    const outline = document
      .querySelector(".outline-menu-button")
      ?.getBoundingClientRect();
    const progress = document
      .querySelector(".progress-menu-button")
      ?.getBoundingClientRect();
    const settings = document
      .querySelector(".settings-menu-button")
      ?.getBoundingClientRect();
    const audio = document
      .querySelector(".audio-menu-button")
      ?.getBoundingClientRect();
    const progressLabel = document.querySelector(
      ".progress-menu-button .nav-label",
    );
    const outlineLabel = document.querySelector(
      ".outline-menu-button .nav-label",
    );
    const audioLabel = document.querySelector(".audio-menu-button .nav-label");
    const outlineChevron = document.querySelector(
      ".outline-menu-button svg:last-child",
    );
    const audioChevron = document.querySelector(
      ".audio-menu-button .audio-menu-chevron",
    );
    const progressChevron = document.querySelector(
      ".progress-menu-button svg:last-child",
    );
    const percent = document.querySelector(".progress-percent");
    const headerBrand = document.querySelector(".site-header > .brand-mark");
    const headerBreadcrumb = document.querySelector(
      ".site-header > .breadcrumb-trail",
    );
    const pageContext = document.querySelector(".mobile-page-context");
    const pageContextBrandTitle = document.querySelector(
      ".mobile-page-brand-title",
    );
    const pageContextBreadcrumb = document.querySelector(
      ".mobile-page-context .breadcrumb-trail",
    );
    const pageHeading = document.querySelector(
      ".manuscript-heading h1, .page-heading h1",
    );
    const headerBrandStyle = headerBrand
      ? window.getComputedStyle(headerBrand)
      : null;
    const headerBreadcrumbStyle = headerBreadcrumb
      ? window.getComputedStyle(headerBreadcrumb)
      : null;
    const pageContextStyle = pageContext
      ? window.getComputedStyle(pageContext)
      : null;
    const progressLabelStyle = progressLabel
      ? window.getComputedStyle(progressLabel)
      : null;
    const outlineLabelStyle = outlineLabel
      ? window.getComputedStyle(outlineLabel)
      : null;
    const audioLabelStyle = audioLabel
      ? window.getComputedStyle(audioLabel)
      : null;
    const outlineChevronStyle = outlineChevron
      ? window.getComputedStyle(outlineChevron)
      : null;
    const audioChevronStyle = audioChevron
      ? window.getComputedStyle(audioChevron)
      : null;
    const progressChevronStyle = progressChevron
      ? window.getComputedStyle(progressChevron)
      : null;
    const percentStyle = percent ? window.getComputedStyle(percent) : null;
    const pageContextBrandBox = pageContextBrandTitle?.getBoundingClientRect();
    const pageContextBreadcrumbBox =
      pageContextBreadcrumb?.getBoundingClientRect();
    const pageHeadingBox = pageHeading?.getBoundingClientRect();
    return {
      homeLeft: home?.left ?? 0,
      homeWidth: home?.width ?? 0,
      searchLeft: search?.left ?? 0,
      settingsLeft: settings?.left ?? 0,
      outlineLeft: outline?.left ?? 0,
      audioLeft: audio?.left ?? 0,
      progressLeft: progress?.left ?? 0,
      searchWidth: search?.width ?? 0,
      outlineWidth: outline?.width ?? 0,
      settingsWidth: settings?.width ?? 0,
      audioWidth: audio?.width ?? 0,
      progressWidth: progress?.width ?? 0,
      progressLabelWidth: progressLabel?.getBoundingClientRect().width ?? 0,
      progressLabelClipped: progressLabelStyle?.clip ?? "",
      outlineLabelWidth: outlineLabel?.getBoundingClientRect().width ?? 0,
      audioLabelWidth: audioLabel?.getBoundingClientRect().width ?? 0,
      outlineLabelClipped: outlineLabelStyle?.clip ?? "",
      audioLabelClipped: audioLabelStyle?.clip ?? "",
      outlineChevronDisplay: outlineChevronStyle?.display ?? "",
      audioChevronDisplay: audioChevronStyle?.display ?? "",
      progressChevronDisplay: progressChevronStyle?.display ?? "",
      progressColor: percentStyle?.color ?? "",
      progressBorderColor: percentStyle?.borderTopColor ?? "",
      progressBackground: percentStyle?.backgroundColor ?? "",
      progressText: percent?.textContent ?? "",
      headerBrandDisplay: headerBrandStyle?.display ?? "",
      headerBreadcrumbDisplay: headerBreadcrumbStyle?.display ?? "",
      pageContextDisplay: pageContextStyle?.display ?? "",
      pageContextBrandTitle: pageContextBrandTitle?.textContent ?? "",
      pageContextBreadcrumbText: pageContextBreadcrumb?.textContent ?? "",
      pageContextBrandTop: pageContextBrandBox?.top ?? 0,
      pageContextBrandBottom: pageContextBrandBox?.bottom ?? 0,
      pageContextBreadcrumbTop: pageContextBreadcrumbBox?.top ?? 0,
      pageContextBreadcrumbBottom: pageContextBreadcrumbBox?.bottom ?? 0,
      pageHeadingTop: pageHeadingBox?.top ?? 0,
    };
  });

  if (layout.clientWidth <= 860) {
    expect(toolbarMetrics.homeLeft).toBeLessThan(toolbarMetrics.searchLeft);
    expect(toolbarMetrics.headerBrandDisplay).toBe("none");
    expect(toolbarMetrics.headerBreadcrumbDisplay).toBe("none");
    expect(toolbarMetrics.pageContextDisplay).toBe("grid");
    expect(toolbarMetrics.pageContextBrandTitle).toBe(
      `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
    );
    expect(toolbarMetrics.pageContextBreadcrumbText).toContain(
      wieldingSection.title,
    );
    expect(toolbarMetrics.pageContextBrandBottom).toBeLessThanOrEqual(
      toolbarMetrics.pageContextBreadcrumbTop,
    );
    expect(toolbarMetrics.pageContextBreadcrumbBottom).toBeLessThanOrEqual(
      toolbarMetrics.pageHeadingTop,
    );
  }
  expect(toolbarMetrics.searchLeft).toBeLessThan(toolbarMetrics.settingsLeft);
  expect(toolbarMetrics.settingsLeft).toBeLessThan(toolbarMetrics.outlineLeft);
  expect(toolbarMetrics.outlineLeft).toBeLessThan(toolbarMetrics.audioLeft);
  expect(toolbarMetrics.audioLeft).toBeLessThan(toolbarMetrics.progressLeft);
  if (layout.clientWidth <= 540) {
    expect(
      Math.abs(toolbarMetrics.homeWidth - toolbarMetrics.searchWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.searchWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.audioWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.progressWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.settingsWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
  }
  if (layout.clientWidth <= 860) {
    expect(toolbarMetrics.outlineLabelWidth).toBeLessThanOrEqual(1);
    expect(toolbarMetrics.audioLabelWidth).toBeLessThanOrEqual(1);
    expect(toolbarMetrics.progressLabelWidth).toBeLessThanOrEqual(1);
    expect(["", "rect(0px, 0px, 0px, 0px)"]).toContain(
      toolbarMetrics.outlineLabelClipped,
    );
    expect(["", "rect(0px, 0px, 0px, 0px)"]).toContain(
      toolbarMetrics.audioLabelClipped,
    );
    expect(["", "rect(0px, 0px, 0px, 0px)"]).toContain(
      toolbarMetrics.progressLabelClipped,
    );
    expect(["", "none"]).toContain(toolbarMetrics.outlineChevronDisplay);
    expect(["", "none"]).toContain(toolbarMetrics.audioChevronDisplay);
    expect(["", "none"]).toContain(toolbarMetrics.progressChevronDisplay);
    expect(toolbarMetrics.progressText).toMatch(/^\d+%$/);
    expect(toolbarMetrics.progressBorderColor).toBe(
      toolbarMetrics.progressColor,
    );
    expect(toolbarMetrics.progressBackground).toBe("rgba(0, 0, 0, 0)");
  }

  await outlineButton.click();
  const outlineMenu = page.getByRole("region", { name: "Site outline" });
  await expect(outlineMenu).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Filter outline" }),
  ).toBeVisible();
  await expect(
    outlineMenu.locator(".outline-volume-link").first(),
  ).toBeVisible();

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

  await page
    .getByRole("searchbox", { name: "Filter outline" })
    .fill("wielding");
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
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(
      searchViewport.width + 1,
    );
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
  const homeProgressButton = page.getByRole("button", { name: /Progress/ });
  await expect(homeProgressButton).toBeVisible();
  await homeProgressButton.click();
  await expect(homeProgressButton).toHaveAttribute("aria-expanded", "true");
  const popover = page.getByRole("region", { name: "Reader progress" });
  await expect(popover).toBeVisible();

  const popoverBox = await popover.boundingBox();
  const viewport = page.viewportSize();
  expect(popoverBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (popoverBox && viewport) {
    expect(popoverBox.x).toBeGreaterThanOrEqual(-1);
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
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

test("reader share menu exposes page sharing and PDF downloads", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { __lastShareData?: ShareData }).__lastShareData = data;
      },
    });
  });
  await page.goto(firstSection.href);

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await expect(shareButton).toHaveText("");
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();

  const shareBox = await shareMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(shareBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (shareBox && viewport) {
    expect(shareBox.x).toBeGreaterThanOrEqual(-1);
    expect(shareBox.x + shareBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const sectionPdfHref = `/downloads/sections/${firstSectionPdfFileName}`;
  const manuscriptPdfHref = `/downloads/manuscripts/${firstManuscriptPdfFileName}`;
  const sectionDownload = shareMenu.getByRole("link", {
    name: `Download this section as PDF: ${firstSection.title}`,
  });
  const manuscriptDownload = shareMenu.getByRole("link", {
    name: `Download full manuscript as PDF: ${firstSection.volumeTitle}`,
  });

  await expect(sectionDownload).toContainText("Download this section");
  await expect(sectionDownload).toHaveAttribute("href", sectionPdfHref);
  await expect(sectionDownload).toHaveAttribute("download", firstSectionPdfFileName);
  await expect(manuscriptDownload).toContainText("Download full manuscript");
  await expect(manuscriptDownload).toHaveAttribute("href", manuscriptPdfHref);
  await expect(manuscriptDownload).toHaveAttribute(
    "download",
    firstManuscriptPdfFileName,
  );

  const sectionPdfResponse = await page.request.get(encodeURI(sectionPdfHref));
  expect(sectionPdfResponse.ok()).toBe(true);
  expect(sectionPdfResponse.headers()["content-type"]).toContain("application/pdf");
  const sectionPdfBytes = await sectionPdfResponse.body();
  expect(pdfPageCount(sectionPdfBytes)).toBeGreaterThanOrEqual(2);
  expect(pdfPageCount(sectionPdfBytes)).toBeLessThanOrEqual(4);
  expect(pdfImageCount(sectionPdfBytes)).toBeGreaterThanOrEqual(1);
  expect(sectionPdfBytes.byteLength).toBeLessThan(450_000);
  const manuscriptPdfResponse = await page.request.get(encodeURI(manuscriptPdfHref));
  expect(manuscriptPdfResponse.ok()).toBe(true);
  expect(manuscriptPdfResponse.headers()["content-type"]).toContain("application/pdf");
  const manuscriptPdfBytes = await manuscriptPdfResponse.body();
  const manuscriptPageCount = pdfPageCount(manuscriptPdfBytes);
  expect(manuscriptPageCount).toBeGreaterThan(2);
  expect(manuscriptPageCount).toBeLessThan(firstSectionVolume.sectionIds.length);
  expect(pdfImageCount(manuscriptPdfBytes)).toBeGreaterThanOrEqual(1);
  expect(manuscriptPdfBytes.byteLength).toBeLessThan(700_000);

  await shareMenu.getByRole("button", { name: "Share this page" }).click();
  await expect(shareMenu.getByRole("status")).toHaveText("Shared");

  const shareData = await page.evaluate(
    () => (window as Window & { __lastShareData?: ShareData }).__lastShareData,
  );
  expect(shareData?.title).toContain(firstSection.title);
  expect(shareData?.url).toContain(firstSection.href);
});

test("volume share menu only offers the full manuscript download", async ({
  page,
}) => {
  await page.goto(firstSectionVolume.href);

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu.getByText("Download this section")).toHaveCount(0);

  const manuscriptDownload = shareMenu.getByRole("link", {
    name: `Download full manuscript as PDF: ${firstSectionVolume.title}`,
  });
  await expect(manuscriptDownload).toBeVisible();
  await expect(manuscriptDownload).toContainText("Download full manuscript");
  await expect(manuscriptDownload).toHaveAttribute(
    "href",
    `/downloads/manuscripts/${firstManuscriptPdfFileName}`,
  );
  await expect(manuscriptDownload).toHaveAttribute(
    "download",
    firstManuscriptPdfFileName,
  );

  const actionMetrics = await manuscriptDownload.evaluate((element) => {
    const panel = element.closest(".reader-share")?.getBoundingClientRect();
    const label = element.querySelector(".share-action-label");
    const labelBox = label?.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      display: style.display,
      labelWidth: labelBox?.width ?? 0,
      panelLeft: panel?.left ?? 0,
      panelRight: panel?.right ?? 0,
      rowLeft: element.getBoundingClientRect().left,
      rowRight: element.getBoundingClientRect().right,
    };
  });

  expect(actionMetrics.display).toBe("grid");
  expect(actionMetrics.labelWidth).toBeGreaterThan(120);
  expect(actionMetrics.rowLeft).toBeGreaterThanOrEqual(actionMetrics.panelLeft);
  expect(actionMetrics.rowRight).toBeLessThanOrEqual(
    actionMetrics.panelRight + 1,
  );
});

test("singleton section share menu offers both PDF downloads", async ({
  page,
}) => {
  const singletonSectionHref = firstSection.href.replace(
    `/${firstSection.sectionId}/`,
    "/",
  );
  await page.goto(singletonSectionHref);

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();

  const sectionDownload = shareMenu.getByRole("link", {
    name: `Download this section as PDF: ${firstSection.title}`,
  });
  const manuscriptDownload = shareMenu.getByRole("link", {
    name: `Download full manuscript as PDF: ${firstSectionVolume.title}`,
  });

  await expect(sectionDownload).toBeVisible();
  await expect(sectionDownload).toContainText("Download this section");
  await expect(sectionDownload).toHaveAttribute(
    "href",
    `/downloads/sections/${firstSectionPdfFileName}`,
  );
  await expect(manuscriptDownload).toBeVisible();
  await expect(manuscriptDownload).toContainText("Download full manuscript");
  await expect(manuscriptDownload).toHaveAttribute(
    "href",
    `/downloads/manuscripts/${firstManuscriptPdfFileName}`,
  );
  await expect(sectionDownload).toHaveAttribute("download", firstSectionPdfFileName);
  await expect(manuscriptDownload).toHaveAttribute(
    "download",
    firstManuscriptPdfFileName,
  );
});

test("reader settings update and persist local appearance preferences", async ({
  page,
}) => {
  await page.goto(firstSection.href);

  const settingsButton = page.getByRole("button", { name: "Reader settings" });
  await expect(settingsButton).toBeVisible();
  await expect(settingsButton).toHaveText("");
  await settingsButton.click();

  const settingsMenu = page.getByRole("region", { name: "Reader settings" });
  await expect(settingsMenu).toBeVisible();

  const settingsBox = await settingsMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(settingsBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (settingsBox && viewport) {
    expect(settingsBox.x).toBeGreaterThanOrEqual(-1);
    expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
  }

  const firstParagraph = page.locator(".manuscript-prose p").first();
  await expect(firstParagraph).toBeVisible();
  await expect(
    settingsMenu.getByRole("button", { name: "Reset font size" }),
  ).toBeVisible();
  await expect(
    settingsMenu.getByRole("button", { exact: true, name: "Reset font" }),
  ).toBeVisible();
  await expect(
    settingsMenu.getByRole("button", { name: "Reset theme" }),
  ).toBeVisible();
  const initialAppearance = await page.evaluate(() => {
    const heading = document.querySelector(".manuscript-heading h1");
    const paragraph = document.querySelector(".manuscript-prose p");
    const toolbarButton = document.querySelector(".settings-menu-button");
    return {
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      headingFontFamily: heading ? getComputedStyle(heading).fontFamily : "",
      fontSize: paragraph ? Number.parseFloat(getComputedStyle(paragraph).fontSize) : 0,
      toolbarFontSize: toolbarButton
        ? Number.parseFloat(getComputedStyle(toolbarButton).fontSize)
        : 0,
      toolbarFontFamily: toolbarButton ? getComputedStyle(toolbarButton).fontFamily : "",
      rootTheme: document.documentElement.dataset.readerTheme ?? "",
    };
  });

  const fontSizeSlider = page.getByRole("slider", { name: "Font size" });
  await fontSizeSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "125");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(settingsMenu.getByText("125% text")).toHaveCount(0);
  await settingsMenu.getByRole("button", { name: "Reset font size" }).click();
  await expect(fontSizeSlider).toHaveValue("100");
  await fontSizeSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "125");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const fontSelect = page.getByRole("combobox", { name: "Reader font" });
  await fontSelect.click();
  const georgiaOption = page.getByRole("option", { name: "Georgia" });
  await expect(georgiaOption).toBeVisible();
  const georgiaOptionFont = await georgiaOption.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(georgiaOptionFont).toContain("Georgia");
  await georgiaOption.click();
  await expect(fontSelect).toContainText("Georgia");
  await expect(settingsMenu.getByText("Saved in this browser")).toHaveCount(0);

  const initialBodyBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  await settingsMenu.getByRole("button", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-reader-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#11100e",
  );
  await settingsMenu.getByRole("button", { name: "Black" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reader-theme", "black");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#000000",
  );

  const changedAppearance = await page.evaluate(() => {
    const heading = document.querySelector(".manuscript-heading h1");
    const paragraph = document.querySelector(".manuscript-prose p");
    const header = document.querySelector(".site-header");
    const toolbarButton = document.querySelector(".settings-menu-button");
    const stored = window.localStorage.getItem("coherence-reader-preferences-v1");
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      headerBackground: header ? getComputedStyle(header).backgroundColor : "",
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      headingFontFamily: heading ? getComputedStyle(heading).fontFamily : "",
      fontSize: paragraph ? Number.parseFloat(getComputedStyle(paragraph).fontSize) : 0,
      toolbarFontSize: toolbarButton
        ? Number.parseFloat(getComputedStyle(toolbarButton).fontSize)
        : 0,
      toolbarFontFamily: toolbarButton ? getComputedStyle(toolbarButton).fontFamily : "",
      rootTheme: document.documentElement.dataset.readerTheme ?? "",
      stored,
    };
  });

  expect(changedAppearance.fontSize).toBeGreaterThan(
    initialAppearance.fontSize,
  );
  expect(changedAppearance.toolbarFontSize).toBeGreaterThan(
    initialAppearance.toolbarFontSize,
  );
  expect(changedAppearance.fontFamily).toContain("Georgia");
  expect(changedAppearance.headingFontFamily).toContain("Georgia");
  expect(changedAppearance.toolbarFontFamily).toContain("Georgia");
  expect(changedAppearance.rootTheme).toBe("black");
  expect(changedAppearance.bodyBackground).toBe("rgb(0, 0, 0)");
  expect(changedAppearance.headerBackground).toBe("rgb(0, 0, 0)");
  expect(changedAppearance.bodyBackground).not.toBe(initialBodyBackground);
  expect(changedAppearance.stored).not.toBeNull();
  expect(JSON.parse(changedAppearance.stored ?? "{}")).toEqual({
    fontSize: 125,
    fontFamily: "georgia",
    theme: "black",
  });

  await page.keyboard.press("Escape");
  await expect(settingsMenu).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Page navigation" })
    .locator(".section-nav-link-next")
    .click();
  await expect(page).toHaveURL(/on-form-timing-and-why-this-book-exists/);
  await expect(page.locator("html")).toHaveAttribute("data-reader-theme", "black");

  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByRole("slider", { name: "Font size" })).toHaveValue("125");
  await expect(page.getByRole("combobox", { name: "Reader font" })).toContainText(
    "Georgia",
  );

  const storedAfterReload = await page.evaluate((key) => {
    const paragraph = document.querySelector(".manuscript-prose p");
    return {
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      stored: window.localStorage.getItem(key),
    };
  }, readerPreferencesStorageKey);

  expect(storedAfterReload.fontFamily).toContain("Georgia");
  expect(JSON.parse(storedAfterReload.stored ?? "{}")).toEqual({
    fontSize: 125,
    fontFamily: "georgia",
    theme: "black",
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-reader-theme", "black");
  const homeAppearance = await page.evaluate(() => {
    const brandTitle = document.querySelector(".brand-title");
    const heroHeading = document.querySelector(".hero-copy h1");
    return {
      brandFontFamily: brandTitle ? getComputedStyle(brandTitle).fontFamily : "",
      heroFontFamily: heroHeading ? getComputedStyle(heroHeading).fontFamily : "",
    };
  });
  expect(homeAppearance.brandFontFamily).toContain("Georgia");
  expect(homeAppearance.heroFontFamily).toContain("Georgia");
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

  await expect(
    page.getByRole("heading", { name: firstSection.title }),
  ).toBeVisible();
  await expect(page.getByText("Last Updated:")).toBeVisible();
  await expect(
    page.getByText(`Version ${firstSection.versionHash}`),
  ).toHaveCount(0);
  await expect(page.getByText(`Codified ${firstSectionVersionDate}`)).toHaveCount(0);
  const lastUpdatedLink = page.getByRole("link", {
    name: `${firstSectionVersionDate}, open version on GitHub`,
  });
  await expect(lastUpdatedLink).toHaveAttribute("href", firstSection.versionUrl);
  await expect(lastUpdatedLink).toHaveAttribute("target", "_blank");
  await expect(lastUpdatedLink).toHaveAttribute("rel", /noopener/);
  const versionIconOpacity = await lastUpdatedLink
    .locator(".section-version-link-icons")
    .evaluate((element) => window.getComputedStyle(element).opacity);
  expect(versionIconOpacity).toBe("0");
  await lastUpdatedLink.hover();
  await expect(lastUpdatedLink.locator(".section-version-link-icons")).toHaveCSS(
    "opacity",
    "1",
  );
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
  await expect(
    breadcrumbs.getByText("Humanity's Most Viable Future"),
  ).toHaveCount(0);
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 540) {
    await expect(breadcrumbs.getByText("Home")).toHaveCount(0);
  }
  const readerLayout = await page.evaluate(() => {
    const header = document
      .querySelector(".site-header")
      ?.getBoundingClientRect();
    const frame = document
      .querySelector(".page-frame.reader-layout")
      ?.getBoundingClientRect();
    const reader = document
      .querySelector(".reader-main")
      ?.getBoundingClientRect();
    const pageContext = document
      .querySelector(".mobile-page-context")
      ?.getBoundingClientRect();
    const pageContextStyle = document.querySelector(".mobile-page-context")
      ? window.getComputedStyle(document.querySelector(".mobile-page-context")!)
      : null;
    const frameStyle = frame
      ? window.getComputedStyle(
          document.querySelector(".page-frame.reader-layout")!,
        )
      : null;
    const viewportWidth = document.documentElement.clientWidth;

    return {
      framePaddingLeft: frameStyle
        ? Number.parseFloat(frameStyle.paddingLeft)
        : 0,
      framePaddingRight: frameStyle
        ? Number.parseFloat(frameStyle.paddingRight)
        : 0,
      framePaddingTop: frameStyle
        ? Number.parseFloat(frameStyle.paddingTop)
        : 0,
      hasMobilePageContext: pageContextStyle?.display !== "none",
      pageContextBottom: pageContext?.bottom ?? 0,
      readerLeft: reader?.left ?? 0,
      readerRight: reader ? viewportWidth - reader.right : 0,
      readerTop: reader?.top ?? 0,
      topInset: header && reader ? reader.top - header.bottom : 0,
    };
  });
  expect(
    Math.abs(readerLayout.framePaddingLeft - readerLayout.framePaddingRight),
  ).toBeLessThanOrEqual(1);
  if (readerLayout.hasMobilePageContext) {
    expect(readerLayout.framePaddingTop).toBe(0);
    expect(readerLayout.pageContextBottom).toBeLessThanOrEqual(
      readerLayout.topInset + readerLayout.framePaddingLeft + 80,
    );
  } else {
    expect(
      Math.abs(readerLayout.framePaddingLeft - readerLayout.framePaddingTop),
    ).toBeLessThanOrEqual(1);
  }
  expect(
    Math.abs(readerLayout.readerLeft - readerLayout.readerRight),
  ).toBeLessThanOrEqual(2);
  if (readerLayout.hasMobilePageContext) {
    expect(readerLayout.readerTop).toBeGreaterThanOrEqual(
      readerLayout.pageContextBottom - 2,
    );
  } else {
    expect(readerLayout.readerLeft).toBeGreaterThanOrEqual(
      readerLayout.topInset - 3,
    );
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
  const popover = page.getByRole("region", { name: "Reader progress" });
  const markReadButton = popover.getByRole("button", {
    name: /^(Mark read|Read)$/,
  });
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
  await markReadButton.click();
  await expect(popover.getByText("Recently read")).toBeVisible();
  await expect(popover.locator(".recently-read a").first()).toContainText(
    firstSection.title,
  );
  const listenButton = page.getByRole("button", { name: /Listen/ });
  await expect(listenButton).toBeVisible();
  const idleListenButtonWidth = await listenButton.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await listenButton.click();
  const audioPanel = page.getByLabel("Audiobook controls");
  await expect(audioPanel).toBeVisible();
  const playButton = page.getByRole("button", { name: "Play audiobook" });
  await expect(playButton).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice" })).toBeVisible();
  await expect(audioPanel.getByText("Speed", { exact: true })).toBeVisible();
  await playButton.click();

  const activeListenButton = page.getByRole("button", {
    name: "Audiobook playing, open controls",
  });
  await expect(activeListenButton).toBeVisible();
  const activeListenButtonWidth = await activeListenButton.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(Math.abs(activeListenButtonWidth - idleListenButtonWidth)).toBeLessThanOrEqual(1);
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

test("reader footer links adjacent sections and the containing chapter", async ({
  page,
}) => {
  await page.goto(sectionWithNeighbors.href);

  const footerNav = page.getByRole("navigation", { name: "Page navigation" });
  await expect(footerNav).toBeVisible();

  const previousLink = footerNav.locator(".section-nav-link-previous");
  await expect(previousLink).toHaveAttribute("href", previousSection.href);
  await expect(previousLink.locator("small")).toHaveText("Previous");
  await expect(previousLink.locator("strong")).toHaveText(previousSection.title);

  const parentLink = footerNav.locator(".section-nav-link-parent");
  await expect(parentLink).toHaveAttribute("href", parentChapter.href);
  await expect(parentLink.locator("small")).toHaveText("Up");
  await expect(parentLink.locator("strong")).toHaveText(parentChapter.title);
  const parentLinkLayout = await parentLink.evaluate((link) => {
    const icon = link.querySelector(".section-nav-icon")?.getBoundingClientRect();
    const label = link.querySelector("small")?.getBoundingClientRect();

    return {
      iconCenterY: icon ? icon.top + icon.height / 2 : 0,
      iconRight: icon?.right ?? 0,
      labelCenterY: label ? label.top + label.height / 2 : 0,
      labelLeft: label?.left ?? 0,
    };
  });
  expect(parentLinkLayout.labelLeft).toBeGreaterThanOrEqual(
    parentLinkLayout.iconRight - 1,
  );
  expect(
    Math.abs(parentLinkLayout.labelCenterY - parentLinkLayout.iconCenterY),
  ).toBeLessThanOrEqual(2);

  const nextLink = footerNav.locator(".section-nav-link-next");
  await expect(nextLink).toHaveAttribute("href", nextSection.href);
  await expect(nextLink.locator("small")).toHaveText("Next");
  await expect(nextLink.locator("strong")).toHaveText(nextSection.title);

  const footerLinkLayout = await footerNav.evaluate((nav) =>
    [...nav.querySelectorAll(".section-nav-link")].map((link) => {
      const bodyStyle = window.getComputedStyle(document.body);
      const labelElement = link.querySelector("small");
      const titleElement = link.querySelector("strong");
      const label = link.querySelector("small")?.getBoundingClientRect();
      const title = link.querySelector("strong")?.getBoundingClientRect();
      const linkStyle = window.getComputedStyle(link);
      const labelStyle = labelElement ? window.getComputedStyle(labelElement) : null;
      const titleStyle = titleElement ? window.getComputedStyle(titleElement) : null;

      return {
        bodyColor: bodyStyle.color,
        labelBottom: label?.bottom ?? 0,
        labelColor: labelStyle?.color ?? "",
        labelDecorationLine: labelStyle?.textDecorationLine ?? "",
        labelDecorationStyle: labelStyle?.textDecorationStyle ?? "",
        labelFontWeight: labelStyle ? Number.parseFloat(labelStyle.fontWeight) : 0,
        linkColor: linkStyle.color,
        lineHeight: titleStyle ? Number.parseFloat(titleStyle.lineHeight) : 0,
        titleColor: titleStyle?.color ?? "",
        titleFontWeight: titleStyle ? Number.parseFloat(titleStyle.fontWeight) : 0,
        titleHeight: title?.height ?? 0,
        titleFontSize: titleStyle ? Number.parseFloat(titleStyle.fontSize) : 0,
        titleTop: title?.top ?? 0,
      };
    }),
  );

  for (const link of footerLinkLayout) {
    expect(link.linkColor).toBe(link.bodyColor);
    expect(link.labelColor).toBe(link.bodyColor);
    expect(link.titleColor).toBe(link.bodyColor);
    expect(link.labelDecorationLine).not.toContain("underline");
    expect(link.labelDecorationStyle).not.toBe("dotted");
    expect(link.labelFontWeight).toBeLessThanOrEqual(500);
    expect(link.titleFontWeight).toBeLessThanOrEqual(500);
    expect(link.titleFontSize).toBeLessThanOrEqual(17);
    expect(link.titleHeight).toBeLessThanOrEqual(link.lineHeight * 2 + 1);
    expect(link.labelBottom).toBeLessThanOrEqual(link.titleTop);
  }

  await parentLink.hover();
  const hoverDecoration = await parentLink.evaluate((link) => {
    const labelStyle = window.getComputedStyle(link.querySelector("small")!);
    const titleStyle = window.getComputedStyle(link.querySelector("strong")!);

    return {
      label: labelStyle.textDecorationLine,
      labelStyle: labelStyle.textDecorationStyle,
      title: titleStyle.textDecorationLine,
    };
  });
  expect(hoverDecoration.label).toContain("underline");
  expect(hoverDecoration.labelStyle).toBe("solid");
  expect(hoverDecoration.title).not.toContain("underline");
});

test("organizational manuscript routes expose page navigation", async ({ page }) => {
  await page.goto("/manuscripts/");
  await expect(page).toHaveURL("/");

  await page.goto(volumeWithNeighbors.href);
  let footerNav = page.getByRole("navigation", { name: "Page navigation" });
  await expect(footerNav.locator(".section-nav-link-previous")).toHaveAttribute(
    "href",
    previousVolume.href,
  );
  await expect(footerNav.locator(".section-nav-link-parent")).toHaveAttribute(
    "href",
    "/",
  );
  await expect(footerNav.locator(".section-nav-link-parent strong")).toHaveText(
    "Home",
  );
  await expect(footerNav.locator(".section-nav-link-next")).toHaveAttribute(
    "href",
    nextVolume.href,
  );

  await page.goto(partWithNeighbors.href);
  footerNav = page.getByRole("navigation", { name: "Page navigation" });
  await expect(footerNav.locator(".section-nav-link-previous")).toHaveAttribute(
    "href",
    previousPart.href,
  );
  await expect(footerNav.locator(".section-nav-link-parent")).toHaveAttribute(
    "href",
    partNavigationVolume.href,
  );
  await expect(footerNav.locator(".section-nav-link-next")).toHaveAttribute(
    "href",
    nextPart.href,
  );

  await page.goto(chapterWithNeighbors.href);
  footerNav = page.getByRole("navigation", { name: "Page navigation" });
  await expect(footerNav.locator(".section-nav-link-previous")).toHaveAttribute(
    "href",
    previousChapter.href,
  );
  await expect(footerNav.locator(".section-nav-link-parent")).toHaveAttribute(
    "href",
    chapterNavigationContext.part.href,
  );
  await expect(footerNav.locator(".section-nav-link-next")).toHaveAttribute(
    "href",
    nextChapter.href,
  );
});

test("toolbar brand owns the active manuscript identity", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const brand = page.locator(".brand-mark");
  if (testInfo.project.name === "mobile") {
    await expect(brand).toBeHidden();
    await expect(page.locator(".mobile-page-context")).toHaveCount(0);

    await page.goto(wieldingVolume.href);
    await expect(brand).toBeHidden();
    await expect(page.locator(".mobile-page-brand-title")).toHaveText(
      `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
    );
    await expect(page.locator(".site-nav .mobile-home-link")).toBeVisible();
    return;
  }

  await expect(brand).toHaveAttribute(
    "aria-label",
    "Providence Collective The Coherence Thesis home",
  );
  await expect(brand.locator(".brand-kicker")).toHaveText(
    "Providence Collective",
  );
  await expect(brand.locator(".brand-title-full")).toHaveText(
    "The Coherence Thesis",
  );
  const homepageBrandTitleSize = await brand
    .locator(".brand-title")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await page.goto(wieldingVolume.href);
  await expect(brand).toHaveAttribute(
    "aria-label",
    `The Coherence Thesis Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title} home`,
  );
  await expect(brand.locator(".brand-kicker")).toHaveText(
    "The Coherence Thesis",
  );
  await expect(brand.locator(".brand-title-full")).toHaveText(
    `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );
  await expect(brand.locator(".brand-title-mobile")).toHaveText(
    `Volume ${wieldingVolume.numberLabel}`,
  );
  const activeBrandTitleSize = await brand
    .locator(".brand-title")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(activeBrandTitleSize).toBeLessThan(homepageBrandTitleSize);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toHaveCount(0);

  const brandStyles = await brand.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    titleBorder: window.getComputedStyle(element.querySelector(".brand-title")!)
      .borderBottomColor,
  }));
  await brand.hover();
  await page.waitForTimeout(200);
  const brandHoverStyles = await brand.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    titleBorder: window.getComputedStyle(element.querySelector(".brand-title")!)
      .borderBottomColor,
  }));
  expect(brandHoverStyles.background).toBe(brandStyles.background);
  expect(brandHoverStyles.titleBorder).not.toBe(brandStyles.titleBorder);
  if (page.viewportSize()?.width && page.viewportSize()!.width > 860) {
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  }

  await page.goto(wieldingFrontMatter.href);
  await expect(brand.locator(".brand-kicker")).toHaveText(
    "The Coherence Thesis",
  );
  await expect(brand.locator(".brand-title-full")).toHaveText(
    `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs.getByText("Manuscripts")).toHaveCount(0);
  await expect(breadcrumbs.getByText("Wielding Intelligence")).toHaveCount(0);
  await expect(breadcrumbs.locator("li")).toHaveCount(1);
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
    "Front Matter",
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(wieldingDiagnosis.href);
  await expect(brand.locator(".brand-title-full")).toBeVisible();
  await expect(brand.locator(".brand-title-full")).toHaveText(
    `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );
  await expect(brand.locator(".brand-title-mobile")).toBeHidden();
  const desktopTitleMetrics = await brand
    .locator(".brand-title-full")
    .evaluate((element) => ({
      titleRight: element.getBoundingClientRect().right,
      shellRight: element.parentElement?.getBoundingClientRect().right ?? 0,
      textOverflow: window.getComputedStyle(element.parentElement!)
        .textOverflow,
    }));
  expect(desktopTitleMetrics.titleRight).toBeLessThanOrEqual(
    desktopTitleMetrics.shellRight + 1,
  );
  expect(desktopTitleMetrics.textOverflow).toBe("clip");

  const narrowBrandStyle = await page.addStyleTag({
    content: ".brand-mark-active { max-width: 5rem !important; }",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(brand.locator(".brand-title-full")).toBeHidden();
  await expect(brand.locator(".brand-title-mobile")).toBeVisible();
  await expect(brand.locator(".brand-title-mobile")).toHaveText(
    `Volume ${wieldingVolume.numberLabel}`,
  );
  await brand.hover();
  const brandTooltip = page.getByRole("tooltip");
  await expect(brandTooltip).toBeVisible();
  await expect(brandTooltip).toHaveText(
    `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );
  await page.mouse.move(4, 4);
  await expect(brandTooltip).toHaveCount(0);
  await narrowBrandStyle.evaluate((element) => element.remove());

  await page.goto(wieldingSection.href);
  const firstBreadcrumbLink = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .locator("a")
    .first();
  await expect(firstBreadcrumbLink).toBeVisible();
  const currentBreadcrumb = page
    .getByRole("navigation", { name: "Breadcrumb" })
    .locator('[aria-current="page"]')
    .first();
  await expect(currentBreadcrumb).toHaveCount(1);
  const breadcrumbStyles = await firstBreadcrumbLink.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    border: window.getComputedStyle(element).borderBottomColor,
    color: window.getComputedStyle(element).color,
    currentColor: window.getComputedStyle(
      element.closest("nav")!.querySelector('[aria-current="page"]')!,
    ).color,
    bodyColor: window.getComputedStyle(document.body).color,
  }));
  expect(breadcrumbStyles.color).toBe(breadcrumbStyles.bodyColor);
  expect(breadcrumbStyles.currentColor).toBe(breadcrumbStyles.bodyColor);
  await firstBreadcrumbLink.hover();
  await page.waitForTimeout(200);
  const breadcrumbHoverStyles = await firstBreadcrumbLink.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    border: window.getComputedStyle(element).borderBottomColor,
    color: window.getComputedStyle(element).color,
  }));
  expect(breadcrumbHoverStyles.background).toBe(breadcrumbStyles.background);
  expect(breadcrumbHoverStyles.border).not.toBe(breadcrumbStyles.border);
  expect(breadcrumbHoverStyles.color).toBe(breadcrumbStyles.bodyColor);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(wieldingVolume.href);
  await expect(brand).toBeHidden();
  await expect(page.locator(".mobile-page-brand-title")).toHaveText(
    `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );
});

test("truncated breadcrumb labels reveal their full title in a tooltip", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Hover tooltips are verified in the desktop project.",
  );

  const longBreadcrumbLabel =
    "The Second Link: Perception Makes New Coordination Possible";

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(
    "/manuscripts/providence-imperative/the-living-reality/the-second-link-perception-makes-new-coordination-possible/",
  );

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();

  const labels = breadcrumbs.locator(".breadcrumb-label");
  await expect(labels.first()).toBeVisible();

  const labelMetrics = await labels.evaluateAll((elements) =>
    elements.map((element, index) => ({
      index,
      text: element.textContent?.trim() ?? "",
      truncated: element.scrollWidth > element.clientWidth + 1,
    })),
  );
  const target = labelMetrics.find(
    (item) => item.text === longBreadcrumbLabel && item.truncated,
  );
  expect(target).toBeDefined();

  const currentLabel = labels.nth(target!.index);
  const currentLabelBorder = await currentLabel.evaluate(
    (element) => window.getComputedStyle(element).borderBottomColor,
  );
  await currentLabel.hover();
  const currentLabelHoverBorder = await currentLabel.evaluate(
    (element) => window.getComputedStyle(element).borderBottomColor,
  );
  expect(currentLabelHoverBorder).toBe(currentLabelBorder);

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(longBreadcrumbLabel);

  const tooltipBox = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(tooltipBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(
    viewport!.width,
  );
  expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.y + tooltipBox!.height).toBeLessThanOrEqual(
    viewport!.height,
  );

  await page.mouse.move(4, viewport!.height - 4);
  await expect(tooltip).toHaveCount(0);
});
