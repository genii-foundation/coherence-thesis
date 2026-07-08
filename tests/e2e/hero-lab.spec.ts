import { expect, test } from "@playwright/test";
import { catalog } from "./fixtures";

test("hero lab presents five homepage hero variants", async ({ page }) => {
  await page.goto("/hero-lab/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Five hero directions for The Coherence Thesis",
    }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  const variants = page.locator(".hero-lab-variant");
  await expect(variants).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Read more" })).toHaveCount(5);
  await expect(
    page.getByRole("heading", {
      name: "A living architecture for a civilization worth inheriting.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`${catalog.stats.volumeCount.toLocaleString()} volumes`),
  ).toBeVisible();
  await expect(
    page.getByText(`${catalog.stats.sectionCount.toLocaleString()} sections`),
  ).toBeVisible();
  await expect(
    page.getByText("The future begins below politics."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Read more" }).nth(1),
  ).toHaveAttribute("href", catalog.sections[0]!.href);
  await expect(page.locator(".hero-lab-map-visual a")).toHaveCount(5);
  await expect(page.locator(".hero-lab-library-visual a")).toHaveCount(5);
  await expect(page.locator(".hero-lab-thesis-visual span")).toHaveCount(9);

  const layout = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;
    const overflowingVariant = Array.from(
      document.querySelectorAll<HTMLElement>(".hero-lab-variant"),
    ).find((element) => element.scrollWidth > element.clientWidth + 1);

    return {
      documentWidth,
      viewportWidth,
      overflowingVariantClass: overflowingVariant?.className ?? "",
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.overflowingVariantClass).toBe("");
});
