import { expect, test, type Page } from "@playwright/test";
import { catalog } from "./fixtures";

const wideViewport = { height: 1152, width: 2048 };

function volumeHash(order: number) {
  return `#${order}`;
}

async function openCoverFlow(page: Page, href = "/") {
  await page.goto(href, { waitUntil: "domcontentloaded" });
  const coverFlow = page.locator(".cover-flow");
  await expect(coverFlow).toBeVisible();
  await expect
    .poll(
      () =>
        coverFlow.locator(".cover-flow-scroll").evaluate((scroller) => {
          return (
            scroller.dataset.coverFlowTargetScroll !== undefined &&
            scroller.dataset.coverFlowVisualScroll !== undefined
          );
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
}

test("wide cover flow keeps every cover visible and stacks toward the center", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "wide desktop layout only");
  test.setTimeout(240_000);

  await page.setViewportSize(wideViewport);
  await openCoverFlow(page);

  const coverFlow = page.locator(".cover-flow");
  const cards = coverFlow.locator(".cover-flow-card");
  await expect(cards).toHaveCount(catalog.volumes.length);
  await cards
    .first()
    .locator(".cover-flow-image-frame")
    .scrollIntoViewIfNeeded();

  const samples = await coverFlow.evaluate(async (flow, expectedCardCount) => {
    const scroller = flow.querySelector<HTMLElement>(".cover-flow-scroll");
    const cardElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card"),
    );
    const shellElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card-shell"),
    );
    const snapElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-snap"),
    );
    if (
      !scroller ||
      cardElements.length !== expectedCardCount ||
      shellElements.length !== expectedCardCount ||
      snapElements.length !== expectedCardCount
    ) {
      return [];
    }

    const waitForMotionSettlement = async () => {
      let stableFrames = 0;

      for (let frame = 0; frame < 180; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const target = Number(scroller.dataset.coverFlowTargetScroll);
        const visual = Number(scroller.dataset.coverFlowVisualScroll);
        stableFrames = Math.abs(target - visual) <= 0.06 ? stableFrames + 1 : 0;
        if (stableFrames >= 3) return;
      }

      throw new Error("Cover flow did not settle");
    };
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const step = snapElements[0]?.offsetWidth ?? 0;
    const samplePositions = [
      0,
      step * 0.35,
      step * 2.5,
      maxScrollLeft / 2,
      maxScrollLeft - step * 0.35,
      maxScrollLeft,
    ];
    const previousReaderAnimations =
      document.documentElement.dataset.readerAnimations;
    const previousScrollBehavior = scroller.style.scrollBehavior;
    const previousScrollSnapType = scroller.style.scrollSnapType;
    document.documentElement.dataset.readerAnimations = "none";
    scroller.style.scrollBehavior = "auto";
    scroller.style.scrollSnapType = "none";

    try {
      const results = [];

      for (const target of samplePositions) {
        scroller.scrollLeft = Math.max(0, Math.min(target, maxScrollLeft));
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        await waitForMotionSettlement();

        const visualScrollLeft = Number(scroller.dataset.coverFlowVisualScroll);
        const scrollerCenter = visualScrollLeft + scroller.clientWidth / 2;
        const measuredCards = cardElements.map((card, index) => {
          const cover = card.querySelector<HTMLElement>(
            ".cover-flow-image-frame",
          );
          const image = cover?.querySelector<HTMLElement>("img") ?? null;
          const shell = shellElements[index];
          const snap = snapElements[index];
          const box = cover?.getBoundingClientRect();
          const snapCenter = snap ? snap.offsetLeft + snap.offsetWidth / 2 : 0;
          const offset = (snapCenter - scrollerCenter) / step;

          return {
            cardOpacity: getComputedStyle(card).opacity,
            coverOpacity: cover ? getComputedStyle(cover).opacity : "",
            display: getComputedStyle(card).display,
            distance: Math.abs(offset),
            imageOpacity: image ? getComputedStyle(image).opacity : "",
            index,
            left: box?.left ?? 0,
            layer: Number.parseInt(
              shell ? getComputedStyle(shell).zIndex : "0",
              10,
            ),
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
            const oppositeSides =
              Math.sign(card.offset) !== 0 &&
              Math.sign(otherCard.offset) !== 0 &&
              Math.sign(card.offset) !== Math.sign(otherCard.offset);
            const overlaps =
              Math.min(card.right, otherCard.right) -
                Math.max(card.left, otherCard.left) >
              0.5;
            if (oppositeSides && !overlaps) {
              return;
            }
            if (card.distance + 0.001 >= otherCard.distance) return;
            if (card.layer <= otherCard.layer) layerOrderIsCorrect = false;
          });
        });

        results.push({
          cardStates,
          layerOrderIsCorrect,
          snapContractIsCorrect: snapElements.every((snap) => {
            const style = getComputedStyle(snap);
            return (
              style.scrollSnapAlign === "center" &&
              style.scrollSnapStop === "normal" &&
              Math.abs(snap.offsetWidth - step) < 0.5
            );
          }),
          scrollLeft: scroller.scrollLeft,
          uniqueLayerCount: new Set(cardStates.map(({ layer }) => layer)).size,
        });
      }

      return results;
    } finally {
      if (previousReaderAnimations === undefined) {
        delete document.documentElement.dataset.readerAnimations;
      } else {
        document.documentElement.dataset.readerAnimations =
          previousReaderAnimations;
      }
      scroller.style.scrollBehavior = previousScrollBehavior;
      scroller.style.scrollSnapType = previousScrollSnapType;
    }
  }, catalog.volumes.length);

  expect(samples).toHaveLength(6);
  samples.forEach((sample) => {
    expect(sample.uniqueLayerCount).toBe(catalog.volumes.length);
    expect(sample.snapContractIsCorrect).toBe(true);
    expect(
      sample.layerOrderIsCorrect,
      `layer order at scrollLeft ${sample.scrollLeft}: ${JSON.stringify(
        sample.cardStates.map(({ distance, index, layer }) => ({
          distance,
          index,
          layer,
        })),
      )}`,
    ).toBe(true);
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

test("center and background covers share the hover zoom cue", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name === "mobile", "desktop hover only");

  await page.setViewportSize(wideViewport);
  await openCoverFlow(page);

  const coverFlow = page.locator(".cover-flow");
  const cards = coverFlow.locator(".cover-flow-card");
  const activeCard = coverFlow.locator(
    '.cover-flow-card[aria-current="true"]',
  );
  const nextButton = coverFlow.getByRole("button", {
    name: "Next manuscript",
  });

  for (const index of [1, 2, 3, 4]) {
    await nextButton.click();
    await expect(activeCard).toHaveAttribute(
      "data-volume-href",
      catalog.volumes[index]!.href,
    );
  }

  const scroller = coverFlow.locator(".cover-flow-scroll");
  await expect
    .poll(
      () =>
        scroller.evaluate((element) =>
          Math.abs(
            Number(element.dataset.coverFlowTargetScroll) -
              Number(element.dataset.coverFlowVisualScroll),
          ),
        ),
      { timeout: 15_000 },
    )
    .toBeLessThan(0.06);

  const expectHoverZoom = async (cardIndex: number) => {
    const card = cards.nth(cardIndex);
    const cover = card.locator(".cover-flow-image-frame");
    const hoverPoint = await cover.evaluate((element) => {
      const card = element.closest(".cover-flow-card");
      const box = element.getBoundingClientRect();
      const yPositions = [0.2, 0.5, 0.8].map(
        (ratio) => box.top + box.height * ratio,
      );

      for (const y of yPositions) {
        const exposedXPositions: number[] = [];
        for (let x = box.left + 2; x < box.right - 2; x += 2) {
          if (
            document.elementFromPoint(x, y)?.closest(".cover-flow-card") ===
            card
          ) {
            exposedXPositions.push(x);
          }
        }
        if (exposedXPositions.length > 0) {
          return {
            x: exposedXPositions[Math.floor(exposedXPositions.length / 2)]!,
            y,
          };
        }
      }

      return null;
    });
    expect(hoverPoint).not.toBeNull();
    await page.mouse.move(hoverPoint!.x, hoverPoint!.y);

    await expect(card).toHaveClass(/\bis-read-cue\b/);
    await expect
      .poll(() =>
        cover.evaluate((element) => {
          const matrix = new DOMMatrixReadOnly(
            getComputedStyle(element).transform,
          );
          return Math.hypot(matrix.a, matrix.b);
        }),
      )
      .toBeGreaterThan(1.02);
  };

  await expectHoverZoom(4);
  await expectHoverZoom(3);
  await expectHoverZoom(5);
});

test("active details stay inside the carousel paint stage", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name === "mobile", "desktop layout only");

  for (const width of [1024, 1244, 1440, 1920]) {
    await page.setViewportSize({ height: 1000, width });
    await openCoverFlow(page);

    const activeCard = page.locator('.cover-flow-card[aria-current="true"]');
    const nextButton = page.getByRole("button", {
      name: "Next manuscript",
    });
    for (const index of [1, 2]) {
      await nextButton.click();
      await expect(activeCard).toHaveAttribute(
        "data-volume-href",
        catalog.volumes[index]!.href,
        { timeout: 15_000 },
      );
    }

    await expect
      .poll(
        () =>
          page.locator(".cover-flow-scroll").evaluate((scroller) =>
            Math.abs(
              Number(scroller.dataset.coverFlowTargetScroll) -
                Number(scroller.dataset.coverFlowVisualScroll),
            ),
          ),
        { timeout: 15_000 },
      )
      .toBeLessThan(0.06);

    const panel = activeCard.locator(".cover-flow-card-panel");
    await panel.scrollIntoViewIfNeeded();
    const geometry = await panel.evaluate((panelElement) => {
      const stage = panelElement.closest(".cover-flow-card-stage");
      if (!(stage instanceof HTMLElement)) {
        throw new Error("Cover flow paint stage is missing");
      }

      const panelBox = panelElement.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      const hit = document.elementFromPoint(
        panelBox.left + panelBox.width / 2,
        Math.min(panelBox.bottom - 2, window.innerHeight - 2),
      );

      return {
        hitInsidePanel: hit ? panelElement.contains(hit) : false,
        overflowY: getComputedStyle(stage).overflowY,
        panelBottom: panelBox.bottom,
        stageBottom: stageBox.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    expect(geometry.panelBottom).toBeLessThanOrEqual(
      geometry.viewportHeight + 2,
    );
    expect(geometry.hitInsidePanel, `panel bottom at ${width}px`).toBe(true);
    expect(
      geometry.overflowY === "visible" ||
        geometry.panelBottom <= geometry.stageBottom + 1,
      `panel must not cross a clipped stage at ${width}px`,
    ).toBe(true);
  }
});

test("cover flow scroll frames avoid transformed geometry reads", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop motion only");

  await page.setViewportSize(wideViewport);
  await openCoverFlow(page);

  const metrics = await page.locator(".cover-flow").evaluate(async (flow) => {
    const scroller = flow.querySelector<HTMLElement>(".cover-flow-scroll");
    const firstSnap = flow.querySelector<HTMLElement>(".cover-flow-snap");
    if (!scroller || !firstSnap) {
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
    const shellElements = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card-shell"),
    );
    const paintValues = () =>
      cardElements.map((card) => [
        card.style.getPropertyValue("--cover-flow-cover-shadow-strength"),
        card.style.getPropertyValue("--cover-flow-cover-wash-opacity"),
      ]);
    const shiftValues = () =>
      shellElements.map((shell) =>
        shell.style.getPropertyValue("--cover-flow-shift"),
      );

    for (let frame = 0; frame < 120; frame += 1) {
      const initialized =
        scroller.dataset.coverFlowVisualScroll !== undefined &&
        cardElements.every(
          (card) =>
            card.style.getPropertyValue(
              "--cover-flow-cover-shadow-strength",
            ) !== "" &&
            card.style.getPropertyValue("--cover-flow-cover-wash-opacity") !==
              "",
        );
      if (initialized) break;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }

    const paintValuesBefore = paintValues();
    const shiftsBefore = shiftValues();
    const nativeGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const previousScrollBehavior = scroller.style.scrollBehavior;
    const previousScrollSnapType = scroller.style.scrollSnapType;
    let rectReads = 0;
    Element.prototype.getBoundingClientRect = function (...args) {
      if (
        this instanceof Element &&
        this.matches(
          ".cover-flow-card, .cover-flow-card-shell, .cover-flow-image-frame",
        )
      ) {
        rectReads += 1;
      }
      return nativeGetBoundingClientRect.apply(this, args);
    };

    try {
      scroller.style.scrollBehavior = "auto";
      scroller.style.scrollSnapType = "none";
      scroller.scrollLeft += firstSnap.offsetWidth * 0.4;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      let stableFrames = 0;
      for (let frame = 0; frame < 180; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const target = Number(scroller.dataset.coverFlowTargetScroll);
        const visual = Number(scroller.dataset.coverFlowVisualScroll);
        stableFrames = Math.abs(target - visual) <= 0.06 ? stableFrames + 1 : 0;
        if (stableFrames >= 3) break;
      }
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

test("cover flow honors reduced motion without a trailing visual scroll", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop motion only");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ height: 1000, width: 1244 });
  await openCoverFlow(page);

  const state = await page.locator(".cover-flow-scroll").evaluate(
    async (scroller) => {
      for (let frame = 0; frame < 120; frame += 1) {
        if (
          scroller.dataset.coverFlowTargetScroll !== undefined &&
          scroller.dataset.coverFlowVisualScroll !== undefined
        ) {
          break;
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }

      scroller.style.scrollBehavior = "auto";
      scroller.style.scrollSnapType = "none";
      scroller.scrollLeft += 24;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );

      return {
        raw: scroller.scrollLeft,
        target: Number(scroller.dataset.coverFlowTargetScroll),
        visual: Number(scroller.dataset.coverFlowVisualScroll),
      };
    },
  );

  expect(state.target).toBeCloseTo(state.raw, 3);
  expect(state.visual).toBeCloseTo(state.raw, 3);
});

test("cover flow smooths small reversals without moving or reordering early", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop motion only");

  await page.setViewportSize({ height: 1000, width: 1244 });
  await openCoverFlow(page);

  const result = await page.locator(".cover-flow").evaluate(async (flow) => {
    const scroller = flow.querySelector<HTMLElement>(".cover-flow-scroll");
    const stage = flow.querySelector<HTMLElement>(".cover-flow-card-stage");
    const snaps = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-snap"),
    );
    const shells = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card-shell"),
    );
    const cards = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-card"),
    );
    const covers = cards.map((card) =>
      card.querySelector<HTMLElement>(".cover-flow-image-frame"),
    );
    if (
      !scroller ||
      !stage ||
      snaps.length !== 9 ||
      shells.length !== 9 ||
      covers.some((cover) => !cover)
    ) {
      throw new Error("Cover flow did not render its visual and snap layers");
    }

    const nextFrame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    const farCenter = () => {
      const box = covers[8]!.getBoundingClientRect();
      return box.left + box.width / 2;
    };
    const layers = () =>
      shells.map((shell) => getComputedStyle(shell).zIndex).join(",");
    const activeIndex = () =>
      cards.findIndex((card) => card.getAttribute("aria-current") === "true");
    const moveRawScroll = (target: number) => {
      scroller.scrollLeft = target;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    };
    const waitForSettlement = async () => {
      let stableFrames = 0;

      for (let frame = 0; frame < 180; frame += 1) {
        await nextFrame();
        const target = Number(scroller.dataset.coverFlowTargetScroll);
        const visual = Number(scroller.dataset.coverFlowVisualScroll);
        stableFrames = Math.abs(target - visual) <= 0.06 ? stableFrames + 1 : 0;
        if (stableFrames >= 3) return;
      }

      throw new Error("Cover flow did not settle");
    };
    const settleAt = async (target: number) => {
      moveRawScroll(target);
      await waitForSettlement();
      return farCenter();
    };
    const previousScrollBehavior = scroller.style.scrollBehavior;
    const previousScrollSnapType = scroller.style.scrollSnapType;
    scroller.style.scrollBehavior = "auto";
    scroller.style.scrollSnapType = "none";

    try {
      const middleSnap = snaps[4]!;
      const base =
        middleSnap.offsetLeft +
        middleSnap.offsetWidth / 2 -
        scroller.clientWidth / 2;
      const baseCenter = await settleAt(base);
      const baselineLayers = layers();
      const plusCenter = await settleAt(base + 12);
      await settleAt(base);
      const minusCenter = await settleAt(base - 12);
      await settleAt(base);

      moveRawScroll(base + 12);
      const immediateCenter = farCenter();
      await nextFrame();
      const firstFrameCenter = farCenter();
      await nextFrame();
      await nextFrame();
      const beforeReversal = farCenter();

      moveRawScroll(base - 12);
      const reversalImmediateCenter = farCenter();
      const reversalSamples = [reversalImmediateCenter];
      const reversalLayers = [layers()];
      const reversalActiveIndices = [activeIndex()];

      for (let frame = 0; frame < 180; frame += 1) {
        await nextFrame();
        reversalSamples.push(farCenter());
        reversalLayers.push(layers());
        reversalActiveIndices.push(activeIndex());
        if (
          Math.abs(
            Number(scroller.dataset.coverFlowTargetScroll) -
              Number(scroller.dataset.coverFlowVisualScroll),
          ) <= 0.06
        ) {
          break;
        }
      }

      return {
        activeIndex: activeIndex(),
        baseCenter,
        baselineLayers,
        beforeReversal,
        farRotation: Math.abs(
          Number.parseFloat(
            cards[8]!.style.getPropertyValue("--cover-flow-rotate"),
          ),
        ),
        farWidth: covers[8]!.getBoundingClientRect().width,
        firstFrameCenter,
        immediateCenter,
        minusCenter,
        plusCenter,
        referenceWidth: covers[6]!.getBoundingClientRect().width,
        reversalActiveIndices,
        reversalImmediateCenter,
        reversalLayers,
        reversalSamples,
        snapCount: snaps.length,
        stagePosition: getComputedStyle(stage).position,
      };
    } finally {
      scroller.style.scrollBehavior = previousScrollBehavior;
      scroller.style.scrollSnapType = previousScrollSnapType;
    }
  });

  const between = (value: number, first: number, second: number) =>
    value >= Math.min(first, second) && value <= Math.max(first, second);

  expect(result.snapCount).toBe(catalog.volumes.length);
  expect(result.stagePosition).toBe("absolute");
  expect(result.activeIndex).toBe(4);
  expect(result.farRotation).toBe(27);
  expect(Math.abs(result.farWidth - result.referenceWidth)).toBeLessThan(0.5);
  expect(Math.abs(result.immediateCenter - result.baseCenter)).toBeLessThan(
    0.1,
  );
  expect(
    between(result.firstFrameCenter, result.baseCenter, result.plusCenter),
  ).toBe(true);
  expect(
    between(result.beforeReversal, result.baseCenter, result.plusCenter),
  ).toBe(true);
  expect(Math.abs(result.beforeReversal - result.baseCenter)).toBeGreaterThan(
    0.01,
  );
  expect(
    Math.abs(result.reversalImmediateCenter - result.beforeReversal),
  ).toBeLessThan(0.1);
  expect(new Set(result.reversalLayers)).toEqual(
    new Set([result.baselineLayers]),
  );
  expect(new Set(result.reversalActiveIndices)).toEqual(new Set([4]));

  expect(
    result.reversalSamples.slice(1).some(
      (center) =>
        Math.abs(center - result.beforeReversal) > 0.01 &&
        Math.abs(center - result.minusCenter) > 0.01,
    ),
  ).toBe(true);

  let previousDistance = Math.abs(
    result.reversalSamples[0]! - result.minusCenter,
  );
  result.reversalSamples.forEach((center) => {
    expect(between(center, result.beforeReversal, result.minusCenter)).toBe(
      true,
    );
    const distance = Math.abs(center - result.minusCenter);
    expect(distance).toBeLessThanOrEqual(previousDistance + 0.05);
    previousDistance = distance;
  });
});

test("cover links keep native semantics and forward horizontal gestures", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop gestures only");
  test.setTimeout(90_000);

  await page.setViewportSize({ height: 1000, width: 1244 });
  await openCoverFlow(page);

  const scroller = page.locator(".cover-flow-scroll");
  const activeCard = page.locator('.cover-flow-card[aria-current="true"]');
  const coverLink = activeCard.locator(".cover-flow-cover-link");
  const panel = activeCard.locator(".cover-flow-card-panel");
  await coverLink.scrollIntoViewIfNeeded();

  const hitTarget = await coverLink.evaluate((link) => {
    const box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    const hitLink = hit?.closest("a");

    return {
      href: hitLink?.getAttribute("href") ?? null,
      pointerEvents: getComputedStyle(link).pointerEvents,
      tagName: hitLink?.tagName ?? null,
    };
  });

  expect(hitTarget.tagName).toBe("A");
  expect(hitTarget.href).toBe(await coverLink.getAttribute("href"));
  expect(hitTarget.pointerEvents).toBe("auto");

  const scrollBeforeModifiedClick = await scroller.evaluate(
    (element) => element.scrollLeft,
  );
  const modifiedInactiveClickWasPrevented = await page
    .locator('.cover-flow-card:not([aria-current="true"]) .cover-flow-cover-link')
    .first()
    .evaluate(
      (link) =>
        new Promise<boolean>((resolve) => {
          const box = link.getBoundingClientRect();
          document.addEventListener(
            "click",
            (event) => {
              const wasPrevented = event.defaultPrevented;
              event.preventDefault();
              resolve(wasPrevented);
            },
            { once: true },
          );
          link.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              button: 0,
              cancelable: true,
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
              metaKey: true,
            }),
          );
        }),
    );
  expect(modifiedInactiveClickWasPrevented).toBe(false);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await scroller.evaluate((element) => element.scrollLeft)).toBeCloseTo(
    scrollBeforeModifiedClick,
    2,
  );

  const resetScroll = async () => {
    await scroller.evaluate(async (element) => {
      const previousScrollBehavior = element.style.scrollBehavior;
      const previousScrollSnapType = element.style.scrollSnapType;
      element.style.scrollBehavior = "auto";
      element.style.scrollSnapType = "none";
      element.scrollLeft = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      element.style.scrollBehavior = previousScrollBehavior;
      element.style.scrollSnapType = previousScrollSnapType;
    });
    await expect
      .poll(() =>
        scroller.evaluate((element) => {
          const target = Number(element.dataset.coverFlowTargetScroll);
          const visual = Number(element.dataset.coverFlowVisualScroll);
          return (
            Math.abs(element.scrollLeft) <= 0.06 &&
            Math.abs(target) <= 0.06 &&
            Math.abs(visual) <= 0.06
          );
        }),
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(page.locator(".cover-flow-card").first()).toHaveAttribute(
      "aria-current",
      "true",
    );
  };
  const expectHorizontalGesture = async () => {
    await expect
      .poll(() =>
        scroller.evaluate((element) => getComputedStyle(element).scrollSnapType),
      )
      .toBe("x mandatory");
    await page.mouse.wheel(480, 0);
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        scroller.evaluate((element) => getComputedStyle(element).scrollSnapType),
      )
      .toBe("x mandatory");
    await expect
      .poll(() =>
        scroller.evaluate((element) =>
          Math.abs(
            Number(element.dataset.coverFlowTargetScroll) -
              Number(element.dataset.coverFlowVisualScroll),
          ),
        ),
        { timeout: 15_000 },
      )
      .toBeLessThan(0.06);
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(activeCard).not.toHaveAttribute(
      "data-volume-href",
      catalog.volumes[0]!.href,
    );
  };

  await resetScroll();
  await coverLink.hover();
  await expectHorizontalGesture();

  await resetScroll();
  await panel.hover();
  await expectHorizontalGesture();

  await resetScroll();
  const secondCoverLink = page
    .locator(".cover-flow-card")
    .nth(1)
    .locator(".cover-flow-cover-link");
  await secondCoverLink.click();
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    catalog.volumes[1]!.href,
    { timeout: 15_000 },
  );
  const activeCoverLink = activeCard.locator(".cover-flow-cover-link");
  const activeHref = await activeCoverLink.getAttribute("href");
  expect(activeHref).not.toBeNull();
  await activeCoverLink.click();
  await expect(page).toHaveURL(new URL(activeHref!, page.url()).href);
});

test("arrow commands queue from the native target while visuals settle", async ({
  page,
}) => {
  await page.setViewportSize({ height: 393, width: 852 });
  await openCoverFlow(page);

  const coverFlow = page.locator(".cover-flow");
  const activeCard = coverFlow.locator(
    '.cover-flow-card[aria-current="true"]',
  );
  const nextButton = coverFlow.getByRole("button", {
    name: "Next manuscript",
  });
  await activeCard.locator(".cover-flow-cover-link").scrollIntoViewIfNeeded();

  const railExtent = await coverFlow.evaluate((flow) => {
    const scroller = flow.querySelector<HTMLElement>(".cover-flow-scroll");
    const snaps = Array.from(
      flow.querySelectorAll<HTMLElement>(".cover-flow-snap"),
    );
    if (!scroller || snaps.length < 2) {
      throw new Error("Cover flow rail is incomplete");
    }

    return {
      actual: scroller.scrollWidth - scroller.clientWidth,
      expected: (snaps.length - 1) * snaps[0]!.offsetWidth,
    };
  });
  expect(Math.abs(railExtent.actual - railExtent.expected)).toBeLessThanOrEqual(
    1,
  );

  for (let index = 1; index <= 4; index += 1) {
    await nextButton.click();
    await expect(activeCard).toHaveAttribute(
      "data-volume-href",
      catalog.volumes[index]!.href,
      { timeout: 15_000 },
    );
  }

  await coverFlow.evaluate((flow) => {
    const next = flow.querySelector<HTMLButtonElement>(
      'button[aria-label="Next manuscript"]',
    );
    const previous = flow.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous manuscript"]',
    );
    if (!next || !previous) throw new Error("Cover flow arrows are missing");

    next.click();
    next.click();
    next.click();
    previous.click();
  });
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    catalog.volumes[6]!.href,
    { timeout: 15_000 },
  );

  await nextButton.evaluate((button) => {
    const next = button as HTMLButtonElement;
    next.click();
    next.click();
  });
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    catalog.volumes.at(-1)!.href,
    { timeout: 15_000 },
  );
  await expect(nextButton).toBeDisabled();
});

test("visible volume number stays in the URL hash", async ({ page }) => {
  const volumeEight = catalog.volumes[7]!;
  const volumeNine = catalog.volumes[8]!;
  const volumeThree = catalog.volumes[2]!;

  await openCoverFlow(page, `/${volumeHash(volumeEight.order)}`);
  const coverFlow = page.locator(".cover-flow");
  const activeCard = coverFlow.locator(
    '.cover-flow-card[aria-current="true"]',
  );
  const nextButton = coverFlow.getByRole("button", {
    name: "Next manuscript",
  });

  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    volumeEight.href,
    { timeout: 15_000 },
  );
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(volumeHash(volumeEight.order));
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(1);

  const historyLength = await page.evaluate(() => window.history.length);
  await nextButton.click();
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    volumeNine.href,
    { timeout: 15_000 },
  );
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(volumeHash(volumeNine.order));
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await page.reload();
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    volumeNine.href,
    { timeout: 15_000 },
  );

  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, volumeHash(volumeThree.order));
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    volumeThree.href,
    { timeout: 15_000 },
  );
  await page.goBack();
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    volumeNine.href,
    { timeout: 15_000 },
  );
});

test("legacy prefixed volume hashes remain valid", async ({ page }) => {
  const volumeSeven = catalog.volumes[6]!;

  await page.goto("/#volume-7");

  await expect(
    page.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("data-volume-href", volumeSeven.href);
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(volumeHash(volumeSeven.order));

  await page.goto("/#volume-vii");

  await expect(
    page.locator('.cover-flow-card[aria-current="true"]'),
  ).toHaveAttribute("data-volume-href", volumeSeven.href);
  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(volumeHash(volumeSeven.order));
});

test("portrait details shrink to fixed outline rows", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "portrait engines only");

  await page.setViewportSize({ height: 852, width: 393 });
  const volumeEight = catalog.volumes[7]!;
  await openCoverFlow(page, `/${volumeHash(volumeEight.order)}`);

  const activeCard = page.locator('.cover-flow-card[aria-current="true"]');
  const activePanel = activeCard.locator(".cover-flow-card-panel");
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    volumeEight.href,
    { timeout: 15_000 },
  );
  await expect(
    activePanel.locator(".manuscript-card-outline-full small"),
  ).toHaveCount(1);
  await expect(
    activePanel.locator(".manuscript-card-outline-part-button small"),
  ).toHaveCount(0);

  const outlineRowHeights = await page
    .locator(
      ".manuscript-card-outline-full, .manuscript-card-outline-part-button",
    )
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).offsetHeight),
    );
  expect(Math.min(...outlineRowHeights)).toBeGreaterThanOrEqual(44);
  expect(
    Math.max(...outlineRowHeights) - Math.min(...outlineRowHeights),
  ).toBeLessThanOrEqual(1);

  const readGeometry = () =>
    activeCard.evaluate((card) => {
      const cover = card.querySelector<HTMLElement>(".cover-flow-image-frame");
      const panel = card.querySelector<HTMLElement>(".cover-flow-card-panel");
      const outline = card.querySelector<HTMLElement>(
        ".cover-flow-card-panel-scroll",
      );
      const rows = Array.from(
        card.querySelectorAll<HTMLElement>(
          ".manuscript-card-outline-part-button",
        ),
      );
      const coverBox = cover?.getBoundingClientRect();
      const panelBox = panel?.getBoundingClientRect();
      const lastRowBox = rows.at(-1)?.getBoundingClientRect();
      if (!cover || !panel || !outline || !coverBox || !panelBox || !lastRowBox) {
        throw new Error("Portrait cover flow geometry is incomplete");
      }

      return {
        bottomGap: panelBox.bottom - lastRowBox.bottom,
        coverDocumentTop: coverBox.top + window.scrollY,
        coverHeight: coverBox.height,
        outlineOverflow: outline.scrollHeight - outline.clientHeight,
        panelHeight: panel.offsetHeight,
        panelOverflow: panel.scrollHeight - panel.clientHeight,
        rowHeights: rows.map((row) => row.offsetHeight),
      };
    });

  const compactGeometry = await readGeometry();
  expect(compactGeometry.panelHeight).toBeLessThan(
    compactGeometry.coverHeight * 0.85,
  );
  expect(compactGeometry.bottomGap).toBeLessThanOrEqual(36);
  expect(compactGeometry.outlineOverflow).toBeLessThanOrEqual(1);
  expect(compactGeometry.panelOverflow).toBeLessThanOrEqual(1);

  await activePanel
    .locator(".manuscript-card-outline-part-button")
    .first()
    .click();
  await expect(
    activePanel.getByRole("button", { name: "Back to parts" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      activePanel.evaluate((panel) => (panel as HTMLElement).offsetHeight),
    )
    .toBeGreaterThan(compactGeometry.panelHeight + outlineRowHeights[0]!);
  const expandedGeometry = await readGeometry();
  expect(expandedGeometry.panelHeight).toBeGreaterThan(
    compactGeometry.panelHeight + outlineRowHeights[0]!,
  );
  expect(
    Math.max(...expandedGeometry.rowHeights) -
      Math.min(...expandedGeometry.rowHeights),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      expandedGeometry.coverDocumentTop - compactGeometry.coverDocumentTop,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(expandedGeometry.coverHeight - compactGeometry.coverHeight),
  ).toBeLessThanOrEqual(1);
  await expect(
    activePanel.locator(".manuscript-card-outline-part-button small"),
  ).toHaveCount(0);

  await activePanel
    .getByRole("button", { name: "Back to parts" })
    .click();
  await expect
    .poll(() =>
      activePanel.evaluate((panel) => (panel as HTMLElement).offsetHeight),
    )
    .toBeLessThanOrEqual(compactGeometry.panelHeight + 1);
  const restoredGeometry = await readGeometry();
  expect(
    Math.abs(
      restoredGeometry.coverDocumentTop - compactGeometry.coverDocumentTop,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(restoredGeometry.coverHeight - compactGeometry.coverHeight),
  ).toBeLessThanOrEqual(1);
});

test("mobile hierarchy swaps do not transfer synthetic hover styling", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile touch only");

  await openCoverFlow(page, `/${volumeHash(3)}`);
  const activeCard = page.locator('.cover-flow-card[aria-current="true"]');
  const panel = activeCard.locator(".cover-flow-card-panel");
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    catalog.volumes[2]!.href,
  );
  await panel.scrollIntoViewIfNeeded();

  await panel.getByRole("button", { name: "The Reckoning" }).tap();
  const centralWound = panel.getByRole("link", {
    name: "The Central Wound",
  });
  const untouchedSibling = panel.getByRole("link", {
    name: "Coordination Failure",
  });
  await expect(centralWound).toBeVisible();
  await page.waitForTimeout(300);

  const visualState = await centralWound.evaluate((row, sibling) => {
    if (!(sibling instanceof HTMLElement)) {
      throw new Error("Comparison outline row is missing");
    }
    const readStyles = (element: Element) => {
      const rowStyle = getComputedStyle(element);
      const title = element.querySelector(".manuscript-card-outline-title");
      const label = title?.querySelector("span");
      return {
        backgroundColor: rowStyle.backgroundColor,
        borderColor: rowStyle.borderColor,
        color: rowStyle.color,
        labelDecorationColor: label
          ? getComputedStyle(label).textDecorationColor
          : null,
        titleTransform: title ? getComputedStyle(title).transform : null,
      };
    };

    return {
      focused: row.matches(":focus-visible"),
      hovered: row.matches(":hover"),
      row: readStyles(row),
      sibling: readStyles(sibling),
    };
  }, await untouchedSibling.elementHandle());

  expect(visualState.hovered).toBe(true);
  expect(visualState.focused).toBe(false);
  expect(visualState.row).toEqual(visualState.sibling);
});

test("wheel sessions keep vertical escape and fractional horizontal tails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop gestures only");

  await page.setViewportSize({ height: 1000, width: 1244 });
  await openCoverFlow(page);

  const panel = page.locator(
    '.cover-flow-card[aria-current="true"] .cover-flow-card-panel',
  );
  await panel.scrollIntoViewIfNeeded();
  const packets = await panel.evaluate(async (panelElement) => {
    const flow = panelElement.closest<HTMLElement>(".cover-flow");
    const scroller = flow?.querySelector<HTMLElement>(".cover-flow-scroll");
    if (!scroller) throw new Error("Cover flow scroller is missing");

    const dispatchWheel = (deltaX: number, deltaY: number) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY,
      });
      panelElement.dispatchEvent(event);
      return event.defaultPrevented;
    };

    dispatchWheel(12, 0);
    const afterHorizontal = scroller.scrollLeft;
    const snapAfterHorizontal = scroller.style.scrollSnapType;
    await new Promise((resolve) => window.setTimeout(resolve, 160));

    dispatchWheel(0.25, 0);
    const afterFractional = scroller.scrollLeft;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const snapAfterFractionalDelay = scroller.style.scrollSnapType;

    const verticalPrevented = dispatchWheel(0.8, 30);
    const afterVertical = scroller.scrollLeft;
    await new Promise((resolve) => window.setTimeout(resolve, 170));

    return {
      afterFractional,
      afterHorizontal,
      afterVertical,
      snapAfterFractionalDelay,
      snapAfterHorizontal,
      snapAfterVertical: getComputedStyle(scroller).scrollSnapType,
      verticalPrevented,
    };
  });

  expect(packets.afterHorizontal).toBeGreaterThan(0);
  expect(packets.snapAfterHorizontal).toBe("none");
  expect(packets.afterFractional).toBeGreaterThanOrEqual(
    packets.afterHorizontal,
  );
  expect(packets.snapAfterFractionalDelay).toBe("none");
  expect(packets.afterVertical).toBeCloseTo(packets.afterFractional, 2);
  expect(packets.snapAfterVertical).toBe("x mandatory");
  expect(packets.verticalPrevented).toBe(false);
});

test("small horizontal wheel packets reach the final manuscript", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop gestures only");
  test.setTimeout(60_000);

  await page.setViewportSize({ height: 1000, width: 1244 });
  await openCoverFlow(page);

  const coverFlow = page.locator(".cover-flow");
  const scroller = coverFlow.locator(".cover-flow-scroll");
  const activeCard = coverFlow.locator(
    '.cover-flow-card[aria-current="true"]',
  );
  const activeCover = activeCard.locator(".cover-flow-cover-link");
  const nextButton = coverFlow.getByRole("button", {
    name: "Next manuscript",
  });
  await activeCover.scrollIntoViewIfNeeded();
  await activeCover.hover();

  await expect
    .poll(() =>
      scroller.evaluate((element) => getComputedStyle(element).scrollSnapType),
    )
    .toBe("x mandatory");

  await activeCover.evaluate(async (cover) => {
    for (let packet = 0; packet < 96; packet += 1) {
      cover.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 18,
          deltaY: 0,
        }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
  });

  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    catalog.volumes.at(-1)!.href,
    { timeout: 15_000 },
  );
  await expect(nextButton).toBeDisabled();
  await expect
    .poll(() =>
      scroller.evaluate(
        (element) =>
          Math.abs(
            element.scrollWidth - element.clientWidth - element.scrollLeft,
          ),
      ),
    )
    .toBeLessThan(1);
  await expect
    .poll(() =>
      scroller.evaluate((element) => getComputedStyle(element).scrollSnapType),
    )
    .toBe("x mandatory");
  await expect
    .poll(
      () =>
        scroller.evaluate((element) =>
          Math.abs(
            Number(element.dataset.coverFlowTargetScroll) -
              Number(element.dataset.coverFlowVisualScroll),
          ),
        ),
      { timeout: 15_000 },
    )
    .toBeLessThan(0.06);
});

test("mobile cover and panel touch gestures feed the native snap rail", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile touch only");

  await openCoverFlow(page);
  const coverFlow = page.locator(".cover-flow");
  const scroller = coverFlow.locator(".cover-flow-scroll");
  const activeCard = coverFlow.locator(
    '.cover-flow-card[aria-current="true"]',
  );
  const panel = activeCard.locator(".cover-flow-card-panel");
  await panel.scrollIntoViewIfNeeded();

  const containment = await panel.evaluate((panelElement) => {
    const flow = panelElement.closest<HTMLElement>(".cover-flow");
    const stage = panelElement.closest<HTMLElement>(".cover-flow-card-stage");
    if (!flow || !stage) throw new Error("Cover flow layout is missing");

    const panelBox = panelElement.getBoundingClientRect();
    const flowBox = flow.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const hit = document.elementFromPoint(
      panelBox.left + panelBox.width / 2,
      Math.min(panelBox.bottom - 2, window.innerHeight - 2),
    );

    return {
      documentHasNoHorizontalOverflow:
        document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
      flowBottom: flowBox.bottom,
      hitInsidePanel: hit ? panelElement.contains(hit) : false,
      panelBottom: panelBox.bottom,
      stageBottom: stageBox.bottom,
    };
  });

  expect(containment.panelBottom).toBeLessThanOrEqual(
    containment.stageBottom + 1,
  );
  expect(containment.panelBottom).toBeLessThanOrEqual(
    containment.flowBottom + 1,
  );
  expect(containment.hitInsidePanel).toBe(true);
  expect(containment.documentHasNoHorizontalOverflow).toBe(true);

  const gesture = await panel.evaluate((panelElement) => {
    const flow = panelElement.closest<HTMLElement>(".cover-flow");
    const scrollerElement = flow?.querySelector<HTMLElement>(
      ".cover-flow-scroll",
    );
    const panelBox = panelElement.getBoundingClientRect();
    if (!scrollerElement) throw new Error("Cover flow scroller is missing");

    const touch = (identifier: number, clientX: number, clientY: number) => ({
      clientX,
      clientY,
      identifier,
      pageX: clientX,
      pageY: clientY,
      screenX: clientX,
      screenY: clientY,
      target: panelElement,
    });
    const touchList = (touches: ReturnType<typeof touch>[]) => ({
      0: touches[0],
      item: (index: number) => touches[index] ?? null,
      length: touches.length,
    });
    const dispatchTouch = (
      type: string,
      touches: ReturnType<typeof touch>[],
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        configurable: true,
        value: touchList(touches),
      });
      panelElement.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const startX = panelBox.left + panelBox.width / 2;
    const startY = panelBox.top + Math.min(panelBox.height / 2, 90);

    dispatchTouch("touchstart", [touch(1, startX, startY)]);
    const verticalPrevented = dispatchTouch("touchmove", [
      touch(1, startX + 2, startY - 80),
    ]);
    dispatchTouch("touchend", []);
    const afterVertical = scrollerElement.scrollLeft;

    dispatchTouch("touchstart", [touch(2, startX, startY)]);
    dispatchTouch("touchmove", [
      touch(2, startX - 140, startY + 2),
    ]);
    const afterHorizontal = scrollerElement.scrollLeft;
    const snapTypeDuringHorizontal = scrollerElement.style.scrollSnapType;
    dispatchTouch("touchend", []);

    for (let index = 3; index <= 9; index += 1) {
      dispatchTouch("touchstart", [touch(index, startX, startY)]);
      dispatchTouch("touchmove", [
        touch(index, startX - 140, startY + 2),
      ]);
      dispatchTouch("touchend", []);
    }
    const afterRepeatedHorizontal = scrollerElement.scrollLeft;
    const maxScrollLeft =
      scrollerElement.scrollWidth - scrollerElement.clientWidth;

    return {
      afterHorizontal,
      afterRepeatedHorizontal,
      afterVertical,
      maxScrollLeft,
      snapTypeDuringHorizontal,
      touchAction: getComputedStyle(panelElement).touchAction,
      verticalPrevented,
    };
  });

  expect(gesture.afterVertical).toBeLessThan(1);
  expect(gesture.verticalPrevented).toBe(false);
  expect(gesture.afterHorizontal).toBeGreaterThan(100);
  expect(gesture.afterRepeatedHorizontal).toBeGreaterThanOrEqual(
    gesture.maxScrollLeft - 1,
  );
  expect(gesture.snapTypeDuringHorizontal).toBe("none");
  expect(gesture.touchAction).toBe("pan-y");
  await expect
    .poll(async () => {
      const state = await scroller.evaluate((element) => ({
        target: Number(element.dataset.coverFlowTargetScroll),
        visual: Number(element.dataset.coverFlowVisualScroll),
      }));
      return Math.abs(state.target - state.visual);
    }, { timeout: 15_000 })
    .toBeLessThan(0.06);
  await expect(activeCard).toHaveAttribute(
    "data-volume-href",
    catalog.volumes.at(-1)!.href,
    { timeout: 15_000 },
  );
});
