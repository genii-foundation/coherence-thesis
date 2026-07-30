import { expect, test } from "@playwright/test";

test.describe("local editorial admin", () => {
  test.skip(
    !process.env.PLAYWRIGHT_FAST,
    "Admin tools exist only in the local development server.",
  );

  test("uses site wayfinding and ranks the editorial work", async ({ page }) => {
    await page.goto("/admin/");

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(breadcrumb.getByText("Status", { exact: true })).toBeVisible();

    const adminNav = page.getByRole("navigation", { name: "Admin views" });
    await expect(adminNav.getByRole("link", { name: "Status" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      adminNav.getByRole("link", { name: "Editorial revisions" }),
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
        "Three renamed subsections, two of which announce what the passage beneath them withholds.",
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

    const bench = page.frameLocator(
      'iframe[title="Comparison bench for ORIENTATION"]',
    );
    const approvedVariant = bench.getByRole("tab", {
      name: "A1131, approved",
    });

    await expect(approvedVariant).toBeVisible();
    await expect(approvedVariant.locator(".approval-mark")).toBeVisible();
    await expect(
      bench.getByRole("tab", { name: "A113", exact: true }).locator(
        ".approval-mark",
      ),
    ).toHaveCount(0);
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
      navRight:
        document
          .querySelector('nav[aria-label="Admin views"]')
          ?.getBoundingClientRect().right ?? 0,
    }));

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.navRight).toBeLessThanOrEqual(layout.clientWidth);
  });
});
