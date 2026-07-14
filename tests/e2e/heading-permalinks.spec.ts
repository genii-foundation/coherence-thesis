import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Chapter, Section } from "../../src/lib/manuscript-data";
import { catalog } from "./fixtures";

function requiredTarget<T>(value: T | undefined, description: string): T {
  if (!value) {
    throw new Error(`Generated catalog has no ${description}.`);
  }

  return value;
}

function sectionsForChapter(chapter: Chapter): Section[] {
  return chapter.sectionIds.map((sectionId) =>
    requiredTarget(
      catalog.sections.find((section) => section.sectionId === sectionId),
      `section for chapter ${chapter.chapterId}`,
    ),
  );
}

const chapterTargets = catalog.volumes.flatMap((volume) =>
  volume.parts.flatMap((part) =>
    part.chapters.map((chapter) => ({
      chapter,
      sections: sectionsForChapter(chapter),
    })),
  ),
);

const linkedChapterTarget = requiredTarget(
  chapterTargets.find(
    ({ chapter, sections }) =>
      sections.length > 1 && sections[0]?.title === chapter.title,
  ),
  "multi-section chapter whose first section represents its heading",
);
const linkedChapterFirstSection = linkedChapterTarget.sections[0]!;
const linkedSubsection = linkedChapterTarget.sections[1]!;

const standaloneHeadingSection = requiredTarget(
  chapterTargets.find(({ sections }) => sections.length === 1)?.sections[0],
  "standalone section heading",
);

const structuralHeadingTarget = requiredTarget(
  chapterTargets.find(
    ({ chapter, sections }) =>
      sections.length > 1 && sections[0]?.title !== chapter.title,
  ),
  "structural chapter heading",
);

const chapterHref = linkedChapterTarget.chapter.href;
const chapterTitle = linkedChapterTarget.chapter.title;
const chapterSectionId = linkedChapterFirstSection.sectionId;
const subsectionTitle = linkedSubsection.title;
const subsectionId = linkedSubsection.sectionId;

async function captureClipboardWrites(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (
            window as Window & { __copiedReaderHeadingLink?: string }
          ).__copiedReaderHeadingLink = text;
        },
      },
    });
  });
}

async function copiedReaderHeadingLink(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () =>
      (window as Window & { __copiedReaderHeadingLink?: string })
        .__copiedReaderHeadingLink,
  );
}

async function tabToLocator(
  page: Page,
  target: Locator,
  maximumSteps = 20,
): Promise<void> {
  for (let step = 0; step < maximumSteps; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }
  throw new Error(`Target did not receive focus within ${maximumSteps} Tab presses.`);
}

test("reader headings reveal and copy full anchored links", async (
  { page },
  testInfo,
) => {
  await captureClipboardWrites(page);
  await page.goto(chapterHref);

  const section = page.locator(`#${subsectionId}`);
  const heading = section.getByRole("heading", {
    level: 2,
    name: subsectionTitle,
  });
  const copyButton = section.getByRole("button", {
    name: `Copy link to ${subsectionTitle}`,
  });
  await expect(heading).toBeVisible();
  await expect(copyButton).toHaveCount(1);

  const restingButton = await copyButton.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      height: box.height,
      opacity: Number.parseFloat(style.opacity),
      pointerEvents: style.pointerEvents,
      right: box.right,
      viewportWidth: window.innerWidth,
      width: box.width,
    };
  });

  if (testInfo.project.name === "mobile") {
    expect(restingButton.opacity).toBeGreaterThan(0.5);
    expect(restingButton.pointerEvents).toBe("auto");
    expect(restingButton.width).toBeGreaterThanOrEqual(44);
    expect(restingButton.height).toBeGreaterThanOrEqual(44);
    expect(restingButton.right).toBeLessThanOrEqual(
      restingButton.viewportWidth + 1,
    );
  } else {
    expect(restingButton.opacity).toBe(0);
    expect(restingButton.pointerEvents).toBe("none");

    await heading.hover();
    await expect
      .poll(() =>
        copyButton.evaluate((element) => ({
          opacity: Number.parseFloat(window.getComputedStyle(element).opacity),
          pointerEvents: window.getComputedStyle(element).pointerEvents,
        })),
      )
      .toEqual({ opacity: 1, pointerEvents: "auto" });

    await copyButton.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("Click to copy link");
  }

  const chapterCopyButton = page.locator(".manuscript-heading").getByRole(
    "button",
    {
      name: `Copy link to ${chapterTitle}`,
    },
  );
  await chapterCopyButton.focus();
  await tabToLocator(page, copyButton);
  await expect(copyButton).toBeFocused();
  await expect
    .poll(() =>
      copyButton.evaluate((element) => ({
        boxShadow: window.getComputedStyle(element).boxShadow,
        opacity: Number.parseFloat(window.getComputedStyle(element).opacity),
      })),
    )
    .toEqual(
      expect.objectContaining({
        boxShadow: expect.not.stringMatching(/^none$/),
        opacity: 1,
      }),
    );

  await copyButton.press("Enter");
  const expectedHref = new URL(
    `${linkedSubsection.readerHref.replace(/#.*$/, "")}#${subsectionId}`,
    page.url(),
  ).href;
  await expect.poll(() => copiedReaderHeadingLink(page)).toBe(expectedHref);

  const toast = page.locator(".reader-copy-toast");
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast).toHaveAttribute("aria-live", "polite");
  await expect(toast).toHaveText("Link copied");
  const toastBox = await toast.boundingBox();
  const viewport = page.viewportSize();
  expect(toastBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(toastBox!.x).toBeGreaterThanOrEqual(0);
  expect(toastBox!.x + toastBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(viewport!.height);

  await chapterCopyButton.press("Enter");
  await expect
    .poll(() => copiedReaderHeadingLink(page))
    .toBe(
      new URL(
        `${linkedChapterFirstSection.readerHref.replace(/#.*$/, "")}#${chapterSectionId}`,
        page.url(),
      ).href,
    );
  await expect(page.locator(".reader-copy-toast")).toHaveCount(1);
});

test("standalone and structural chapter headings resolve to real anchors", async ({
  page,
}) => {
  await captureClipboardWrites(page);

  await page.goto(standaloneHeadingSection.href);
  const standaloneCopy = page.getByRole("button", {
    name: `Copy link to ${standaloneHeadingSection.title}`,
  });
  await standaloneCopy.focus();
  await standaloneCopy.press("Enter");
  await expect
    .poll(() => copiedReaderHeadingLink(page))
    .toBe(
      new URL(
        `${standaloneHeadingSection.readerHref.replace(/#.*$/, "")}#${standaloneHeadingSection.sectionId}`,
        page.url(),
      ).href,
    );
  await expect(
    page.locator(`#${standaloneHeadingSection.sectionId}`),
  ).toHaveCount(1);

  await page.goto(structuralHeadingTarget.chapter.href);
  const structuralCopy = page.locator(".manuscript-heading").getByRole(
    "button",
    {
      name: `Copy link to ${structuralHeadingTarget.chapter.title}`,
    },
  );
  await structuralCopy.focus();
  await structuralCopy.press("Enter");
  await expect
    .poll(() => copiedReaderHeadingLink(page))
    .toBe(
      new URL(
        `${structuralHeadingTarget.chapter.href}#${structuralHeadingTarget.chapter.chapterId}`,
        page.url(),
      ).href,
    );
  await expect(
    page.locator(`#${structuralHeadingTarget.chapter.chapterId}`),
  ).toHaveCount(1);
});

test("reader headings remain readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await page.goto(chapterHref);
    await expect(
      page.getByRole("heading", { level: 1, name: chapterTitle }),
    ).toBeVisible();
    await expect(
      page
        .locator(`#${subsectionId}`)
        .getByRole("heading", { level: 2, name: subsectionTitle }),
    ).toBeVisible();
    const copyButtons = page.locator(".reader-heading-link-button");
    await expect(copyButtons).toHaveCount(linkedChapterTarget.sections.length);
    await expect(copyButtons.first()).toBeHidden();
    await expect(copyButtons.last()).toBeHidden();
  } finally {
    await context.close();
  }
});
