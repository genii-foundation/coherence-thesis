import { expect, test } from "@playwright/test";

test("icon lab controls update the real toolbar progress specimen", async ({
  page,
}) => {
  await page.goto("/progress-icon-lab/");

  const toolbarBadge = page.locator(".site-header .progress-percent");
  await expect(toolbarBadge).toHaveAttribute("data-preview", "true");
  await expect(toolbarBadge).toHaveAttribute("data-connected", "true");
  await expect(toolbarBadge).toHaveAttribute("data-preview-size", "48");
  await expect(toolbarBadge).toHaveAttribute("data-preview-stroke", "1.4");
  await expect(toolbarBadge).toHaveAttribute("data-preview-text-size", "12.5");
  await expect(toolbarBadge).toHaveAttribute(
    "data-preview-cloud-offset",
    "2",
  );
  await expect(
    page.getByRole("button", { name: "Progress preview 62%" }),
  ).toBeVisible();

  await page.getByRole("slider", { name: /Footprint/ }).fill("42");
  await page.getByRole("slider", { name: /Outline/ }).fill("1.5");
  await page.getByRole("slider", { name: /Numeral/ }).fill("11");
  await page.getByRole("slider", { name: /Cloud Y offset/ }).fill("4");
  await page.getByRole("slider", { name: /Progress/ }).fill("54");

  await expect(toolbarBadge).toHaveAttribute("data-preview-size", "42");
  await expect(toolbarBadge).toHaveAttribute("data-preview-stroke", "1.5");
  await expect(toolbarBadge).toHaveAttribute("data-preview-text-size", "11");
  await expect(toolbarBadge).toHaveAttribute(
    "data-preview-cloud-offset",
    "4",
  );
  await expect(
    page.getByRole("button", { name: "Progress preview 54%" }),
  ).toBeVisible();
  await expect(toolbarBadge.locator("svg > g")).toHaveAttribute(
    "transform",
    "translate(0 6.095238095238095)",
  );

  await page.getByRole("button", { name: "Circle" }).click();
  await expect(toolbarBadge).toHaveAttribute("data-connected", "false");
  await page.getByRole("button", { name: "Cloud" }).click();
  await expect(toolbarBadge).toHaveAttribute("data-connected", "true");
});
