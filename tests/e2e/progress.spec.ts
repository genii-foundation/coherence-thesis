import { expect, test } from "@playwright/test";
import {
  buildReaderHeatmapModel,
  progressForHeatmapCell,
} from "../../src/lib/reader-heatmap";
import { audioVoiceStorageKey } from "../../src/lib/audio-preferences";
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
  highQualityVoicePreferenceId,
  wieldingSection,
  copyrightYearLabel,
  nextSection,
  sectionWithNeighbors,
} from "./fixtures";

// These tests mock sync requests. Blocking the offline worker keeps WebKit
// requests visible to Playwright routing.
test.use({ serviceWorkers: "block" });

const systemVoicePreference = {
  voiceURI: null,
  rate: 1,
  pitch: 1,
  useSystemVoice: true,
};
test("progress menu shows a resettable email sent confirmation", async ({
  isMobile,
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

  await expect(
    page.getByRole("button", { name: "Mark current section as read" }),
  ).toBeVisible();

  const emailInput = page.getByLabel("Email");
  const signInButton = page.getByRole("button", { name: "Sign in to sync" });
  await emailInput.fill("reader@example.com");
  await expect(emailInput).toHaveValue("reader@example.com");
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
  const modalMetrics = await page.evaluate(() => {
    const backdrop = document.querySelector(".reader-sync-modal-backdrop");
    const popover = document.querySelector(".progress-popover");
    const box = backdrop?.getBoundingClientRect();
    const dialogBox = backdrop
      ?.querySelector('[role="dialog"]')
      ?.getBoundingClientRect();
    const style = backdrop ? window.getComputedStyle(backdrop) : null;
    const topLeftHit = document.elementFromPoint(8, 8);
    const bottomRightHit = document.elementFromPoint(
      window.innerWidth - 8,
      window.innerHeight - 8,
    );
    return {
      bottom: box?.bottom ?? -1,
      bottomRightBlocked: Boolean(backdrop?.contains(bottomRightHit)),
      dialogBox: dialogBox
        ? {
            bottom: dialogBox.bottom,
            left: dialogBox.left,
            right: dialogBox.right,
            top: dialogBox.top,
          }
        : null,
      left: box?.left ?? -1,
      parentTag: backdrop?.parentElement?.tagName ?? "",
      popoverContainsBackdrop: Boolean(backdrop && popover?.contains(backdrop)),
      position: style?.position ?? "",
      right: box?.right ?? -1,
      top: box?.top ?? -1,
      topLeftBlocked: Boolean(backdrop?.contains(topLeftHit)),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(modalMetrics.parentTag).toBe("BODY");
  expect(modalMetrics.popoverContainsBackdrop).toBe(false);
  expect(modalMetrics.position).toBe("fixed");
  expect(Math.abs(modalMetrics.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(modalMetrics.left)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(modalMetrics.right - modalMetrics.viewportWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(modalMetrics.bottom - modalMetrics.viewportHeight),
  ).toBeLessThanOrEqual(1);
  expect(modalMetrics.topLeftBlocked).toBe(true);
  expect(modalMetrics.bottomRightBlocked).toBe(true);
  expect(modalMetrics.dialogBox).not.toBeNull();
  if (modalMetrics.dialogBox) {
    expect(modalMetrics.dialogBox.top).toBeGreaterThanOrEqual(-1);
    expect(modalMetrics.dialogBox.left).toBeGreaterThanOrEqual(-1);
    expect(modalMetrics.dialogBox.right).toBeLessThanOrEqual(
      modalMetrics.viewportWidth + 1,
    );
    expect(modalMetrics.dialogBox.bottom).toBeLessThanOrEqual(
      modalMetrics.viewportHeight + 1,
    );
  }
  const cancelButton = syncModal.getByRole("button", { name: "Cancel" });
  const continueButton = syncModal.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeFocused();
  await expect(page.locator(".site-shell")).toHaveAttribute("inert", "");
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page.keyboard.press("Tab");
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(continueButton).toBeFocused();

  if (!isMobile) {
    const initialScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(8, 8);
    await page.mouse.wheel(0, 600);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY);
  }
  expect(signInEmailRequests).toBe(0);

  await page.keyboard.press("Escape");
  await expect(syncModal).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Reader progress" }),
  ).toBeVisible();
  await expect(page.locator(".site-shell")).not.toHaveAttribute("inert", "");
  await expect(signInButton).toBeFocused();
  expect(signInEmailRequests).toBe(0);

  await signInButton.click();
  await expect(syncModal).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(syncModal).toBeVisible();
  expect(signInEmailRequests).toBe(0);

  await cancelButton.click();
  await expect(syncModal).toHaveCount(0);
  await expect(page.locator(".site-shell")).not.toHaveAttribute("inert", "");
  await expect(signInButton).toBeFocused();
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
  const otpInput = page.getByLabel("One-time code");
  await expect(otpInput).toBeVisible();
  await expect(otpInput).toBeFocused();
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
  const progressBadge = progressButton.locator(".progress-percent");
  await expect(progressBadge).toHaveAttribute(
    "data-connected",
    "false",
  );
  await page.getByRole("button", { name: /Progress/ }).click();

  if (
    await page
      .getByText("Sync is not configured for this build.")
      .isVisible()
  ) {
    test.skip(true, "Sync is not configured in this test environment.");
  }

  await expect(
    page.getByRole("button", { name: "Mark current section as read" }),
  ).toBeVisible();

  const emailInput = page.getByLabel("Email");
  await emailInput.fill("reader@example.com");
  await expect(emailInput).toHaveValue("reader@example.com");
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
  await expect(progressBadge).toHaveAttribute(
    "data-connected",
    "true",
  );
  await expect(progressBadge.locator(".progress-cloud-mark")).toHaveCount(1);
  await expect(progressButton).toHaveAttribute(
    "aria-label",
    /Progress \d+%, signed in/,
  );

  const signedInProgressGeometry = await progressButton.evaluate((element) => {
    const cloud = element.querySelector(".progress-cloud-mark");
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
      onstart: (() => void) | null = null;

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
        speak: (utterance: SpeechSynthesisUtterance) => {
          utterance.onstart?.({} as SpeechSynthesisEvent);
        },
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
  const readingMapGap = await readingMapLink.evaluate((element) => {
    const section = element.closest(".reader-actions");
    const previousSection = section?.previousElementSibling;
    if (!previousSection) return 0;
    return (
      element.getBoundingClientRect().top -
      previousSection.getBoundingClientRect().bottom
    );
  });
  expect(readingMapGap).toBeGreaterThanOrEqual(11.99);
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
    footer.getByText(`© ${copyrightYearLabel} by GENII Foundation.`),
  ).toBeVisible();
});

test("audio voice selection exposes one built-in system option", async ({ page }) => {
  await page.addInitScript(() => {
    class TestSpeechSynthesisUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;

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
          utterance.onstart?.({} as SpeechSynthesisEvent);
        },
      },
    });
  });

  await page.goto(`${firstSection.href}?listen=1`);
  const audioPanel = page.getByLabel("Audiobook controls");
  await expect(audioPanel).toBeVisible({ timeout: 15_000 });

  const voiceSelect = page.getByRole("combobox", { name: "Voice" });
  await expect(voiceSelect).toHaveValue(highQualityVoicePreferenceId);
  await expect(voiceSelect.locator("option", { hasText: "High Quality 1" }))
    .toHaveCount(1);
  await expect(voiceSelect.locator("option", { hasText: "System voice" }))
    .toHaveCount(1);
  await expect(voiceSelect.locator("option", { hasText: "Samantha" }))
    .toHaveCount(0);

  await voiceSelect.selectOption("");
  await expect(voiceSelect).toHaveValue("");

  await page.getByRole("button", { name: "Reset voice" }).click();
  await expect(voiceSelect).toHaveValue(highQualityVoicePreferenceId);
});

test("reader words can start playback from a focused word", async ({ page }) => {
  await page.addInitScript(({ storageKey, preference }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(preference));
    class TestSpeechSynthesisUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    const spokenTexts: string[] = [];

    Object.defineProperty(window, "__spokenTexts", {
      configurable: true,
      value: spokenTexts,
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
        getVoices: () => [{ name: "Samantha", voiceURI: "samantha" }],
        pause: () => undefined,
        removeEventListener: () => undefined,
        resume: () => undefined,
        speak: (utterance: SpeechSynthesisUtterance) => {
          spokenTexts.push(utterance.text);
          utterance.onstart?.({} as SpeechSynthesisEvent);
          utterance.onboundary?.({
            charIndex: 0,
            charLength: utterance.text.split(/\s+/)[0]?.length ?? 0,
            elapsedTime: 0,
            name: "word",
          } as SpeechSynthesisEvent);
        },
      },
    });
  }, { storageKey: audioVoiceStorageKey, preference: systemVoicePreference });

  await page.goto(firstSection.href);
  const targetWord = page.locator(".manuscript-prose p .audio-word").first();
  await expect(targetWord).toBeVisible();
  const targetText = (await targetWord.textContent())?.trim() ?? "";

  await targetWord.hover();
  const initialTooltip = page.getByRole("button", {
    name: "Click Here to Play",
  });
  await expect(initialTooltip).toBeVisible();
  await expect
    .poll(() =>
      initialTooltip.evaluate((element) => {
        const tail = window.getComputedStyle(element, "::before");
        return Number.parseFloat(tail.borderTopWidth);
      }),
    )
    .toBeGreaterThan(0);

  await targetWord.click();
  await expect(targetWord).toHaveClass(/is-audio-focused/);
  const selectedTooltip = page.getByRole("button", {
    name: "Click Again to start playback",
  });
  await expect(selectedTooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(targetWord).not.toHaveClass(/is-audio-focused/);
  await expect(selectedTooltip).toHaveCount(0);

  await targetWord.hover();
  await targetWord.click();
  await expect(targetWord).toHaveClass(/is-audio-focused/);
  const selectedTooltipAfterOutsideClick = page.getByRole("button", {
    name: "Click Again to start playback",
  });
  await expect(selectedTooltipAfterOutsideClick).toBeVisible();
  await page.evaluate(() =>
    document.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
  await expect(targetWord).not.toHaveClass(/is-audio-focused/);
  await expect(selectedTooltipAfterOutsideClick).toHaveCount(0);

  await targetWord.hover();
  await targetWord.click();
  await expect(targetWord).toHaveClass(/is-audio-focused/);
  const playTooltip = page.getByRole("button", {
    name: "Click Again to start playback",
  });
  await expect(playTooltip).toBeVisible();
  await playTooltip.click();

  await expect(page.getByRole("button", { name: "Pause audiobook" }))
    .toBeVisible();
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  const targetId = await targetWord.getAttribute("id");
  expect(targetId).not.toBeNull();
  const targetHash = targetId ?? "";
  const jumpLink = page.getByRole("link", { name: "Jump to playback location" });
  await expect(jumpLink).toHaveAttribute("href", new RegExp(`#${targetHash}$`));
  await expect(targetWord).toHaveClass(/is-audio-current/);
  const currentSpeaker = page.locator(".audio-current-speaker");
  await expect(currentSpeaker).toBeVisible();
  await expect(currentSpeaker).toHaveCSS("position", "absolute");
  await expect(currentSpeaker).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect
    .poll(() =>
      currentSpeaker.evaluate(
        (speaker, expectedWordId) =>
          speaker.closest(".audio-word")?.id === expectedWordId,
        targetHash,
      ),
    )
    .toBe(true);
  const speakerAlignmentDelta = () =>
    page.evaluate((id) => {
      const word = document.getElementById(id);
      const speaker = document.querySelector(".audio-current-speaker");
      if (!word || !speaker) return 999;
      const wordRect = word.getBoundingClientRect();
      const speakerRect = speaker.getBoundingClientRect();
      const wordCenter = wordRect.top + wordRect.height / 2;
      const speakerCenter = speakerRect.top + speakerRect.height / 2;
      return Math.abs(wordCenter - speakerCenter);
    }, targetHash);
  await expect.poll(speakerAlignmentDelta).toBeLessThan(4);
  const immediateScrollDelta = await page.evaluate((id) => {
    const word = document.getElementById(id);
    const speaker = word?.querySelector(".audio-current-speaker");
    if (!word || !speaker) return 999;
    const wordTop = word.getBoundingClientRect().top;
    const speakerTop = speaker.getBoundingClientRect().top;
    window.scrollBy(0, 24);
    return Math.abs(
      (word.getBoundingClientRect().top - wordTop) -
        (speaker.getBoundingClientRect().top - speakerTop),
    );
  }, targetHash);
  expect(immediateScrollDelta).toBeLessThan(0.5);
  await expect.poll(speakerAlignmentDelta).toBeLessThan(4);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await jumpLink.click();
  await expect(page).toHaveURL(new RegExp(`#${targetHash}$`));
  await expect
    .poll(() =>
      page.evaluate((id) => document.getElementById(id)?.matches(":target"), targetHash),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        (expectedWord) =>
          (window as unknown as { __spokenTexts: string[] }).__spokenTexts
            .at(0)
            ?.startsWith(expectedWord) ?? false,
        targetText,
      ),
    )
    .toBe(true);
});

test("reader navigation does not interrupt active playback", async ({ page }) => {
  await page.addInitScript(({ storageKey, preference }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(preference));
    class TestSpeechSynthesisUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    const spokenTexts: string[] = [];
    let cancelCount = 0;

    Object.defineProperties(window, {
      __spokenTexts: {
        configurable: true,
        value: spokenTexts,
      },
      __cancelCount: {
        configurable: true,
        get: () => cancelCount,
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestSpeechSynthesisUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        cancel: () => {
          cancelCount += 1;
        },
        getVoices: () => [{ name: "Samantha", voiceURI: "samantha" }],
        pause: () => undefined,
        removeEventListener: () => undefined,
        resume: () => undefined,
        speak: (utterance: SpeechSynthesisUtterance) => {
          spokenTexts.push(utterance.text);
          utterance.onstart?.({} as SpeechSynthesisEvent);
        },
      },
    });
  }, { storageKey: audioVoiceStorageKey, preference: systemVoicePreference });

  await page.goto(`${sectionWithNeighbors.href}?listen=1`);
  await expect(page.getByRole("button", { name: "Pause audiobook" }))
    .toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __spokenTexts: string[] }).__spokenTexts,
      ),
    )
    .toHaveLength(1);
  const cancelCountAfterStart = await page.evaluate(
    () => (window as unknown as { __cancelCount: number }).__cancelCount,
  );

  await page.keyboard.press("Escape");
  await expect(page.locator(".audio-popover")).toHaveCount(0);
  await page.locator(".section-nav-link-next").click();
  await expect(page).toHaveURL(new RegExp(`${nextSection.href}$`));
  await expect(page.getByRole("button", { name: "Pause audiobook" }))
    .toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __cancelCount: number }).__cancelCount,
      ),
    )
    .toBe(cancelCountAfterStart);
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
