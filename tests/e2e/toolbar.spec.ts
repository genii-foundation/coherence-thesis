import { expect, test, type Page } from "@playwright/test";
import {
  searchTargetSection,
  wieldingVolume,
  wieldingFrontMatter,
  wieldingDiagnosis,
  wieldingSection,
  expectMenuFitsViewport,
} from "./fixtures";

function expectSettledTransform(transform: string): void {
  if (transform === "none") return;
  const values = transform.match(/^matrix\(([^)]+)\)$/)?.[1]
    ?.split(",")
    .map((value) => Number.parseFloat(value.trim()));
  expect(values).toBeDefined();
  expect(values?.slice(0, 4)).toEqual([1, 0, 0, 1]);
  expect(Math.abs(values?.[4] ?? 100)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(values?.[5] ?? 100)).toBeLessThanOrEqual(0.01);
}

async function expectToolbarTriggerActive(
  page: Page,
  selector: string,
): Promise<void> {
  const trigger = page.locator(selector);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  await expect
    .poll(async () =>
      trigger.evaluate((element) => {
        const style = window.getComputedStyle(element);
        const probe = document.createElement("div");
        probe.style.background = "var(--nav-hover-background)";
        document.body.append(probe);
        const expectedBackground = window.getComputedStyle(probe).backgroundColor;
        probe.remove();

        return style.backgroundColor === expectedBackground;
      }),
    )
    .toBe(true);
}

async function expectToolbarTriggerOpenWithoutActiveWash(
  page: Page,
  selector: string,
): Promise<void> {
  const trigger = page.locator(selector);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toHaveAttribute("data-toolbar-menu-trigger", "true");
  await expect(trigger).toHaveAttribute("data-menu-open", "true");

  await expect
    .poll(async () =>
      trigger.evaluate((element) => {
        const style = window.getComputedStyle(element);
        const probe = document.createElement("div");
        probe.style.background = "var(--nav-hover-background)";
        document.body.append(probe);
        const activeBackground = window.getComputedStyle(probe).backgroundColor;
        probe.remove();

        return style.backgroundColor !== activeBackground;
      }),
    )
    .toBe(true);
}

async function expectRestingControlBorder(
  page: Page,
  selector: string,
): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  await control.evaluate((element) => {
    if (element instanceof HTMLElement) element.blur();
  });

  const border = await control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      color: style.borderTopColor,
      style: style.borderTopStyle,
      width: Number.parseFloat(style.borderTopWidth),
    };
  });

  expect(border.width).toBeGreaterThanOrEqual(1);
  expect(border.style).not.toBe("none");
  expect(border.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(border.color).not.toBe("transparent");
}

async function expectMobilePopoverStartsBelowToolbar(
  page: Page,
  selector: string,
): Promise<void> {
  await expect
    .poll(async () =>
      page.locator(selector).evaluate((element) => {
        const popover = element.getBoundingClientRect();
        const header = document
          .querySelector(".site-header")
          ?.getBoundingClientRect();
        const headerBottom = header?.bottom ?? 0;
        return (
          popover.top >= headerBottom - 1 &&
          popover.top <= headerBottom + 2
        );
      }),
    )
    .toBe(true);

  const metrics = await page.locator(selector).evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      radiusTopLeft: Number.parseFloat(style.borderTopLeftRadius),
      radiusTopRight: Number.parseFloat(style.borderTopRightRadius),
    };
  });

  expect(metrics.radiusTopLeft).toBe(0);
  expect(metrics.radiusTopRight).toBe(0);
}

async function toolbarMenuHeightTarget(
  page: Page,
  selector: string,
): Promise<number> {
  return page.locator(selector).evaluate((element) => {
    const value = getComputedStyle(element)
      .getPropertyValue("--toolbar-menu-height")
      .trim();
    return Number.parseFloat(value);
  });
}

test("mobile toolbar and progress menu stay within the viewport", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        cancel: () => undefined,
        getVoices: () => [
          { name: "Albert", voiceURI: "albert" },
          { name: "Samantha", voiceURI: "samantha" },
          { name: "Daniel", voiceURI: "daniel" },
          { name: "Karen", voiceURI: "karen" },
          { name: "Moira", voiceURI: "moira" },
          { name: "Tessa", voiceURI: "tessa" },
          { name: "Zarvox", voiceURI: "zarvox" },
          { name: "Bubbles", voiceURI: "bubbles" },
        ],
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
    expect(layout.headerHeight).toBeLessThanOrEqual(88);
  }
  if (layout.clientWidth > 860) {
    expect(layout.headerPaddingLeft).toBeCloseTo(layout.headerPaddingTop, 1);
    expect(layout.headerPaddingRight).toBeCloseTo(layout.headerPaddingTop, 1);
  }

  const searchButton = page.getByRole("button", { name: "Search manuscripts" });
  const outlineButton = page.getByRole("button", { name: /Outline/ });
  const settingsButton = page.getByRole("button", { name: "Reader settings" });
  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  const audioButton = page.getByRole("button", { name: /Listen/ });
  const progressButton = page.getByRole("button", { name: /Progress/ });
  await expect(page.locator(".site-nav .mobile-home-link")).toHaveCount(0);
  await expect(searchButton).toBeVisible();
  await expect(outlineButton).toBeVisible();
  await expect(settingsButton).toBeVisible();
  await expect(shareButton).toBeVisible();
  await expect(audioButton).toBeVisible();
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
    const settings = document
      .querySelector(".settings-menu-button")
      ?.getBoundingClientRect();
    const share = document
      .querySelector(".share-menu-button")
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
    const outlineIcon = document.querySelector(".outline-menu-button svg");
    const audioChevron = document.querySelector(
      ".audio-menu-button .audio-menu-chevron",
    );
    const percent = document.querySelector(".progress-percent");
    const headerBrand = document.querySelector(".site-header > .brand-mark");
    const headerBrandTitle = headerBrand?.querySelector(".brand-title");
    const headerBrandLogoFull = headerBrand?.querySelector(
      ".brand-title-mobile-logo-full",
    );
    const headerBrandLogoInitials = headerBrand?.querySelector(
      ".brand-title-mobile-logo-initials",
    );
    const headerBreadcrumb = document.querySelector(
      ".site-header > .breadcrumb-trail",
    );
    const pageContext = document.querySelector(".mobile-page-context");
    const pageContextBrandKicker = document.querySelector(
      ".mobile-page-brand-kicker",
    );
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
    const headerBrandTitleStyle = headerBrandTitle
      ? window.getComputedStyle(headerBrandTitle)
      : null;
    const headerBrandLogoFullStyle = headerBrandLogoFull
      ? window.getComputedStyle(headerBrandLogoFull)
      : null;
    const headerBrandLogoInitialsStyle = headerBrandLogoInitials
      ? window.getComputedStyle(headerBrandLogoInitials)
      : null;
    const headerBreadcrumbStyle = headerBreadcrumb
      ? window.getComputedStyle(headerBreadcrumb)
      : null;
    const pageContextStyle = pageContext
      ? window.getComputedStyle(pageContext)
      : null;
    const pageContextBrandKickerStyle = pageContextBrandKicker
      ? window.getComputedStyle(pageContextBrandKicker)
      : null;
    const pageContextBrandTitleStyle = pageContextBrandTitle
      ? window.getComputedStyle(pageContextBrandTitle)
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
    const outlineIconStyle = outlineIcon
      ? window.getComputedStyle(outlineIcon)
      : null;
    const audioChevronStyle = audioChevron
      ? window.getComputedStyle(audioChevron)
      : null;
    const percentStyle = percent ? window.getComputedStyle(percent) : null;
    const pageContextBrandBox = pageContextBrandTitle?.getBoundingClientRect();
    const pageContextBreadcrumbBox =
      pageContextBreadcrumb?.getBoundingClientRect();
    const pageHeadingBox = pageHeading?.getBoundingClientRect();
    return {
      searchLeft: search?.left ?? 0,
      settingsLeft: settings?.left ?? 0,
      outlineLeft: outline?.left ?? 0,
      shareLeft: share?.left ?? 0,
      audioLeft: audio?.left ?? 0,
      progressLeft: progress?.left ?? 0,
      searchWidth: search?.width ?? 0,
      outlineWidth: outline?.width ?? 0,
      settingsWidth: settings?.width ?? 0,
      shareWidth: share?.width ?? 0,
      audioWidth: audio?.width ?? 0,
      progressWidth: progress?.width ?? 0,
      progressLabelWidth: progressLabel?.getBoundingClientRect().width ?? 0,
      progressLabelClipped: progressLabelStyle?.clip ?? "",
      outlineLabelWidth: outlineLabel?.getBoundingClientRect().width ?? 0,
      audioLabelWidth: audioLabel?.getBoundingClientRect().width ?? 0,
      outlineLabelClipped: outlineLabelStyle?.clip ?? "",
      audioLabelClipped: audioLabelStyle?.clip ?? "",
      outlineIconDisplay: outlineIconStyle?.display ?? "",
      audioChevronDisplay: audioChevronStyle?.display ?? "",
      progressColor: percentStyle?.color ?? "",
      progressBorderColor: percentStyle?.borderTopColor ?? "",
      progressBackground: percentStyle?.backgroundColor ?? "",
      progressText: percent?.textContent ?? "",
      headerBrandDisplay: headerBrandStyle?.display ?? "",
      headerBrandLeft: headerBrand?.getBoundingClientRect().left ?? 0,
      headerBrandRight: headerBrand?.getBoundingClientRect().right ?? 0,
      headerBrandWidth: headerBrand?.getBoundingClientRect().width ?? 0,
      headerBrandTitleWidth:
        headerBrandTitle?.getBoundingClientRect().width ?? 0,
      headerBrandPaddingLeft: headerBrandStyle?.paddingLeft ?? "",
      headerBrandTitleBorderColor:
        headerBrandTitleStyle?.borderBottomColor ?? "",
      headerBrandLogoFontSize: headerBrandLogoInitialsStyle?.fontSize ?? "",
      headerBrandMobileLogo: [
        headerBrandLogoFullStyle?.display !== "none"
          ? headerBrandLogoFull?.textContent
          : "",
        headerBrandLogoInitialsStyle?.display !== "none"
          ? headerBrandLogoInitials?.textContent
          : "",
      ].join(""),
      headerBrandTitleOverflow: headerBrandTitleStyle?.textOverflow ?? "",
      headerBreadcrumbDisplay: headerBreadcrumbStyle?.display ?? "",
      pageContextDisplay: pageContextStyle?.display ?? "",
      pageContextBrandKicker: pageContextBrandKicker?.textContent ?? "",
      pageContextBrandKickerOverflow:
        pageContextBrandKickerStyle?.textOverflow ?? "",
      pageContextBrandTitle: pageContextBrandTitle?.textContent ?? "",
      pageContextBrandTitleOverflow:
        pageContextBrandTitleStyle?.textOverflow ?? "",
      pageContextBreadcrumbText: pageContextBreadcrumb?.textContent ?? "",
      pageContextBrandTop: pageContextBrandBox?.top ?? 0,
      pageContextBrandBottom: pageContextBrandBox?.bottom ?? 0,
      pageContextBreadcrumbTop: pageContextBreadcrumbBox?.top ?? 0,
      pageContextBreadcrumbBottom: pageContextBreadcrumbBox?.bottom ?? 0,
      pageHeadingTop: pageHeadingBox?.top ?? 0,
    };
  });

  if (layout.clientWidth <= 860) {
    expect(["flex", "inline-flex"]).toContain(
      toolbarMetrics.headerBrandDisplay,
    );
    expect(toolbarMetrics.headerBrandMobileLogo).toBe("CT");
    expect(toolbarMetrics.headerBrandTitleOverflow).not.toBe("ellipsis");
    expect(toolbarMetrics.headerBrandLeft).toBeLessThan(
      toolbarMetrics.searchLeft,
    );
    expect(toolbarMetrics.headerBrandRight).toBeLessThanOrEqual(
      toolbarMetrics.searchLeft,
    );
    expect(toolbarMetrics.headerBrandWidth).toBeLessThanOrEqual(
      toolbarMetrics.headerBrandTitleWidth +
        Number.parseFloat(toolbarMetrics.headerBrandPaddingLeft) +
        2,
    );
    expect(
      toolbarMetrics.searchLeft - toolbarMetrics.headerBrandRight,
    ).toBeGreaterThan(8);
    expect(
      Number.parseFloat(toolbarMetrics.headerBrandPaddingLeft),
    ).toBeGreaterThan(0);
    expect(
      Number.parseFloat(toolbarMetrics.headerBrandLogoFontSize),
    ).toBeGreaterThan(20);
    expect(toolbarMetrics.headerBreadcrumbDisplay).toBe("none");
    expect(toolbarMetrics.pageContextDisplay).toBe("grid");
    expect(toolbarMetrics.pageContextBrandKicker).toBe("The Coherence Thesis");
    expect(toolbarMetrics.pageContextBrandKickerOverflow).not.toBe("ellipsis");
    expect(toolbarMetrics.pageContextBrandTitle).toBe(
      `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
    );
    expect(toolbarMetrics.pageContextBrandTitleOverflow).not.toBe("ellipsis");
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
  expect(toolbarMetrics.searchLeft).toBeLessThan(toolbarMetrics.outlineLeft);
  expect(toolbarMetrics.outlineLeft).toBeLessThan(toolbarMetrics.settingsLeft);
  expect(toolbarMetrics.settingsLeft).toBeLessThan(toolbarMetrics.shareLeft);
  expect(toolbarMetrics.shareLeft).toBeLessThan(toolbarMetrics.audioLeft);
  expect(toolbarMetrics.audioLeft).toBeLessThan(toolbarMetrics.progressLeft);
  if (layout.clientWidth <= 860) {
    const toolbarRightGap =
      layout.clientWidth -
      toolbarMetrics.progressLeft -
      toolbarMetrics.progressWidth;
    expect(toolbarRightGap).toBeLessThanOrEqual(layout.headerPaddingRight + 2);
  }
  if (layout.clientWidth <= 540) {
    expect(
      Math.abs(toolbarMetrics.searchWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.shareWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(toolbarMetrics.settingsWidth - toolbarMetrics.outlineWidth),
    ).toBeLessThanOrEqual(1);
    expect(toolbarMetrics.audioWidth).toBeGreaterThan(
      toolbarMetrics.outlineWidth,
    );
    expect(toolbarMetrics.progressWidth).toBeGreaterThan(
      toolbarMetrics.outlineWidth,
    );
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
    expect(toolbarMetrics.outlineIconDisplay).not.toBe("none");
    expect(["", "none"]).toContain(toolbarMetrics.audioChevronDisplay);
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

  const outlineLinkMetrics = await page.evaluate(() => {
    const rectFor = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect
        ? {
            left: rect.left,
            right: rect.right,
            width: rect.width,
          }
        : null;
    };
    return {
      popover: rectFor(".outline-popover"),
      topLink: rectFor(".outline-top-links a"),
      topText: rectFor(".outline-top-links strong"),
      volumeLink: rectFor(".outline-volume-link"),
      volumeText: rectFor(".outline-volume-link strong"),
    };
  });

  expect(outlineLinkMetrics.popover).not.toBeNull();
  expect(outlineLinkMetrics.topLink).not.toBeNull();
  expect(outlineLinkMetrics.topText).not.toBeNull();
  expect(outlineLinkMetrics.volumeLink).not.toBeNull();
  expect(outlineLinkMetrics.volumeText).not.toBeNull();

  if (
    outlineLinkMetrics.popover &&
    outlineLinkMetrics.topLink &&
    outlineLinkMetrics.topText &&
    outlineLinkMetrics.volumeLink &&
    outlineLinkMetrics.volumeText
  ) {
    for (const item of [
      outlineLinkMetrics.topLink,
      outlineLinkMetrics.topText,
      outlineLinkMetrics.volumeLink,
      outlineLinkMetrics.volumeText,
    ]) {
      expect(item.left).toBeGreaterThanOrEqual(
        outlineLinkMetrics.popover.left - 1,
      );
      expect(item.right).toBeLessThanOrEqual(
        outlineLinkMetrics.popover.right + 1,
      );
    }
    expect(outlineLinkMetrics.topLink.width).toBeGreaterThan(
      outlineLinkMetrics.popover.width * 0.7,
    );
    expect(outlineLinkMetrics.volumeLink.width).toBeGreaterThan(
      outlineLinkMetrics.popover.width * 0.7,
    );
    expect(outlineLinkMetrics.topText.width).toBeGreaterThan(120);
    expect(outlineLinkMetrics.volumeText.width).toBeGreaterThan(120);
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
  await expect(
    popover.getByText("Reading history is kept in this browser until you choose to sync."),
  ).toBeVisible();

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
    "Reading history is kept in this browser until you choose to sync.",
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
      recommendationWidth: recommendationBox?.width ?? 0,
      recommendationTextAlign: recommendationStyle?.textAlign ?? "",
      recommendationWhiteSpace: recommendationStyle?.whiteSpace ?? "",
      panelLeft: panel.left,
      panelRight: panel.right,
    };
  });

  expect(progressMenuMetrics.copyFontSize).toBeLessThanOrEqual(18);
  expect(progressMenuMetrics.copyTextAlign).toBe("left");
  expect(progressMenuMetrics.recommendationTextAlign).toBe("left");
  expect(progressMenuMetrics.recommendationWhiteSpace).toBe("normal");
  expect(progressMenuMetrics.recommendationLeft).toBeGreaterThanOrEqual(
    progressMenuMetrics.panelLeft,
  );
  expect(progressMenuMetrics.recommendationRight).toBeLessThanOrEqual(
    progressMenuMetrics.panelRight + 1,
  );
  expect(progressMenuMetrics.recommendationWidth).toBeGreaterThan(220);
});

test("toolbar popovers slide, fade, and resize through content changes", async ({
  page,
}) => {
  await page.goto(wieldingSection.href);

  await page.getByRole("button", { name: "Search manuscripts" }).click();
  const searchMenu = page.getByRole("region", { name: "Manuscript search" });
  const searchPopover = page.locator(".search-popover");
  await expect(searchMenu).toBeVisible();
  await expect(searchPopover).toHaveAttribute("data-menu-state", "open");
  await expect
    .poll(() =>
      searchPopover.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");

  const openMotion = await searchPopover.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      opacity: style.opacity,
      transform: style.transform,
      transitionProperty: style.transitionProperty,
    };
  });
  expect(openMotion.opacity).toBe("1");
  expectSettledTransform(openMotion.transform);
  expect(openMotion.transitionProperty).toContain("height");
  expect(openMotion.transitionProperty).toContain("opacity");
  expect(openMotion.transitionProperty).toContain("transform");

  const emptyHeightTarget = await toolbarMenuHeightTarget(
    page,
    ".search-popover",
  );
  await page
    .getByRole("searchbox", { name: "Search all manuscripts" })
    .fill("the");
  await expect(searchMenu.locator(".search-result").first()).toBeVisible();
  await expect
    .poll(() => toolbarMenuHeightTarget(page, ".search-popover"))
    .toBeGreaterThan(emptyHeightTarget + 20);

  await page.keyboard.press("Escape");
  await expect(searchMenu).toHaveCount(0);
  await expect(searchPopover).toHaveCount(0);
});

test("toolbar popovers scroll within a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 360 });
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

  await page.getByRole("button", { name: "Search manuscripts" }).click();
  const searchMenu = page.getByRole("region", { name: "Manuscript search" });
  await expectToolbarTriggerActive(page, ".search-menu-button");
  await expectRestingControlBorder(page, ".search-field input");
  await page.getByRole("searchbox", { name: "Search all manuscripts" }).fill("the");
  await expect(searchMenu.locator(".search-result").first()).toBeVisible();
  await expectMenuFitsViewport(page, ".search-popover", ".search-results");
  await page.keyboard.press("Escape");
  await expect(searchMenu).toHaveCount(0);

  await page.getByRole("button", { name: /Outline/ }).click();
  const outlineMenu = page.getByRole("region", { name: "Site outline" });
  await expectToolbarTriggerActive(page, ".outline-menu-button");
  await expectRestingControlBorder(page, ".outline-search input");
  await expect(outlineMenu.locator(".outline-volume-link").first()).toBeVisible();
  await expectMenuFitsViewport(page, ".outline-popover", ".outline-scroll");
  await page.keyboard.press("Escape");
  await expect(outlineMenu).toHaveCount(0);

  await page.getByRole("button", { name: "Reader settings" }).click();
  const settingsMenu = page.getByRole("region", { name: "Reader settings" });
  await expectToolbarTriggerActive(page, ".settings-menu-button");
  await expect(settingsMenu.getByText("Reading settings")).toBeVisible();
  await expectRestingControlBorder(page, ".font-select-button");
  await settingsMenu.getByRole("button", { name: "Reader font" }).click();
  const fontOptions = page.locator(".font-select-options");
  await expect(fontOptions).toBeVisible();
  const fontOptionMetrics = await page.evaluate(() => {
    const options = document.querySelector(".font-select-options");
    const settings = document.querySelector(".settings-popover");
    const optionsBox = options?.getBoundingClientRect();
    return {
      bottom: optionsBox?.bottom ?? 0,
      parentTag: options?.parentElement?.tagName ?? "",
      settingsContainsOptions: Boolean(
        options && settings?.contains(options),
      ),
      top: optionsBox?.top ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
  expect(fontOptionMetrics.parentTag).toBe("BODY");
  expect(fontOptionMetrics.settingsContainsOptions).toBe(false);
  expect(fontOptionMetrics.top).toBeGreaterThanOrEqual(-1);
  expect(fontOptionMetrics.bottom).toBeLessThanOrEqual(
    fontOptionMetrics.viewportHeight + 1,
  );
  await settingsMenu.getByRole("button", { name: "Reader font" }).click();
  await expect(fontOptions).toHaveCount(0);
  await expectMenuFitsViewport(page, ".settings-popover");
  await page.keyboard.press("Escape");
  await expect(settingsMenu).toHaveCount(0);

  await page.getByRole("button", { name: "Share and downloads" }).click();
  const shareMenu = page.getByLabel("Share and downloads").filter({
    hasText: "Share",
  });
  await expectToolbarTriggerActive(page, ".share-menu-button");
  await expect(shareMenu).toBeVisible();
  await expectMenuFitsViewport(page, ".share-popover");
  await page.keyboard.press("Escape");
  await expect(shareMenu).toHaveCount(0);

  await page.getByRole("button", { name: /Listen/ }).click();
  await page.mouse.move(12, 12);
  const audioMenu = page.getByLabel("Audiobook controls");
  await expectToolbarTriggerOpenWithoutActiveWash(page, ".audio-menu-button");
  await expect(audioMenu).toBeVisible();
  await expectRestingControlBorder(page, ".voice-field select");
  await expect(audioMenu.getByText("Voice", { exact: true })).toBeVisible();
  await expect(audioMenu.getByText("Speed", { exact: true })).toBeVisible();
  await expect(
    audioMenu.locator("optgroup[label='High quality voices']"),
  ).toHaveCount(1);
  await expect(
    audioMenu.locator("optgroup[label='System voices']"),
  ).toHaveCount(1);
  const voiceSelect = audioMenu.getByRole("combobox", { name: "Voice" });
  const speedSlider = audioMenu.getByRole("slider", { name: "Speed" });
  const resetVoice = audioMenu.getByRole("button", { name: "Reset voice" });
  const resetSpeed = audioMenu.getByRole("button", { name: "Reset speed" });
  await expect(resetVoice).toBeDisabled();
  await expect(resetSpeed).toBeDisabled();
  const highQualityOption = audioMenu.locator("option", {
    hasText: "High Quality 1",
  });
  await expect(highQualityOption).toHaveCount(1);
  await expect(
    audioMenu.locator("option", { hasText: "Automatic system voice" }),
  ).toHaveCount(1);
  await expect(audioMenu.locator("option", { hasText: "Albert" })).toHaveCount(0);
  await expect(audioMenu.getByText("Offline playback")).toBeVisible();
  await voiceSelect.selectOption("");
  await expect(resetVoice).toBeEnabled();
  await expect(resetSpeed).toBeDisabled();
  await speedSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "1.25");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(speedSlider).toHaveValue("1.25");
  await expect(resetSpeed).toBeEnabled();
  await resetVoice.click();
  await expect(voiceSelect).toHaveValue("clip:default");
  await expect(speedSlider).toHaveValue("1.25");
  await expect(resetVoice).toBeDisabled();
  await expect(resetSpeed).toBeEnabled();
  await resetSpeed.click();
  await expect(speedSlider).toHaveValue("1");
  await expect(resetSpeed).toBeDisabled();
  if (await highQualityOption.isEnabled()) {
    await expect(voiceSelect).toHaveValue("clip:default");
    await expect(audioMenu.locator(".audio-offline-item").first()).toBeVisible();
    await expect(audioMenu.locator(".audio-offline-meter").first()).toHaveCount(1);
  } else {
    await expect(highQualityOption).toBeDisabled();
    await expect(audioMenu.getByText("Audio clips pending").first()).toBeVisible();
    await expect(audioMenu.locator(".audio-offline-meter")).toHaveCount(0);
  }
  await expectMenuFitsViewport(page, ".audio-popover");
  await page.getByRole("button", { name: "Pause audiobook" }).click();
  await expect(audioMenu).toBeVisible();
  await expectToolbarTriggerOpenWithoutActiveWash(page, ".audio-menu-button");
  await expect(page.getByRole("button", { name: /Listen/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(audioMenu).toHaveCount(0);

  await page.getByRole("button", { name: /Progress/ }).click();
  const progressMenu = page.getByRole("region", { name: "Reader progress" });
  await expectToolbarTriggerActive(page, ".progress-menu-button");
  await expect(progressMenu).toBeVisible();
  await expect(progressMenu.getByText("Recommended next")).toBeVisible();
  await expectMenuFitsViewport(page, ".progress-popover");
});

test("mobile toolbar popovers open below the toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 810, height: 520 });
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

  await page.getByRole("button", { name: "Search manuscripts" }).click();
  await expect(page.getByRole("region", { name: "Manuscript search" })).toBeVisible();
  await expectMobilePopoverStartsBelowToolbar(page, ".search-popover");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Outline/ }).click();
  await expect(page.getByRole("region", { name: "Site outline" })).toBeVisible();
  await expectMobilePopoverStartsBelowToolbar(page, ".outline-popover");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByRole("region", { name: "Reader settings" })).toBeVisible();
  await expectMobilePopoverStartsBelowToolbar(page, ".settings-popover");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Share and downloads" }).click();
  await expect(
    page.getByLabel("Share and downloads").filter({ hasText: "Share" }),
  ).toBeVisible();
  await expectMobilePopoverStartsBelowToolbar(page, ".share-popover");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Listen/ }).click();
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  await expectMobilePopoverStartsBelowToolbar(page, ".audio-popover");
  await page.getByRole("button", { name: "Pause audiobook" }).click();
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  await expect(page.getByRole("button", { name: /Listen/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Progress/ }).click();
  await expect(page.getByRole("region", { name: "Reader progress" })).toBeVisible();
  await expectMobilePopoverStartsBelowToolbar(page, ".progress-popover");
});

test("toolbar brand owns the active manuscript identity", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const brand = page.locator(".brand-mark");
  if (testInfo.project.name === "mobile") {
    await expect(brand).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
    await expect(
      brand.locator(".brand-title-mobile-logo-initials"),
    ).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-initials")).toHaveText(
      "CT",
    );
    await expect(page.locator(".mobile-page-context")).toHaveCount(0);

    await page.goto("/overview");
    await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
    await expect(
      brand.locator(".brand-title-mobile-logo-initials"),
    ).toBeVisible();
    await expect(page.locator(".mobile-page-brand-kicker")).toHaveText(
      "Providence Collective",
    );
    await expect(page.locator(".mobile-page-brand-title")).toHaveText(
      "The Coherence Thesis",
    );
    await expect(page.locator(".mobile-page-brand")).toHaveAttribute(
      "href",
      "/",
    );
    const overviewBrandOverflow = await page
      .locator(".mobile-page-brand")
      .evaluate((element) => ({
        navLogoColor: window.getComputedStyle(
          document.querySelector(".brand-title-mobile-logo")!,
        ).color,
        brandColor: window.getComputedStyle(element).color,
        kickerColor: window.getComputedStyle(
          element.querySelector(".mobile-page-brand-kicker")!,
        ).color,
        titleColor: window.getComputedStyle(
          element.querySelector(".mobile-page-brand-title")!,
        ).color,
        kicker: window.getComputedStyle(
          element.querySelector(".mobile-page-brand-kicker")!,
        ).textOverflow,
        title: window.getComputedStyle(
          element.querySelector(".mobile-page-brand-title")!,
        ).textOverflow,
      }));
    expect(overviewBrandOverflow.navLogoColor).toBe(
      overviewBrandOverflow.kickerColor,
    );
    expect(overviewBrandOverflow.titleColor).toBe(
      overviewBrandOverflow.brandColor,
    );
    expect(overviewBrandOverflow.titleColor).not.toBe(
      overviewBrandOverflow.kickerColor,
    );
    expect(overviewBrandOverflow.kicker).not.toBe("ellipsis");
    expect(overviewBrandOverflow.title).not.toBe("ellipsis");

    await page.goto(wieldingVolume.href);
    await expect(brand).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
    await expect(
      brand.locator(".brand-title-mobile-logo-initials"),
    ).toBeVisible();
    await expect(page.locator(".mobile-page-brand-title")).toHaveText(
      `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
    );
    await expect(page.locator(".site-nav .mobile-home-link")).toHaveCount(0);
    await expect(brand).toHaveClass(/brand-mark-compact/);
    await brand.focus();
    const mobileBrandTooltip = page.locator(".clean-tooltip");
    await expect(mobileBrandTooltip).toBeVisible();
    await page.waitForFunction(() => {
      const tooltip = document.querySelector(".clean-tooltip");
      if (!tooltip) return false;
      const arrow = tooltip.querySelector(".clean-tooltip-arrow");
      const arrowBox = arrow?.getBoundingClientRect();
      return Boolean(arrowBox && arrowBox.width > 0 && arrowBox.height > 0);
    });
    const mobileBrandTooltipAlignment = await page.evaluate(() => {
      const brandBox = document
        .querySelector(".site-header > .brand-mark")
        ?.getBoundingClientRect();
      const tooltip = document.querySelector(".clean-tooltip");
      const arrowBox = tooltip
        ?.querySelector(".clean-tooltip-arrow")
        ?.getBoundingClientRect();

      return {
        brandCenter: brandBox ? brandBox.left + brandBox.width / 2 : 0,
        brandWidth: brandBox?.width ?? 0,
        tooltipArrowX: arrowBox ? arrowBox.left + arrowBox.width / 2 : 0,
      };
    });
    expect(mobileBrandTooltipAlignment.brandWidth).toBeLessThan(56);
    expect(
      Math.abs(
        mobileBrandTooltipAlignment.tooltipArrowX -
          mobileBrandTooltipAlignment.brandCenter,
      ),
    ).toBeLessThanOrEqual(2);
    await brand.evaluate((element) => (element as HTMLElement).blur());
    await expect(mobileBrandTooltip).toHaveCount(0);

    await page.setViewportSize({ width: 500, height: 760 });
    await expect(brand).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
    await expect(
      brand.locator(".brand-title-mobile-logo-initials"),
    ).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-initials")).toHaveText(
      "CT",
    );

    await page.setViewportSize({ width: 390, height: 760 });
    await expect(brand).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
    await expect(
      brand.locator(".brand-title-mobile-logo-initials"),
    ).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-initials")).toHaveText(
      "CT",
    );

    await page.setViewportSize({ width: 320, height: 760 });
    await expect(brand).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
    await expect(
      brand.locator(".brand-title-mobile-logo-initials"),
    ).toBeVisible();
    await expect(brand.locator(".brand-title-mobile-logo-initials")).toHaveText(
      "CT",
    );
    const narrowToolbarMetrics = await page.evaluate(() => {
      const brandBox = document
        .querySelector(".site-header > .brand-mark")
        ?.getBoundingClientRect();
      const progressBox = document
        .querySelector(".progress-menu-button")
        ?.getBoundingClientRect();
      const headerStyle = window.getComputedStyle(
        document.querySelector(".site-header")!,
      );

      return {
        brandWidth: brandBox?.width ?? 0,
        progressRight: progressBox?.right ?? 0,
        viewportWidth: document.documentElement.clientWidth,
        headerPaddingRight: Number.parseFloat(headerStyle.paddingRight),
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(narrowToolbarMetrics.brandWidth).toBeGreaterThan(28);
    expect(narrowToolbarMetrics.brandWidth).toBeLessThan(56);
    expect(narrowToolbarMetrics.scrollWidth).toBeLessThanOrEqual(
      narrowToolbarMetrics.viewportWidth + 1,
    );
    expect(
      narrowToolbarMetrics.viewportWidth - narrowToolbarMetrics.progressRight,
    ).toBeLessThanOrEqual(narrowToolbarMetrics.headerPaddingRight + 2);
    await expect(page.locator(".mobile-page-brand")).toBeHidden();
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
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );

  await page.goto("/overview/");
  const overviewBrandTitleMetrics = await brand.evaluate((element) => {
    const title = element.querySelector(".brand-title")!;
    const titleText = element.querySelector(".brand-title-full")!;

    return {
      brandWidth: element.getBoundingClientRect().width,
      titleWidth: title.getBoundingClientRect().width,
      titleTextWidth: titleText.getBoundingClientRect().width,
    };
  });
  expect(overviewBrandTitleMetrics.titleWidth).toBeLessThanOrEqual(
    overviewBrandTitleMetrics.brandWidth,
  );
  expect(
    Math.abs(
      overviewBrandTitleMetrics.titleWidth -
        overviewBrandTitleMetrics.titleTextWidth,
    ),
  ).toBeLessThanOrEqual(1);

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
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
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
  await narrowBrandStyle.evaluate((element) => (element as Element).remove());

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
  const breadcrumbHoverStyles = await firstBreadcrumbLink.evaluate(
    (element) => ({
      background: window.getComputedStyle(element).backgroundColor,
      border: window.getComputedStyle(element).borderBottomColor,
      color: window.getComputedStyle(element).color,
    }),
  );
  expect(breadcrumbHoverStyles.background).toBe(breadcrumbStyles.background);
  expect(breadcrumbHoverStyles.border).not.toBe(breadcrumbStyles.border);
  expect(breadcrumbHoverStyles.color).toBe(breadcrumbStyles.bodyColor);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(wieldingVolume.href);
  await expect(brand).toBeVisible();
  await expect(brand.locator(".brand-title-mobile-logo-full")).toBeHidden();
  await expect(
    brand.locator(".brand-title-mobile-logo-initials"),
  ).toBeVisible();
  await expect(brand.locator(".brand-title-mobile-logo-initials")).toHaveText(
    "CT",
  );
  await expect(page.locator(".mobile-page-brand-title")).toHaveText(
    `Volume ${wieldingVolume.numberLabel} · ${wieldingVolume.title}`,
  );
});
