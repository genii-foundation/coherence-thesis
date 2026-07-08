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
  await expect(labPage).toHaveClass(/background-lab-vellum-fiber/);

  await page.getByRole("button", { name: /Moss grain/ }).click();
  await expect(labPage).toHaveClass(/background-lab-moss-grain/);
  await expect(page.getByRole("button", { name: /Moss grain/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: /Night vellum/ }).click();
  await expect(labPage).toHaveClass(/background-lab-night-vellum/);
  await expect(
    page.getByRole("heading", { name: "Common inputs" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
