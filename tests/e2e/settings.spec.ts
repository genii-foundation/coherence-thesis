import { expect, test } from "@playwright/test";
import {
  readerPreferencesStorageKey,
  firstSection,
} from "./fixtures";

test("reader settings update and persist local appearance preferences", async ({
  page,
}) => {
  await page.goto(firstSection.href);

  const settingsButton = page.getByRole("button", { name: "Reader settings" });
  await expect(settingsButton).toBeVisible();
  await expect(settingsButton).toHaveText("");
  await settingsButton.click();

  const settingsMenu = page.getByRole("region", { name: "Reader settings" });
  await expect(settingsMenu).toBeVisible();

  const settingsBox = await settingsMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(settingsBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (settingsBox && viewport) {
    expect(settingsBox.x).toBeGreaterThanOrEqual(-1);
    expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
  }

  const firstParagraph = page.locator(".manuscript-prose p").first();
  await expect(firstParagraph).toBeVisible();
  await expect(
    settingsMenu.getByRole("button", { name: "Reset font size" }),
  ).toBeVisible();
  await expect(
    settingsMenu.getByRole("button", { exact: true, name: "Reset font" }),
  ).toBeVisible();
  await expect(
    settingsMenu.getByRole("button", { name: "Reset theme" }),
  ).toBeVisible();
  const initialAppearance = await page.evaluate(() => {
    const heading = document.querySelector(".manuscript-heading h1");
    const paragraph = document.querySelector(".manuscript-prose p");
    const toolbarButton = document.querySelector(".settings-menu-button");
    return {
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      headingFontFamily: heading ? getComputedStyle(heading).fontFamily : "",
      fontSize: paragraph
        ? Number.parseFloat(getComputedStyle(paragraph).fontSize)
        : 0,
      toolbarFontSize: toolbarButton
        ? Number.parseFloat(getComputedStyle(toolbarButton).fontSize)
        : 0,
      toolbarFontFamily: toolbarButton
        ? getComputedStyle(toolbarButton).fontFamily
        : "",
      rootTheme: document.documentElement.dataset.readerTheme ?? "",
    };
  });

  const fontSizeSlider = page.getByRole("slider", { name: "Font size" });
  await fontSizeSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "125");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(settingsMenu.getByText("125% text")).toHaveCount(0);
  await settingsMenu.getByRole("button", { name: "Reset font size" }).click();
  await expect(fontSizeSlider).toHaveValue("100");
  await fontSizeSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "125");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const fontSelect = settingsMenu.getByRole("button", { name: "Reader font" });
  await fontSelect.click();
  const georgiaOption = settingsMenu.getByRole("button", {
    name: "Georgia",
    exact: true,
  });
  await expect(georgiaOption).toBeVisible();
  const georgiaOptionFont = await georgiaOption.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(georgiaOptionFont).toContain("Georgia");
  await georgiaOption.click();
  await expect(fontSelect).toContainText("Georgia");
  await expect(settingsMenu.getByText("Saved in this browser")).toHaveCount(0);

  const initialBodyBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  await settingsMenu.getByRole("button", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-theme",
    "dark",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#11100e",
  );
  await settingsMenu.getByRole("button", { name: "Black" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-theme",
    "black",
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#000000",
  );

  const changedAppearance = await page.evaluate(() => {
    const heading = document.querySelector(".manuscript-heading h1");
    const paragraph = document.querySelector(".manuscript-prose p");
    const header = document.querySelector(".site-header");
    const toolbarButton = document.querySelector(".settings-menu-button");
    const stored = window.localStorage.getItem(
      "coherence-reader-preferences-v1",
    );
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      headerBackground: header ? getComputedStyle(header).backgroundColor : "",
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      headingFontFamily: heading ? getComputedStyle(heading).fontFamily : "",
      fontSize: paragraph
        ? Number.parseFloat(getComputedStyle(paragraph).fontSize)
        : 0,
      toolbarFontSize: toolbarButton
        ? Number.parseFloat(getComputedStyle(toolbarButton).fontSize)
        : 0,
      toolbarFontFamily: toolbarButton
        ? getComputedStyle(toolbarButton).fontFamily
        : "",
      rootTheme: document.documentElement.dataset.readerTheme ?? "",
      stored,
    };
  });

  expect(changedAppearance.fontSize).toBeGreaterThan(
    initialAppearance.fontSize,
  );
  expect(changedAppearance.toolbarFontSize).toBeGreaterThan(
    initialAppearance.toolbarFontSize,
  );
  expect(changedAppearance.fontFamily).toContain("Georgia");
  expect(changedAppearance.headingFontFamily).toContain("Georgia");
  expect(changedAppearance.toolbarFontFamily).toContain("Georgia");
  expect(changedAppearance.rootTheme).toBe("black");
  expect(changedAppearance.bodyBackground).toBe("rgb(0, 0, 0)");
  expect(changedAppearance.headerBackground).toBe("rgb(0, 0, 0)");
  expect(changedAppearance.bodyBackground).not.toBe(initialBodyBackground);
  expect(changedAppearance.stored).not.toBeNull();
  expect(JSON.parse(changedAppearance.stored ?? "{}")).toEqual({
    fontSize: 125,
    fontFamily: "georgia",
    theme: "black",
  });

  await page.keyboard.press("Escape");
  await expect(settingsMenu).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Page navigation" })
    .locator(".section-nav-link-next")
    .click();
  await expect(page).toHaveURL(/on-form-timing-and-why-this-book-exists/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-theme",
    "black",
  );

  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByRole("slider", { name: "Font size" })).toHaveValue(
    "125",
  );
  await expect(
    page.getByRole("button", { name: "Reader font" }),
  ).toContainText("Georgia");

  const storedAfterReload = await page.evaluate((key) => {
    const paragraph = document.querySelector(".manuscript-prose p");
    return {
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      stored: window.localStorage.getItem(key),
    };
  }, readerPreferencesStorageKey);

  expect(storedAfterReload.fontFamily).toContain("Georgia");
  expect(JSON.parse(storedAfterReload.stored ?? "{}")).toEqual({
    fontSize: 125,
    fontFamily: "georgia",
    theme: "black",
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-theme",
    "black",
  );
  const homeAppearance = await page.evaluate(() => {
    const brandTitle = document.querySelector(".brand-title");
    const heroHeading = document.querySelector(".hero-copy h1");
    return {
      brandFontFamily: brandTitle
        ? getComputedStyle(brandTitle).fontFamily
        : "",
      heroFontFamily: heroHeading
        ? getComputedStyle(heroHeading).fontFamily
        : "",
    };
  });
  expect(homeAppearance.brandFontFamily).toContain("Georgia");
  expect(homeAppearance.heroFontFamily).toContain("Georgia");
});
