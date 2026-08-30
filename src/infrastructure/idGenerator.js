/** IdGenerator port implementation. */
export function createIdGenerator({ cryptoImpl = globalThis.crypto } = {}) {
  return {
    next() {
      if (cryptoImpl?.randomUUID) return cryptoImpl.randomUUID();
      const bytes = new Uint8Array(16);
      cryptoImpl.getRandomValues(bytes);
      return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    },
  };
}
