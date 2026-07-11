import { expect, test } from "@playwright/test";
import { catalog } from "./fixtures";

const wideViewport = { height: 1152, width: 2048 };

test("wide cover flow keeps every cover visible and stacks toward the center", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "wide desktop layout only");

  await page.setViewportSize(wideViewport);
  await page.goto("/");

  const coverFlow = page.locator(".cover-flow");
  const cards = coverFlow.locator(".cover-flow-card");
  await expect(cards).toHaveCount(catalog.volumes.length);
  await cards.first().locator(".cover-flow-image-frame").scrollIntoViewIfNeeded();

  const samples = await coverFlow.evaluate(async (flow, expectedCardCount) => {
    const scroller = flow.querySelector<HTMLElement>(".cover-flow-scroll");
    const cardElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card"),
    );
    const shellElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card-shell"),
    );
    if (!scroller || cardElements.length !== expectedCardCount) return [];

    const waitForMotionFrame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const step = shellElements[0]?.offsetWidth ?? 0;
    const samplePositions = [
      0,
      step * 0.35,
      step * 2.5,
      maxScrollLeft / 2,
      maxScrollLeft - step * 0.35,
      maxScrollLeft,
    ];
    const previousScrollBehavior = scroller.style.scrollBehavior;
    const previousScrollSnapType = scroller.style.scrollSnapType;
    scroller.style.scrollBehavior = "auto";
    scroller.style.scrollSnapType = "none";

    try {
      const results = [];

      for (const target of samplePositions) {
        scroller.scrollLeft = Math.max(0, Math.min(target, maxScrollLeft));
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        await waitForMotionFrame();

        const scrollerCenter =
          scroller.scrollLeft + scroller.clientWidth / 2;
        const measuredCards = cardElements.map((card, index) => {
          const cover = card.querySelector<HTMLElement>(
            ".cover-flow-image-frame",
          );
          const image = cover?.querySelector<HTMLElement>("img") ?? null;
          const shell = shellElements[index];
          const box = cover?.getBoundingClientRect();
          const shellCenter = shell
            ? shell.offsetLeft + shell.offsetWidth / 2
            : 0;
          const offset = (shellCenter - scrollerCenter) / step;

          return {
            cardOpacity: getComputedStyle(card).opacity,
            coverOpacity: cover ? getComputedStyle(cover).opacity : "",
            display: getComputedStyle(card).display,
            distance: Math.abs(offset),
            imageOpacity: image ? getComputedStyle(image).opacity : "",
            index,
            left: box?.left ?? 0,
            layer: Number.parseInt(shell?.style.zIndex ?? "0", 10),
            offset,
            right: box?.right ?? 0,
            visibility: getComputedStyle(card).visibility,
          };
        });
        const cardStates = measuredCards.map((card) => {
          const nearerCards = measuredCards.filter(
            (candidate) =>
              Math.sign(candidate.offset) === Math.sign(card.offset) &&
              candidate.distance + 0.001 < card.distance,
          );
          const visibleExposure =
            card.offset < 0
              ? Math.min(...nearerCards.map(({ left }) => left), innerWidth) -
                Math.max(card.left, 0)
              : Math.min(card.right, innerWidth) -
                Math.max(...nearerCards.map(({ right }) => right), 0);

          return { ...card, visibleExposure };
        });
        let layerOrderIsCorrect = true;

        cardStates.forEach((card, index) => {
          cardStates.forEach((otherCard, otherIndex) => {
            if (index === otherIndex) return;
            if (card.distance + 0.001 >= otherCard.distance) return;
            if (card.layer <= otherCard.layer) layerOrderIsCorrect = false;
          });
        });

        results.push({
          cardStates,
          layerOrderIsCorrect,
          scrollLeft: scroller.scrollLeft,
          uniqueLayerCount: new Set(cardStates.map(({ layer }) => layer)).size,
        });
      }

      return results;
    } finally {
      scroller.style.scrollBehavior = previousScrollBehavior;
      scroller.style.scrollSnapType = previousScrollSnapType;
    }
  }, catalog.volumes.length);

  expect(samples).toHaveLength(6);
  samples.forEach((sample) => {
    expect(sample.uniqueLayerCount).toBe(catalog.volumes.length);
    expect(sample.layerOrderIsCorrect).toBe(true);
    sample.cardStates.forEach((card) => {
      expect(card.cardOpacity).toBe("1");
      expect(card.coverOpacity).toBe("1");
      expect(card.imageOpacity).toBe("1");
      expect(card.display).not.toBe("none");
      expect(card.visibility).toBe("visible");
      expect(
        card.visibleExposure,
        `cover ${card.index} at scrollLeft ${sample.scrollLeft}`,
      ).toBeGreaterThan(0);
    });
  });
});

test("cover flow scroll frames avoid transformed geometry reads", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop motion only");

  await page.setViewportSize(wideViewport);
  await page.goto("/");

  const metrics = await page.locator(".cover-flow").evaluate(async (flow) => {
    const scroller = flow.querySelector<HTMLElement>(".cover-flow-scroll");
    const firstShell = flow.querySelector<HTMLElement>(
      ".cover-flow-card-shell",
    );
    if (!scroller || !firstShell) {
      return {
        cardZIndices: [],
        paintValuesAfter: [],
        paintValuesBefore: [],
        rectReads: -1,
        shiftsAfter: [],
        shiftsBefore: [],
        staleYValues: [],
      };
    }

    const cardElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card"),
    );
    const paintValues = () =>
      cardElements.map((card) => [
        card.style.getPropertyValue("--cover-flow-cover-shadow-strength"),
        card.style.getPropertyValue("--cover-flow-cover-wash-opacity"),
      ]);
    const shiftValues = () =>
      cardElements.map((card) =>
        card.style.getPropertyValue("--cover-flow-shift"),
      );
    const paintValuesBefore = paintValues();
    const shiftsBefore = shiftValues();
    const nativeGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const previousScrollBehavior = scroller.style.scrollBehavior;
    const previousScrollSnapType = scroller.style.scrollSnapType;
    let rectReads = 0;
    Element.prototype.getBoundingClientRect = function (...args) {
      if (
        this instanceof Element &&
        this.matches(".cover-flow-card, .cover-flow-image-frame")
      ) {
        rectReads += 1;
      }
      return nativeGetBoundingClientRect.apply(this, args);
    };

    try {
      scroller.style.scrollBehavior = "auto";
      scroller.style.scrollSnapType = "none";
      scroller.scrollLeft += firstShell.offsetWidth * 0.4;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    } finally {
      scroller.style.scrollBehavior = previousScrollBehavior;
      scroller.style.scrollSnapType = previousScrollSnapType;
      Element.prototype.getBoundingClientRect = nativeGetBoundingClientRect;
    }

    return {
      cardZIndices: cardElements.map((card) => getComputedStyle(card).zIndex),
      paintValuesAfter: paintValues(),
      paintValuesBefore,
      rectReads,
      shiftsAfter: shiftValues(),
      shiftsBefore,
      staleYValues: cardElements.map((card) =>
        card.style.getPropertyValue("--cover-flow-y"),
      ),
    };
  });

  expect(metrics.rectReads).toBe(0);
  expect(metrics.paintValuesAfter).toEqual(metrics.paintValuesBefore);
  expect(metrics.shiftsAfter).not.toEqual(metrics.shiftsBefore);
  expect(metrics.cardZIndices).toEqual(
    Array.from({ length: catalog.volumes.length }, () => "auto"),
  );
  expect(metrics.staleYValues).toEqual(
    Array.from({ length: catalog.volumes.length }, () => ""),
  );
});
