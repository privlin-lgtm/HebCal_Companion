import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppProvider } from "../../context/AppContext";
import { ToastProvider } from "../../context/ToastContext";
import { createServices, type AppServices } from "../../composition";
import { SyncPanel } from "./SyncPanel";
import type { SyncCoordinator, SyncPort, SyncStatus, SyncUser } from "../../application/ports";

const SAMPLE_USER: SyncUser = { id: "user-1", email: "tester@example.com" };

/** A configured, unlocked fake sync port so the panel reaches its controls. */
function createFakeSync(overrides: Partial<SyncPort> = {}): SyncPort {
  return {
    isConfigured: () => true,
    signIn: async () => SAMPLE_USER,
    signUp: async () => ({ user: SAMPLE_USER, needsConfirmation: false }),
    signOut: async () => {},
    getUser: async () => SAMPLE_USER,
    onAuthChange: () => () => {},
    unlock: () => {},
    lock: () => {},
    isUnlocked: () => true,
    push: async () => {},
    pull: async () => null,
    getLastSync: () => null,
    ...overrides,
  };
}

function createFakeCoordinator(
  status: SyncStatus,
  lastError: string | null = null,
): SyncCoordinator & { syncNow: ReturnType<typeof vi.fn> } {
  return {
    start: () => () => {},
    syncNow: vi.fn(async () => {}),
    getStatus: () => status,
    getLastError: () => lastError,
    subscribe: () => () => {},
  };
}

function renderPanel(services: AppServices) {
  return render(
    <AppProvider services={services}>
      <ToastProvider>
        <SyncPanel records={[]} onMerged={vi.fn()} />
      </ToastProvider>
    </AppProvider>,
  );
}

/** Builds AppServices from the real composition root, then overrides the sync
 *  port and coordinator with fakes so the panel can be driven deterministically. */
function makeServices(sync: SyncPort, coordinator: SyncCoordinator): AppServices {
  return { ...createServices(), sync, syncCoordinator: coordinator };
}

describe("SyncPanel", () => {
  it("renders nothing when sync is not configured", () => {
    const sync = createFakeSync({ isConfigured: () => false });
    const { container } = renderPanel(makeServices(sync, createFakeCoordinator("disabled")));
    expect(container.firstChild).toBeNull();
  });

  it("shows the sign-in form when signed out", () => {
    const sync = createFakeSync({ getUser: async () => null, isUnlocked: () => false });
    renderPanel(makeServices(sync, createFakeCoordinator("locked")));
    expect(screen.getByLabelText("Email")).toBeDefined();
    expect(screen.getByText("Need an account?")).toBeDefined();
  });

  it("shows Sync now and the synced status when unlocked and idle", async () => {
    renderPanel(makeServices(createFakeSync(), createFakeCoordinator("idle")));
    expect(await screen.findByText("Sync now")).toBeDefined();
    expect(await screen.findByText("Up to date")).toBeDefined();
  });

  it("shows the syncing status", async () => {
    renderPanel(makeServices(createFakeSync(), createFakeCoordinator("syncing")));
    expect(await screen.findByText("Syncing…")).toBeDefined();
  });

  it("shows the error status without exposing the passphrase", async () => {
    renderPanel(makeServices(createFakeSync(), createFakeCoordinator("error", "Connection failed")));
    expect(await screen.findByText("Sync error")).toBeDefined();
    // The unlock form (and its passphrase field) is hidden while unlocked, so
    // the passphrase label never appears alongside the error status.
    expect(screen.queryByLabelText("Encryption passphrase")).toBeNull();
  });

  it("shows the unlock form when locked", async () => {
    const sync = createFakeSync({ isUnlocked: () => false });
    renderPanel(makeServices(sync, createFakeCoordinator("locked")));
    expect(await screen.findByLabelText("Encryption passphrase")).toBeDefined();
  });

  it("triggers the coordinator on Sync now", async () => {
    const coordinator = createFakeCoordinator("idle");
    renderPanel(makeServices(createFakeSync(), coordinator));
    fireEvent.click(await screen.findByText("Sync now"));
    await waitFor(() => expect(coordinator.syncNow).toHaveBeenCalled());
  });
});
