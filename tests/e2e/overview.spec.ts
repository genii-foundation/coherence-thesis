import { expect, test } from "@playwright/test";
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

test("home page presents the overview and manuscript entry points", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "There is a field forming around the work civilization forgot to name.",
    }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("link", { name: /Read the overview/ }),
  ).toHaveAttribute("href", "/overview/");
  await expect(
    page.getByRole("link", { name: /Begin Volume I/ }),
  ).toHaveAttribute("href", catalog.volumes[0]!.href);
  await expect(
    page.getByRole("link", { name: /Browse manuscripts/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Nine volume series")).toHaveCount(0);
  await expect(
    page.getByText(
      "Presence, trust architecture, regenerative economics, anti-capture governance, humane intelligence, and right-sized community are not separate projects here. They are strands of one civilizational craft.",
    ),
  ).toBeVisible();
  await expect(page.locator(".hero-stats li")).toHaveText([
    `${catalog.stats.volumeCount.toLocaleString()} volumes`,
    `${catalog.stats.sectionCount.toLocaleString()} sections`,
    `${formatReadingDurationForWords(catalog.stats.wordCount)} of audio`,
  ]);
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
    const coverFlow = document
      .querySelector(".cover-flow")
      ?.getBoundingClientRect();
    return {
      gap: hero && coverFlow ? coverFlow.top - hero.bottom : 0,
      heroHeight: hero?.height ?? 0,
    };
  });
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
  const wieldingCard = page.getByRole("link", {
    name: "Open Wielding Intelligence",
  });
  const wieldingPanel = wieldingCard.locator(".cover-flow-card-panel");
  await expect(wieldingCard.locator("img")).toBeVisible();
  await expect(wieldingPanel).toBeVisible();
  await expect(wieldingPanel.getByText("Wielding Intelligence")).toBeVisible();
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
  const detailTagHeight = await wieldingPanel
    .locator(".manuscript-card-tags span")
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(detailTagHeight).toBeLessThanOrEqual(24);
  await expect(wieldingPanel.locator(".manuscript-card-symbol")).toHaveText(
    "☽",
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
        glyphCenter: glyphBox.top + glyphBox.height / 2,
        paddingTop: window.getComputedStyle(element).paddingTop,
      };
    });
  expect(Number.parseFloat(symbolAlignment.paddingTop)).toBeGreaterThan(0);
  expect(symbolAlignment.badgeHeight).toBeGreaterThan(28);
  expect(symbolAlignment.badgeHeight).toBeLessThan(40);
  expect(symbolAlignment.glyphCenter).toBeGreaterThan(
    symbolAlignment.badgeCenter,
  );
  expect(
    symbolAlignment.glyphCenter - symbolAlignment.badgeCenter,
  ).toBeLessThan(4);

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

test("home page presents an interactive cover flow", async ({ page }) => {
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
  ).toHaveAttribute("href", initialActiveVolume.href);
  await expect(
    coverFlow.locator(
      ".cover-flow-card.is-active .cover-flow-card-panel strong",
    ),
  ).toHaveText(initialActiveVolume.title);

  const coverFlowTransforms = await coverFlow.evaluate((flow) => {
    const active = flow.querySelector<HTMLElement>(
      '.cover-flow-card[aria-current="true"]',
    );
    const shells = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card-shell"),
    );
    const firstShellRect = shells[0]?.getBoundingClientRect();
    const secondShellRect = shells[1]?.getBoundingClientRect();
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
      activeTransform: active ? getComputedStyle(active).transform : "",
      cardGap: window.getComputedStyle(flow.querySelector(".cover-flow-track")!)
        .gap,
      flowWidth: flow.getBoundingClientRect().width,
      overlap:
        firstShellRect && secondShellRect
          ? firstShellRect.right - secondShellRect.left
          : 0,
      panelVisible:
        active?.querySelector(".cover-flow-card-panel") &&
        window.getComputedStyle(active.querySelector(".cover-flow-card-panel")!)
          .backdropFilter,
      sideRotate: sideCard?.style.getPropertyValue("--cover-flow-rotate") ?? "",
      sideScale: sideCard?.style.getPropertyValue("--cover-flow-scale") ?? "",
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
  expect(coverFlowTransforms.overlap).toBeGreaterThan(
    coverFlowTransforms.viewportWidth < 720 ? 90 : 140,
  );
  expect(coverFlowTransforms.panelVisible).not.toBe("none");
  expect(coverFlowTransforms.sideRotate).not.toBe("0deg");
  expect(Number.parseFloat(coverFlowTransforms.sideScale)).toBeLessThan(1);

  await page.getByRole("button", { name: "Next manuscript" }).click();
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("href", catalog.volumes[initialActiveIndex + 1]!.href);
  await expect(
    coverFlow.locator(
      ".cover-flow-card.is-active .cover-flow-card-panel strong",
    ),
  ).toHaveText(catalog.volumes[initialActiveIndex + 1]!.title);

  const nextButton = page.getByRole("button", { name: "Next manuscript" });
  for (
    let targetIndex = initialActiveIndex + 2;
    targetIndex < catalog.volumes.length;
    targetIndex += 1
  ) {
    await nextButton.click();
    await expect(
      coverFlow.locator('.cover-flow-card[aria-current="true"]'),
    ).toHaveAttribute("href", catalog.volumes[targetIndex]!.href);
  }

  await expect(nextButton).toBeDisabled();

  const previousButton = page.getByRole("button", {
    name: "Previous manuscript",
  });
  await previousButton.click();
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("href", catalog.volumes.at(-2)!.href);

  await coverFlow.locator(".cover-flow-scroll").dispatchEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: 920,
    deltaY: 0,
  });
  await expect(
    coverFlow.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("href", catalog.volumes.at(-1)!.href);
});
