import { expect, test } from "@playwright/test";
import { audioVoiceStorageKey } from "../../src/lib/audio-preferences";
import {
  catalog,
  readerProgressStorageKey,
  formatReadingDurationForWords,
  firstOverviewReference,
  firstOverviewSection,
  wieldingVolume,
  copyrightYearLabel,
  hexToRgb,
} from "./fixtures";

const systemVoicePreference = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
  useSystemVoice: true,
};

function sectionForId(sectionId: string) {
  const section = catalog.sections.find(
    (candidate) => candidate.sectionId === sectionId,
  );
  if (!section) throw new Error(`Missing section fixture: ${sectionId}`);
  return section;
}

test("home page presents the overview and manuscript entry points", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Follow the common thread.",
    }),
  ).toBeVisible();
  await expect(page.locator(".hero-copy h1")).toHaveCSS("font-weight", "300");
  await expect(page.locator(".brand-kicker")).toHaveText(
    "Providence Collective",
  );
  await expect(page.locator(".brand-title-full")).toHaveText(
    "The Coherence Thesis",
  );
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://www.coherence-thesis.com/share/coherence-thesis-og.jpg",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1200",
  );
  await expect(
    page.locator('meta[property="og:image:height"]'),
  ).toHaveAttribute("content", "630");
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
  const firstReadTarget = catalog.sections[0]!;
  await expect(
    page.getByRole("link", { name: "Listen" }),
  ).toHaveAttribute("href", `${firstReadTarget.href}?listen=1`);
  await expect(
    page.getByRole("link", { name: "Read", exact: true }),
  ).toHaveAttribute("href", firstReadTarget.href);
  await expect(
    page.getByRole("link", { name: "Overview" }),
  ).toHaveAttribute("href", "/overview/");
  await expect(
    page.getByRole("link", { name: /Browse manuscripts|Begin Volume I|Read the overview/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Nine volume series")).toHaveCount(0);
  await expect(
    page.getByText(
      "If your path moves through inner development, social architecture, humane technology, and place-based regeneration, join us in shaping a future worth inheriting.",
    ),
  ).toBeVisible();
  await expect(page.locator(".hero-copy h1")).toHaveCSS("font-weight", "300");
  await expect(page.locator(".hero-stats li")).toHaveText([
    `${catalog.stats.volumeCount.toLocaleString()} volumes`,
    `${catalog.stats.sectionCount.toLocaleString()} sections`,
    `${formatReadingDurationForWords(catalog.stats.wordCount)} of audio`,
  ]);
  await expect(page.locator(".hero-stats li").first()).toHaveCSS(
    "font-weight",
    "600",
  );
  await expect(page.locator(".hero-stats li").first()).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  const statSeparatorContent = await page
    .locator(".hero-stats li")
    .first()
    .evaluate((item) => getComputedStyle(item, "::after").content);
  expect(statSeparatorContent).toBe("none");
  await expect(page.locator(".hero-stats li").first()).toHaveCSS(
    "color",
    hexToRgb("#77542a"),
  );
  await expect(
    page.getByRole("region", { name: "Background highlight intensity" }),
  ).toHaveCount(0);
  await expect(page.locator(".overview-map")).toHaveCount(0);
  await expect(page.locator(".stats-band")).toHaveCount(0);
  await expect(page.getByText("Ready for the full body")).toHaveCount(0);
  await expect(page.locator(".cover-flow-card")).toHaveCount(
    catalog.volumes.length,
  );
  expect(catalog.volumes.map((volume) => volume.coverImage)).toEqual(
    catalog.volumes.map(
      (volume) => `/art/coherence-thesis-vol${volume.order}-cover.png`,
    ),
  );
  await expect(page.locator(".hero-art img")).toHaveAttribute(
    "src",
    /coherence-thesis-hero\.png/,
  );
  if (testInfo.project.name !== "mobile") {
    await page.setViewportSize({ width: 880, height: 900 });
    const actionTops = await page.locator(".hero-actions a").evaluateAll((links) =>
      links.map((link) => Math.round(link.getBoundingClientRect().top)),
    );
    expect(new Set(actionTops).size).toBe(1);
    const heroCtaAlignment = await page.evaluate(() => {
      const actions = document
        .querySelector(".hero-actions")
        ?.getBoundingClientRect();
      const stats = document
        .querySelector(".hero-stats")
        ?.getBoundingClientRect();

      return {
        centerDelta:
          actions && stats
            ? Math.abs(
                actions.left + actions.width / 2 - (stats.left + stats.width / 2),
              )
            : Number.POSITIVE_INFINITY,
        statsWidth: stats?.width ?? Number.POSITIVE_INFINITY,
        actionsWidth: actions?.width ?? 0,
      };
    });
    expect(heroCtaAlignment.centerDelta).toBeLessThanOrEqual(1);
    expect(heroCtaAlignment.statsWidth).toBeLessThanOrEqual(
      heroCtaAlignment.actionsWidth,
    );
    const brandKickerFit = await page
      .locator(".site-header .brand-kicker")
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        textOverflow: window.getComputedStyle(element).textOverflow,
      }));
    expect(brandKickerFit.textOverflow).not.toBe("ellipsis");
    expect(brandKickerFit.clientWidth).toBeGreaterThanOrEqual(
      brandKickerFit.scrollWidth,
    );
  }
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
  const robertLink = footer.getByRole("link", {
    name: "Robert James Ryan III",
  });
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
    const heroHeading = document
      .querySelector(".hero-copy h1")
      ?.getBoundingClientRect();
    const heroDeck = document
      .querySelector(".hero-deck")
      ?.getBoundingClientRect();
    const heroActions = document
      .querySelector(".hero-actions")
      ?.getBoundingClientRect();
    const coverFlow = document
      .querySelector(".cover-flow")
      ?.getBoundingClientRect();
    return {
      deckToActionsGap:
        heroDeck && heroActions ? heroActions.top - heroDeck.bottom : 0,
      gap: hero && coverFlow ? coverFlow.top - hero.bottom : 0,
      headingToDeckGap:
        heroHeading && heroDeck ? heroDeck.top - heroHeading.bottom : 0,
      heroHeight: hero?.height ?? 0,
    };
  });
  expect(
    Math.abs(
      homepageSpacing.headingToDeckGap - homepageSpacing.deckToActionsGap,
    ),
  ).toBeLessThanOrEqual(1);
  expect(homepageSpacing.gap).toBeGreaterThanOrEqual(24);
  if (testInfo.project.name === "desktop") {
    expect(homepageSpacing.heroHeight).toBeLessThanOrEqual(1000);
  }

  const homepageCoverShadows = await page.evaluate(() => {
    const heroImage = document.querySelector(".hero-art img");
    const coverCard = document.querySelector(".cover-flow-image-frame");
    return {
      hero: heroImage ? getComputedStyle(heroImage).boxShadow : "",
      card: coverCard ? getComputedStyle(coverCard).boxShadow : "",
    };
  });
  expect(homepageCoverShadows.card).not.toBe("none");
  expect(homepageCoverShadows.hero).not.toBe("none");

  await page.getByRole("button", { name: "Next manuscript" }).click();
  const wieldingCard = page.locator(
    '.cover-flow-card[aria-label="Open Wielding Intelligence"]',
  );
  const wieldingPanel = wieldingCard.locator(".cover-flow-card-panel");
  await expect(wieldingCard.locator("img")).toBeVisible();
  await expect(wieldingPanel).toBeVisible();
  await expect(
    wieldingPanel.locator(".manuscript-card-panel-top strong"),
  ).toHaveText("Wielding Intelligence");
  await expect(
    wieldingPanel.getByText(
      formatReadingDurationForWords(wieldingVolume.wordCount),
    ),
  ).toBeVisible();
  await expect(wieldingPanel.getByText("Moon")).toHaveCount(0);
  await expect(
    wieldingPanel.getByText(`${wieldingVolume.parts.length} parts`),
  ).toHaveCount(0);
  await expect(wieldingPanel.getByText(/chapters/)).toHaveCount(0);
  await expect(wieldingPanel.locator(".manuscript-card-symbol")).toHaveText(
    "☽",
  );
  await expect(wieldingPanel.locator(".manuscript-card-symbol")).toHaveClass(
    /astrology-icon-moon/,
  );
  await expect(wieldingPanel.locator(".manuscript-card-symbol")).toHaveAttribute(
    "aria-label",
    "Moon",
  );
  const symbolAlignment = await wieldingPanel
    .locator(".manuscript-card-symbol")
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const badgeBox = element.getBoundingClientRect();
      const glyphBox = range.getBoundingClientRect();
      range.detach();

      return {
        badgeCenter: badgeBox.top + badgeBox.height / 2,
        badgeHeight: badgeBox.height,
        boxShadow: window.getComputedStyle(element).boxShadow,
        glyphCenter: glyphBox.top + glyphBox.height / 2,
      };
    });
  expect(symbolAlignment.boxShadow).not.toBe("none");
  expect(symbolAlignment.badgeHeight).toBeGreaterThan(28);
  expect(symbolAlignment.badgeHeight).toBeLessThan(46);
  expect(
    Math.abs(symbolAlignment.glyphCenter - symbolAlignment.badgeCenter),
  ).toBeLessThan(4);

});

test("home page listen and read actions resume at the first unread section", async ({
  page,
}) => {
  const readSection = catalog.sections[0]!;
  const unreadSection = catalog.sections[1]!;

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
      contentHash: readSection.contentHash,
      key: readerProgressStorageKey,
      sectionId: readSection.sectionId,
    },
  );

  await page.goto("/");

  await expect(page.getByRole("link", { name: "Listen" })).toHaveAttribute(
    "href",
    `${unreadSection.href}?listen=1`,
  );
  await expect(
    page.getByRole("link", { name: "Read", exact: true }),
  ).toHaveAttribute("href", unreadSection.href);
});

test("home page listen action starts audiobook playback", async ({ page }) => {
  await page.addInitScript(({ storageKey, preference }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(preference));
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

    const spokenAudio: string[] = [];
    Object.defineProperty(window, "__spokenAudio", {
      configurable: true,
      value: spokenAudio,
    });
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
        resume: () => undefined,
        speak: (utterance: SpeechSynthesisUtterance) => {
          spokenAudio.push(utterance.text);
        },
      },
    });
  }, { storageKey: audioVoiceStorageKey, preference: systemVoicePreference });

  await page.goto("/");
  const listenLink = page.getByRole("link", { name: "Listen" });
  await expect(listenLink).toHaveAttribute(
    "href",
    `${catalog.sections[0]!.href}?listen=1`,
  );
  await listenLink.click();

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15000 })
    .toBe(catalog.sections[0]!.href);
  await expect(
    page.getByRole("button", { name: "Pause audiobook" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __spokenAudio: string[] }).__spokenAudio,
      ),
    )
    .toHaveLength(1);
});

test("overview links into canonical manuscript sections", async ({
  page,
}, testInfo) => {
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
  await expect(
    page.locator(".page-heading .eyebrow", { hasText: "Five minute map" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Five-Minute Overview of the nine published manuscripts."),
  ).toBeVisible();
  const overviewLayout = await page.evaluate(() => {
    const heading = document
      .querySelector(".page-heading")
      ?.getBoundingClientRect();
    const stats = document
      .querySelector(".stats-band")
      ?.getBoundingClientRect();
    const map = document
      .querySelector(".overview-map")
      ?.getBoundingClientRect();

    return {
      statsAfterHeading: heading && stats ? stats.top - heading.bottom : 0,
      mapAfterStats: stats && map ? map.top - stats.bottom : 0,
      statsWidth: stats?.width ?? 0,
      mapWidth: map?.width ?? 0,
    };
  });
  expect(overviewLayout.statsAfterHeading).toBeGreaterThanOrEqual(24);
  expect(overviewLayout.mapAfterStats).toBeGreaterThanOrEqual(24);
  expect(overviewLayout.statsWidth).toBeLessThanOrEqual(768);
  expect(overviewLayout.mapWidth).toBeLessThanOrEqual(768);
  const overviewStats = page.locator(".stats-band");
  await expect(overviewStats.getByText("volumes")).toBeVisible();
  await expect(overviewStats.getByText("parts")).toBeVisible();
  await expect(overviewStats.getByText("sections")).toBeVisible();
  await expect(overviewStats.getByText("full read")).toBeVisible();
  await expect(
    overviewStats.getByText(catalog.stats.volumeCount.toLocaleString()),
  ).toBeVisible();
  await expect(
    overviewStats.getByText(catalog.stats.partCount.toLocaleString()),
  ).toBeVisible();
  await expect(
    overviewStats.getByText(catalog.stats.sectionCount.toLocaleString()),
  ).toBeVisible();
  await expect(
    overviewStats.getByText(
      formatReadingDurationForWords(catalog.stats.wordCount),
    ),
  ).toBeVisible();
  const statLayout = await overviewStats.evaluate((stats) => {
    const items = Array.from(stats.querySelectorAll<HTMLElement>("div"));
    const durationValue = stats.querySelector<HTMLElement>(
      ".stats-band-duration-value",
    );
    const durationUnit = stats.querySelector<HTMLElement>(
      ".stats-band-duration-unit",
    );
    let durationSharesLine = false;

    if (durationValue && durationUnit) {
      const valueRect = durationValue.getBoundingClientRect();
      const unitRect = durationUnit.getBoundingClientRect();
      durationSharesLine =
        valueRect.top < unitRect.bottom && unitRect.top < valueRect.bottom;
    }

    return {
      aligned: items.every((item) => {
        const value = item.querySelector<HTMLElement>("strong");
        const label = item.querySelector<HTMLElement>("span");
        if (!value || !label) return false;
        return (
          Math.abs(
            value.getBoundingClientRect().left -
              label.getBoundingClientRect().left,
          ) < 1
        );
      }),
      durationSharesLine,
      durationUnitIsSmaller:
        durationValue && durationUnit
          ? parseFloat(getComputedStyle(durationUnit).fontSize) <
            parseFloat(getComputedStyle(durationValue).fontSize)
          : false,
      durationValueColor: durationValue
        ? getComputedStyle(durationValue).color
        : "",
      firstStatColor:
        items[0]?.querySelector("strong")
          ? getComputedStyle(items[0]!.querySelector("strong")!).color
          : "",
      minLeftPadding: Math.min(
        ...items.map((item) => parseFloat(getComputedStyle(item).paddingLeft)),
      ),
    };
  });
  expect(statLayout.aligned).toBe(true);
  expect(statLayout.durationSharesLine).toBe(true);
  expect(statLayout.durationUnitIsSmaller).toBe(true);
  expect(statLayout.durationValueColor).toBe(statLayout.firstStatColor);
  expect(statLayout.minLeftPadding).toBeGreaterThanOrEqual(23);
  await expect(page.locator(".overview-node")).toHaveCount(
    catalog.overview.nodes.length,
  );
  await expect(page.locator("details.overview-node")).toHaveCount(0);
  await expect(page.locator(".overview-node summary")).toHaveCount(0);
  await expect(page.locator(".overview-chevron")).toHaveCount(0);
  await expect(page.locator(".overview-node-number")).toHaveText(
    catalog.volumes.map((volume) => volume.numberLabel),
  );
  await expect(page.locator(".overview-node-cover-open img")).toHaveCount(
    catalog.overview.nodes.length,
  );
  await expect(page.locator(".overview-node-card-link")).toHaveCount(
    catalog.overview.nodes.length,
  );
  await expect(page.locator(".overview-read-link")).toHaveCount(
    catalog.overview.nodes.length,
  );
  await expect(
    page.getByText(
      "The Cardinal Scale is where the thesis stops describing civilization and starts building one.",
    ),
  ).toBeVisible();
  const firstVolumeFirstSection = sectionForId(catalog.volumes[0]!.sectionIds[0]!);
  await expect(page.locator(".overview-node-card-link").first()).toHaveAttribute(
    "href",
    firstVolumeFirstSection.href,
  );
  await expect(page.locator(".overview-read-link").first()).toHaveAttribute(
    "href",
    firstVolumeFirstSection.href,
  );
  await expect(page.locator(".overview-read-link").first()).toContainText(
    "Read This Manuscript",
  );
  await expect(
    page.locator(".overview-read-link-indicator").first(),
  ).toHaveText("››");
  const cardPadding = await page
    .locator(".overview-node-heading")
    .first()
    .evaluate((heading) => parseFloat(getComputedStyle(heading).paddingLeft));
  expect(cardPadding).toBeGreaterThanOrEqual(23);
  const overviewNodeAlignment = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(".overview-node"));

    return nodes.map((node) => {
      const heading = node.querySelector(".overview-node-heading strong");
      const copy = node.querySelector(".overview-node-content p");
      const headingLeft = heading?.getBoundingClientRect().left ?? 0;
      const copyLeft = copy?.getBoundingClientRect().left ?? 0;

      return Math.abs(headingLeft - copyLeft);
    });
  });
  expect(Math.max(...overviewNodeAlignment)).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "desktop") {
    const firstCard = page.locator(".overview-node").first();
    const firstReadLink = page.locator(".overview-read-link").first();
    await firstCard.hover();
    await page.waitForTimeout(240);
    const hoverScale = await firstCard.evaluate((card) => {
      const transform = getComputedStyle(card).transform;
      if (transform === "none") return 1;
      const matrix = new DOMMatrixReadOnly(transform);
      return matrix.a;
    });
    expect(hoverScale).toBeGreaterThan(1.01);

    await expect
      .poll(() =>
        firstReadLink.evaluate(
          (link) => getComputedStyle(link).textDecorationColor,
        ),
      )
      .toBe(await firstReadLink.evaluate((link) => getComputedStyle(link).color));

    await firstReadLink.hover();
    const readLinkStyle = await firstReadLink.evaluate((link) => {
      const indicator = link.querySelector<HTMLElement>(
        ".overview-read-link-indicator",
      );
      const style = getComputedStyle(link);
      return {
        color: style.color,
        columnGap: style.columnGap,
        decorationColor: style.textDecorationColor,
        decorationLine: style.textDecorationLine,
        indicatorColor: indicator ? getComputedStyle(indicator).color : "",
      };
    });
    expect(readLinkStyle.decorationLine).toContain("underline");
    expect(readLinkStyle.decorationColor).toBe(readLinkStyle.color);
    expect(readLinkStyle.indicatorColor).toBe(readLinkStyle.color);
    expect(Number.parseFloat(readLinkStyle.columnGap)).toBeGreaterThan(4);
  }
  await expect(page.getByRole("button", { name: "Listen" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^Seed$/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /^Seed$/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/manuscripts\/humanitys-most-viable-future\//);
});

test("overview manuscript cards target the earliest unread section", async ({
  page,
}) => {
  const firstVolume = catalog.volumes[0]!;
  const readSection = sectionForId(firstVolume.sectionIds[0]!);
  const earliestUnreadSection = sectionForId(firstVolume.sectionIds[1]!);
  const laterUnreadSection = sectionForId(firstVolume.sectionIds[2]!);

  await page.addInitScript(
    ({ key, laterUnread, read }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          sections: {
            [read.sectionId]: {
              sectionId: read.sectionId,
              contentHash: read.contentHash,
              readAt: 1_000,
              percent: 100,
            },
            [laterUnread.sectionId]: {
              sectionId: laterUnread.sectionId,
              contentHash: laterUnread.contentHash,
              readAt: 0,
              percent: 42,
              firstOpenedAt: 1_500,
              lastOpenedAt: 2_000,
            },
          },
        }),
      );
    },
    {
      key: readerProgressStorageKey,
      laterUnread: {
        contentHash: laterUnreadSection.contentHash,
        sectionId: laterUnreadSection.sectionId,
      },
      read: {
        contentHash: readSection.contentHash,
        sectionId: readSection.sectionId,
      },
    },
  );

  await page.goto("/overview/");

  const firstCard = page.locator(".overview-node").first();
  await expect(firstCard.locator(".overview-node-card-link")).toHaveAttribute(
    "href",
    earliestUnreadSection.href,
  );
  await expect(firstCard.locator(".overview-read-link")).toHaveAttribute(
    "href",
    earliestUnreadSection.href,
  );

  await firstCard.click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(earliestUnreadSection.href);
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

test("home page presents an interactive cover flow", async ({ page }, testInfo) => {
  await page.goto("/");
  const coverFlow = page.locator(".cover-flow");
  const initialActiveIndex = 0;
  const initialActiveVolume = catalog.volumes[initialActiveIndex]!;

  await expect(coverFlow).toBeVisible();
  await expect(page.locator(".manuscript-showcase")).toHaveCount(0);
  await expect(coverFlow.locator(".cover-flow-card")).toHaveCount(
    catalog.volumes.length,
  );
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("data-volume-href", initialActiveVolume.href);
  await expect(
    coverFlow.locator(
      ".cover-flow-card.is-active .cover-flow-card-panel strong",
    ),
  ).toHaveText(initialActiveVolume.title);
  const firstSection = catalog.sections[0]!;
  const activeCard = coverFlow.locator('.cover-flow-card[aria-current="true"]');
  const activePanel = activeCard.locator(".cover-flow-card-panel");
  await expect(activePanel.locator(".manuscript-card-tags")).toHaveCount(0);
  await expect(
    activePanel.locator(".manuscript-card-outline-full"),
  ).toHaveAttribute("href", firstSection.href);
  const readFullLabelMetrics = await activePanel
    .locator(".manuscript-card-outline-full")
    .evaluate((row) => {
      const icon = row.querySelector("svg")?.getBoundingClientRect();
      const label = row
        .querySelector(".manuscript-card-outline-title > span")
        ?.getBoundingClientRect();

      return {
        iconCenter: icon ? icon.top + icon.height / 2 : 0,
        labelCenter: label ? label.top + label.height / 2 : 0,
        labelHeight: label?.height ?? 0,
      };
    });
  expect(
    Math.abs(
      readFullLabelMetrics.iconCenter - readFullLabelMetrics.labelCenter,
    ),
  ).toBeLessThanOrEqual(3);
  expect(readFullLabelMetrics.labelHeight).toBeLessThan(32);
  await expect(
    activePanel.getByRole("button", { name: "Opening" }),
  ).toBeVisible();
  const panelMetrics = await activeCard.evaluate((card) => {
    const flow = card.closest(".cover-flow");
    const cover = card.querySelector(".cover-flow-image-frame");
    const panel = card.querySelector(".cover-flow-card-panel");
    const panelScroll = card.querySelector(".cover-flow-card-panel-scroll");
    const flowBox = flow?.getBoundingClientRect();
    const coverBox = cover?.getBoundingClientRect();
    const panelBox = panel?.getBoundingClientRect();
    const panelStyle = panel ? window.getComputedStyle(panel) : null;
    const panelScrollStyle = panelScroll
      ? window.getComputedStyle(panelScroll)
      : null;

    return {
      coverHeight: coverBox?.height ?? 0,
      coverToPanelGap:
        coverBox && panelBox ? panelBox.top - coverBox.bottom : 0,
      panelHeight: panelBox?.height ?? 0,
      panelMaxHeight: panelStyle?.maxHeight ?? "",
      panelOverflowY: panelStyle?.overflowY ?? "",
      panelScrollClientHeight: panelScroll?.clientHeight ?? 0,
      panelScrollHeight: panelScroll?.scrollHeight ?? 0,
      panelScrollOverflowY: panelScrollStyle?.overflowY ?? "",
      stageEndGap: flowBox && panelBox ? flowBox.bottom - panelBox.bottom : 0,
      panelTransitionProperty: panelStyle?.transitionProperty ?? "",
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  const mobileCoverFlowAlignment = await coverFlow.evaluate((flow) => {
    const active = flow.querySelector<HTMLElement>(
      '.cover-flow-card[aria-current="true"]',
    );
    const cover = active?.querySelector<HTMLElement>(".cover-flow-image-frame");
    const panel = active?.querySelector<HTMLElement>(".cover-flow-card-panel");
    const previous = flow.querySelector<HTMLElement>(
      ".cover-flow-edge-button-previous",
    );
    const next = flow.querySelector<HTMLElement>(".cover-flow-edge-button-next");
    const coverBox = cover?.getBoundingClientRect();
    const panelBox = panel?.getBoundingClientRect();
    const previousBox = previous?.getBoundingClientRect();
    const nextBox = next?.getBoundingClientRect();
    const coverCenterY = coverBox ? coverBox.top + coverBox.height / 2 : 0;

    return {
      nextCenterOffset:
        nextBox && coverBox
          ? nextBox.top + nextBox.height / 2 - coverCenterY
          : 0,
      nextRightInset: nextBox
        ? document.documentElement.clientWidth - nextBox.right
        : 0,
      panelLeftDelta:
        coverBox && panelBox ? Math.abs(panelBox.left - coverBox.left) : 0,
      panelRightDelta:
        coverBox && panelBox ? Math.abs(panelBox.right - coverBox.right) : 0,
      previousCenterOffset:
        previousBox && coverBox
          ? previousBox.top + previousBox.height / 2 - coverCenterY
          : 0,
      previousLeftInset: previousBox?.left ?? 0,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  if (mobileCoverFlowAlignment.viewportWidth <= 540) {
    expect(mobileCoverFlowAlignment.panelLeftDelta).toBeLessThanOrEqual(2);
    expect(mobileCoverFlowAlignment.panelRightDelta).toBeLessThanOrEqual(2);
    expect(mobileCoverFlowAlignment.previousCenterOffset).toBeGreaterThanOrEqual(
      3,
    );
    expect(mobileCoverFlowAlignment.previousCenterOffset).toBeLessThanOrEqual(
      8,
    );
    expect(mobileCoverFlowAlignment.nextCenterOffset).toBeGreaterThanOrEqual(3);
    expect(mobileCoverFlowAlignment.nextCenterOffset).toBeLessThanOrEqual(8);
    expect(mobileCoverFlowAlignment.previousLeftInset).toBeGreaterThan(8);
    expect(mobileCoverFlowAlignment.nextRightInset).toBeGreaterThan(8);
  }
  expect(panelMetrics.panelHeight).toBeLessThanOrEqual(
    panelMetrics.coverHeight * 0.88 + 2,
  );
  expect(panelMetrics.stageEndGap).toBeLessThanOrEqual(
    panelMetrics.viewportWidth <= 540 ? 80 : 150,
  );
  expect(panelMetrics.coverToPanelGap).toBeGreaterThanOrEqual(44);
  expect(panelMetrics.panelMaxHeight).not.toBe("none");
  expect(panelMetrics.panelOverflowY).toBe("hidden");
  expect(panelMetrics.panelTransitionProperty).toContain("height");
  expect(panelMetrics.panelScrollOverflowY).toBe("auto");
  expect(panelMetrics.panelScrollHeight).toBeGreaterThanOrEqual(
    panelMetrics.panelScrollClientHeight,
  );

  await activePanel
    .getByRole("button", { name: "Opening" })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
  await expect(
    activePanel.getByRole("button", { name: "Back to parts" }),
  ).toBeVisible();
  await expect(
    activePanel.locator(".manuscript-card-outline-part-overview"),
  ).toHaveAttribute("href", initialActiveVolume.parts[0]!.href);
  await expect(
    activePanel.locator(".manuscript-card-outline-part-overview"),
  ).toContainText("Overview");
  const partOverviewMetaAlignment = await activePanel
    .locator(".manuscript-card-outline-part-overview")
    .evaluate((row) => {
      const minutes = row.querySelector("small")?.getBoundingClientRect();
      const dot = row
        .querySelector(".progress-state-dot")
        ?.getBoundingClientRect();

      return {
        dotCenter: dot ? dot.top + dot.height / 2 : 0,
        minutesCenter: minutes ? minutes.top + minutes.height / 2 : 0,
      };
    });
  expect(
    Math.abs(
      partOverviewMetaAlignment.minutesCenter -
        partOverviewMetaAlignment.dotCenter,
    ),
  ).toBeLessThanOrEqual(9);
  await expect(
    activePanel.getByRole("link", {
      name: new RegExp(initialActiveVolume.parts[0]!.chapters[0]!.title),
    }),
  ).toHaveAttribute("href", initialActiveVolume.parts[0]!.chapters[0]!.href);
  const chapterRowMetrics = await activePanel
    .locator(".manuscript-card-outline-chapters")
    .evaluate((outline) => {
      const rows = Array.from(
        outline.querySelectorAll<HTMLElement>(
          ".manuscript-card-outline-part-button",
        ),
      );

      return rows.map((row) => {
        const minutes = row.querySelector("small")?.getBoundingClientRect();
        const dot = row
          .querySelector(".progress-state-dot")
          ?.getBoundingClientRect();

        return {
          hasChevron: Boolean(row.querySelector(".manuscript-card-outline-chevron")),
          isAnchor: row.tagName === "A",
          minuteDotDelta:
            minutes && dot
              ? Math.abs(
                  minutes.top +
                    minutes.height / 2 -
                    (dot.top + dot.height / 2),
                )
              : null,
        };
      });
    });
  expect(chapterRowMetrics.length).toBeGreaterThan(1);
  expect(chapterRowMetrics.every((row) => row.hasChevron)).toBe(true);
  expect(chapterRowMetrics.every((row) => row.isAnchor)).toBe(true);
  expect(
    Math.max(...chapterRowMetrics.map((row) => row.minuteDotDelta ?? 100)),
  ).toBeLessThanOrEqual(3);
  await activePanel
    .getByRole("button", { name: "Back to parts" })
    .dispatchEvent("click");
  await expect(
    activePanel.getByRole("button", { name: "Opening" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      coverFlow.evaluate((flow) => {
        const active = flow.querySelector<HTMLElement>(
          '.cover-flow-card[aria-current="true"]',
        );
        return Math.abs(
          Number.parseFloat(
            active?.style.getPropertyValue("--cover-flow-rotate") ?? "100",
          ),
        );
      }),
    )
    .toBeLessThan(1);

  const coverFlowTransforms = await coverFlow.evaluate((flow) => {
    const shadowAlpha = (element: HTMLElement | null) => {
      if (!element) return 0;
      const shadow = window.getComputedStyle(element).boxShadow;
      const match = shadow.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
      return match ? Number.parseFloat(match[1] ?? "0") : 0;
    };
    const active = flow.querySelector<HTMLElement>(
      '.cover-flow-card[aria-current="true"]',
    );
    const activeCover = active?.querySelector<HTMLElement>(
      ".cover-flow-image-frame",
    );
    const activeShell = active?.closest<HTMLElement>(".cover-flow-card-shell");
    const sideCard =
      activeShell?.previousElementSibling?.querySelector<HTMLElement>(
        ".cover-flow-card",
      ) ??
      activeShell?.nextElementSibling?.querySelector<HTMLElement>(
        ".cover-flow-card",
      ) ??
      null;

    return {
      activeRotate: active?.style.getPropertyValue("--cover-flow-rotate") ?? "",
      activeScale: active?.style.getPropertyValue("--cover-flow-scale") ?? "",
      activeShadowStrength:
        active?.style.getPropertyValue("--cover-flow-cover-shadow-strength") ??
        "",
      activeShadowAlpha: shadowAlpha(
        active?.querySelector<HTMLElement>(".cover-flow-image-frame") ?? null,
      ),
      activeTransform: active ? getComputedStyle(active).transform : "",
      cardGap: window.getComputedStyle(flow.querySelector(".cover-flow-track")!)
        .gap,
      nativeSnapStop: activeShell
        ? window.getComputedStyle(activeShell).scrollSnapStop
        : "",
      flowWidth: flow.getBoundingClientRect().width,
      scrollStepWidth: activeShell?.getBoundingClientRect().width ?? 0,
      activeCoverWidth: activeCover?.getBoundingClientRect().width ?? 0,
      panelVisible:
        active?.querySelector(".cover-flow-card-panel") &&
        window.getComputedStyle(active.querySelector(".cover-flow-card-panel")!)
          .backdropFilter,
      sideRotate: sideCard?.style.getPropertyValue("--cover-flow-rotate") ?? "",
      sideScale: sideCard?.style.getPropertyValue("--cover-flow-scale") ?? "",
      sideShadowStrength:
        sideCard?.style.getPropertyValue("--cover-flow-cover-shadow-strength") ??
        "",
      sideShadowAlpha: shadowAlpha(
        sideCard?.querySelector<HTMLElement>(".cover-flow-image-frame") ?? null,
      ),
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(
    Math.abs(Number.parseFloat(coverFlowTransforms.activeRotate)),
  ).toBeLessThan(1);
  expect(Number.parseFloat(coverFlowTransforms.activeScale)).toBeGreaterThan(
    1.05,
  );
  expect(coverFlowTransforms.activeTransform).not.toBe("none");
  expect(Number.parseFloat(coverFlowTransforms.cardGap)).toBeLessThan(1);
  expect(coverFlowTransforms.flowWidth).toBeGreaterThanOrEqual(
    coverFlowTransforms.viewportWidth,
  );
  expect(coverFlowTransforms.nativeSnapStop).toBe("normal");
  expect(coverFlowTransforms.scrollStepWidth).toBeLessThan(
    coverFlowTransforms.activeCoverWidth,
  );
  expect(coverFlowTransforms.panelVisible).not.toBe("none");
  expect(coverFlowTransforms.sideRotate).not.toBe("0deg");
  expect(Number.parseFloat(coverFlowTransforms.sideScale)).toBeLessThan(1);
  expect(
    Number.parseFloat(coverFlowTransforms.activeShadowStrength),
  ).toBeGreaterThan(0.95);
  expect(Number.parseFloat(coverFlowTransforms.sideShadowStrength)).toBeLessThan(
    Number.parseFloat(coverFlowTransforms.activeShadowStrength),
  );
  expect(coverFlowTransforms.activeShadowAlpha).toBeGreaterThanOrEqual(0.16);
  expect(coverFlowTransforms.sideShadowAlpha).toBeLessThan(0.19);

  const verticalStability = await coverFlow
    .locator(".cover-flow-scroll")
    .evaluate(async (scroller) => {
      const card = document.querySelector<HTMLElement>(".cover-flow-card");
      const cover = card?.querySelector<HTMLElement>(".cover-flow-image-frame");
      const originalScrollLeft = scroller.scrollLeft;
      const tops: number[] = [];
      const maxScrollLeft = Math.min(
        scroller.scrollWidth - scroller.clientWidth,
        420,
      );

      for (let scrollLeft = 0; scrollLeft <= maxScrollLeft; scrollLeft += 30) {
        scroller.scrollLeft = scrollLeft;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
        const coverBox = cover?.getBoundingClientRect();
        if (coverBox) tops.push(coverBox.top);
      }

      scroller.scrollLeft = originalScrollLeft;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

      return {
        maxTop: Math.max(...tops),
        minTop: Math.min(...tops),
      };
    });
  expect(verticalStability.maxTop - verticalStability.minTop).toBeLessThanOrEqual(
    1,
  );

  const currentActiveHref = await coverFlow
    .locator('.cover-flow-card[aria-current="true"]')
    .getAttribute("data-volume-href");
  const currentActiveIndex = Math.max(
    catalog.volumes.findIndex((volume) => volume.href === currentActiveHref),
    0,
  );
  const backgroundTarget =
    catalog.volumes[
      currentActiveIndex < catalog.volumes.length - 1
        ? currentActiveIndex + 1
        : currentActiveIndex - 1
    ]!;
  await coverFlow
    .locator(`.cover-flow-card[data-volume-href="${backgroundTarget.href}"]`)
    .dispatchEvent("click");
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveCount(1, { timeout: 15000 });
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("data-volume-href", backgroundTarget.href, {
    timeout: 15000,
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"] .cover-flow-card-panel strong'),
  ).toHaveText(backgroundTarget.title, { timeout: 15000 });
  await page.reload();
  await expect(coverFlow).toBeVisible();
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("data-volume-href", initialActiveVolume.href);

  const nextButton = coverFlow.locator(".cover-flow-edge-button-next");
  const finalTargetIndex =
    testInfo.project.name === "mobile" ? initialActiveIndex + 1 : catalog.volumes.length - 1;
  for (
    let targetIndex = initialActiveIndex + 1;
    targetIndex <= finalTargetIndex;
    targetIndex += 1
  ) {
    await expect(nextButton).toBeEnabled({ timeout: 15000 });
    await nextButton.dispatchEvent("click");
    await expect(
      coverFlow.locator('.cover-flow-card[aria-current="true"]'),
    ).toHaveAttribute("data-volume-href", catalog.volumes[targetIndex]!.href, {
      timeout: 15000,
    });
  }

  if (testInfo.project.name === "mobile") return;

  await expect(nextButton).toBeDisabled();
  const previousButton = coverFlow.locator(".cover-flow-edge-button-previous");
  await previousButton.dispatchEvent("click");
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("data-volume-href", catalog.volumes.at(-2)!.href);

  if (testInfo.project.name !== "mobile") {
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
    });
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
    await coverFlow.scrollIntoViewIfNeeded();
    await coverFlow.locator(".cover-flow-scroll").hover();
    await page.mouse.wheel(0, 380);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(40);

    await coverFlow.scrollIntoViewIfNeeded();
    await coverFlow.locator(".cover-flow-scroll").evaluate((scroller) => {
      scroller.scrollLeft = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await coverFlow.locator(".cover-flow-scroll").hover();
    const nativeHorizontalScroll = await coverFlow
      .locator(".cover-flow-scroll")
      .evaluate((scroller) => scroller.scrollLeft);
    await page.mouse.wheel(920, 0);
    await expect
      .poll(() =>
        coverFlow
          .locator(".cover-flow-scroll")
          .evaluate((scroller) => scroller.scrollLeft),
      )
      .toBeGreaterThan(nativeHorizontalScroll + 80);
    await expect(
      coverFlow.locator('.cover-flow-card[aria-current="true"]'),
    ).not.toHaveAttribute("data-volume-href", initialActiveVolume.href);
  }
});
