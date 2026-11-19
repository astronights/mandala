import { expect, test, type Page } from "@playwright/test";

const art = (page: Page) => page.getByTestId("zoom-pan");

async function tapGlowingPiece(page: Page) {
  const point = await page.evaluate(() => {
    for (const p of document.querySelectorAll<SVGPathElement>("main svg path[data-index]")) {
      if (!p.getAttribute("fill")?.startsWith("color-mix")) continue;
      p.scrollIntoView({ block: "center" });
      const r = p.getBoundingClientRect();
      if (r.width < 6) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (document.elementFromPoint(x, y) === p) return { x, y };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main svg path[data-index]").first()).toBeVisible();
});

test("finishing guided colouring early reveals the design and counts down to tomorrow", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "I’m done" })).toHaveCount(0);
  await tapGlowingPiece(page);
  await page.getByRole("button", { name: "I’m done" }).click();

  await expect(page.getByText("Today’s mandala is complete")).toBeVisible();
  await expect(page.getByTestId("countdown")).toHaveText(/^(\d+h )?\d+m$|less than a minute/);
  // The rest of the design blooms in: no bare paper left.
  await expect
    .poll(() =>
      page
        .locator("main svg path[data-index]")
        .evaluateAll((els) => els.filter((e) => e.getAttribute("fill") === "var(--paper)").length),
    )
    .toBe(0);

  // Still finished when reopened today.
  await page.reload();
  await expect(page.getByText("Today’s mandala is complete")).toBeVisible();

  // Free colouring is offered as something to do next.
  await page.getByRole("button", { name: "Colour it freely" }).click();
  await expect(page.getByRole("button", { name: "Free" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "Eraser" })).toBeVisible();
});

test("draw mode mirrors a stroke, then finishes", async ({ page, isMobile }) => {
  await page.getByRole("button", { name: "Draw" }).click();
  const surface = page.getByTestId("draw-surface");
  await expect(surface).toBeVisible();
  await art(page).scrollIntoViewIfNeeded();

  const box = (await art(page).boundingBox())!;
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const;
  if (isMobile) {
    // One finger draws (pinching is covered in mobile.spec).
    const cdp = await page.context().newCDPSession(page);
    const pt = (fx: number, fy: number) => {
      const [x, y] = at(fx, fy);
      return [{ x, y, id: 0 }];
    };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(0.55, 0.3) });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: pt(0.55 + i * 0.02, 0.3 + i * 0.015),
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(...at(0.55, 0.3));
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(...at(0.55 + i * 0.02, 0.3 + i * 0.015));
    await page.mouse.up();
  }

  await expect(page.getByTestId("stroke-count")).toHaveText("1 stroke");
  const copies = await page.getByTestId("strokes").locator("path").count();
  expect(copies).toBeGreaterThanOrEqual(12); // mirrored all round by default

  // The view didn't pan or zoom while drawing.
  expect(await art(page).locator("svg[role=img]").getAttribute("viewBox")).toBe(
    "-500 -500 1000 1000",
  );

  await page.reload();
  await expect(page.getByTestId("stroke-count")).toHaveText("1 stroke");
  await page.getByRole("button", { name: "I’m done" }).click();
  await expect(page.getByText("Today’s drawing is complete")).toBeVisible();
  await page.getByRole("button", { name: "Keep drawing" }).click();
  await expect(page.getByTestId("draw-surface")).toBeVisible();
});
