import { expect, test, type Page } from "@playwright/test";
import {
  catalog,
  volumeWithNeighbors,
  previousVolume,
  nextVolume,
  partNavigationVolume,
  partWithNeighbors,
  previousPart,
  nextPart,
  chapterNavigationContext,
  chapterWithNeighbors,
  previousChapter,
  nextChapter,
  singleSectionChapterTarget,
  singleSectionPart,
  singleSectionChapter,
  centralWoundSection,
  centralWoundPart,
  sectionWithNeighbors,
  previousSection,
  nextSection,
  parentSectionContainer,
} from "./fixtures";

async function measureOpeningDropCap(page: Page, href: string) {
  await page.goto(href);

  return page.locator(".manuscript-prose").first().evaluate((prose) => {
    const paragraphs = Array.from(prose.children).filter(
      (element): element is HTMLParagraphElement =>
        element instanceof HTMLParagraphElement,
    );
    const firstParagraph = paragraphs[0];
    const secondParagraph = paragraphs[1];
    const firstWordText = firstParagraph
      ?.querySelector(".audio-word")
      ?.firstChild;
    const secondWord = secondParagraph?.querySelector(".audio-word");

    if (!firstParagraph || !secondParagraph || !firstWordText || !secondWord) {
      return null;
    }

    const firstLetterRange = document.createRange();
    firstLetterRange.setStart(firstWordText, 0);
    firstLetterRange.setEnd(firstWordText, 1);
    const firstLetterBox = firstLetterRange.getBoundingClientRect();
    const firstParagraphBox = firstParagraph.getBoundingClientRect();
    const secondParagraphBox = secondParagraph.getBoundingClientRect();
    const secondWordBox = secondWord.getBoundingClientRect();
    const firstParagraphStyle = window.getComputedStyle(firstParagraph);
    const firstLetterStyle = window.getComputedStyle(
      firstParagraph,
      "::first-letter",
    );

    return {
      clearance: secondWordBox.top - firstLetterBox.bottom,
      dropCapFloat: firstLetterStyle.float,
      dropCapFontSize: Number.parseFloat(firstLetterStyle.fontSize),
      firstParagraphDisplay: firstParagraphStyle.display,
      firstParagraphHeight: firstParagraphBox.height,
      firstParagraphTextLength: firstParagraph.textContent?.trim().length ?? 0,
      horizontalOverflow:
        document.documentElement.scrollWidth - window.innerWidth,
      lineHeight: Number.parseFloat(firstParagraphStyle.lineHeight),
      paragraphGap: secondParagraphBox.top - firstParagraphBox.bottom,
      paragraphMargin: Number.parseFloat(firstParagraphStyle.marginBottom),
    };
  });
}

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

test("short and long openings keep their drop caps clear", async ({ page }) => {
  const shortOpening = await measureOpeningDropCap(
    page,
    "/manuscripts/1/opening/on-form-timing-and-why-this-book-exists/",
  );
  const longOpening = await measureOpeningDropCap(
    page,
    "/manuscripts/1/opening/orientation/",
  );

  expect(shortOpening).not.toBeNull();
  expect(longOpening).not.toBeNull();

  if (!shortOpening || !longOpening) return;

  for (const opening of [shortOpening, longOpening]) {
    expect(opening.dropCapFloat).toBe("left");
    expect(opening.firstParagraphDisplay).toBe("flow-root");
    expect(opening.firstParagraphHeight).toBeGreaterThanOrEqual(
      opening.dropCapFontSize - 1,
    );
    expect(opening.paragraphGap).toBeGreaterThanOrEqual(
      opening.paragraphMargin - 1,
    );
    expect(opening.clearance).toBeGreaterThanOrEqual(8);
    expect(opening.horizontalOverflow).toBeLessThanOrEqual(1);
  }

  expect(shortOpening.firstParagraphTextLength).toBeLessThan(60);
  expect(longOpening.firstParagraphTextLength).toBeGreaterThan(200);
  expect(longOpening.firstParagraphHeight).toBeGreaterThan(
    shortOpening.firstParagraphHeight + longOpening.lineHeight,
  );
});

test("later chapter sections do not reserve drop cap space", async ({
  page,
}) => {
  await page.goto(
    "/manuscripts/2/the-diagnosis/the-architecture-of-extraction/",
  );

  const laterOpening = page
    .locator("#v02-toward-humane-technology-2")
    .locator(".manuscript-prose > p:first-of-type");
  await expect(laterOpening).toBeVisible();

  const layout = await laterOpening.evaluate((firstParagraph) => {
    const style = window.getComputedStyle(firstParagraph);
    const firstLetterStyle = window.getComputedStyle(
      firstParagraph,
      "::first-letter",
    );
    return {
      firstLetterFloat: firstLetterStyle.float,
      minHeight: style.minHeight,
    };
  });

  expect(layout.firstLetterFloat).toBe("none");
  expect(layout.minHeight).toBe("0px");
});

test("manuscript volume heading uses the colored astrology icon", async ({
  page,
}) => {
  const volume = catalog.volumes[0];
  expect(volume).toBeDefined();

  await page.goto(volume!.href);

  const meta = page.locator(".volume-meta-tags");
  const astrologyIcon = meta.locator("> .astrology-icon");
  await expect(astrologyIcon).toBeVisible();
  await expect(astrologyIcon).toHaveAttribute("aria-label", volume!.planet);
  await expect(astrologyIcon).toHaveClass(/astrology-icon-sun/);
  await expect(astrologyIcon).toHaveText("☉");
  await expect(meta.getByText(volume!.planet, { exact: true })).toHaveCount(0);

  const iconStyle = await astrologyIcon.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      borderColor: styles.borderColor,
      boxShadow: styles.boxShadow,
      color: styles.color,
    };
  });
  expect(iconStyle.borderColor).toContain("rgba");
  expect(iconStyle.boxShadow).not.toBe("none");
  expect(iconStyle.color).toContain("rgb");
});

test("single-section chapter cards open reader content directly", async ({
  page,
}) => {
  await page.goto(singleSectionPart.href);

  const chapterCard = page.locator(".chapter-list").getByRole("link", {
    name: new RegExp(singleSectionChapterTarget.title),
  });
  await expect(chapterCard).toHaveAttribute(
    "href",
    singleSectionChapterTarget.href,
  );
  await Promise.all([
    page.waitForURL(singleSectionChapterTarget.href),
    chapterCard.click(),
  ]);

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

test("multi-section chapters render one anchored reader page", async ({
  page,
}) => {
  const chapterHref =
    "/manuscripts/4/the-governance-architecture/the-amendment-architecture/";
  const sections = catalog.sections.filter(
    (section) => section.chapterHref === chapterHref,
  );

  expect(sections.map((section) => section.sectionId)).toEqual([
    "v04-the-amendment-architecture",
    "v04-the-deeper-inquiry-9",
    "v04-what-remains-open-9",
  ]);

  await page.goto(chapterHref);

  await expect(page).toHaveURL(chapterHref);
  await expect(
    page.getByRole("heading", { level: 1, name: "The Amendment Architecture" }),
  ).toBeVisible();
  await expect(page.locator(".section-index")).toHaveCount(0);
  await expect(page.locator(".chapter-reader-section")).toHaveCount(3);
  await expect(
    page.locator("#v04-the-deeper-inquiry-9").getByRole("heading", {
      name: "The Deeper Inquiry",
    }),
  ).toBeVisible();
  await expect(
    page.locator("#v04-what-remains-open-9").getByRole("heading", {
      name: "What Remains Open",
    }),
  ).toBeVisible();

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs.locator(".breadcrumb-label")).toHaveText([
    "The Governance Architecture",
    "The Amendment Architecture",
  ]);

  await page.goto(sections[1]!.href);
  await expect(page).toHaveURL(sections[1]!.readerHref);
  await expect(
    page.locator("#v04-the-deeper-inquiry-9").getByRole("heading", {
      name: "The Deeper Inquiry",
    }),
  ).toBeVisible();
});

test("chapter navigation continues into the first section of the next part", async ({
  page,
}) => {
  await page.goto(
    "/manuscripts/2/the-diagnosis/the-architecture-of-extraction/",
  );

  const nextLink = page
    .getByRole("navigation", { name: "Page navigation" })
    .locator(".section-nav-link-next");
  await expect(nextLink).toHaveAttribute(
    "href",
    "/manuscripts/2/the-response/coherence-as-infrastructure/",
  );
  await expect(nextLink.locator("strong")).toHaveText(
    "Coherence as Infrastructure",
  );

  await Promise.all([
    page.waitForURL(
      "/manuscripts/2/the-response/coherence-as-infrastructure/",
    ),
    nextLink.click(),
  ]);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Coherence as Infrastructure",
    }),
  ).toBeVisible();
});

test("legacy front matter routes redirect to clean canonical routes", async ({
  page,
}) => {
  await page.goto("/manuscripts/humanitys-most-viable-future/front-matter/");
  await expect(page).toHaveURL("/manuscripts/1/opening/");

  await page.goto(
    "/manuscripts/misanthropic-artifice/front-matter/prologue-two-scenes/",
  );
  await expect(page).toHaveURL(
    "/manuscripts/8/contents/prologue-two-scenes/",
  );

  await page.goto(
    "/manuscripts/humanitys-most-viable-future/front-matter/orientation/v01-orientation/",
  );
  await expect(page).toHaveURL(
    "/manuscripts/1/opening/orientation/",
  );
});

test("structural part opener routes redirect to substantive content", async ({
  page,
}) => {
  await page.goto(
    "/manuscripts/wielding-intelligence/v02-wielding-intelligence/",
  );
  await expect(page).toHaveURL(
    "/manuscripts/2/main/builders-of-the-coherent-civilization/",
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Builders of the Coherent Civilization",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).locator(
      ".breadcrumb-label",
    ),
  ).toHaveText([
    "Wielding Intelligence",
    "Builders of the Coherent Civilization",
  ]);

  await page.goto("/manuscripts/3/the-reckoning/start/");
  await expect(page).toHaveURL(
    "/manuscripts/3/the-reckoning/the-central-wound/",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "The Central Wound" }),
  ).toBeVisible();
});

test("synthetic opening part headings do not repeat their title", async ({
  page,
}) => {
  await page.goto("/manuscripts/1/opening/");

  const heading = page.locator(".page-heading");
  await expect(heading.locator(".eyebrow")).toHaveCount(0);
  await expect(heading.getByRole("heading", { level: 1 })).toHaveText("Opening");
  await expect(heading.locator("h1 + p")).toHaveText(
    "5 minutes across 4 chapters.",
  );

  const headingGap = await heading.evaluate((element) => {
    const title = element.querySelector("h1")?.getBoundingClientRect();
    const summary = element.querySelector("h1 + p")?.getBoundingClientRect();
    return title && summary ? summary.top - title.bottom : 0;
  });
  expect(headingGap).toBeGreaterThanOrEqual(14);
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

test("reader footer links adjacent sections and the containing parent", async ({
  page,
}, testInfo) => {
  await page.goto(sectionWithNeighbors.href);

  const footerNav = page.getByRole("navigation", { name: "Page navigation" });
  await expect(footerNav).toBeVisible();

  const previousLink = footerNav.locator(".section-nav-link-previous");
  await expect(previousLink).toHaveAttribute("href", previousSection.href);
  await expect(previousLink.locator("small")).toHaveText("Previous");
  await expect(previousLink.locator("strong")).toHaveText(
    previousSection.title,
  );

  const parentLink = footerNav.locator(".section-nav-link-parent");
  await expect(parentLink).toHaveAttribute("href", parentSectionContainer.href);
  await expect(parentLink.locator("small")).toHaveText("Up");
  await expect(parentLink.locator("strong")).toHaveText(parentSectionContainer.title);
  const parentLinkLayout = await parentLink.evaluate((link) => {
    const icon = link
      .querySelector(".section-nav-icon")
      ?.getBoundingClientRect();
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

  if (testInfo.project.name === "mobile") {
    const mobileFooterLayout = await footerNav.evaluate((nav) => {
      const rows = [
        ["previous", ".section-nav-link-previous"],
        ["next", ".section-nav-link-next"],
        ["parent", ".section-nav-link-parent"],
      ] as const;

      return rows.map(([name, selector]) => {
        const link = nav.querySelector(selector)!;
        const icon = link.querySelector(".section-nav-icon")!;
        const linkBox = link.getBoundingClientRect();
        const iconBox = icon.getBoundingClientRect();
        const linkStyle = window.getComputedStyle(link);

        return {
          name,
          borderTopWidth: linkStyle.borderTopWidth,
          iconLeft: iconBox.left,
          top: linkBox.top,
        };
      });
    });
    expect(mobileFooterLayout.map((row) => row.name)).toEqual([
      "previous",
      "next",
      "parent",
    ]);
    expect(
      [...mobileFooterLayout]
        .sort((a, b) => a.top - b.top)
        .map((row) => row.name),
    ).toEqual(["previous", "next", "parent"]);
    for (const row of mobileFooterLayout) {
      expect(row.borderTopWidth).toBe("0px");
      expect(
        Math.abs(row.iconLeft - mobileFooterLayout[0]!.iconLeft),
      ).toBeLessThanOrEqual(1);
    }
  }

  const footerLinkLayout = await footerNav.evaluate((nav) =>
    [...nav.querySelectorAll(".section-nav-link")].map((link) => {
      const bodyStyle = window.getComputedStyle(document.body);
      const labelElement = link.querySelector("small");
      const titleElement = link.querySelector("strong");
      const label = link.querySelector("small")?.getBoundingClientRect();
      const title = link.querySelector("strong")?.getBoundingClientRect();
      const linkStyle = window.getComputedStyle(link);
      const labelStyle = labelElement
        ? window.getComputedStyle(labelElement)
        : null;
      const titleStyle = titleElement
        ? window.getComputedStyle(titleElement)
        : null;

      return {
        bodyColor: bodyStyle.color,
        labelBottom: label?.bottom ?? 0,
        labelColor: labelStyle?.color ?? "",
        labelDecorationLine: labelStyle?.textDecorationLine ?? "",
        labelDecorationStyle: labelStyle?.textDecorationStyle ?? "",
        labelFontWeight: labelStyle
          ? Number.parseFloat(labelStyle.fontWeight)
          : 0,
        linkColor: linkStyle.color,
        lineHeight: titleStyle ? Number.parseFloat(titleStyle.lineHeight) : 0,
        titleColor: titleStyle?.color ?? "",
        titleFontWeight: titleStyle
          ? Number.parseFloat(titleStyle.fontWeight)
          : 0,
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

test("organizational manuscript pages expose page navigation", async ({
  page,
}) => {
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
    "/manuscripts/3/the-living-reality/the-second-link-perception-makes-new-coordination-possible/",
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
