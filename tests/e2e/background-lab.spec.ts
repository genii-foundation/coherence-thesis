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

  const filledPreviewSurfaces = await page.evaluate(() =>
    [
      ".background-lab-hero",
      ".background-lab-current",
      ".background-lab-preview",
      ".background-lab-panel",
      ".background-lab-mini-card",
      ".background-lab-stat",
      ".background-lab-tags span",
      ".background-lab-reader blockquote",
      ".background-lab-option",
    ].flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((element) => {
          const style = window.getComputedStyle(element);

          return (
            style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
            style.backgroundImage !== "none"
          );
        })
        .map((element) => ({
          selector,
          backgroundColor: window.getComputedStyle(element).backgroundColor,
          backgroundImage: window.getComputedStyle(element).backgroundImage,
        })),
    ),
  );
  expect(filledPreviewSurfaces).toEqual([]);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
