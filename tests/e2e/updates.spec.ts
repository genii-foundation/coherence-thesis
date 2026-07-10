import { expect, test } from "@playwright/test";
import {
  updatesBranch,
  updateKindLabels,
  updatesRepositoryUrl,
  type UpdateEntry,
} from "../../src/lib/updates";
import {
  allUpdateDays,
  getUpdatesPageHref,
  getUpdatesPageSlice,
  getUpdatesTotalPages,
  updatesPageSize,
  updatesSnapshot,
} from "../../src/lib/updates-pagination";

const latestPageDays = getUpdatesPageSlice(1);
const latestUpdate = latestPageDays[0]!.entries[0]!;
const lastPage = getUpdatesTotalPages();
const lastPageDays = getUpdatesPageSlice(lastPage);
const oldestUpdate = lastPageDays.at(-1)!.entries.at(-1)!;
const contrastDayIndex = allUpdateDays.findIndex((day) =>
  day.entries.some(
    (entry) => entry.kind === "fix" || entry.kind === "performance",
  ),
);
const contrastEntry =
  allUpdateDays[contrastDayIndex]?.entries.find(
    (entry) => entry.kind === "fix" || entry.kind === "performance",
  ) ?? null;
const contrastPage = Math.floor(contrastDayIndex / updatesPageSize) + 1;
const hasPullRequest = (
  entry: UpdateEntry,
): entry is UpdateEntry & {
  pullRequestNumber: number;
  pullRequestUrl: string;
} =>
  typeof entry.pullRequestNumber === "number" &&
  typeof entry.pullRequestUrl === "string";
const pullRequestDayIndex = allUpdateDays.findIndex((day) =>
  day.entries.some(hasPullRequest),
);
const pullRequestEntry =
  allUpdateDays[pullRequestDayIndex]?.entries.find(hasPullRequest) ?? null;
const pullRequestPage =
  Math.floor(pullRequestDayIndex / updatesPageSize) + 1;

test("footer links to Updates immediately before GitHub", async ({ page }) => {
  await page.goto("/");

  const footer = page.getByRole("contentinfo", { name: "Site information" });
  const updatesLink = footer.getByRole("link", { name: "Updates" });
  await expect(updatesLink).toHaveAttribute("href", "/updates/");
  await expect(updatesLink).not.toHaveAttribute("target", "_blank");

  const footerLinkLabels = await footer.getByRole("link").evaluateAll((links) =>
    links.map(
      (link) =>
        link.getAttribute("aria-label") ?? link.textContent?.trim() ?? "",
    ),
  );
  expect(footerLinkLabels.slice(-2)).toEqual(["Updates", "Open to Source"]);
});

test("updates page renders the latest history with timeline pagination", async ({
  page,
}) => {
  await page.goto("/updates/");

  const updatesHeading = page.locator(".updates-heading");
  await expect(updatesHeading).toHaveCount(1);
  await expect(
    updatesHeading.getByRole("heading", { level: 1, name: "Updates" }),
  ).toBeVisible();
  await expect(updatesHeading.locator(".eyebrow")).toHaveCount(0);
  await expect(
    updatesHeading.getByText(
      "Every change to the thesis and its reader interface, newest first.",
      { exact: true },
    ),
  ).toBeVisible();
  const historyLink = updatesHeading.getByRole("link", {
    name: "Browse history",
    exact: true,
  });
  await expect(historyLink).toHaveAttribute(
    "href",
    updatesRepositoryUrl + "/commits/" + updatesBranch,
  );
  await expect(historyLink.locator("svg")).toHaveCount(1);
  const newestFirstMentions = await updatesHeading.evaluate(
    (heading) => (heading.textContent?.match(/newest first/g) ?? []).length,
  );
  expect(newestFirstMentions).toBe(1);
  await expect(
    page.getByText(
      new RegExp(
        updatesSnapshot.commits.length.toLocaleString() +
          " commits across " +
          allUpdateDays.length.toLocaleString() +
          " days",
      ),
    ),
  ).toBeVisible();
  await expect(page.locator("[data-update-day]")).toHaveCount(
    latestPageDays.length,
  );
  await expect(page.locator("[data-update-sha]")).toHaveCount(
    latestPageDays.flatMap((day) => day.entries).length,
  );
  await expect(page.locator(".updates-timeline-rail")).toHaveCount(
    latestPageDays.length,
  );
  await expect(page.locator('[data-latest-day="true"]')).toHaveCount(1);

  const latestEntry = page.locator(
    '[data-update-sha="' + latestUpdate.sha + '"]',
  );
  await expect(latestEntry).toContainText("Latest");
  await expect(latestEntry).toContainText(
    updateKindLabels[latestUpdate.kind],
  );
  await expect(latestEntry.getByRole("heading", { level: 3 })).toHaveText(
    latestUpdate.title,
  );
  const commitLink = latestEntry.getByRole("link", {
    name:
      "Open commit " +
      latestUpdate.shortSha +
      ": " +
      latestUpdate.title +
      " on GitHub",
    exact: true,
  });
  await expect(commitLink).toHaveAttribute("href", latestUpdate.commitUrl);
  await expect(commitLink).toHaveAttribute("target", "_blank");
  await expect(commitLink).toHaveAttribute("rel", "noopener noreferrer");

  const cardGeometry = await latestEntry.evaluate((entry) => {
    const article = entry.querySelector("article")!.getBoundingClientRect();
    const link = entry
      .querySelector(".updates-card-link")!
      .getBoundingClientRect();
    const style = window.getComputedStyle(entry.querySelector("article")!);
    return {
      borderRadius: Number.parseFloat(style.borderRadius),
      boxShadow: style.boxShadow,
      heightDelta: Math.abs(article.height - link.height),
      widthDelta: Math.abs(article.width - link.width),
    };
  });
  expect(cardGeometry.borderRadius).toBeGreaterThan(0);
  expect(cardGeometry.boxShadow).not.toBe("none");
  expect(cardGeometry.heightDelta).toBeLessThanOrEqual(2.1);
  expect(cardGeometry.widthDelta).toBeLessThanOrEqual(2.1);

  const latestCard = latestEntry.locator("article");
  const standardCard = page
    .locator(".updates-entry:not(.is-latest) article")
    .first();
  const [latestCardDefault, standardCardDefault] = await Promise.all([
    latestCard.evaluate((card) => {
      const style = window.getComputedStyle(card);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    }),
    standardCard.evaluate((card) => {
      const style = window.getComputedStyle(card);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    }),
  ]);
  expect(latestCardDefault.backgroundColor).toBe(
    standardCardDefault.backgroundColor,
  );
  expect(latestCardDefault.borderColor).toBe(standardCardDefault.borderColor);

  const expectedHoverBorder = await latestCard.evaluate((card) => {
    const probe = document.createElement("span");
    probe.style.border =
      "1px solid color-mix(in srgb, var(--bronze-deep) 62%, var(--line))";
    card.append(probe);
    const borderColor = window.getComputedStyle(probe).borderColor;
    probe.remove();
    return borderColor;
  });
  await latestCard.hover();
  await expect
    .poll(() =>
      latestCard.evaluate((card) => window.getComputedStyle(card).borderColor),
    )
    .toBe(expectedHoverBorder);
  await standardCard.hover();
  await expect
    .poll(() =>
      standardCard.evaluate((card) =>
        window.getComputedStyle(card).borderColor,
      ),
    )
    .toBe(expectedHoverBorder);
  expect(expectedHoverBorder).not.toBe(latestCardDefault.borderColor);

  const topPagination = page.getByRole("navigation", {
    name: "Updates pagination",
    exact: true,
  });
  await expect(
    topPagination.locator('[aria-current="page"]'),
  ).toHaveText("Latest");
  if (lastPage > 1) {
    await expect(
      topPagination.getByRole("link", { name: "2", exact: true }),
    ).toHaveAttribute("href", "/updates/2/");
  }

  const timelineGeometry = await page
    .locator(".updates-timeline-rail")
    .first()
    .evaluate((rail) => {
      const line = window.getComputedStyle(rail, "::before");
      const circle = window.getComputedStyle(rail, "::after");
      return {
        circleBorderRadius: circle.borderRadius,
        circleHeight: Number.parseFloat(circle.height),
        circleWidth: Number.parseFloat(circle.width),
        lineBackground: line.backgroundImage,
        lineWidth: Number.parseFloat(line.width),
      };
    });
  expect(timelineGeometry.lineWidth).toBeGreaterThan(0);
  expect(timelineGeometry.lineBackground).not.toBe("none");
  expect(timelineGeometry.circleBorderRadius).toBe("50%");
  expect(timelineGeometry.circleWidth).toBeGreaterThanOrEqual(10);
  expect(timelineGeometry.circleHeight).toBeGreaterThanOrEqual(10);

  const dayHeadingStyle = await page
    .locator(".updates-day-heading")
    .first()
    .evaluate((heading) => {
      const style = window.getComputedStyle(heading);
      return {
        borderTopWidth: style.borderTopWidth,
        textAlign: style.textAlign,
      };
    });
  expect(dayHeadingStyle.textAlign).toBe(
    (page.viewportSize()?.width ?? 0) > 720 ? "right" : "left",
  );
  expect(dayHeadingStyle.borderTopWidth).toBe("0px");

  const horizontalLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(horizontalLayout.documentWidth).toBeLessThanOrEqual(
    horizontalLayout.viewportWidth + 1,
  );
});

test("fix and performance badges keep readable theme contrast", async ({
  page,
}) => {
  expect(contrastEntry).not.toBeNull();
  await page.goto(getUpdatesPageHref(contrastPage));

  const badge = page.locator(
    '[data-update-sha="' +
      contrastEntry!.sha +
      '"] [data-update-kind="' +
      contrastEntry!.kind +
      '"]',
  );
  await expect(badge).toBeVisible();

  for (const theme of ["default", "light", "dark", "black"]) {
    await page.evaluate((nextTheme) => {
      if (nextTheme === "default") {
        delete document.documentElement.dataset.readerTheme;
      } else {
        document.documentElement.dataset.readerTheme = nextTheme;
      }
    }, theme);
    const colors = await badge.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--ink)";
      document.body.append(probe);
      const ink = window.getComputedStyle(probe).color;
      probe.remove();
      return {
        badge: window.getComputedStyle(element).color,
        ink,
      };
    });
    expect(colors.badge).toBe(colors.ink);
  }
});

test("pull request links keep their visible label and a distinct target", async ({
  page,
}) => {
  expect(pullRequestEntry).not.toBeNull();
  await page.goto(getUpdatesPageHref(pullRequestPage));

  const pullRequestLabel =
    "PR #" + pullRequestEntry!.pullRequestNumber.toLocaleString();
  const pullRequestLink = page
    .locator('[data-update-sha="' + pullRequestEntry!.sha + '"]')
    .getByRole("link", {
      name: "Open " + pullRequestLabel + " on GitHub",
      exact: true,
    });
  await expect(pullRequestLink).toHaveText(pullRequestLabel);
  await expect(pullRequestLink).toHaveAttribute(
    "href",
    pullRequestEntry!.pullRequestUrl,
  );

  const target = await pullRequestLink.boundingBox();
  expect(target).not.toBeNull();
  const expectedHeight = (page.viewportSize()?.width ?? 0) <= 720 ? 31.5 : 23.5;
  expect(target!.height).toBeGreaterThanOrEqual(expectedHeight);
  expect(target!.width).toBeGreaterThanOrEqual(24);
});

test("numbered updates pages preserve the oldest commit", async ({ page }) => {
  await page.goto(getUpdatesPageHref(lastPage));

  await expect(page.locator("[data-update-day]")).toHaveCount(
    lastPageDays.length,
  );
  await expect(page.locator("[data-update-sha]")).toHaveCount(
    lastPageDays.flatMap((day) => day.entries).length,
  );
  await expect(
    page.locator('[data-update-sha="' + oldestUpdate.sha + '"]'),
  ).toContainText(oldestUpdate.title);

  const topPagination = page.getByRole("navigation", {
    name: "Updates pagination",
    exact: true,
  });
  await expect(topPagination.locator('[aria-current="page"]')).toHaveText(
    lastPage.toLocaleString(),
  );
  await expect(
    topPagination.getByRole("link", { name: "Latest", exact: true }),
  ).toHaveAttribute("href", "/updates/");

  const horizontalLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(horizontalLayout.documentWidth).toBeLessThanOrEqual(
    horizontalLayout.viewportWidth + 1,
  );
});
