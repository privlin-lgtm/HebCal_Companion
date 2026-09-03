/** Capacitor runtime detection and platform abstraction. */

export function isCapacitorNative(): boolean {
  return typeof (globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === "function"
    && (globalThis as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
}

export function getPlatform(): "web" | "ios" | "android" {
  if (!isCapacitorNative()) return "web";
  const platform = (globalThis as unknown as { Capacitor?: { getPlatform: () => string } }).Capacitor?.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

/** Check if running in kiosk mode (URL parameter or localStorage flag). */
export function isKioskMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("kiosk") || localStorage.getItem("or-zarua-kiosk") === "true";
  } catch {
    return false;
  }
}

export function enterKioskMode() {
  try { localStorage.setItem("or-zarua-kiosk", "true"); } catch { /* ignore */ }
}

export function exitKioskMode() {
  try { localStorage.removeItem("or-zarua-kiosk"); } catch { /* ignore */ }
}