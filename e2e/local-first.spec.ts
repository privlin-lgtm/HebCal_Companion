/**
 * Local-first offline persistence and deterministic two-context sync E2E.
 *
 * These tests run against the production build served by `vite preview` and
 * must never touch a real Supabase account:
 *
 * - The web server builds with `VITE_SUPABASE_URL` and
 *   `VITE_SUPABASE_ANON_KEY` empty and `VITE_E2E_TEST_HOOK=1`
 *   (see `playwright.config.ts`).
 * - The sync scenario injects a fake in-memory relay (see `./testSync.ts`)
 *   shared between two isolated browser contexts through Node-side bridge
 *   functions, while the app still uses its real crypto, repository,
 *   coordinator, and UI.
 *
 * Everything is driven through the UI ("Sync now" button) and asserted from
 * both the DOM and IndexedDB, so the tests are deterministic.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createE2eRelay, installFakeSyncHook } from "./testSync";

const REMEMBRANCE_DB_NAME = "or-zarua-remembrances";
const PASSPHRASE = "e2e-passphrase-12345";
const SYNC_NAME = "E2E Rivka bat Avraham";
const SYNC_DATE = "2020-01-07";

type RecordRow = {
  id: string;
  record: { name: string } | null;
  deleted: boolean;
  version: { counter: number; deviceId: string };
};

type MetadataRow = { key: string; value: unknown };

/** Reads the local `records` store so assertions are made at the storage layer. */
async function readRecords(page: Page): Promise<RecordRow[]> {
  return page.evaluate(async (dbName) => {
    const open = indexedDB.open(dbName, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<RecordRow[]>((resolve, reject) => {
        const tx = db.transaction("records", "readonly");
        const req = tx.objectStore("records").getAll();
        req.onsuccess = () => resolve(req.result as RecordRow[]);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }, REMEMBRANCE_DB_NAME);
}

/** Reads the local `metadata` store (device id, cursor, lamport, …). */
async function readMetadata(page: Page): Promise<MetadataRow[]> {
  return page.evaluate(async (dbName) => {
    const open = indexedDB.open(dbName, 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<MetadataRow[]>((resolve, reject) => {
        const tx = db.transaction("metadata", "readonly");
        const req = tx.objectStore("metadata").getAll();
        req.onsuccess = () => resolve(req.result as MetadataRow[]);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }, REMEMBRANCE_DB_NAME);
}

async function addRemembrance(page: Page, name: string) {
  await page.getByRole("button", { name: /Add a remembrance/i }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Original Gregorian date").fill(SYNC_DATE);
  await page.getByRole("button", { name: "Save remembrance" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });
}

test.describe("local-first offline persistence", () => {
  test("keeps an offline-created remembrance across a reload", async ({ browser }) => {
    // The preview origin stays reachable (the app shell); every external
    // request (Supabase, Hebcal API, geocoding) is aborted — i.e. the app is
    // "offline" relative to the internet. Service workers are blocked so a
    // stale cache cannot mask the reload behaviour.
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();

    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:4173") return route.continue();
      return route.abort();
    });

    await page.goto("./");
    await expect(page.getByText("Remember with intention")).toBeVisible();

    // Supabase is unset in the E2E build → the sync panel must not appear.
    await expect(page.getByText("Sync across devices")).toHaveCount(0);

    // Create a remembrance while "offline".
    await addRemembrance(page, "Offline Rivka bat Avraham");
    await expect(page.getByText(/1 saved remembrance/i)).toBeVisible();

    // Reload with the network still blocked: IndexedDB is the source of truth.
    await page.reload();
    await expect(page.getByText("Remember with intention")).toBeVisible();
    await expect(page.getByText("Offline Rivka bat Avraham")).toBeVisible({ timeout: 20_000 });

    // Deletes are persisted locally too: tombstone survives a reload.
    await page.getByRole("button", { name: "Delete Offline Rivka bat Avraham" }).click();
    await expect(page.getByText("Offline Rivka bat Avraham")).toBeHidden();
    await page.reload();
    await expect(page.getByText("Offline Rivka bat Avraham")).toBeHidden({ timeout: 20_000 });

    await context.close();
  });
});

test.describe("two-context sync via a fake relay", () => {
  test("propagates a create, then a delete, across isolated contexts", async ({ browser }) => {
    // The relay lives in this test's Node process and is shared by both
    // Playwright contexts through exposed bridge functions on each page.
    const relay = createE2eRelay();

    async function openSyncedPage(email: string): Promise<{
      page: Page;
      context: BrowserContext;
    }> {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      await page.exposeFunction("__orZaruaTestEncrypt", relay.encrypt);
      await page.exposeFunction("__orZaruaTestDecrypt", relay.decrypt);
      await page.exposeFunction("__orZaruaTestRelayPush", relay.push);
      await page.exposeFunction("__orZaruaTestRelayPull", relay.pull);
      await page.addInitScript(installFakeSyncHook);
      await page.goto("./");
      await expect(page.getByText("Sync across devices")).toBeVisible();
      await signInAndUnlock(page, email);
      return { page, context };
    }

    async function signInAndUnlock(page: Page, email: string) {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("e2e-password");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByLabel("Encryption passphrase")).toBeVisible({ timeout: 20_000 });
      await page.getByLabel("Encryption passphrase").fill(PASSPHRASE);
      await page.getByRole("button", { name: "Unlock sync" }).click();
      await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible({ timeout: 20_000 });
    }

    /** Clicks "Sync now" and waits until the coordinator reports idle. */
    async function syncNow(page: Page) {
      await page.getByRole("button", { name: "Sync now" }).click();
      await expect(page.getByText("Up to date")).toBeVisible({ timeout: 30_000 });
    }

    // Device A: sign in, unlock, create, push.
    const a = await openSyncedPage("a@example.com");
    await addRemembrance(a.page, SYNC_NAME);
    await syncNow(a.page);
    // The save normally enqueues the create upsert plus the computed
    // upcoming-date refresh, both of which are pushed; duplicate pushes are
    // deduped idempotently, so the count is stable after a completed cycle.
    expect(relay.rowCount()).toBeGreaterThan(0);
    const rowsAfterFirstSync = relay.rowCount();

    // Device B: sign in with the same account, unlock with the same passphrase,
    // pull. The create must reach B's local store through the relay.
    const b = await openSyncedPage("b@example.com");
    await syncNow(b.page);

    let bRecords = await readRecords(b.page);
    expect(bRecords).toHaveLength(1);
    expect(bRecords[0].record?.name).toBe(SYNC_NAME);
    expect(bRecords[0].deleted).toBe(false);
    const syncedId = bRecords[0].id;

    // The pulled record survives a reload in B (persisted locally). Reloading
    // resets the page-memory session/passphrase, so B re-authenticates below.
    await b.page.reload();
    await expect(b.page.getByText(SYNC_NAME)).toBeVisible({ timeout: 20_000 });
    await signInAndUnlock(b.page, "b@example.com");

    // Device A deletes the record; exactly one tombstone is pushed to the relay.
    await a.page.getByRole("button", { name: `Delete ${SYNC_NAME}` }).click();
    await expect(a.page.getByText(SYNC_NAME)).toBeHidden();
    await syncNow(a.page);
    expect(relay.rowCount()).toBe(rowsAfterFirstSync + 1); // the delete tombstone

    // Device B pulls the tombstone: the delete applies and the record is
    // tombstoned locally (deleted row stays, cursor advanced past it).
    await syncNow(b.page);

    bRecords = await readRecords(b.page);
    expect(bRecords).toHaveLength(1);
    expect(bRecords[0].id).toBe(syncedId);
    expect(bRecords[0].deleted).toBe(true);
    expect(bRecords[0].record).toBeNull();

    const bMetadata = await readMetadata(b.page);
    const cursor = bMetadata.find((row) => row.key === "cursor");
    expect(cursor?.value).toEqual({ sequence: relay.rowCount() });

    // Reload B: the tombstone prevents resurrection of the name.
    await b.page.reload();
    await expect(b.page.getByText(SYNC_NAME)).toBeHidden({ timeout: 20_000 });

    // A further sync cycle pulls nothing new and still does not resurrect it.
    await signInAndUnlock(b.page, "b@example.com");
    await syncNow(b.page);
    await b.page.reload();
    await expect(b.page.getByText(SYNC_NAME)).toBeHidden({ timeout: 20_000 });
    bRecords = await readRecords(b.page);
    expect(bRecords[0].id).toBe(syncedId);
    expect(bRecords[0].deleted).toBe(true);

    await a.context.close();
    await b.context.close();
  });
});
