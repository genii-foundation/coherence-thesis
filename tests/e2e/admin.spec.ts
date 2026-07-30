import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

test.describe("local editorial admin", () => {
  test.skip(
    !process.env.PLAYWRIGHT_FAST,
    "Admin tools exist only in the local development server.",
  );

  test("uses site wayfinding and ranks the editorial work", async ({ page }) => {
    await page.goto("/admin/");

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Admin" })).toBeVisible();

    const siteHeader = page.getByRole("banner");
    const adminNav = siteHeader.getByRole("navigation", {
      name: "Admin views",
    });
    await expect(adminNav.getByRole("link", { name: "Status" })).toHaveAttribute(
      "aria-current",
      "page",
    );
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
      orientationCard.getByText("Which of the first three variants is closest?"),
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
      bench.getByRole("tab", { name: "A113", exact: true }).locator(
        ".approval-mark",
      ),
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
    await bench.getByText("Corpus commitments", { exact: true }).click();
    await expect(
      bench.getByText("Relationship to the reader:", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollHeight),
      )
      .toBeGreaterThan(pageHeightBeforeEvidence);

    const pageBounds = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(pageBounds.scrollWidth).toBeLessThanOrEqual(
      pageBounds.clientWidth,
    );
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
              reasoning: ["Clarifies the sequence while preserving the claim."],
              status: "candidate",
            },
            {
              label: "B",
              title: "Explicit transition",
              text: ["The sequence is explicit, and the claim remains unchanged."],
              reasoning: ["Adds a transition at the cost of more explanation."],
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

    try {
      await page.goto("/admin/calibration/");
      await expect(
        page.getByRole("link", {
          name: "Open working revision for Working revision fixture",
        }),
      ).toBeVisible();

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
        page.getByText(
          "Make the sequence clearer without changing the claim.",
        ),
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

  test("keeps the toolbar icons visually consistent and the dashboard in bounds", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/");

    const toolbarColors = await page.evaluate(() => {
      const adminIcon = document.querySelector(
        '.editorial-admin-button svg',
      );
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
