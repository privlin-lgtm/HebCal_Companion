import { webcrypto } from "node:crypto";
import "./i18n/config";
import "@testing-library/jest-dom/vitest";

// jsdom ships crypto.getRandomValues but not crypto.subtle, which the sync
// encryption needs. Node's implementation is spec-compliant, so borrow it.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

// This jsdom build exposes `window` but no Storage at all, so adapters that
// persist state have nothing to write to. Provide an in-memory equivalent.
if (!globalThis.localStorage) {
  const createStorage = () => {
    const entries = new Map<string, string>();
    return {
      get length() { return entries.size; },
      clear: () => entries.clear(),
      getItem: (key: string) => entries.get(key) ?? null,
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      removeItem: (key: string) => { entries.delete(key); },
      setItem: (key: string, value: string) => { entries.set(key, String(value)); },
    } as unknown as Storage;
  };
  Object.defineProperty(globalThis, "localStorage", { value: createStorage(), configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: createStorage(), configurable: true });
}

// Polyfill matchMedia for jsdom
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Polyfill ResizeObserver for jsdom
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
