import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");

test.describe("documentation screenshots", () => {
  test("capture portfolio screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./");
    await expect(page.locator("#today-hebrew")).not.toHaveText("Loading Hebrew date…", { timeout: 20_000 });
    await expect(page.locator("#shabbat-content")).toBeVisible({ timeout: 20_000 });

    await page.locator(".hero").screenshot({ path: path.join(docsDir, "hero.png") });
    await page.locator("#converter").screenshot({ path: path.join(docsDir, "converter.png") });
    await page.locator("#shabbat").screenshot({ path: path.join(docsDir, "shabbat.png") });

    await page.getByRole("button", { name: /Add a remembrance/i }).click();
    await page.locator("#remembrance-name").fill("Rivka bat Avraham");
    await page.locator("#remembrance-date").fill("2020-01-07");
    await page.getByRole("button", { name: "Save remembrance" }).click();
    await expect(page.locator(".remembrance-card")).toBeVisible({ timeout: 20_000 });
    await page.locator("#remembrances").screenshot({ path: path.join(docsDir, "remembrances.png") });
  });
});
