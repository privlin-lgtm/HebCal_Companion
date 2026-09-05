import { expect, test } from "@playwright/test";

test.describe("Or Zarua core flows", () => {
  test("loads the hero with today's Hebrew date", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { name: /Keep sacred time/i })).toBeVisible();
    // Hebrew date should load (not show "unavailable")
    await expect(page.getByText("Hebrew date unavailable")).toBeHidden({ timeout: 20_000 });
  });

  test("converts a Gregorian date to Hebrew", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByText("Find your place in time")).toBeVisible();
    // Fill the Gregorian date input
    const dateInput = page.getByLabel("Gregorian date");
    await dateInput.fill("2026-10-02");
    await page.getByRole("button", { name: /Convert date/i }).first().click();
    // Result should appear (not the empty state)
    await expect(page.getByText("Choose a date to begin")).toBeHidden({ timeout: 15_000 });
  });

  test("switches converter to Hebrew-to-Gregorian tab", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("tab", { name: "Hebrew to Gregorian" }).click();
    await expect(page.getByLabel("Hebrew month", { exact: true })).toBeVisible();
  });

  test("loads Shabbat times for the default city", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByText("Welcome Shabbat")).toBeVisible();
    // Shabbat content should load (not show error)
    await expect(page.getByText("Unable to load Shabbat times")).toBeHidden({ timeout: 20_000 });
    // Should show candle lighting and havdalah labels
    await expect(page.getByText("Candle lighting")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Havdalah", { exact: true })).toBeVisible();
  });

  test("switches Shabbat city", async ({ page }) => {
    await page.goto("./");
    // Wait for initial load
    await expect(page.getByText("Candle lighting")).toBeVisible({ timeout: 20_000 });
    // Click New York chip
    await page.getByRole("button", { name: "New York" }).click();
    // Wait for loading to finish and content to show
    await expect(page.getByText("Finding local times")).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText("Candle lighting")).toBeVisible();
  });

  test("saves a remembrance and exports", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByText("Remember with intention")).toBeVisible();
    // Open dialog
    await page.getByRole("button", { name: /Add a remembrance/i }).click();
    // Fill form
    await page.getByLabel("Name").fill("Portfolio Test Rivka");
    await page.getByLabel("Original Gregorian date").fill("2020-01-07");
    await page.getByRole("button", { name: "Save remembrance" }).click();
    // Should show the saved remembrance
    await expect(page.getByText("Portfolio Test Rivka")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/1 saved remembrance/i)).toBeVisible();
    // Export
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/remembrances\.json$/i);
  });

  test("shows the Hebrew calendar month view", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByText("Hebrew month view")).toBeVisible();
    // Should show weekday headers
    await expect(page.getByText("Sun", { exact: true })).toBeVisible();
  });

  test("shows zmanim panel", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByText("Halachic times today")).toBeVisible();
    // Should show some zmanim labels
    await expect(page.getByText("Sunrise")).toBeVisible({ timeout: 20_000 });
  });

  test("shows the weekly holiday guide", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByText("Whats coming up")).toBeVisible();
  });
});