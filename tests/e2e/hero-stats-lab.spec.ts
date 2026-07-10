import { expect, test } from "@playwright/test";

test("hero stats lab presents three readable treatments with live proof points", async ({
  page,
}) => {
  await page.goto("/hero-stats-lab/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Three treatments for the hero proof points.",
    }),
  ).toBeVisible();

  const options = page.locator(".hero-stats-lab-option");
  await expect(options).toHaveCount(3);

  for (const option of await options.all()) {
    await expect(option.getByRole("link", { name: "Listen" })).toBeVisible();
    await expect(option.getByRole("link", { name: "Read" })).toBeVisible();
    await expect(option.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(option.getByText("Volumes", { exact: true })).toBeVisible();
    await expect(option.getByText("Sections", { exact: true })).toBeVisible();
    await expect(option.getByText("Hours of audio", { exact: true })).toBeVisible();
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
