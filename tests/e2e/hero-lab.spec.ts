import { expect, test } from "@playwright/test";
import { catalog, formatReadingDurationForWords } from "./fixtures";

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
      name: "There is a field forming around the work civilization forgot to name.",
    }),
  ).toBeVisible();
  await expect(variants.first()).toContainText(
    "There is a field forming around the work civilization forgot to name.",
  );
  const firstVariantStats = page.getByLabel("Variant 01 stats");
  await expect(
    firstVariantStats.getByText(`${catalog.stats.volumeCount.toLocaleString()} volumes`),
  ).toBeVisible();
  await expect(
    firstVariantStats.getByText(
      `${catalog.stats.sectionCount.toLocaleString()} sections`,
    ),
  ).toBeVisible();
  await expect(
    firstVariantStats.getByText(`${catalog.stats.wordCount.toLocaleString()} words`),
  ).toBeVisible();
  await expect(
    firstVariantStats.getByText(
      `${formatReadingDurationForWords(catalog.stats.wordCount)} audio`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText("A field guide for people building what comes after extraction."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Start where civilization becomes a living body again.",
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
