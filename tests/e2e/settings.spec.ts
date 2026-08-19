import { expect, test } from "@playwright/test";
import { readerPreferencesStorageKey, firstSection } from "./fixtures";

test("maximum reader text size keeps every phone toolbar control clear", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, preferences }) => {
      window.localStorage.setItem(key, JSON.stringify(preferences));
    },
    {
      key: readerPreferencesStorageKey,
      preferences: {
        animations: "balanced",
        focus: "none",
        fontFamily: "literata",
        fontSize: 125,
        highlights: "on",
        schemaVersion: 2,
        theme: "textured",
      },
    },
  );

  for (const width of [393, 320]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto(firstSection.href);

    const metrics = await page.evaluate(() => {
      const brand = document
        .querySelector(".site-header > .brand-mark")
        ?.getBoundingClientRect();
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(".site-nav > * > button"),
        (control) => {
          const box = control.getBoundingClientRect();
          return {
            height: box.height,
            left: box.left,
            right: box.right,
          };
        },
      );

      return {
        brandRight: brand?.right ?? Number.POSITIVE_INFINITY,
        clientWidth: document.documentElement.clientWidth,
        controls,
        rootFontSize: Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        ),
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(metrics.rootFontSize).toBe(20);
    expect(metrics.controls).toHaveLength(7);
    expect(metrics.brandRight).toBeLessThanOrEqual(metrics.controls[0]!.left);
    expect(metrics.controls.at(-1)!.right).toBeLessThanOrEqual(
      metrics.clientWidth,
    );
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    metrics.controls.forEach((control, index) => {
      expect(control.height).toBeGreaterThanOrEqual(44);
      const next = metrics.controls[index + 1];
      if (next) expect(control.right).toBeLessThanOrEqual(next.left);
    });
  }
});

test("reader settings update and persist local appearance preferences", async ({
  page,
}) => {
  await page.goto(firstSection.href);
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, readerPreferencesStorageKey);
  await page.reload();

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
  const resetFontSizeButton = settingsMenu.getByRole("button", {
    name: "Reset font size",
  });
  const resetFontButton = settingsMenu.getByRole("button", {
    exact: true,
    name: "Reset font",
  });
  const resetThemeButton = settingsMenu.getByRole("button", {
    name: "Reset theme",
  });
  const resetFocusButton = settingsMenu.getByRole("button", {
    name: "Reset focus mode",
  });
  await expect(resetFontSizeButton).toBeVisible();
  await expect(resetFontSizeButton).toBeDisabled();
  await expect(resetFontButton).toBeVisible();
  await expect(resetFontButton).toBeDisabled();
  await expect(resetThemeButton).toBeVisible();
  await expect(resetThemeButton).toBeDisabled();
  await expect(resetFocusButton).toBeVisible();
  await expect(resetFocusButton).toBeDisabled();
  const focusResearchButton = settingsMenu.getByRole("button", {
    name: "Focus mode research",
  });
  await expect(focusResearchButton).toBeVisible();
  await focusResearchButton.click();
  const focusResearchPopover = page.getByRole("dialog", {
    name: "Focus mode research",
  });
  await expect(focusResearchPopover).toBeVisible();
  await expect(focusResearchPopover).toContainText(
    "Focus mode may potentially assist with speed reading and comprehension.",
  );
  await expect(focusResearchPopover).toContainText(
    "They do not establish that partial-word emphasis improves reading speed or comprehension.",
  );
  const researchLinks = focusResearchPopover.getByRole("link");
  await expect(researchLinks).toHaveCount(3);
  await expect(researchLinks.nth(0)).toHaveAttribute(
    "href",
    "https://doi.org/10.3389/fpsyg.2012.00085",
  );
  await expect(researchLinks.nth(1)).toHaveAttribute(
    "href",
    "https://doi.org/10.1016/j.visres.2013.03.005",
  );
  await expect(researchLinks.nth(2)).toHaveAttribute(
    "href",
    "https://doi.org/10.3758/BF03194790",
  );
  await focusResearchButton.click();
  await expect(focusResearchPopover).toHaveCount(0);
  await expect(settingsMenu).toBeVisible();
  const balancedAnimations = settingsMenu.getByRole("radio", {
    name: "Balanced",
  });
  const noAnimations = settingsMenu.getByRole("radio", { name: "None" });
  const noAnimationsOption = settingsMenu
    .locator(".settings-radio-option")
    .filter({ hasText: "None" });
  await expect(balancedAnimations).toBeChecked();
  await expect(noAnimations).not.toBeChecked();
  // Scoped to the animations fieldset: the settings panel now has a second
  // radio group for bookmark highlights, so a bare .settings-radio-group is
  // ambiguous.
  const animationControlMetrics = await settingsMenu
    .locator(".settings-radio-section")
    .filter({ hasText: "Animations" })
    .locator(".settings-radio-group")
    .evaluate((group) => {
      const options = Array.from(
        group.querySelectorAll<HTMLElement>(".settings-radio-option"),
      );
      const inputs = Array.from(
        group.querySelectorAll<HTMLInputElement>("input"),
      );
      const groupStyle = getComputedStyle(group);
      const optionRects = options.map((option) =>
        option.getBoundingClientRect(),
      );
      const firstOptionStyle = options[0] ? getComputedStyle(options[0]) : null;
      const checkedOptionIndex = inputs.findIndex((input) => input.checked);
      const checkedOptionStyle =
        checkedOptionIndex >= 0 && options[checkedOptionIndex]
          ? getComputedStyle(options[checkedOptionIndex])
          : null;
      inputs[0]?.focus();
      const focusedInputStyle = inputs[0] ? getComputedStyle(inputs[0]) : null;
      return {
        groupDisplay: groupStyle.display,
        groupColumns: groupStyle.gridTemplateColumns.split(" ").length,
        groupBorderWidth: Number.parseFloat(groupStyle.borderTopWidth),
        groupRadius: Number.parseFloat(groupStyle.borderTopLeftRadius),
        firstOptionRadius: firstOptionStyle
          ? Number.parseFloat(firstOptionStyle.borderTopLeftRadius)
          : 0,
        inputOpacities: inputs.map((input) => getComputedStyle(input).opacity),
        optionValues: inputs.map((input) => input.value),
        focusedInputOutline: focusedInputStyle?.outlineStyle ?? "",
        checkedOptionShadow: checkedOptionStyle?.boxShadow ?? "",
        optionGap:
          optionRects.length >= 2
            ? Math.round(optionRects[1]!.left - optionRects[0]!.right)
            : 0,
      };
    });
  expect(animationControlMetrics.groupDisplay).toBe("grid");
  expect(animationControlMetrics.groupColumns).toBe(2);
  expect(animationControlMetrics.groupBorderWidth).toBeGreaterThanOrEqual(1);
  expect(animationControlMetrics.groupRadius).toBeGreaterThan(0);
  expect(animationControlMetrics.firstOptionRadius).toBeGreaterThan(0);
  expect(animationControlMetrics.inputOpacities).toEqual(["0", "0"]);
  expect(animationControlMetrics.optionValues).toEqual(["none", "balanced"]);
  expect(animationControlMetrics.focusedInputOutline).toBe("none");
  expect(animationControlMetrics.checkedOptionShadow).not.toBe("none");
  expect(animationControlMetrics.optionGap).toBe(0);
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
      rootAnimations: document.documentElement.dataset.readerAnimations ?? "",
      rootFocus: document.documentElement.dataset.readerFocus ?? "",
    };
  });
  expect(initialAppearance.rootAnimations).toBe("balanced");
  expect(initialAppearance.rootFocus).toBe("none");

  const focusSlider = page.getByRole("slider", { name: "Focus mode" });
  await expect(focusSlider).toHaveValue("0");
  await expect(focusSlider).toHaveAttribute("aria-valuetext", "None");
  await focusSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "3");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-focus",
    "strong",
  );
  await expect(focusSlider).toHaveAttribute("aria-valuetext", "Strong");
  await expect(resetFocusButton).toBeEnabled();
  const activeFocusMetrics = await firstParagraph
    .locator(".focus-word")
    .first()
    .evaluate((word) => {
      const emphasized = word.querySelector<HTMLElement>(
        ".focus-emphasis-light",
      );
      return {
        focusFontWeight: emphasized
          ? Number.parseInt(getComputedStyle(emphasized).fontWeight, 10)
          : 0,
        emphasizedText: emphasized?.textContent ?? "",
        renderedWord: word.textContent,
      };
    });
  expect(activeFocusMetrics.focusFontWeight).toBe(650);
  expect(activeFocusMetrics.emphasizedText.length).toBeGreaterThan(0);
  expect(activeFocusMetrics.renderedWord).toContain(
    activeFocusMetrics.emphasizedText,
  );
  await resetFocusButton.click();
  await expect(focusSlider).toHaveValue("0");
  await expect(resetFocusButton).toBeDisabled();
  await focusSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "3");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
  await expect(resetFontSizeButton).toBeEnabled();
  await expect(settingsMenu.getByText("125% text")).toHaveCount(0);
  await resetFontSizeButton.click();
  await expect(fontSizeSlider).toHaveValue("100");
  await expect(resetFontSizeButton).toBeDisabled();
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
  const fontOptions = page.locator(".font-select-options");
  await expect(fontOptions).toBeVisible();
  const fontOptionsMetrics = await page.evaluate(() => {
    const options = document.querySelector(".font-select-options");
    const settings = document.querySelector(".settings-popover");
    const rect = (element: Element | null) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        top: box.top,
      };
    };
    const optionsBox = rect(options);
    const settingsBox = rect(settings);
    return {
      optionsBox,
      parentTag: options?.parentElement?.tagName ?? "",
      settingsBox,
      settingsContainsOptions: Boolean(options && settings?.contains(options)),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(fontOptionsMetrics.parentTag).toBe("BODY");
  expect(fontOptionsMetrics.settingsContainsOptions).toBe(false);
  expect(fontOptionsMetrics.optionsBox).not.toBeNull();
  expect(fontOptionsMetrics.settingsBox).not.toBeNull();
  if (fontOptionsMetrics.optionsBox) {
    expect(fontOptionsMetrics.optionsBox.top).toBeGreaterThanOrEqual(0);
    expect(fontOptionsMetrics.optionsBox.left).toBeGreaterThanOrEqual(0);
    expect(fontOptionsMetrics.optionsBox.right).toBeLessThanOrEqual(
      fontOptionsMetrics.viewportWidth,
    );
    expect(fontOptionsMetrics.optionsBox.bottom).toBeLessThanOrEqual(
      fontOptionsMetrics.viewportHeight,
    );
  }
  const newsreaderOption = page.getByRole("button", {
    name: "Newsreader",
    exact: true,
  });
  await expect(newsreaderOption).toBeVisible();
  const newsreaderOptionFont = await newsreaderOption.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  expect(newsreaderOptionFont).toContain("Newsreader");
  await newsreaderOption.click();
  await expect(fontSelect).toContainText("Newsreader");
  await expect(resetFontButton).toBeEnabled();
  await expect(settingsMenu.getByText("Saved in this browser")).toHaveCount(0);

  const initialBodyBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  await settingsMenu.getByRole("button", { name: "Dark" }).click();
  await expect(resetThemeButton).toBeEnabled();

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
  await noAnimationsOption.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-animations",
    "none",
  );
  const disabledMotion = await page.evaluate(() => {
    const button = document.querySelector(".settings-menu-button");
    const buttonStyle = button ? getComputedStyle(button) : null;
    return {
      transitionDuration: buttonStyle?.transitionDuration ?? "",
      animationName: buttonStyle?.animationName ?? "",
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });
  expect(
    disabledMotion.transitionDuration
      .split(",")
      .every((duration) => duration.trim() === "0s"),
  ).toBe(true);
  expect(disabledMotion.animationName).toBe("none");
  expect(disabledMotion.scrollBehavior).toBe("auto");

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
      rootAnimations: document.documentElement.dataset.readerAnimations ?? "",
      rootFocus: document.documentElement.dataset.readerFocus ?? "",
      stored,
    };
  });

  expect(changedAppearance.fontSize).toBeGreaterThan(
    initialAppearance.fontSize,
  );
  expect(changedAppearance.toolbarFontSize).toBeGreaterThan(
    initialAppearance.toolbarFontSize,
  );
  expect(changedAppearance.fontFamily).toContain("Newsreader");
  expect(changedAppearance.headingFontFamily).toContain("Newsreader");
  expect(changedAppearance.toolbarFontFamily).toContain("Newsreader");
  expect(changedAppearance.rootTheme).toBe("black");
  expect(changedAppearance.rootAnimations).toBe("none");
  expect(changedAppearance.rootFocus).toBe("strong");
  expect(changedAppearance.bodyBackground).toBe("rgb(0, 0, 0)");
  expect(changedAppearance.headerBackground).toBe("rgb(0, 0, 0)");
  expect(changedAppearance.bodyBackground).not.toBe(initialBodyBackground);
  expect(changedAppearance.stored).not.toBeNull();
  expect(JSON.parse(changedAppearance.stored ?? "{}")).toEqual({
    fontSize: 125,
    fontFamily: "newsreader",
    theme: "black",
    animations: "none",
    highlights: "on",
    schemaVersion: 2,
    focus: "strong",
  });

  await page.keyboard.press("Escape");
  await expect(settingsMenu).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Page navigation" })
    .locator(".section-nav-link-next")
    .click();
  await expect(page).toHaveURL(/the-work-behind-the-book/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-theme",
    "black",
  );

  await page.getByRole("button", { name: "Reader settings" }).click();
  await expect(page.getByRole("slider", { name: "Font size" })).toHaveValue(
    "125",
  );
  await expect(page.getByRole("button", { name: "Reader font" })).toContainText(
    "Newsreader",
  );
  await expect(page.getByRole("radio", { name: "None" })).toBeChecked();
  await expect(page.getByRole("slider", { name: "Focus mode" })).toHaveValue(
    "3",
  );

  const storedAfterReload = await page.evaluate((key) => {
    const paragraph = document.querySelector(".manuscript-prose p");
    return {
      fontFamily: paragraph ? getComputedStyle(paragraph).fontFamily : "",
      stored: window.localStorage.getItem(key),
    };
  }, readerPreferencesStorageKey);

  expect(storedAfterReload.fontFamily).toContain("Newsreader");
  expect(JSON.parse(storedAfterReload.stored ?? "{}")).toEqual({
    fontSize: 125,
    fontFamily: "newsreader",
    theme: "black",
    animations: "none",
    highlights: "on",
    schemaVersion: 2,
    focus: "strong",
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-theme",
    "black",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-animations",
    "none",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-reader-focus",
    "strong",
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
  expect(homeAppearance.brandFontFamily).toContain("Newsreader");
  expect(homeAppearance.heroFontFamily).toContain("Newsreader");
});

test("focus mode research closes before its parent settings menu", async ({
  page,
}) => {
  await page.goto(firstSection.href);
  await page.getByRole("button", { name: "Reader settings" }).click();

  const settingsMenu = page.getByRole("region", { name: "Reader settings" });
  await settingsMenu
    .getByRole("button", { name: "Focus mode research" })
    .click();

  const researchPopover = page.getByRole("dialog", {
    name: "Focus mode research",
  });
  await expect(researchPopover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(researchPopover).toHaveCount(0);
  await expect(settingsMenu).toBeVisible();
});
