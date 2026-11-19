import { expect, test } from "@playwright/test";

test("reports anonymous progress after colouring, and nothing for just visiting", async ({
  page,
}) => {
  const reports: Record<string, unknown>[] = [];
  await page.route("/api/play", async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await expect(page.locator("main svg path[data-index]").first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  expect(reports).toHaveLength(0);

  await page.getByRole("button", { name: "Free" }).click();
  await page.locator('main svg path[data-group="r0-base"]').click({ force: true });
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({ mode: "free", version: 1, completed: false });
  expect(String(reports[0].deviceId)).toMatch(/^[0-9a-f-]{36}$/);
  expect(Number(reports[0].progress)).toBeGreaterThan(0);
});

test("sends nothing when the browser asks not to be tracked", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true }),
  );
  let sent = 0;
  await page.route("/api/play", (route) => {
    sent++;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Free" }).click();
  await page.locator('main svg path[data-group="r0-base"]').click({ force: true });
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(300);
  expect(sent).toBe(0);
});

test("the play endpoint accepts reports quietly without a database", async ({ request }) => {
  const res = await request.post("/api/play", { data: { anything: true } });
  expect(res.status()).toBe(204);
});
