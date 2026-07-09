import { expect, test } from "@playwright/test";
import {
  buildReaderHeatmapModel,
  progressForHeatmapCell,
} from "../../src/lib/reader-heatmap";
import {
  emptyProgress,
  readerProgressV2StorageKey,
  recordScrollProgress,
  serializeProgress,
} from "../../src/lib/reader-state";
import {
  readerEventsStorageKey,
  firstSection,
  firstSectionVersionDate,
  wieldingSection,
  copyrightYearLabel,
} from "./fixtures";

test("progress menu shows a resettable email sent confirmation", async ({
  page,
}) => {
  let signInEmailRequests = 0;
  await page.route("**/auth/v1/otp**", async (route) => {
    signInEmailRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.goto(wieldingSection.href);
  await page.getByRole("button", { name: /Progress/ }).click();

  if (
    await page
      .getByText("Sync is not configured for this build.")
      .isVisible()
  ) {
    test.skip(true, "Sync is not configured in this test environment.");
  }

  const emailInput = page.getByLabel("Email");
  const signInButton = page.getByRole("button", { name: "Sign in to sync" });
  await emailInput.fill("reader@example.com");
  const initialBackground = await signInButton.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  await signInButton.click();

  const syncModal = page.getByRole("dialog", {
    name: "Sync reading progress?",
  });
  await expect(syncModal).toBeVisible();
  await expect(
    syncModal.getByText(
      "If you continue, reading progress will be synchronized to your Cloud account so this site can remember where you left off and share progress between your devices.",
    ),
  ).toBeVisible();
  expect(signInEmailRequests).toBe(0);

  await syncModal.getByRole("button", { name: "Cancel" }).click();
  await expect(syncModal).toHaveCount(0);
  expect(signInEmailRequests).toBe(0);
  await expect(emailInput).toHaveValue("reader@example.com");

  await signInButton.click();
  await page
    .getByRole("dialog", { name: "Sync reading progress?" })
    .getByRole("button", { name: "Continue" })
    .click();

  const sentButton = page.getByRole("button", {
    name: "Check your email to finish.",
  });
  await expect(sentButton).toBeVisible();
  expect(signInEmailRequests).toBe(1);
  await expect(page.getByLabel("One-time code")).toBeVisible();
  await expect(page.getByText("Check your email to finish.")).toHaveCount(1);
  await expect(signInButton).toHaveCount(0);

  const sentButtonState = await sentButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      background: style.backgroundColor,
      className: element.className,
      height: Math.round(rect.height),
    };
  });

  expect(sentButtonState.className).toContain("reader-sync-sent-button");
  expect(sentButtonState.background).not.toBe(initialBackground);
  expect(sentButtonState.height).toBeGreaterThan(40);

  await sentButton.click();

  await expect(emailInput).toHaveValue("");
  await expect(page.getByLabel("One-time code")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign in to sync" }),
  ).toBeVisible();
});

test("progress button wraps percent in a cloud when signed in", async ({
  page,
}) => {
  let progressWrites = 0;
  let consentWrites = 0;
  let eventWrites = 0;

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "not signed in" }),
    });
  });
  await page.route("**/auth/v1/otp**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.route("**/auth/v1/verify**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "test-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "user-1",
          aud: "authenticated",
          role: "authenticated",
          email: "reader@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/rest/v1/reader_progress**", async (route) => {
    if (route.request().method() !== "GET") {
      progressWrites += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "null" : "{}",
    });
  });
  await page.route("**/rest/v1/reader_sync_consent**", async (route) => {
    if (route.request().method() !== "GET") {
      consentWrites += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "null" : "{}",
    });
  });
  await page.route("**/rest/v1/reader_engagement_events**", async (route) => {
    eventWrites += 1;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        message: "debug event upload failure",
        code: "TEST_EVENT_FAILURE",
      }),
    });
  });

  await page.goto(wieldingSection.href);

  const progressButton = page.locator(".progress-menu-button");
  await expect(progressButton.locator(".progress-percent-cloud")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /Progress/ }).click();

  if (
    await page
      .getByText("Sync is not configured for this build.")
      .isVisible()
  ) {
    test.skip(true, "Sync is not configured in this test environment.");
  }

  await page.getByLabel("Email").fill("reader@example.com");
  await page.getByRole("button", { name: "Sign in to sync" }).click();
  await page
    .getByRole("dialog", { name: "Sync reading progress?" })
    .getByRole("button", { name: "Continue" })
    .click();
  await page.getByLabel("One-time code").fill("12345678");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(progressButton).toHaveClass(/is-signed-in/);
  const syncSection = page.locator(".reader-sync");
  await expect(page.getByText("Reading progress")).toBeVisible();
  await expect(page.getByText("Synced across all your devices.")).toBeVisible();
  await expect(syncSection.getByText("Account:")).toBeVisible();
  await expect(syncSection.getByText("reader@example.com")).toBeVisible();
  await expect(syncSection.getByText("Last synced:")).toBeVisible();
  await expect(syncSection.getByText(/\(just now\)/)).toBeVisible();
  await expect(
    syncSection.getByText("Progress synced. Reading history details will retry."),
  ).toBeVisible();
  await expect(syncSection.getByRole("button")).toHaveCount(2);
  await expect(syncSection.getByRole("button", { name: "Sync now" })).toBeVisible();
  await expect(syncSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Allow sync")).toHaveCount(0);
  await expect(page.getByText("Pause sync")).toHaveCount(0);
  await expect(page.getByText("Resume sync")).toHaveCount(0);
  await expect(page.getByText("Delete synced data")).toHaveCount(0);
  await expect(page.getByText("Delete account")).toHaveCount(0);
  await expect(progressButton.locator(".progress-percent-cloud")).toHaveCount(
    1,
  );
  await expect(progressButton).toHaveAttribute(
    "aria-label",
    /Progress \d+%, signed in/,
  );

  const signedInProgressGeometry = await progressButton.evaluate((element) => {
    const cloud = element.querySelector(".progress-percent-cloud");
    const percent = element.querySelector(".progress-percent");
    const buttonBox = element.getBoundingClientRect();
    const cloudBox = cloud?.getBoundingClientRect();
    const percentBox = percent?.getBoundingClientRect();
    return {
      cloudCenterX: Math.round(
        ((cloudBox?.left ?? 0) + (cloudBox?.right ?? 0)) / 2 - buttonBox.left,
      ),
      cloudWidth: Math.round(cloudBox?.width ?? 0),
      percentCenterX: Math.round(
        ((percentBox?.left ?? 0) + (percentBox?.right ?? 0)) / 2 -
          buttonBox.left,
      ),
    };
  });

  expect(signedInProgressGeometry.cloudWidth).toBeGreaterThan(28);
  expect(
    Math.abs(
      signedInProgressGeometry.cloudCenterX -
        signedInProgressGeometry.percentCenterX,
    ),
  ).toBeLessThanOrEqual(1);
  expect(progressWrites).toBeGreaterThan(0);
  expect(consentWrites).toBeGreaterThan(0);
  expect(eventWrites).toBeGreaterThan(0);
});

test("reader route exposes progress and audio controls", async ({ page }) => {
  await page.addInitScript(() => {
    class TestSpeechSynthesisUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        cancel: () => undefined,
        getVoices: () => [],
        pause: () => undefined,
        removeEventListener: () => undefined,
        speak: () => undefined,
      },
    });
  });
  await page.goto(firstSection.href);

  await expect(
    page.getByRole("heading", { name: firstSection.title }),
  ).toBeVisible();
  await expect(page.getByText("Last Updated:")).toBeVisible();
  await expect(
    page.getByText(`Version ${firstSection.versionHash}`),
  ).toHaveCount(0);
  await expect(
    page.getByText(`Codified ${firstSectionVersionDate}`),
  ).toHaveCount(0);
  const lastUpdatedLink = page.getByRole("link", {
    name: `${firstSectionVersionDate}, open version on GitHub`,
  });
  await expect(lastUpdatedLink).toHaveAttribute(
    "href",
    firstSection.versionUrl,
  );
  await expect(lastUpdatedLink).toHaveAttribute("target", "_blank");
  await expect(lastUpdatedLink).toHaveAttribute("rel", /noopener/);
  const versionIconOpacity = await lastUpdatedLink
    .locator(".section-version-link-icons")
    .evaluate((element) => window.getComputedStyle(element).opacity);
  expect(versionIconOpacity).toBe("0");
  await lastUpdatedLink.hover();
  await expect(
    lastUpdatedLink.locator(".section-version-link-icons"),
  ).toHaveCSS("opacity", "1");
  await expect(
    page.getByText(
      `${firstSection.volumeTitle} / ${firstSection.partTitle} / ${firstSection.chapterTitle}`,
    ),
  ).toHaveCount(0);
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toBeVisible();
  await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
    firstSection.title,
  );
  await expect(breadcrumbs.getByText("Manuscripts")).toHaveCount(0);
  await expect(
    breadcrumbs.getByText("Humanity's Most Viable Future"),
  ).toHaveCount(0);
  const viewport = page.viewportSize();
  if (!viewport || viewport.width > 540) {
    await expect(breadcrumbs.getByText("Home")).toHaveCount(0);
  }
  const readerLayout = await page.evaluate(() => {
    const header = document
      .querySelector(".site-header")
      ?.getBoundingClientRect();
    const frame = document
      .querySelector(".page-frame.reader-layout")
      ?.getBoundingClientRect();
    const reader = document
      .querySelector(".reader-main")
      ?.getBoundingClientRect();
    const pageContext = document
      .querySelector(".mobile-page-context")
      ?.getBoundingClientRect();
    const pageContextStyle = document.querySelector(".mobile-page-context")
      ? window.getComputedStyle(document.querySelector(".mobile-page-context")!)
      : null;
    const frameStyle = frame
      ? window.getComputedStyle(
          document.querySelector(".page-frame.reader-layout")!,
        )
      : null;
    const viewportWidth = document.documentElement.clientWidth;

    return {
      framePaddingLeft: frameStyle
        ? Number.parseFloat(frameStyle.paddingLeft)
        : 0,
      framePaddingRight: frameStyle
        ? Number.parseFloat(frameStyle.paddingRight)
        : 0,
      framePaddingTop: frameStyle
        ? Number.parseFloat(frameStyle.paddingTop)
        : 0,
      hasMobilePageContext: pageContextStyle?.display !== "none",
      pageContextBottom: pageContext?.bottom ?? 0,
      readerLeft: reader?.left ?? 0,
      readerRight: reader ? viewportWidth - reader.right : 0,
      readerTop: reader?.top ?? 0,
      topInset: header && reader ? reader.top - header.bottom : 0,
    };
  });
  expect(
    Math.abs(readerLayout.framePaddingLeft - readerLayout.framePaddingRight),
  ).toBeLessThanOrEqual(1);
  if (readerLayout.hasMobilePageContext) {
    expect(readerLayout.framePaddingTop).toBe(0);
    expect(readerLayout.pageContextBottom).toBeLessThanOrEqual(
      readerLayout.topInset + readerLayout.framePaddingLeft + 80,
    );
  } else {
    expect(
      Math.abs(readerLayout.framePaddingLeft - readerLayout.framePaddingTop),
    ).toBeLessThanOrEqual(1);
  }
  expect(
    Math.abs(readerLayout.readerLeft - readerLayout.readerRight),
  ).toBeLessThanOrEqual(2);
  if (readerLayout.hasMobilePageContext) {
    expect(readerLayout.readerTop).toBeGreaterThanOrEqual(
      readerLayout.pageContextBottom - 2,
    );
  } else {
    expect(readerLayout.readerLeft).toBeGreaterThanOrEqual(
      readerLayout.topInset - 3,
    );
  }
  const progressButton = page.getByRole("button", { name: /Progress/ });
  await expect(progressButton).toBeVisible();
  await expect
    .poll(async () => {
      if ((await progressButton.getAttribute("aria-expanded")) !== "true") {
        await progressButton.click();
      }
      return progressButton.getAttribute("aria-expanded");
    })
    .toBe("true");
  const popover = page.getByRole("region", { name: "Reader progress" });
  const readingMapLink = popover.getByRole("link", { name: "Open reading map" });
  await expect(readingMapLink).toBeVisible();
  await expect(readingMapLink).toHaveAttribute("href", "/progress/");
  const markReadButton = popover.getByRole("button", {
    name: /^(Mark current section as read|Current section is marked read)$/,
  });
  await expect(markReadButton).toBeVisible();
  const markReadButtonStyle = await markReadButton.evaluate((element) => {
    const sectionStyle = window.getComputedStyle(
      element.closest(".reader-actions")!,
    );
    const style = window.getComputedStyle(element);
    return {
      sectionBorderTopWidth: sectionStyle.borderTopWidth,
      justifyContent: style.justifyContent,
      textAlign: style.textAlign,
    };
  });
  expect(markReadButtonStyle.sectionBorderTopWidth).toBe("0px");
  expect(markReadButtonStyle.justifyContent).toBe("flex-start");
  expect(markReadButtonStyle.textAlign).toBe("left");
  await expect(markReadButton).toHaveText("Mark current section as read");
  await markReadButton.click();
  await expect(markReadButton).toHaveText("Current section is marked read");
  await expect(popover.getByText("Recently read")).toBeVisible();
  await expect(popover.locator(".recently-read a").first()).toContainText(
    firstSection.title,
  );
  const recentLinkMetrics = await popover
    .locator(".recently-read a")
    .first()
    .evaluate((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const panel = element.closest(".reader-status")!.getBoundingClientRect();

      return {
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        width: box.width,
        panelWidth: panel.width,
      };
    });
  expect(recentLinkMetrics.textOverflow).toBe("clip");
  expect(recentLinkMetrics.whiteSpace).toBe("normal");
  expect(recentLinkMetrics.width).toBeGreaterThan(
    recentLinkMetrics.panelWidth - 80,
  );
  const localEvents = await page.evaluate((key) => {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{
      eventType: string;
      sectionId?: string;
    }>;
  }, readerEventsStorageKey);
  expect(localEvents.some((event) => event.eventType === "section_opened")).toBe(
    true,
  );
  expect(localEvents.some((event) => event.eventType === "manual_mark_read")).toBe(
    true,
  );
  const listenButton = page.getByRole("button", { name: /Listen/ });
  await expect(listenButton).toBeVisible();
  const idleListenButtonWidth = await listenButton.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await listenButton.click();
  const audioPanel = page.getByLabel("Audiobook controls");
  await expect(audioPanel).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice" })).toBeVisible();
  await expect(audioPanel.getByText("Voice", { exact: true })).toBeVisible();
  await expect(audioPanel.getByText("Speed", { exact: true })).toBeVisible();

  const activeListenButton = page.getByRole("button", {
    name: "Pause audiobook",
  });
  await expect(activeListenButton).toBeVisible();
  const activeListenButtonWidth = await activeListenButton.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(
    Math.abs(activeListenButtonWidth - idleListenButtonWidth),
  ).toBeLessThanOrEqual(1);
  await expect(activeListenButton.locator(".audio-waveform")).toBeVisible();
  await expect(activeListenButton.locator(".nav-label")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(audioPanel).toHaveCount(0);
  await activeListenButton.click();
  await expect(page.getByRole("button", { name: /Listen/ })).toBeVisible();
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  await page.keyboard.press("Escape");
  const footer = page.getByRole("contentinfo", { name: "Site information" });
  await expect(footer).toBeVisible();
  await expect(
    footer.getByText(`© ${copyrightYearLabel} by the Providence Collective.`),
  ).toBeVisible();
});

test("audio voice selection restarts active playback", async ({ page }) => {
  await page.addInitScript(() => {
    class TestSpeechSynthesisUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    const voices = [
      { name: "Samantha", voiceURI: "samantha" },
      { name: "Daniel", voiceURI: "daniel" },
      { name: "Karen", voiceURI: "karen" },
      { name: "Moira", voiceURI: "moira" },
      { name: "Tessa", voiceURI: "tessa" },
    ] as SpeechSynthesisVoice[];
    const spokenVoices: Array<string | null> = [];

    Object.defineProperty(window, "__spokenVoices", {
      configurable: true,
      value: spokenVoices,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        cancel: () => undefined,
        getVoices: () => voices,
        pause: () => undefined,
        removeEventListener: () => undefined,
        resume: () => undefined,
        speak: (utterance: SpeechSynthesisUtterance) => {
          spokenVoices.push(utterance.voice?.voiceURI ?? null);
        },
      },
    });
  });

  await page.goto(firstSection.href);
  await page.getByRole("button", { name: /Listen/ }).click();
  const audioPanel = page.getByLabel("Audiobook controls");
  await expect(audioPanel).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __spokenVoices: Array<string | null> })
            .__spokenVoices,
      ),
    )
    .toEqual([null]);

  const voiceSelect = page.getByRole("combobox", { name: "Voice" });
  await voiceSelect.selectOption("samantha");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __spokenVoices: Array<string | null> })
            .__spokenVoices,
      ),
    )
    .toEqual([null, "samantha"]);

  await voiceSelect.selectOption("");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __spokenVoices: Array<string | null> })
            .__spokenVoices,
      ),
    )
    .toEqual([null, "samantha", null]);
});

test("reading map renders the manuscript heatmap", async ({ page }) => {
  await page.goto("/progress/");

  await expect(page.getByRole("heading", { name: "Reading Map" })).toBeVisible();
  await expect(
    page.getByText("One thousand squares across the nine manuscripts."),
  ).toHaveCount(0);
  await expect(page.locator(".progress-heatmap-volume")).toHaveCount(9);
  await expect(page.locator(".progress-heatmap-cell")).toHaveCount(1_000);
  await expect(page.locator(".progress-heatmap-volume-read-tag")).toHaveCount(9);
  await expect(page.locator(".progress-heatmap-volume-read-tag").first()).toHaveText(
    "0% read",
  );

  const progressSummary = page.getByLabel("Reading progress summary");
  await expect(progressSummary.getByText("sections read")).toBeVisible();
  await expect(progressSummary.getByText("revised sections")).toBeVisible();
  await expect(progressSummary.getByText("squares")).toHaveCount(0);

  const firstCell = page.locator(".progress-heatmap-cell").first();
  await expect(firstCell).toHaveAttribute("type", "button");
  await firstCell.hover();

  const tooltip = page.getByRole("dialog", { name: "Section jump links" });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCount(1);
  const hoverHint = page.getByText("(click to jump)");
  await expect(hoverHint).toHaveCount(0);
  await expect(tooltip.getByRole("link").first()).toHaveAttribute(
    "href",
    /\/manuscripts\//,
  );
  await firstCell.click();
  await expect(tooltip).toBeVisible();
  await expect(hoverHint).toHaveCount(0);
  await expect(tooltip).toHaveCount(1);

  const secondCell = page.locator(".progress-heatmap-cell").nth(1);
  await secondCell.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCount(1);
  await expect(hoverHint).toHaveCount(0);

  const mapMetrics = await page.evaluate(() => {
    const cell = document.querySelector(".progress-heatmap-cell");
    const tooltip = document.querySelector(".progress-heatmap-tooltip");
    const tooltipArrow = document.querySelector(".progress-heatmap-tooltip-arrow");
    const tooltipContent = tooltip?.querySelector(".progress-heatmap-tooltip-content");
    const tooltipReadTag = tooltip?.querySelector(".progress-heatmap-tooltip-read-tag");
    const tooltipLink = tooltip?.querySelector(".progress-heatmap-tooltip-links a");
    const tooltipLinkIndicator = tooltipLink?.querySelector(
      ".progress-heatmap-tooltip-link-indicator",
    );
    const tooltipLinkTitle = tooltipLink?.querySelector(
      ".progress-heatmap-tooltip-link-title",
    );
    const volume = document.querySelector(".progress-heatmap-volume");
    const volumeReadTag = volume?.querySelector(".progress-heatmap-volume-read-tag");
    const box = cell?.getBoundingClientRect();
    const tooltipBox = tooltip?.getBoundingClientRect();
    const tooltipContentBox = tooltipContent?.getBoundingClientRect();
    const tooltipReadTagBox = tooltipReadTag?.getBoundingClientRect();
    const tooltipArrowBox = tooltipArrow?.getBoundingClientRect();
    const tooltipStyle = tooltip ? window.getComputedStyle(tooltip) : null;
    const tooltipLinkStyle = tooltipLinkTitle
      ? window.getComputedStyle(tooltipLinkTitle)
      : null;
    const tooltipArrowOutside =
      tooltipBox && tooltipArrowBox
        ? tooltipArrowBox.bottom > tooltipBox.bottom + 2 ||
          tooltipArrowBox.top < tooltipBox.top - 2 ||
          tooltipArrowBox.right > tooltipBox.right + 2 ||
          tooltipArrowBox.left < tooltipBox.left - 2
        : false;
    const volumeBox = volume?.getBoundingClientRect();
    const volumeReadTagBox = volumeReadTag?.getBoundingClientRect();
    const cellStyle = cell ? window.getComputedStyle(cell) : null;
    return {
      cellWidth: box?.width ?? 0,
      cellHeight: box?.height ?? 0,
      cellBorderRadius: Number.parseFloat(cellStyle?.borderTopLeftRadius ?? "0"),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      tooltipLeft: tooltipBox?.left ?? 0,
      tooltipRight: tooltipBox?.right ?? 0,
      tooltipTop: tooltipBox?.top ?? 0,
      tooltipBottom: tooltipBox?.bottom ?? 0,
      tooltipArrowWidth: tooltipArrowBox?.width ?? 0,
      tooltipArrowHeight: tooltipArrowBox?.height ?? 0,
      tooltipArrowOutside,
      tooltipOverflowX: tooltipStyle?.overflowX ?? "",
      tooltipOverflowY: tooltipStyle?.overflowY ?? "",
      tooltipLinkFontWeight: Number.parseFloat(
        tooltipLinkStyle?.fontWeight ?? "0",
      ),
      tooltipLinkIndicator: tooltipLinkIndicator?.textContent?.trim() ?? "",
      tooltipReadTagRightGap:
        tooltipContentBox && tooltipReadTagBox
          ? tooltipContentBox.right - tooltipReadTagBox.right
          : 0,
      tooltipReadTagTopGap:
        tooltipContentBox && tooltipReadTagBox
          ? tooltipReadTagBox.top - tooltipContentBox.top
          : 0,
      volumeReadTagRightGap:
        volumeBox && volumeReadTagBox ? volumeBox.right - volumeReadTagBox.right : 0,
      volumeReadTagTopGap:
        volumeBox && volumeReadTagBox ? volumeReadTagBox.top - volumeBox.top : 0,
      viewportHeight: document.documentElement.clientHeight,
    };
  });

  expect(Math.abs(mapMetrics.cellWidth - mapMetrics.cellHeight)).toBeLessThanOrEqual(1);
  expect(mapMetrics.cellBorderRadius).toBeGreaterThanOrEqual(
    mapMetrics.cellWidth / 2 - 1,
  );
  expect(mapMetrics.scrollWidth).toBeLessThanOrEqual(mapMetrics.viewportWidth + 1);
  expect(mapMetrics.tooltipLeft).toBeGreaterThanOrEqual(0);
  expect(mapMetrics.tooltipRight).toBeLessThanOrEqual(mapMetrics.viewportWidth);
  expect(mapMetrics.tooltipTop).toBeGreaterThanOrEqual(0);
  expect(mapMetrics.tooltipBottom).toBeLessThanOrEqual(mapMetrics.viewportHeight);
  expect(mapMetrics.tooltipArrowWidth).toBeGreaterThan(0);
  expect(mapMetrics.tooltipArrowHeight).toBeGreaterThan(0);
  expect(mapMetrics.tooltipArrowOutside).toBe(true);
  expect(mapMetrics.tooltipOverflowX).toBe("visible");
  expect(mapMetrics.tooltipOverflowY).toBe("visible");
  expect(mapMetrics.tooltipLinkFontWeight).toBeLessThanOrEqual(600);
  expect(mapMetrics.tooltipLinkIndicator).toBe("››");
  expect(mapMetrics.tooltipReadTagRightGap).toBeLessThanOrEqual(1);
  expect(mapMetrics.tooltipReadTagTopGap).toBeLessThanOrEqual(2);
  expect(mapMetrics.volumeReadTagRightGap).toBeLessThanOrEqual(2);
  expect(mapMetrics.volumeReadTagTopGap).toBeLessThanOrEqual(24);

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
});

test("reading map partial cells fill to the center", async ({ page }) => {
  const model = buildReaderHeatmapModel();
  const partialCell = model.volumes[0]!.cells[0]!;
  const partialProgress = partialCell.portions.reduce(
    (current, portion) => recordScrollProgress(current, portion, 50),
    emptyProgress(),
  );
  expect(progressForHeatmapCell(partialProgress, partialCell).percent).toBe(50);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    {
      key: readerProgressV2StorageKey,
      value: serializeProgress(partialProgress),
    },
  );

  await page.goto("/progress/");

  const partialCellButton = page.locator(".progress-heatmap-cell-partial").first();
  await expect(partialCellButton).toBeVisible();

  const partialCellStyle = await partialCellButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      progress: style.getPropertyValue("--cell-progress").trim(),
    };
  });

  expect(partialCellStyle.progress).toBe("0.5");
  expect(partialCellStyle.backgroundImage).toContain("conic-gradient");
  expect(partialCellStyle.backgroundImage).not.toContain("radial-gradient");
});
