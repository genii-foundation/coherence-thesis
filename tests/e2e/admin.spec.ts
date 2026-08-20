import { expect, test } from "@playwright/test";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  countEditorialDebtByStatus,
  editorialDebtLane,
  parseEditorialDebtItem,
} from "../../src/lib/editorial-debt";

// The debt page derives every count from the item files at request time. This
// reads the same files through the same parser, so an assertion below fails the
// moment a visible label stops matching the register behind it.
function debtRegisterFixture() {
  const itemsRoot = path.join(
    process.cwd(),
    "editorial",
    "evidence",
    "debt",
    "items",
  );
  const items = readdirSync(itemsRoot)
    .filter((name) => name.endsWith(".md"))
    .map((name) =>
      parseEditorialDebtItem(
        path.join(itemsRoot, name),
        readFileSync(path.join(itemsRoot, name), "utf8"),
      ),
    );
  const active = items.filter((item) => item.status !== "resolved");
  return {
    total: items.length,
    counts: countEditorialDebtByStatus(items),
    decide: active.filter((item) => editorialDebtLane(item) === "decide")
      .length,
    execute: active.filter((item) => editorialDebtLane(item) === "execute")
      .length,
    blocked: active.filter((item) => editorialDebtLane(item) === "blocked")
      .length,
    activeCritical: active.filter((item) => item.severity === "critical")
      .length,
    critical: items.filter((item) => item.severity === "critical").length,
  };
}

test.describe("local editorial admin", () => {
  test.skip(
    !process.env.PLAYWRIGHT_FAST,
    "Admin tools exist only in the local development server.",
  );

  test("uses site wayfinding and ranks the editorial work", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/");

    const siteHeader = page.getByRole("banner");
    const breadcrumb = siteHeader.getByRole("navigation", {
      name: "Breadcrumb",
    });
    await expect(breadcrumb.getByRole("link", { name: "Admin" })).toBeVisible();

    const pageContext = page.getByRole("region", { name: "Page context" });
    await expect(
      pageContext.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeHidden();
    const adminNav = siteHeader.getByRole("navigation", {
      name: "Admin views",
    });
    await expect(
      adminNav.getByRole("link", { name: "Publication Status" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      adminNav.getByRole("link", { name: "Editorial Revisions" }),
    ).toBeVisible();
    await expect(
      adminNav.getByRole("link", { name: "Editorial Guidelines" }),
    ).toBeVisible();
    await expect(
      siteHeader.getByLabel("Local repository, read only"),
    ).toBeVisible();
    await expect(siteHeader.getByRole("button")).toHaveCount(0);

    const desktopAdminHeader = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".site-header");
      const brand = header?.querySelector<HTMLElement>(":scope > .brand-mark");
      const context = header?.querySelector<HTMLElement>(
        ":scope > .admin-toolbar-context",
      );
      const breadcrumb = context?.querySelector<HTMLElement>(
        'nav[aria-label="Breadcrumb"]',
      );
      const repositoryState = context?.querySelector<HTMLElement>(
        '[aria-label="Local repository, read only"]',
      );
      const adminViews = header?.querySelector<HTMLElement>(
        'nav[aria-label="Admin views"]',
      );
      const headerBounds = header?.getBoundingClientRect();
      const brandBounds = brand?.getBoundingClientRect();
      const contextBounds = context?.getBoundingClientRect();
      const breadcrumbBounds = breadcrumb?.getBoundingClientRect();
      const repositoryBounds = repositoryState?.getBoundingClientRect();
      const viewsBounds = adminViews?.getBoundingClientRect();

      return {
        breadcrumbAboveRepository:
          Boolean(breadcrumbBounds && repositoryBounds) &&
          breadcrumbBounds!.top < repositoryBounds!.top,
        contextFollowsBrand:
          Boolean(brandBounds && contextBounds) &&
          contextBounds!.left >= brandBounds!.right,
        contextStaysBesideBrand:
          Boolean(brandBounds && contextBounds) &&
          contextBounds!.left - brandBounds!.right <= 20,
        contextLinesAlign:
          Boolean(breadcrumbBounds && repositoryBounds) &&
          Math.abs(breadcrumbBounds!.left - repositoryBounds!.left) <= 1,
        viewsReachRightEdge:
          Boolean(headerBounds && viewsBounds) &&
          headerBounds!.right - viewsBounds!.right <= 15,
      };
    });
    expect(desktopAdminHeader.breadcrumbAboveRepository).toBe(true);
    expect(desktopAdminHeader.contextFollowsBrand).toBe(true);
    expect(desktopAdminHeader.contextStaysBesideBrand).toBe(true);
    expect(desktopAdminHeader.contextLinesAlign).toBe(true);
    expect(desktopAdminHeader.viewsReachRightEdge).toBe(true);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Volume I",
    );
    await expect(
      page.getByRole("region", { name: "Executive summary" }),
    ).toBeVisible();
    const volumeMetric = page
      .getByRole("region", { name: "Executive summary" })
      .locator("article")
      .filter({ hasText: "Volume I" });
    await expect(volumeMetric.getByText("100%", { exact: true })).toBeVisible();
    await expect(volumeMetric).toContainText(
      "28 of 28 rendered · 27 records settled",
    );
    await expect(volumeMetric.getByText("96%", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(
        "9 originals · 0 published revisions · 0 awaiting publication",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^Volume I is fully rendered\. \d+ author decisions remain\.$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Live repository", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Checked", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Decisions and blockers" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Portfolio progress" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Work queue" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 558, height: 858 });
    await expect(breadcrumb).toBeHidden();
    await expect(
      pageContext.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    await expect(
      pageContext.getByRole("navigation", { name: "Admin views" }),
    ).toBeVisible();
    await expect(
      siteHeader.getByRole("navigation", { name: "Admin views" }),
    ).toBeHidden();
    await expect(
      pageContext.getByLabel("Local repository, read only"),
    ).toBeHidden();
    const mobileLayout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(
      mobileLayout.clientWidth,
    );
  });

  test("shows the living editorial standard and its Git history", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 942, height: 956 });
    await page.goto("/admin/guidelines/");

    const desktopContext = page.getByRole("region", { name: "Page context" });
    const desktopBreadcrumb = page
      .getByRole("banner")
      .getByRole("navigation", { name: "Breadcrumb" });
    await expect(desktopBreadcrumb).toBeVisible();
    await expect(
      desktopBreadcrumb.getByText("Editorial Guidelines", { exact: true }),
    ).toBeVisible();
    await expect(
      desktopContext.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeHidden();
    const desktopNav = page.getByRole("banner").getByRole("navigation", {
      name: "Admin views",
    });
    await expect(
      desktopNav.getByRole("link", { name: "Publication Status" }),
    ).toBeVisible();
    await expect(
      desktopNav.getByRole("link", { name: "Editorial Revisions" }),
    ).toBeVisible();
    await expect(
      desktopNav.getByRole("link", { name: "Editorial Guidelines" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      desktopContext.getByRole("navigation", { name: "Admin views" }),
    ).toBeHidden();
    await expect(page.getByRole("banner").getByRole("button")).toHaveCount(0);

    const constrainedLayout = await page.evaluate(() => {
      const nav = document.querySelector(
        '.site-header nav[aria-label="Admin views"]',
      );
      const links = nav ? [...nav.querySelectorAll("a")] : [];
      const group = nav?.querySelector(".admin-header-view-list");
      const navBounds = nav?.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        allTabsInsideNav:
          Boolean(navBounds) &&
          links.every((link) => {
            const bounds = link.getBoundingClientRect();
            return (
              bounds.left >= navBounds!.left - 1 &&
              bounds.right <= navBounds!.right + 1
            );
          }),
        groupGap: group ? getComputedStyle(group).gap : "",
        groupBorderWidth: group ? getComputedStyle(group).borderTopWidth : "",
      };
    });
    expect(constrainedLayout.scrollWidth).toBeLessThanOrEqual(
      constrainedLayout.clientWidth,
    );
    expect(constrainedLayout.allTabsInsideNav).toBe(true);
    expect(constrainedLayout.groupGap).toBe("0px");
    expect(constrainedLayout.groupBorderWidth).toBe("1px");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Editorial Guidelines",
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Editorial Guidelines" })
        .getByText("editorial/method/standard.md", { exact: true }),
    ).toBeVisible();

    const history = page.getByRole("list", {
      name: "Editorial standard history",
    });
    expect(await history.getByRole("listitem").count()).toBeGreaterThan(0);
    await expect(history).toContainText("R-LEDGER-WINS");
    await expect(history).toContainText(
      "Moved from editorial/standards/editorial.md to editorial/method/standard.md.",
    );

    const standard = page.getByRole("article", {
      name: "Current editorial standard",
    });
    const pageOutline = page.getByRole("complementary", {
      name: "On this page",
    });
    const pageRailLayout = await page.evaluate(() => {
      const outline = document.querySelector<HTMLElement>(
        'aside[aria-label="On this page"]',
      );
      const content = outline?.nextElementSibling as HTMLElement | null;
      const standard = document.querySelector<HTMLElement>(
        'article[aria-label="Current editorial standard"]',
      );
      const history = document.querySelector<HTMLElement>(
        'ol[aria-label="Editorial standard history"]',
      );
      const voiceCards = document.querySelector<HTMLElement>(
        'section[aria-labelledby="voice-cards-title"]',
      );

      return {
        outlineAndContentAreSiblings:
          Boolean(outline && content) &&
          outline!.parentElement === content!.parentElement,
        allContentSharesColumn:
          Boolean(content && standard && history && voiceCards) &&
          content!.contains(standard) &&
          content!.contains(history) &&
          content!.contains(voiceCards),
        outlineIsSticky: outline
          ? getComputedStyle(outline).position === "sticky"
          : false,
      };
    });
    await expect(pageOutline).toBeVisible();
    expect(pageRailLayout.outlineAndContentAreSiblings).toBe(true);
    expect(pageRailLayout.allContentSharesColumn).toBe(true);
    expect(pageRailLayout.outlineIsSticky).toBe(true);
    await expect(
      standard.getByRole("heading", {
        level: 2,
        name: "2. Hierarchy of fidelity",
      }),
    ).toBeVisible();
    await expect(standard).toContainText("R-VOICE-BIND");
    await expect(standard).toContainText("R-LEDGER-WINS");
    const sectionHistoryButtons = standard.getByRole("button", {
      name: /^View Git history for /,
    });
    await expect(sectionHistoryButtons).toHaveCount(12);
    await standard
      .getByRole("button", {
        name: "View Git history for Editorial aim, 1 recorded revision",
      })
      .click();
    const aimHistory = page.getByRole("list", {
      name: "Git history for Editorial aim",
    });
    await expect(aimHistory).toBeVisible();
    await expect(aimHistory).toContainText("Introduced");
    await expect(aimHistory).toContainText("Current");
    const guidelinesBeforeEvolution = await page.evaluate(() => {
      const standard = document.querySelector(
        'article[aria-label="Current editorial standard"]',
      );
      const history = document.querySelector(
        'ol[aria-label="Editorial standard history"]',
      );
      return Boolean(
        standard &&
        history &&
        standard.compareDocumentPosition(history) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(guidelinesBeforeEvolution).toBe(true);

    const voiceCards = page.getByRole("region", { name: "Voice Cards" });
    const voiceCardDisclosures = voiceCards.locator("[data-voice-card-id]");
    await expect(voiceCardDisclosures).toHaveCount(10);
    const voiceCardJumpLinks = page.getByRole("list", {
      name: "Voice card jump links",
    });
    await expect(voiceCardJumpLinks.getByRole("link")).toHaveCount(10);
    await voiceCardJumpLinks
      .getByRole("link", { name: "Volume I", exact: true })
      .click();
    await expect(page).toHaveURL(/#voice-card-volume-01$/);
    await expect(
      voiceCards.locator('[data-voice-card-id="volume-01"]'),
    ).toHaveAttribute("open", "");
    await voiceCards
      .locator('[data-voice-card-id="volume-01"] > summary')
      .click();
    const voiceCardFilters = voiceCards.getByRole("group", {
      name: "Voice card status",
    });
    await expect(
      voiceCardFilters.getByRole("radio", { name: "All 10" }),
    ).toBeChecked();
    await voiceCardFilters.getByText("Pending", { exact: true }).click();
    await expect(
      voiceCardFilters.getByRole("radio", { name: "Pending 0" }),
    ).toBeChecked();
    await expect(
      voiceCards.locator("[data-voice-card-id]:visible"),
    ).toHaveCount(0);
    await voiceCardFilters.getByText("All", { exact: true }).click();
    const corpusVoiceCard = voiceCards.locator('[data-voice-card-id="corpus"]');
    await expect(corpusVoiceCard).toHaveAttribute("open", "");
    await expect(corpusVoiceCard).toContainText(
      "Invite scrutiny, questions, practice, or participation.",
    );
    await expect(corpusVoiceCard).toContainText(
      "editorial/sources/corpus/voice-card.md",
    );
    const volumeOneVoiceCard = voiceCards.locator(
      '[data-voice-card-id="volume-01"]',
    );
    await expect(volumeOneVoiceCard).not.toHaveAttribute("open", "");
    await volumeOneVoiceCard.locator(":scope > summary").click();
    await expect(volumeOneVoiceCard).toHaveAttribute("open", "");
    await expect(volumeOneVoiceCard).toContainText("Invitational and candid.");
    const effectiveVoice = volumeOneVoiceCard.getByRole("region", {
      name: "Effective voice for Volume I",
    });
    await expect(effectiveVoice).toContainText(
      "Corpus floor + Volume I overlay",
    );
    await expect(effectiveVoice).toContainText(
      "It moves more slowly than the later volumes",
    );
    const voiceHistory = volumeOneVoiceCard.locator(
      '[class*="voiceCardHistory"]',
    );
    await voiceHistory.locator(":scope > summary").click();
    const voiceHistoryList = volumeOneVoiceCard.getByRole("list", {
      name: "Git history for Volume I voice card",
    });
    await expect(voiceHistoryList).toBeVisible();
    expect(
      await voiceHistoryList.getByRole("listitem").count(),
    ).toBeGreaterThan(0);
    await volumeOneVoiceCard
      .getByRole("link", { name: "Link to Volume I voice card" })
      .click();
    await expect(page).toHaveURL(/#voice-card-volume-01$/);
    await volumeOneVoiceCard.locator(":scope > summary").click();

    const voiceCardsFollowEvolution = await page.evaluate(() => {
      const history = document.querySelector(
        'ol[aria-label="Editorial standard history"]',
      );
      const voiceCards = document.querySelector(
        'section[aria-labelledby="voice-cards-title"]',
      );
      return Boolean(
        history &&
        voiceCards &&
        history.compareDocumentPosition(voiceCards) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(voiceCardsFollowEvolution).toBe(true);

    await page.setViewportSize({ width: 320, height: 844 });
    const mobileContext = page.getByRole("region", { name: "Page context" });
    await expect(desktopBreadcrumb).toBeHidden();
    await expect(
      mobileContext.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    const mobileNav = mobileContext.getByRole("navigation", {
      name: "Admin views",
    });
    const currentTab = mobileNav.getByRole("link", {
      name: "Editorial Guidelines",
    });
    await expect(currentTab).toBeVisible();
    await expect(currentTab).toHaveAttribute("aria-current", "page");
    await expect(currentTab).toBeInViewport();

    const mobileLayout = await page.evaluate(() => {
      const nav = document.querySelector(
        '.mobile-page-context nav[aria-label="Admin views"]',
      );
      const current = nav?.querySelector('[aria-current="page"]');
      const links = nav ? [...nav.querySelectorAll("a")] : [];
      const navBounds = nav?.getBoundingClientRect();
      const currentBounds = current?.getBoundingClientRect();
      const firstBounds = links[0]?.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        navOverflowX: nav ? getComputedStyle(nav).overflowX : "",
        navCanScroll: Boolean(nav) && nav!.scrollWidth > nav!.clientWidth,
        currentInsideNav:
          Boolean(navBounds && currentBounds) &&
          currentBounds!.left >= navBounds!.left - 1 &&
          currentBounds!.right <= navBounds!.right + 1,
        navRunsEdgeToEdge:
          Boolean(navBounds) &&
          navBounds!.left <= 1 &&
          navBounds!.right >= document.documentElement.clientWidth - 1,
        firstTabStartsAtOrBeforePageGutter:
          Boolean(firstBounds) && firstBounds!.left <= 21,
      };
    });
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(
      mobileLayout.clientWidth,
    );
    expect(mobileLayout.navOverflowX).toBe("auto");
    expect(mobileLayout.navCanScroll).toBe(true);
    expect(mobileLayout.currentInsideNav).toBe(true);
    expect(mobileLayout.navRunsEdgeToEdge).toBe(true);
    expect(mobileLayout.firstTabStartsAtOrBeforePageGutter).toBe(true);
  });

  test("uses theme tokens for every major admin surface", async ({ page }) => {
    const themes = ["textured", "light", "dark", "black"] as const;
    const setTheme = async (theme: (typeof themes)[number]) => {
      await page.evaluate((nextTheme) => {
        document.documentElement.setAttribute("data-reader-theme", nextTheme);
      }, theme);
    };
    const expectToken = async (
      locator: ReturnType<typeof page.locator>,
      property: "backgroundColor" | "color",
      token: string,
    ) => {
      const colors = await locator.evaluate(
        (node, { property: requestedProperty, token: requestedToken }) => {
          const probe = document.createElement("span");
          probe.style.position = "absolute";
          probe.style.pointerEvents = "none";
          if (requestedProperty === "backgroundColor") {
            probe.style.backgroundColor = `var(${requestedToken})`;
          } else {
            probe.style.color = `var(${requestedToken})`;
          }
          node.append(probe);
          const actual = getComputedStyle(node)[requestedProperty];
          const expected = getComputedStyle(probe)[requestedProperty];
          probe.remove();
          return { actual, expected };
        },
        { property, token },
      );
      expect(colors.actual).toBe(colors.expected);
    };

    for (const theme of themes) {
      await page.goto("/admin/guidelines/");
      await setTheme(theme);
      const standard = page.getByRole("article", {
        name: "Current editorial standard",
      });
      await expectToken(standard, "backgroundColor", "--panel-background");
      await expectToken(
        standard.getByRole("heading", { level: 2 }).first(),
        "color",
        "--ink",
      );
      await expectToken(standard.locator("p").first(), "color", "--ink-soft");
      await expectToken(
        page.locator(".admin-header-view-list").first(),
        "backgroundColor",
        "--card-background",
      );

      const historyButton = standard.getByRole("button", {
        name: /^View Git history for Hierarchy of fidelity, \d+ recorded revisions$/,
      });
      await expect(historyButton).toContainText(/^\d+$/);
      await historyButton.click();
      const history = page.getByRole("list", {
        name: "Git history for Hierarchy of fidelity",
      });
      await expectToken(
        history.locator("xpath=..").first(),
        "backgroundColor",
        "--panel-background",
      );

      await page.goto("/admin/");
      await setTheme(theme);
      await expectToken(
        page.locator('[class*="metricCard"]').nth(1),
        "backgroundColor",
        "--admin-surface",
      );
      await expectToken(
        page.locator('[class*="currentPanel"]'),
        "backgroundColor",
        "--admin-surface-strong",
      );
      await expectToken(
        page.locator('[class*="taskCard"]').first(),
        "backgroundColor",
        "--admin-field",
      );

      await page.goto("/admin/calibration/");
      await setTheme(theme);
      await expectToken(
        page.locator('[class*="revisionMetrics"]'),
        "backgroundColor",
        "--admin-surface",
      );
      await expectToken(
        page.locator('[class*="startSessionPanel"]'),
        "backgroundColor",
        "--admin-surface-strong",
      );
      const workingRevisionCards = page.locator(
        '[class*="workingRevisionGrid"] article',
      );
      if (await workingRevisionCards.count()) {
        await expectToken(
          workingRevisionCards.first(),
          "backgroundColor",
          "--admin-surface",
        );
      } else {
        await expect(
          page.getByRole("heading", { level: 2, name: "Working revisions" }),
        ).toHaveCount(0);
      }
    }
  });

  test("turns the revision ledger into a bounded editorial workflow", async ({
    page,
  }) => {
    await page.goto("/admin/calibration/");

    const adminNav = page.getByRole("navigation", { name: "Admin views" });
    await expect(
      adminNav.getByRole("link", { name: "Editorial Revisions" }),
    ).toHaveAttribute("aria-current", "page");

    await expect(
      page.getByRole("heading", { level: 1, name: "Editorial Revisions" }),
    ).toBeVisible();
    await expect(page.getByText("Editorial decision ledger")).toHaveCount(0);
    await expect(
      page.getByText("Compare variants", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Revision summary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Open questions" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Heading decision 1 of 5. Keep What the Argument Has Established",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Author-governed sessions",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Agent-only records" }),
    ).toBeVisible();

    const orientationCard = page.getByRole("link", {
      name: "Open comparison bench for ORIENTATION",
    });
    await expect(orientationCard).toBeVisible();
    await expect(orientationCard).toHaveAttribute(
      "href",
      "/admin/bench/v01-orientation/",
    );
    await expect(orientationCard.getByText(/^\d+ rulings?$/)).toBeVisible();
    await expect(
      orientationCard.getByText(
        "Which of the first three variants is closest?",
      ),
    ).toHaveCount(0);
    const cardInset = await orientationCard.evaluate((link) => {
      const card = link.closest("article");
      if (!card) return null;
      const linkBox = link.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      return {
        top: linkBox.top - cardBox.top,
        right: cardBox.right - linkBox.right,
        bottom: cardBox.bottom - linkBox.bottom,
        left: linkBox.left - cardBox.left,
      };
    });
    expect(cardInset).not.toBeNull();
    expect(Math.max(...Object.values(cardInset!))).toBeLessThanOrEqual(2);

    const promptButtons = page.getByRole("button", {
      name: "Copy session prompt",
    });
    expect(await promptButtons.count()).toBeGreaterThan(0);
    await promptButtons.nth(0).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });

  test("marks the approved calibration variant in the lineage tree", async ({
    page,
  }) => {
    await page.goto("/admin/bench/v01-orientation/");

    const bench = page.getByRole("region", {
      name: "Calibration comparison",
    });
    const approvedVariant = bench.getByRole("tab", {
      name: "A1131, approved",
    });

    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(approvedVariant).toBeVisible();
    await expect(approvedVariant.locator(".approval-mark")).toBeVisible();
    await expect(
      bench
        .getByRole("tab", { name: "A113", exact: true })
        .locator(".approval-mark"),
    ).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const split = document.querySelector(".calibration-bench .bench");
      return {
        splitWidth: split?.getBoundingClientRect().width ?? 0,
        viewportWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    expect(layout.splitWidth).toBeGreaterThan(layout.viewportWidth * 0.9);
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);

    const pageHeightBeforeEvidence = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await bench.getByText("Effective voice card", { exact: true }).click();
    await expect(
      bench.getByText("Relationship to the reader:", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
      .toBeGreaterThan(pageHeightBeforeEvidence);

    const pageBounds = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(pageBounds.scrollWidth).toBeLessThanOrEqual(pageBounds.clientWidth);
  });

  test("keeps revision work transient until the editor approves it", async ({
    page,
  }) => {
    const sessionsRoot = path.join(
      process.cwd(),
      "generated",
      "revision-sessions",
    );
    const fixturePath = path.join(
      sessionsRoot,
      "v01-e2e-working-revision.json",
    );
    mkdirSync(sessionsRoot, { recursive: true });

    try {
      await page.goto("/admin/calibration/");
      await expect(
        page.getByRole("link", {
          name: "Open working revision for Working revision fixture",
        }),
      ).toHaveCount(0);
      writeFileSync(
        fixturePath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            sectionId: "v01-e2e-working-revision",
            editorialId: "volume-01",
            currentHeading: "Working revision fixture",
            sourceHref: "/manuscripts/1/opening/orientation/",
            paragraphAnchor: "p-hf0505fc63ec527f1",
            selectedPassage: "The selected passage remains unchanged.",
            baseCheckpointId: "volume-01/original",
            status: "review",
            directions: [
              {
                text: "Make the sequence clearer without changing the claim.",
                createdAt: "2026-07-30T12:01:00.000Z",
              },
            ],
            variants: [
              {
                label: "A",
                title: "Closer sequence",
                text: [
                  "The selected *passage* remains **clear** and unchanged.",
                ],
                reasoning: [
                  "Clarifies the sequence while preserving the claim.",
                ],
                status: "candidate",
              },
              {
                label: "B",
                title: "Explicit transition",
                text: [
                  "The sequence is explicit, and the claim remains unchanged.",
                ],
                reasoning: [
                  "Adds a transition at the cost of more explanation.",
                ],
                status: "candidate",
              },
            ],
            approvedVariant: null,
            durableRecordPath: null,
            createdAt: "2026-07-30T12:00:00.000Z",
            updatedAt: "2026-07-30T12:02:00.000Z",
          },
          null,
          2,
        )}\n`,
      );
      await page.reload();
      await expect(
        page.getByRole("link", {
          name: "Open working revision for Working revision fixture",
        }),
      ).toBeVisible({ timeout: 8_000 });

      await page.goto("/admin/revisions/v01-e2e-working-revision/");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Working revision fixture",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Revision progress" }),
      ).toContainText("Direction");
      await expect(page.getByText("Ready for review")).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: "Original manuscript" }),
      ).toHaveCount(0);
      await expect(page.getByText("Original manuscript")).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "The passage you copied",
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "The passage you copied" })
          .getByText("The selected passage remains unchanged."),
      ).toBeVisible();
      await expect(
        page.getByText("Make the sequence clearer without changing the claim."),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 3, name: "Closer sequence" }),
      ).toBeVisible();
      const accentedVariant = page
        .locator('article[data-variant-status="candidate"]')
        .filter({ hasText: "Closer sequence" });
      await expect(accentedVariant.locator("em")).toHaveText("passage");
      await expect(accentedVariant.locator("strong")).toHaveText("clear");
      const accentColors = await accentedVariant.evaluate((card) => {
        const emphasis = card.querySelector("em");
        const strong = card.querySelector("strong");
        const resolveColor = (value: string) => {
          const probe = document.createElement("span");
          probe.style.color = value;
          card.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        return {
          emphasis: emphasis ? getComputedStyle(emphasis).color : null,
          emphasisToken: resolveColor("var(--emphasis)"),
          strong: strong ? getComputedStyle(strong).color : null,
          strongToken: resolveColor("var(--bronze-deep)"),
        };
      });
      expect(accentColors.emphasis).toBe(accentColors.emphasisToken);
      expect(accentColors.strong).toBe(accentColors.strongToken);
      await expect(
        page.getByText(
          "This is transient working state. It cannot change the manuscript",
          { exact: false },
        ),
      ).toBeVisible();
      await expect(page.getByText("Durable record complete")).toHaveCount(0);

      const revisionLayout = await page.evaluate(() => {
        const original = document.querySelector(
          '[aria-labelledby="revision-source-title"]',
        );
        const workspace = document.querySelector(
          '[class*="revisionWorkspace"]',
        );
        return {
          originalOverflowY: original
            ? getComputedStyle(original).overflowY
            : null,
          workspaceWidth: workspace?.getBoundingClientRect().width ?? 0,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(revisionLayout.originalOverflowY).not.toBe("auto");
      expect(revisionLayout.workspaceWidth).toBeGreaterThan(
        revisionLayout.viewportWidth * 0.9,
      );

      await page.setViewportSize({ width: 390, height: 844 });
      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    } finally {
      rmSync(fixturePath, { force: true });
    }
  });

  test("states debt counts the register actually derives, and filters to them", async ({
    page,
  }) => {
    const register = debtRegisterFixture();
    await page.goto("/admin/debt/");

    // The nav sits in the banner on desktop and in the mobile page context
    // island at narrow widths, so match whichever one is actually showing.
    const adminNav = page.locator('nav[aria-label="Admin views"]:visible');
    await expect(
      adminNav.getByRole("link", { name: "Editorial debt" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByText("Editorial debt", { exact: true }),
    ).toHaveAttribute("aria-current", "page");

    const summary = page.getByRole("region", { name: "Register summary" });
    const metricValue = (label: string, value: number) =>
      summary
        .locator("article")
        .filter({ hasText: label })
        .getByText(String(value), { exact: true });
    await expect(
      metricValue("Critical and active", register.activeCritical),
    ).toBeVisible();
    await expect(metricValue("Need a decision", register.decide)).toBeVisible();
    await expect(metricValue("Ready to work", register.execute)).toBeVisible();
    await expect(metricValue("Blocked", register.blocked)).toBeVisible();

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `${register.decide} of ${register.counts.open + register.counts.query + register.counts.deferred} open obligations`,
    );

    // The health card compares the derived counts with the generated index. The
    // repository gate keeps them equal, so the page must say so.
    await expect(
      page.getByText("index.md matches the item files"),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Derived: ${register.counts.open} open, ${register.counts.query} queries, ${register.counts.deferred} deferred, ${register.counts.resolved} resolved.`,
        { exact: false },
      ),
    ).toBeVisible();

    const rows = page.locator("[data-debt-row]");
    const visibleRows = page.locator("[data-debt-row]:visible");
    await expect(rows).toHaveCount(register.total);
    await expect(
      page.getByText(`${register.total} shown`, { exact: false }),
    ).toBeVisible();

    await page
      .getByRole("group", { name: "Severity" })
      .getByText("critical", { exact: true })
      .click();
    await expect(
      page.getByText(`${register.critical} of ${register.total} shown`),
    ).toBeVisible();
    await expect(visibleRows).toHaveCount(register.critical);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(visibleRows).toHaveCount(register.total);

    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });

  test("renders a debt ticket with its evidence and its routing intact", async ({
    page,
  }) => {
    await page.goto("/admin/debt/ctd-0112/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Version provenance records commits that did not introduce the content",
    );
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(
      breadcrumb.getByRole("link", { name: "Editorial debt" }),
    ).toHaveAttribute("href", "/admin/debt/");
    await expect(
      breadcrumb.getByText("CTD-0112", { exact: true }),
    ).toBeVisible();

    // Routing is derived, not stored. This resolved ticket routes through the
    // explicit debt utility if a verifier reopens it, and the boundedness signal
    // must explain itself.
    await expect(
      page.getByText("Verifier with authority to reopen the ticket"),
    ).toBeVisible();
    await expect(
      page.getByText("$coherence-utility-editorial-debt", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Not a boundedness candidate", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Resolved tickets are closure records, not boundedness candidates.",
        { exact: false },
      ),
    ).toBeVisible();

    // Sections beyond the four the contract requires must survive.
    await expect(
      page.getByRole("heading", { level: 2, name: "Mechanism" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Paydown criteria" }),
    ).toBeVisible();

    // Several tickets carry tables and fenced code as their evidence.
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    await expect(table.getByRole("cell", { name: "324" })).toBeVisible();
    await expect(page.locator("pre code").first()).toContainText("commitSha");

    await expect(
      page.getByRole("link", {
        name: "publishing/continuity/version-provenance.json",
      }),
    ).toHaveAttribute(
      "href",
      "/admin/debt/source/?path=publishing%2Fcontinuity%2Fversion-provenance.json",
    );

    await page.getByRole("button", { name: "Quick triage" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });

  test("keeps the toolbar icons visually consistent and the dashboard in bounds", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/");

    const toolbarColors = await page.evaluate(() => {
      const adminIcon = document.querySelector(".editorial-admin-button svg");
      const searchIcon = document.querySelector(".search-menu-button svg");
      return {
        admin: adminIcon ? getComputedStyle(adminIcon).stroke : "",
        search: searchIcon ? getComputedStyle(searchIcon).stroke : "",
      };
    });

    expect(toolbarColors.admin).toBe(toolbarColors.search);

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      navRight: Math.max(
        0,
        ...[...document.querySelectorAll('nav[aria-label="Admin views"]')]
          .map((nav) => nav.getBoundingClientRect())
          .filter((bounds) => bounds.width > 0)
          .map((bounds) => bounds.right),
      ),
    }));

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.navRight).toBeLessThanOrEqual(layout.clientWidth);
  });
});
