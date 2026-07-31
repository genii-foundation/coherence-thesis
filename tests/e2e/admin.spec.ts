import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    decide: active.filter((item) => editorialDebtLane(item) === "decide").length,
    execute: active.filter((item) => editorialDebtLane(item) === "execute")
      .length,
    blocked: active.filter((item) => editorialDebtLane(item) === "blocked")
      .length,
    activeCritical: active.filter((item) => item.severity === "critical").length,
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
    await page.goto("/admin/");

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Admin" })).toBeVisible();

    const siteHeader = page.getByRole("banner");
    const adminNav = siteHeader.getByRole("navigation", {
      name: "Admin views",
    });
    await expect(
      adminNav.getByRole("link", { name: "Status" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      adminNav.getByRole("link", { name: "Editorial revisions" }),
    ).toBeVisible();
    await expect(
      siteHeader.getByLabel("Local repository, read only"),
    ).toBeVisible();

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
        name: "Volume I is fully rendered. 8 author decisions remain.",
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
    const mobileContext = page.getByRole("region", { name: "Page context" });
    await expect(
      mobileContext.getByRole("navigation", { name: "Admin views" }),
    ).toBeVisible();
    await expect(
      mobileContext.getByLabel("Local repository, read only"),
    ).toBeVisible();
    const mobileLayout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(
      mobileLayout.clientWidth,
    );
  });

  test("turns the revision ledger into a bounded editorial workflow", async ({
    page,
  }) => {
    await page.goto("/admin/calibration/");

    const adminNav = page.getByRole("navigation", { name: "Admin views" });
    await expect(
      adminNav.getByRole("link", { name: "Editorial revisions" }),
    ).toHaveAttribute("aria-current", "page");

    await expect(
      page.getByRole("heading", { level: 1, name: "Editorial revisions" }),
    ).toBeVisible();
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
    await expect(
      orientationCard.getByText("8 rulings", { exact: true }),
    ).toBeVisible();
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
    await expect(promptButtons).toHaveCount(4);
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
                text: ["The selected passage remains clear and unchanged."],
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

    // Routing is derived, not stored. A technical ticket routes to the
    // application maintainer, and the boundedness signal must explain itself.
    await expect(page.getByText("Application maintainer")).toBeVisible();
    await expect(page.getByText("$coherence-build-feature")).toBeVisible();
    await expect(
      page.getByText("Not a boundedness candidate", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("its only scope is the corpus", { exact: false }),
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
