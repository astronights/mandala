import { expect, test, type Page } from "@playwright/test";

const pieces = (page: Page) => page.locator("main svg[role=img] path[data-index]");
const symmetry = (page: Page) => page.getByRole("group", { name: "Lines of symmetry" });

async function colouredCount(page: Page) {
  return pieces(page).evaluateAll(
    (els) => els.filter((el) => el.getAttribute("fill") !== "var(--paper)").length,
  );
}

/** Pick a repeated motif piece away from the centre that is actually on top. */
async function tapTarget(page: Page) {
  const index = await page.evaluate(() => {
    const svg = document.querySelector("main svg[role=img]")!;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-index]"));
    for (const p of paths) {
      if (!p.dataset.group?.endsWith("-motif") || !p.getAttribute("transform")) continue;
      const r = p.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (document.elementFromPoint(x, y) === p) return p.dataset.index!;
    }
    return null;
  });
  expect(index).not.toBeNull();
  return page.locator(`main svg[role=img] path[data-index="${index}"]`);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(pieces(page).first()).toBeVisible();
});

test("shows a single mandala for today and nothing to browse", async ({ page }) => {
  const today = await page.evaluate(() =>
    new Date().toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  );
  await expect(page.getByTestId("today")).toHaveText(today);
  await expect(page.locator("main svg[role=img]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /previous day|next day/i })).toHaveCount(0);
  await expect(page.getByText(/past days|coming up/i)).toHaveCount(0);
});

test("a tap at full symmetry colours many pieces; off colours one", async ({ page }) => {
  const target = await tapTarget(page);
  await target.click();
  const full = await colouredCount(page);
  expect(full).toBeGreaterThanOrEqual(6);

  await page.getByRole("button", { name: "Undo" }).click();
  expect(await colouredCount(page)).toBe(0);

  await symmetry(page).getByRole("button", { name: "No symmetry" }).click();
  await expect(page.getByText("One piece at a time")).toBeVisible();
  await target.click();
  expect(await colouredCount(page)).toBe(1);
});

test("fewer lines of symmetry colour fewer pieces", async ({ page }) => {
  const target = await tapTarget(page);
  await target.click();
  const full = await colouredCount(page);
  await page.getByRole("button", { name: "Clear" }).click();

  await symmetry(page).getByRole("button", { name: "1 line" }).click();
  await target.click();
  const one = await colouredCount(page);
  expect(one).toBeGreaterThanOrEqual(1);
  expect(one).toBeLessThanOrEqual(2);
  expect(one).toBeLessThan(full);
});

test("colouring survives a reload, and so does the symmetry choice", async ({ page }) => {
  await symmetry(page).getByRole("button", { name: "2 lines" }).click();
  await (await tapTarget(page)).click();
  const before = await colouredCount(page);
  expect(before).toBeGreaterThan(0);

  await page.reload();
  await expect(pieces(page).first()).toBeVisible();
  await expect.poll(() => colouredCount(page)).toBe(before);
  await expect(symmetry(page).getByRole("button", { name: "2 lines" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("theme button cycles and the choice persists", async ({ page }) => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = page.getByRole("button", { name: /^Theme:/ });
  await theme.click(); // automatic → light
  await expect.poll(bg).toBe("rgb(246, 242, 234)");
  await theme.click(); // light → dark
  await expect.poll(bg).toBe("rgb(21, 23, 27)");
  await page.reload();
  await expect.poll(bg).toBe("rgb(21, 23, 27)");
});

test("fits the screen without horizontal scrolling", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.reload();
  await expect(pieces(page).first()).toBeVisible();
  await (await tapTarget(page)).click();
  expect(errors).toEqual([]);
});
