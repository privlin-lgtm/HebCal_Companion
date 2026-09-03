import type { IdGenerator } from "../application/ports";

export function createIdGenerator({ cryptoImpl = globalThis.crypto }: { cryptoImpl?: Crypto } = {}): IdGenerator {
  return {
    next() {
      if (cryptoImpl?.randomUUID) return cryptoImpl.randomUUID();
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    },
  };
}