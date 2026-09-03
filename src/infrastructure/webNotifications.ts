import type { NotificationPort } from "../application/ports";
import { isCapacitorNative } from "./capacitorBridge";

/**
 * Web Notifications API adapter. On Capacitor native, this would be
 * replaced with @capacitor/local-notifications.
 */
export function createWebNotifications(): NotificationPort {
  function isSupported(): boolean {
    return typeof Notification !== "undefined" && "permission" in Notification;
  }

  async function requestPermission(): Promise<boolean> {
    if (!isSupported()) return false;
    if (Notification.permission === "granted") return true;
    const result = await Notification.requestPermission();
    return result === "granted";
  }

  async function schedule(title: string, body: string, at: Date): Promise<void> {
    if (!isSupported() || Notification.permission !== "granted") return;
    // For web, we use setTimeout to schedule. In a real app with a service worker,
    // this would use the Notifications API via the SW.
    const delay = at.getTime() - Date.now();
    if (delay <= 0) {
      new Notification(title, { body });
      return;
    }
    // Note: setTimeout won't fire if the tab is closed. For production,
    // use a service worker with push notifications or Capacitor local notifications.
    setTimeout(() => {
      try { new Notification(title, { body }); } catch { /* ignore */ }
    }, delay);
  }

  async function cancel(_id: string): Promise<void> {
    // Web Notifications API doesn't support cancellation of scheduled notifications.
    // Would need Capacitor LocalNotifications for this.
  }

  async function cancelAll(): Promise<void> {
    // Same as above.
  }

  return { isSupported, requestPermission, schedule, cancel, cancelAll };
}