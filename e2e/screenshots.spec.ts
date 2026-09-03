import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");

test.describe("documentation screenshots", () => {
  test("capture portfolio screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");

    // Wait for hero to load
    await expect(page.getByText("Hebrew date unavailable")).toBeHidden({ timeout: 20_000 });
    await page.locator("#top").screenshot({ path: path.join(docsDir, "hero.png") });

    // Converter
    await page.locator("#converter").screenshot({ path: path.join(docsDir, "converter.png") });

    // Shabbat
    await expect(page.getByText("Candle lighting")).toBeVisible({ timeout: 20_000 });
    await page.locator("#shabbat").screenshot({ path: path.join(docsDir, "shabbat.png") });

    // Calendar
    await page.locator("#calendar").screenshot({ path: path.join(docsDir, "calendar.png") });

    // Zmanim
    await page.locator("#zmanim").screenshot({ path: path.join(docsDir, "zmanim.png") });

    // Remembrances — add one first
    await page.getByRole("button", { name: /Add a remembrance/i }).click();
    await page.getByLabel("Name").fill("Rivka bat Avraham");
    await page.getByLabel("Original Gregorian date").fill("2020-01-07");
    await page.getByRole("button", { name: "Save remembrance" }).click();
    await expect(page.getByText("Rivka bat Avraham")).toBeVisible({ timeout: 20_000 });
    await page.locator("#remembrances").screenshot({ path: path.join(docsDir, "remembrances.png") });
  });
});