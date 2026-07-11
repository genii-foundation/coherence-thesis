import { expect, test } from "@playwright/test";
import {
  updatesBranch,
  formatUpdateLineCount,
  updateKindLabels,
  updatesRepositoryUrl,
  type UpdateEntry,
} from "../../src/lib/updates";
import {
  allUpdateDays,
  getUpdatesPageHref,
  getUpdatesPageSlice,
  getUpdatesSummary,
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
const noPullRequestDayIndex = allUpdateDays.findIndex((day) =>
  day.entries.some((entry) => !hasPullRequest(entry)),
);
const noPullRequestEntry =
  allUpdateDays[noPullRequestDayIndex]?.entries.find(
    (entry) => !hasPullRequest(entry),
  ) ?? null;
const noPullRequestPage =
  Math.floor(noPullRequestDayIndex / updatesPageSize) + 1;
const changeLevelTargets = ([1, 5] as const).map((changeLevel) => {
  const dayIndex = allUpdateDays.findIndex((day) =>
    day.entries.some((entry) => entry.changeLevel === changeLevel),
  );
  return {
    changeLevel,
    entry:
      allUpdateDays[dayIndex]?.entries.find(
        (entry) => entry.changeLevel === changeLevel,
      ) ?? null,
    page: Math.floor(dayIndex / updatesPageSize) + 1,
  };
});
const deploymentDayIndex = allUpdateDays.findIndex((day) =>
  day.entries.some((entry) => Boolean(entry.deploymentUrl)),
);
const deploymentEntry =
  allUpdateDays[deploymentDayIndex]?.entries.find((entry) =>
    Boolean(entry.deploymentUrl),
  ) ?? null;
const deploymentPage = Math.floor(deploymentDayIndex / updatesPageSize) + 1;
const noDeploymentDayIndex = allUpdateDays.findIndex((day) =>
  day.entries.some((entry) => !entry.deploymentUrl),
);
const noDeploymentEntry =
  allUpdateDays[noDeploymentDayIndex]?.entries.find(
    (entry) => !entry.deploymentUrl,
  ) ?? null;
const noDeploymentPage = Math.floor(noDeploymentDayIndex / updatesPageSize) + 1;

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
      "Every change to the thesis and its reader interface.",
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
  await expect(updatesHeading.locator(".updates-summary")).toContainText(
    new RegExp(
      updatesSnapshot.commits.length.toLocaleString() +
        " commits across " +
        allUpdateDays.length.toLocaleString() +
        " days, newest first\\.",
    ),
  );
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
  const latestPullRequest = hasPullRequest(latestUpdate)
    ? latestUpdate
    : null;
  const primaryLink = latestEntry.getByRole("link", {
    name: latestPullRequest
      ? "Open PR #" +
        latestPullRequest.pullRequestNumber.toLocaleString() +
        ": " +
        latestUpdate.title +
        " on GitHub"
      : "Open commit " +
        latestUpdate.shortSha +
        ": " +
        latestUpdate.title +
        " on GitHub",
    exact: true,
  });
  await expect(primaryLink).toHaveAttribute(
    "href",
    latestPullRequest?.pullRequestUrl ?? latestUpdate.commitUrl,
  );
  await expect(primaryLink).toHaveAttribute("target", "_blank");
  await expect(primaryLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(latestEntry).toHaveAttribute(
    "data-primary-target",
    latestPullRequest ? "pull-request" : "commit",
  );

  if (latestPullRequest) {
    const commitHashLink = latestEntry.getByRole("link", {
      name: "Open commit " + latestUpdate.shortSha + " on GitHub",
      exact: true,
    });
    await expect(commitHashLink).toHaveAttribute(
      "href",
      latestUpdate.commitUrl,
    );
  } else {
    await expect(latestEntry.locator(".updates-primary-reference")).toContainText(
      latestUpdate.shortSha,
    );
    await expect(latestEntry.locator(".updates-commit-link")).toHaveCount(0);
  }

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

  const changeSummary = latestEntry.locator(".updates-change-summary");
  await expect(changeSummary).toHaveAttribute(
    "data-files-changed",
    latestUpdate.filesChanged.toLocaleString("en-US", { useGrouping: false }),
  );
  await expect(changeSummary).toHaveAttribute(
    "data-lines-changed",
    latestUpdate.linesChanged.toLocaleString("en-US", { useGrouping: false }),
  );
  await expect(changeSummary).toHaveAttribute(
    "data-change-level",
    latestUpdate.changeLevel.toLocaleString(),
  );
  const visibleChangeCounts = changeSummary.locator(".updates-change-counts");
  await expect(visibleChangeCounts).toHaveAttribute("aria-hidden", "true");
  await expect(visibleChangeCounts).toContainText(
    latestUpdate.filesChanged.toLocaleString() +
      " " +
      (latestUpdate.filesChanged === 1 ? "file" : "files"),
  );
  await expect(visibleChangeCounts).toContainText(
    formatUpdateLineCount(latestUpdate.linesChanged) +
      " " +
      (latestUpdate.linesChanged === 1 ? "line" : "lines"),
  );
  const changeMeter = changeSummary.locator(".updates-change-meter");
  await expect(changeMeter).toHaveAttribute("aria-hidden", "true");
  await expect(changeMeter.locator(":scope > span")).toHaveCount(5);
  await expect(
    changeMeter.locator(':scope > span[data-filled="true"]'),
  ).toHaveCount(latestUpdate.changeLevel);
  await expect(changeSummary.locator(".sr-only")).toContainText(
    latestUpdate.filesChanged.toLocaleString() +
      " " +
      (latestUpdate.filesChanged === 1 ? "file" : "files") +
      " changed, " +
      latestUpdate.linesChanged.toLocaleString() +
      " " +
      (latestUpdate.linesChanged === 1 ? "line" : "lines") +
      " changed.",
  );

  const changeSummaryGeometry = await latestEntry.evaluate((entry) => {
    const content = entry
      .querySelector(".updates-card-content")!
      .getBoundingClientRect();
    const main = entry
      .querySelector(".updates-card-main")!
      .getBoundingClientRect();
    const summary = entry
      .querySelector(".updates-change-summary")!
      .getBoundingClientRect();
    const meter = entry
      .querySelector(".updates-change-meter")!
      .getBoundingClientRect();
    const counts = entry
      .querySelector(".updates-change-counts")!
      .getBoundingClientRect();
    const summaryStyle = window.getComputedStyle(
      entry.querySelector(".updates-change-summary")!,
    );
    const countsStyle = window.getComputedStyle(
      entry.querySelector(".updates-change-counts")!,
    );
    return {
      borderLeftWidth: summaryStyle.borderLeftWidth,
      countsLeft: counts.left,
      countsTextAlign: countsStyle.textAlign,
      contentRight: content.right,
      mainBottom: main.bottom,
      mainRight: main.right,
      meterRight: meter.right,
      summaryRight: summary.right,
      summaryTop: summary.top,
    };
  });
  expect(changeSummaryGeometry.borderLeftWidth).toBe("0px");
  expect(changeSummaryGeometry.countsTextAlign).toBe("left");
  expect(changeSummaryGeometry.meterRight).toBeLessThanOrEqual(
    changeSummaryGeometry.countsLeft,
  );
  if ((page.viewportSize()?.width ?? 0) > 720) {
    expect(changeSummaryGeometry.summaryTop).toBeLessThan(
      changeSummaryGeometry.mainBottom,
    );
    expect(changeSummaryGeometry.summaryRight).toBeLessThanOrEqual(
      changeSummaryGeometry.contentRight + 1,
    );
    expect(changeSummaryGeometry.mainRight).toBeLessThanOrEqual(
      changeSummaryGeometry.summaryRight,
    );
  } else {
    expect(changeSummaryGeometry.summaryTop).toBeGreaterThanOrEqual(
      changeSummaryGeometry.mainBottom,
    );
    expect(changeSummaryGeometry.summaryRight).toBeLessThanOrEqual(
      changeSummaryGeometry.contentRight + 1,
    );
  }

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

  const primaryReference = latestEntry.locator(".updates-primary-reference");
  const secondaryCommitReference = latestEntry.locator(".updates-commit-link");
  await expect(primaryReference).toHaveCount(1);
  await expect(secondaryCommitReference).toHaveCount(
    latestPullRequest ? 1 : 0,
  );
  await latestCard.hover();
  await expect
    .poll(() =>
      primaryReference.evaluate((reference) => {
        const style = window.getComputedStyle(reference);
        return style.textDecorationColor === style.color;
      }),
    )
    .toBe(true);
  if (latestPullRequest) {
    await expect
      .poll(() =>
        secondaryCommitReference.evaluate((reference) => {
          const style = window.getComputedStyle(reference);
          return style.textDecorationColor === style.color;
        }),
      )
      .toBe(false);
    await secondaryCommitReference.hover();
    await expect
      .poll(() =>
        secondaryCommitReference.evaluate((reference) => {
          const style = window.getComputedStyle(reference);
          return style.textDecorationColor === style.color;
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        primaryReference.evaluate((reference) => {
          const style = window.getComputedStyle(reference);
          return style.textDecorationColor === style.color;
        }),
      )
      .toBe(false);
  }

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

  const entry = page.locator(
    '[data-update-sha="' + pullRequestEntry!.sha + '"]',
  );
  const metadataOrder = await entry.locator(".updates-entry-meta").evaluate(
    (metadata) =>
      Array.from(metadata.children).map((child) => ({
        isCommit: child.classList.contains("updates-commit-reference"),
        isPullRequest: child.classList.contains("updates-pull-link"),
      })),
  );
  expect(metadataOrder.findIndex((item) => item.isPullRequest)).toBeLessThan(
    metadataOrder.findIndex((item) => item.isCommit),
  );

  const target = await pullRequestLink.boundingBox();
  expect(target).not.toBeNull();
  const expectedHeight = (page.viewportSize()?.width ?? 0) <= 720 ? 31.5 : 23.5;
  expect(target!.height).toBeGreaterThanOrEqual(expectedHeight);
  expect(target!.width).toBeGreaterThanOrEqual(24);

  const commitLink = entry.getByRole("link", {
    name: "Open commit " + pullRequestEntry!.shortSha + " on GitHub",
    exact: true,
  });
  const commitTarget = await commitLink.boundingBox();
  expect(commitTarget).not.toBeNull();
  expect(commitTarget!.height).toBeGreaterThanOrEqual(expectedHeight);
  expect(commitTarget!.width).toBeGreaterThanOrEqual(24);
});

test("cards without a pull request use the commit as their primary target", async ({
  page,
}) => {
  expect(noPullRequestEntry).not.toBeNull();
  await page.goto(getUpdatesPageHref(noPullRequestPage));

  const entry = page.locator(
    '[data-update-sha="' + noPullRequestEntry!.sha + '"]',
  );
  await expect(entry).toHaveAttribute("data-primary-target", "commit");
  const cardLink = entry.getByRole("link", {
    name:
      "Open commit " +
      noPullRequestEntry!.shortSha +
      ": " +
      noPullRequestEntry!.title +
      " on GitHub",
    exact: true,
  });
  await expect(cardLink).toHaveAttribute(
    "href",
    noPullRequestEntry!.commitUrl,
  );
  await expect(entry.locator(".updates-pull-link")).toHaveCount(0);
  await expect(entry.locator(".updates-commit-link")).toHaveCount(0);

  const commitReference = entry.locator(".updates-primary-reference");
  await expect(commitReference).toContainText(noPullRequestEntry!.shortSha);
  await entry.locator("article").hover();
  await expect
    .poll(() =>
      commitReference.evaluate((reference) => {
        const style = window.getComputedStyle(reference);
        return style.textDecorationColor === style.color;
      }),
    )
    .toBe(true);
});

test("change meters make small and very large updates distinguishable", async ({
  page,
}) => {
  for (const target of changeLevelTargets) {
    expect(target.entry).not.toBeNull();
    await page.goto(getUpdatesPageHref(target.page));

    const summary = page.locator(
      '[data-update-sha="' +
        target.entry!.sha +
        '"] .updates-change-summary',
    );
    await expect(summary).toHaveAttribute(
      "data-change-level",
      target.changeLevel.toLocaleString(),
    );
    await expect(
      summary.locator('.updates-change-meter > span[data-filled="true"]'),
    ).toHaveCount(target.changeLevel);
    const visibleCounts = summary.locator(".updates-change-counts");
    await expect(visibleCounts).toContainText(
      formatUpdateLineCount(target.entry!.linesChanged) + " lines",
    );
    if (target.entry!.linesChanged >= 1_000) {
      await expect(visibleCounts).not.toContainText(
        target.entry!.linesChanged.toLocaleString(),
      );
    }
  }
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

test("literary mode filters commits and resets pagination when switching views", async ({
  page,
}) => {
  const literarySummary = getUpdatesSummary("literary");
  const literaryLatestDays = getUpdatesPageSlice(1, "literary");
  const literaryLatestEntries = literaryLatestDays.flatMap(
    (day) => day.entries,
  );

  await page.goto("/updates/");

  for (const paginationName of [
    "Updates pagination",
    "Updates pagination, end",
  ]) {
    const pagination = page.getByRole("navigation", {
      name: paginationName,
      exact: true,
    });
    const modeLink = pagination.getByRole("link", {
      name: "Literary updates",
      exact: true,
    });
    await expect(modeLink).toHaveAttribute("href", "/updates/literary/");
    await expect(pagination.locator(":scope > *").first()).toHaveClass(
      /updates-mode-link/,
    );
  }

  await page.goto("/updates/literary/");

  await expect(page.locator("[data-update-sha]")).toHaveCount(
    literaryLatestEntries.length,
  );
  expect(
    await page.locator("[data-update-sha]").evaluateAll((entries) =>
      entries.map((entry) => entry.getAttribute("data-update-sha")),
    ),
  ).toEqual(literaryLatestEntries.map((entry) => entry.sha));
  expect(literaryLatestEntries.every((entry) => entry.isLiterary)).toBe(true);
  await expect(page.locator(".updates-summary")).toContainText(
    literarySummary.totalCommitCount.toLocaleString() +
      " commits across " +
      literarySummary.totalDayCount.toLocaleString() +
      " days, newest first.",
  );

  for (const paginationName of [
    "Updates pagination",
    "Updates pagination, end",
  ]) {
    const modeLink = page
      .getByRole("navigation", { name: paginationName, exact: true })
      .getByRole("link", { name: "Show All Updates", exact: true });
    await expect(modeLink).toHaveAttribute("href", "/updates/");
  }

  if (getUpdatesTotalPages("literary") > 1) {
    await expect(
      page
        .getByRole("navigation", {
          name: "Updates pagination",
          exact: true,
        })
        .getByRole("link", { name: "2", exact: true }),
    ).toHaveAttribute("href", "/updates/literary/2/");
  }

  if (getUpdatesTotalPages() > 1) {
    await page.goto("/updates/2/");
    await expect(
      page
        .getByRole("navigation", {
          name: "Updates pagination",
          exact: true,
        })
        .getByRole("link", { name: "Literary updates", exact: true }),
    ).toHaveAttribute("href", "/updates/literary/");
  }
});

test("available historical versions appear immediately after commit links", async ({
  page,
}) => {
  expect(deploymentEntry).not.toBeNull();
  expect(noDeploymentEntry).not.toBeNull();

  await page.goto(getUpdatesPageHref(deploymentPage));

  const entry = page.locator(
    '[data-update-sha="' + deploymentEntry!.sha + '"]',
  );
  const versionLink = entry.getByRole("link", {
    name: "View version for " + deploymentEntry!.shortSha + " in a new tab",
    exact: true,
  });
  await expect(versionLink).toHaveAttribute(
    "href",
    deploymentEntry!.deploymentUrl!,
  );
  await expect(versionLink).toHaveAttribute("target", "_blank");
  await expect(versionLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(versionLink).toContainText("View version");
  await expect(versionLink.locator("svg")).toHaveCount(1);

  const metadataOrder = await entry.locator(".updates-entry-meta").evaluate(
    (metadata) =>
      Array.from(metadata.children).map((child) => ({
        isCommit: child.classList.contains("updates-commit-reference"),
        isVersion: child.classList.contains("updates-deployment-link"),
      })),
  );
  expect(metadataOrder.findIndex((item) => item.isCommit)).toBeLessThan(
    metadataOrder.findIndex((item) => item.isVersion),
  );

  await page.goto(getUpdatesPageHref(noDeploymentPage));
  await expect(
    page
      .locator('[data-update-sha="' + noDeploymentEntry!.sha + '"]')
      .locator(".updates-deployment-link"),
  ).toHaveCount(0);
});
