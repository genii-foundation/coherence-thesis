import { expect, test } from "@playwright/test";
import { catalog } from "../../src/lib/manuscript-data";

const firstSection = catalog.sections[0];

test("home page presents the overview and manuscript entry points", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The Providence Imperative" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Read the overview/ })).toHaveAttribute(
    "href",
    "/overview/",
  );
  await expect(page.getByRole("link", { name: /Enter manuscript/ })).toBeVisible();
  await expect(page.getByText("five minute overview")).toBeVisible();
});

test("overview links into canonical manuscript sections", async ({ page }) => {
  await page.goto("/overview/");

  await expect(page.getByRole("heading", { name: "The Coherence Thesis" })).toBeVisible();
  await expect(page.getByRole("link", { name: /The central wound/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /The central wound/ }).first().click();
  await expect(page).toHaveURL(/\/manuscripts\/providence-imperative\//);
});

test("reader route exposes progress and audio controls", async ({ page }) => {
  await page.goto(firstSection.href);

  await expect(page.getByRole("heading", { name: firstSection.title })).toBeVisible();
  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs.getByText("Home")).toBeVisible();
  await expect(breadcrumbs.getByText("Providence Imperative")).toBeVisible();
  await expect(breadcrumbs.getByText(firstSection.title).first()).toBeVisible();
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
  await expect(page.getByRole("button", { name: /Mark read|Read/ })).toBeVisible();
  const listenButton = page.getByRole("button", { name: /Listen/ });
  await expect(listenButton).toBeVisible();
  await listenButton.click();
  await expect(page.getByLabel("Audiobook controls")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play audiobook" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Voice" })).toBeVisible();
});
