import { expect, test } from "@playwright/test";
import { catalog } from "./fixtures";

test("hero lab presents five homepage hero variants", async ({ page }) => {
  await page.goto("/hero-lab/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Five merged hero directions for The Coherence Thesis",
    }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  const variants = page.locator(".hero-lab-variant");
  await expect(variants).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Begin Volume I" })).toHaveCount(
    5,
  );
  await expect(
    page.getByRole("link", { name: "Read the overview" }),
  ).toHaveCount(5);
  await expect(page.locator(".hero-lab-cover-visual img")).toHaveCount(5);
  await expect(
    page.getByRole("heading", {
      name: "Power, but grown inside coherence.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`${catalog.stats.volumeCount.toLocaleString()} volumes`),
  ).toBeVisible();
  await expect(
    page.getByText(`${catalog.stats.sectionCount.toLocaleString()} sections`),
  ).toBeVisible();
  await expect(
    page.getByText("A build manual for the people carrying the future."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "There is a field forming around the work civilization forgot to name.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Begin Volume I" }).first(),
  ).toHaveAttribute("href", catalog.volumes[0]!.href);
  await expect(
    page.getByRole("link", { name: "Read the overview" }).first(),
  ).toHaveAttribute("href", "/overview/");

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
