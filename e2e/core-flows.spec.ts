import { expect, test } from "@playwright/test";

test.describe("Or Zarua core flows", () => {
  test("loads today and Shabbat times", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { name: /Keep sacred time/i })).toBeVisible();
    await expect(page.locator("#today-hebrew")).not.toHaveText("Loading Hebrew date…", { timeout: 20_000 });
    await expect(page.locator("#today-hebrew")).not.toHaveText("Hebrew date unavailable");
    await expect(page.locator("#shabbat-content")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#candle-time")).not.toHaveText("—");
    await expect(page.locator("#havdalah-time")).not.toHaveText("—");
  });

  test("converts a Gregorian date", async ({ page }) => {
    await page.goto("./");
    await page.locator("#gregorian-date").fill("2026-10-02");
    await page.getByRole("button", { name: /Convert date/i }).first().click();
    await expect(page.locator("#conversion-content")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#result-hebrew")).toContainText("Tishrei");
  });

  test("switches Shabbat city without leaving a stuck loading state", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("#shabbat-content")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "New York" }).click();
    await page.getByRole("button", { name: "London" }).click();
    await expect(page.locator("#shabbat-loading")).toBeHidden({ timeout: 20_000 });
    await expect(page.locator("#location-title")).toContainText(/London|United Kingdom/i, { timeout: 20_000 });
    await expect(page.locator("#candle-time")).not.toHaveText("—");
  });

  test("saves a remembrance and exports JSON", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: /Add a remembrance/i }).click();
    await page.locator("#remembrance-name").fill("Portfolio Test Rivka");
    await page.locator("#remembrance-date").fill("2020-01-07");
    await page.getByRole("button", { name: "Save remembrance" }).click();
    await expect(page.locator("#remembrance-summary")).toContainText(/1 saved remembrance/i, { timeout: 20_000 });
    await expect(page.locator(".remembrance-card h3")).toHaveText("Portfolio Test Rivka");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/remembrances\.json$/i);
  });
});
