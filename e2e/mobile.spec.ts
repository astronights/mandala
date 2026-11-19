import { expect, test, type Page } from "@playwright/test";

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone-only");
  // A typical modern phone with browser chrome showing (iPhone 13/14 class).
  test.use({ viewport: { width: 390, height: 664 } });

  const art = (page: Page) => page.getByTestId("zoom-pan");
  const viewBox = (page: Page) => art(page).locator("svg[role=img]").getAttribute("viewBox");
  const coloured = (page: Page) =>
    page
      .locator("main svg path[data-index]")
      .evaluateAll((els) => els.filter((e) => e.getAttribute("fill") !== "var(--paper)").length);

  /** A real two-finger pinch through the Chrome DevTools Protocol. */
  async function pinch(page: Page, from: number, to: number) {
    const box = (await art(page).boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const points = (d: number) => [
      { x: cx - d / 2, y: cy, id: 0 },
      { x: cx + d / 2, y: cy, id: 1 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: points(from + ((to - from) * i) / 10),
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main svg path[data-index]").first()).toBeVisible();
  });

  test("the mandala fills the width and every control fits on one screen", async ({ page }) => {
    const vw = page.viewportSize()!.width;
    const box = (await art(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(vw - 1);
    const progress = (await page.getByTestId("progress").boundingBox())!;
    expect(progress.y + progress.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    // No vertical scrolling needed on a typical phone.
    const scroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(scroll).toBeLessThanOrEqual(0);
  });

  test("tap targets are at least 40px", async ({ page }) => {
    const targets = page.locator(
      "main [role=radio], main [role=group] button, main button:has-text('Undo'), main button[aria-label^='Theme']",
    );
    for (const b of await targets.all()) {
      const r = (await b.boundingBox())!;
      expect(
        Math.min(r.width, r.height),
        (await b.getAttribute("aria-label")) ?? (await b.textContent()) ?? "",
      ).toBeGreaterThanOrEqual(36);
      expect(r.height).toBeGreaterThanOrEqual(36);
    }
  });

  test("pinch zooms in without colouring, a tap still colours, and reset zooms out", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Free" }).tap();
    await pinch(page, 60, 240);
    const vb = (await viewBox(page))!.split(" ").map(Number);
    expect(vb[2]).toBeLessThan(500);
    expect(await coloured(page)).toBe(0);

    const box = (await art(page).boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => coloured(page)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Show the whole mandala" }).tap();
    expect(await viewBox(page)).toBe("-500 -500 1000 1000");
  });

  test("the page itself doesn't scroll sideways or zoom while pinching the mandala", async ({
    page,
  }) => {
    await pinch(page, 60, 240);
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(scale).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("offers a home-screen manifest and icons", async ({ request, page }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Mandala", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
  await page.goto("/");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /apple-icon\.png/,
  );
});
