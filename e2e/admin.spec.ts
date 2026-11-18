import { expect, test, type Page } from "@playwright/test";
import { ADMIN_PASSWORD } from "../playwright.config";

async function signIn(page: Page, passcode = ADMIN_PASSWORD) {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Passcode").fill(passcode);
  await page.getByRole("button", { name: "Enter" }).click();
}

test.describe("admin", () => {
  test("sends visitors to the passcode screen", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
    await expect(page.getByLabel("Passcode")).toBeFocused();
  });

  test("keeps the activity API closed without a session", async ({ request }) => {
    const res = await request.get("/api/admin/activity");
    expect(res.status()).toBe(401);
  });

  test("rejects a wrong passcode", async ({ page }) => {
    await signIn(page, "definitely-wrong");
    await expect(page).toHaveURL(/error=wrong/);
    await expect(page.locator("#login-error")).toHaveText("That passcode isn't right.");
    await expect(page.getByLabel("Passcode")).toHaveAttribute("aria-invalid", "true");
  });

  test("signs in once, then shows activity and patterns", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("button", { name: "Activity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // E2E runs without a database.
    await expect(page.getByText("No database is connected yet.")).toBeVisible();

    await page.getByRole("button", { name: "Patterns" }).click();
    await expect(page.getByText("live today")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Past days" })).toBeVisible();
    await expect(page.locator("main svg[role=img]")).toHaveCount(21);

    // Signed in: the passcode screen is skipped.
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("the session cookie is HTTP-only and strict", async ({ page, context }) => {
    await signIn(page);
    const cookie = (await context.cookies()).find((c) => c.name === "mandala_admin");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict" });
    // Stays signed in for about a year; there's no sign-out.
    expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(360 * 86_400_000);
  });

  test("is excluded from search engines", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
