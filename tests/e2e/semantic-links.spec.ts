import { expect, test } from "@playwright/test";

test("reviewed semantic references follow current continuity routes", async ({
  page,
}) => {
  await page.goto("/manuscripts/1/opening/a-note-on-compression/");

  const prose = page.locator(".manuscript-prose");
  const seed = prose.getByRole("link", { name: "seed", exact: true });
  const sprout = prose.getByRole("link", { name: "sprout", exact: true });
  const stem = prose.getByRole("link", { name: "stem", exact: true });

  await expect(seed).toHaveAttribute(
    "href",
    "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
  );
  await expect(sprout).toHaveAttribute(
    "href",
    "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/",
  );
  await expect(stem).toHaveAttribute(
    "href",
    "/manuscripts/1/seed-sprout-stem-and-soil/the-stem/",
  );

  await seed.hover();
  await expect(
    page.getByRole("button", { name: "Click Here to Play" }),
  ).toHaveCount(0);

  await Promise.all([
    page.waitForURL(
      "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    ),
    seed.click(),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "The Seed" }),
  ).toBeVisible();
});
