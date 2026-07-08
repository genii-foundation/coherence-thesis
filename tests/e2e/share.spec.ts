import { expect, test } from "@playwright/test";
import {
  firstSection,
  firstSectionVolume,
  firstSectionPdfFileName,
  firstManuscriptPdfFileName,
  pdfPageCount,
  pdfImageCount,
} from "./fixtures";

test("reader share menu exposes page sharing and PDF downloads", async ({
  page,
}) => {
  await page.route("**/downloads/**", async (route) => {
    if (route.request().method() === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
      return;
    }

    await route.continue();
  });

  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as Window & { __lastShareData?: ShareData }).__lastShareData =
          data;
      },
    });
  });
  await page.goto(firstSection.href);

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await expect(shareButton).toHaveText("");
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();

  const shareBox = await shareMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(shareBox).not.toBeNull();
  expect(viewport).not.toBeNull();

  if (shareBox && viewport) {
    expect(shareBox.x).toBeGreaterThanOrEqual(-1);
    expect(shareBox.x + shareBox.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const sectionPdfHref = `/downloads/sections/${firstSectionPdfFileName}`;
  const manuscriptPdfHref = `/downloads/manuscripts/${firstManuscriptPdfFileName}`;
  const sectionDownload = shareMenu.getByRole("link", {
    name: `Download this section as PDF: ${firstSection.title}`,
  });
  const manuscriptDownload = shareMenu.getByRole("link", {
    name: `Download full manuscript as PDF: ${firstSection.volumeTitle}`,
  });

  await expect(sectionDownload).toContainText("Download this section");
  await expect(sectionDownload).toHaveAttribute("href", sectionPdfHref);
  await expect(sectionDownload).toHaveAttribute(
    "download",
    firstSectionPdfFileName,
  );
  await expect(manuscriptDownload).toContainText("Download full manuscript");
  await expect(manuscriptDownload).toHaveAttribute("href", manuscriptPdfHref);
  await expect(manuscriptDownload).toHaveAttribute(
    "download",
    firstManuscriptPdfFileName,
  );

  const sectionPdfResponse = await page.request.get(encodeURI(sectionPdfHref));
  expect(sectionPdfResponse.ok()).toBe(true);
  expect(sectionPdfResponse.headers()["content-type"]).toContain(
    "application/pdf",
  );
  const sectionPdfBytes = await sectionPdfResponse.body();
  expect(pdfPageCount(sectionPdfBytes)).toBeGreaterThanOrEqual(2);
  expect(pdfPageCount(sectionPdfBytes)).toBeLessThanOrEqual(4);
  expect(pdfImageCount(sectionPdfBytes)).toBeGreaterThanOrEqual(1);
  expect(sectionPdfBytes.byteLength).toBeLessThan(450_000);
  const manuscriptPdfResponse = await page.request.get(
    encodeURI(manuscriptPdfHref),
  );
  expect(manuscriptPdfResponse.ok()).toBe(true);
  expect(manuscriptPdfResponse.headers()["content-type"]).toContain(
    "application/pdf",
  );
  const manuscriptPdfBytes = await manuscriptPdfResponse.body();
  const manuscriptPageCount = pdfPageCount(manuscriptPdfBytes);
  expect(manuscriptPageCount).toBeGreaterThan(2);
  expect(manuscriptPageCount).toBeLessThan(
    firstSectionVolume.sectionIds.length,
  );
  expect(pdfImageCount(manuscriptPdfBytes)).toBeGreaterThanOrEqual(1);
  expect(manuscriptPdfBytes.byteLength).toBeLessThan(700_000);

  await shareMenu.getByRole("button", { name: "Share this page" }).click();
  await expect(shareMenu.getByRole("status")).toHaveText("Shared");

  const shareData = await page.evaluate(
    () => (window as Window & { __lastShareData?: ShareData }).__lastShareData,
  );
  expect(shareData?.title).toContain(firstSection.title);
  expect(shareData?.url).toContain(firstSection.href);
});

test("volume share menu only offers the full manuscript download", async ({
  page,
}) => {
  await page.goto(firstSectionVolume.href);

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu.getByText("Download this section")).toHaveCount(0);

  const manuscriptDownload = shareMenu.getByRole("link", {
    name: `Download full manuscript as PDF: ${firstSectionVolume.title}`,
  });
  await expect(manuscriptDownload).toBeVisible();
  await expect(manuscriptDownload).toContainText("Download full manuscript");
  await expect(manuscriptDownload).toHaveAttribute(
    "href",
    `/downloads/manuscripts/${firstManuscriptPdfFileName}`,
  );
  await expect(manuscriptDownload).toHaveAttribute(
    "download",
    firstManuscriptPdfFileName,
  );

  const actionMetrics = await manuscriptDownload.evaluate((element) => {
    const panel = element.closest(".reader-share")?.getBoundingClientRect();
    const label = element.querySelector(".share-action-label");
    const labelBox = label?.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      display: style.display,
      labelWidth: labelBox?.width ?? 0,
      panelLeft: panel?.left ?? 0,
      panelRight: panel?.right ?? 0,
      rowLeft: element.getBoundingClientRect().left,
      rowRight: element.getBoundingClientRect().right,
    };
  });

  expect(actionMetrics.display).toBe("grid");
  expect(actionMetrics.labelWidth).toBeGreaterThan(120);
  expect(actionMetrics.rowLeft).toBeGreaterThanOrEqual(actionMetrics.panelLeft);
  expect(actionMetrics.rowRight).toBeLessThanOrEqual(
    actionMetrics.panelRight + 1,
  );
});

test("singleton section share menu offers both PDF downloads", async ({
  page,
}) => {
  const singletonSectionHref = firstSection.href.replace(
    `/${firstSection.sectionId}/`,
    "/",
  );
  await page.goto(singletonSectionHref);

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();

  const sectionDownload = shareMenu.getByRole("link", {
    name: `Download this section as PDF: ${firstSection.title}`,
  });
  const manuscriptDownload = shareMenu.getByRole("link", {
    name: `Download full manuscript as PDF: ${firstSectionVolume.title}`,
  });

  await expect(sectionDownload).toBeVisible();
  await expect(sectionDownload).toContainText("Download this section");
  await expect(sectionDownload).toHaveAttribute(
    "href",
    `/downloads/sections/${firstSectionPdfFileName}`,
  );
  await expect(manuscriptDownload).toBeVisible();
  await expect(manuscriptDownload).toContainText("Download full manuscript");
  await expect(manuscriptDownload).toHaveAttribute(
    "href",
    `/downloads/manuscripts/${firstManuscriptPdfFileName}`,
  );
  await expect(sectionDownload).toHaveAttribute(
    "download",
    firstSectionPdfFileName,
  );
  await expect(manuscriptDownload).toHaveAttribute(
    "download",
    firstManuscriptPdfFileName,
  );
});

test("homepage share menu only exposes page sharing", async ({ page }) => {
  await page.goto("/");

  const shareButton = page.getByRole("button", { name: "Share and downloads" });
  await expect(shareButton).toBeVisible();
  await shareButton.click();

  const shareMenu = page.getByRole("region", { name: "Share and downloads" });
  await expect(shareMenu).toBeVisible();
  await expect(
    shareMenu.getByRole("button", { name: "Share this page" }),
  ).toBeVisible();
  await expect(
    shareMenu.getByRole("link", { name: /Download this section/ }),
  ).toHaveCount(0);
  await expect(
    shareMenu.getByRole("link", { name: /Download full manuscript/ }),
  ).toHaveCount(0);
  await expect(
    shareMenu.getByRole("button", { name: /Download this section/ }),
  ).toHaveCount(0);
  await expect(
    shareMenu.getByRole("button", { name: /Download full manuscript/ }),
  ).toHaveCount(0);
});
