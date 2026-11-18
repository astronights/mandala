import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config";

test.describe("admin", () => {
  test("asks for credentials", async ({ request }) => {
    const res = await request.get("/admin");
    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"]).toContain("Basic");
  });

  test("rejects a wrong password", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      baseURL,
      httpCredentials: { username: "admin", password: "wrong" },
    });
    const res = await (await ctx.newPage()).goto("/admin");
    expect(res?.status()).toBe(401);
    await ctx.close();
  });

  test("shows history and upcoming days with the right password", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      baseURL,
      httpCredentials: { username: "admin", password: ADMIN_PASSWORD },
    });
    const page = await ctx.newPage();
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("live today")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Past days" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
    await expect(page.locator("main svg[role=img]")).toHaveCount(21);

    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByRole("button", { name: "back to today" })).toBeVisible();
    await ctx.close();
  });

  test("is excluded from search engines", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      baseURL,
      httpCredentials: { username: "admin", password: ADMIN_PASSWORD },
    });
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await ctx.close();
  });
});
