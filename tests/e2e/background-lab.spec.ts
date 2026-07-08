import { expect, test } from "@playwright/test";

test("background lab toggles texture variations", async ({ page }) => {
  await page.goto("/background-lab/");

  await expect(
    page.getByRole("heading", {
      name: "Organic texture trials for the reader surface.",
    }),
  ).toBeVisible();

  const variationButtons = page
    .getByLabel("Background variations")
    .getByRole("button");
  await expect(variationButtons).toHaveCount(10);

  const labPage = page.locator(".background-lab-page");
  await expect(labPage).toHaveClass(/background-lab-pulp-bloom/);

  await page.getByRole("button", { name: /Cloud wash/ }).click();
  await expect(labPage).toHaveClass(/background-lab-cloud-wash/);
  await expect(page.getByRole("button", { name: /Cloud wash/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: /Soft terrain/ }).click();
  await expect(labPage).toHaveClass(/background-lab-soft-terrain/);
  await expect(
    page.getByRole("heading", { name: "Common inputs" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
