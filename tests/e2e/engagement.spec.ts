import { expect, test } from "@playwright/test";
import {
  readerEventsStorageKey,
  readerProgressStorageKey,
  firstSection,
} from "./fixtures";

test("singleton section alias records anonymous engagement events", async ({
  page,
}) => {
  const aliasHref = firstSection.href.replace(`${firstSection.sectionId}/`, "");

  await page.goto(aliasHref);
  await expect(
    page.getByRole("heading", { name: firstSection.title }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      return page.evaluate((key) => {
        return JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{
          eventType: string;
          sectionId?: string;
        }>;
      }, readerEventsStorageKey);
    })
    .toContainEqual(
      expect.objectContaining({
        eventType: "section_opened",
        sectionId: firstSection.sectionId,
      }),
    );
});

test("reader shows subtle revision status for previously read sections", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, section }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          sections: {
            [section.sectionId]: {
              sectionId: section.sectionId,
              contentHash: "older-section-hash",
              paragraphs: section.paragraphs.map(
                (
                  paragraph: { paragraphId: string; contentHash: string },
                  index: number,
                ) => ({
                  paragraphId: paragraph.paragraphId,
                  contentHash:
                    index === 0
                      ? `older-${paragraph.contentHash}`
                      : paragraph.contentHash,
                }),
              ),
              readAt: Date.now() - 1000,
              percent: 100,
            },
          },
        }),
      );
    },
    {
      key: readerProgressStorageKey,
      section: firstSection,
    },
  );

  await page.goto(firstSection.href);

  const revisionNotice = page.getByLabel("Updated section notice");
  await expect(revisionNotice).toBeVisible();
  await expect(revisionNotice).toContainText("Revised since you read this.");
  await expect(
    revisionNotice.getByRole("link", {
      name: "Jump to the first changed passage",
    }),
  ).toHaveAttribute(
    "href",
    `${firstSection.href}#${firstSection.paragraphs[0]!.anchor}`,
  );

  await page.goto(
    `/manuscripts/${firstSection.volumeId}/${firstSection.partId}/`,
  );
  const chapterCard = page.locator(".chapter-card", {
    hasText: firstSection.chapterTitle,
  });
  await expect(
    chapterCard.locator('[data-updated-marker="true"]'),
  ).toBeVisible();
  await expect(chapterCard.locator('[data-read-checkmark="true"]')).toHaveCount(
    0,
  );
});
