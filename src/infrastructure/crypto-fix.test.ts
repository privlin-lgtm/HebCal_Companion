import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

const PASSPHRASE = "a-long-enough-passphrase";

describe("crypto security fixes", () => {
  it("rejects envelopes with iteration counts above the cap", async () => {
    const envelope = JSON.parse(await encryptJson({ secret: true }, PASSPHRASE));
    envelope.iter = 10_000_000;
    await expect(decryptJson(JSON.stringify(envelope), PASSPHRASE))
      .rejects.toThrow(/unusually high/i);
  });

  it("accepts envelopes with normal iteration counts (below cap)", async () => {
    // Default encryption uses 210K iterations, which is below the 500K cap
    const sealed = await encryptJson({ secret: true }, PASSPHRASE);
    await expect(decryptJson(sealed, PASSPHRASE))
      .resolves.toEqual({ secret: true });
  });

  it("rejects envelopes with an invalid kdf field", async () => {
    const envelope = JSON.parse(await encryptJson({ secret: true }, PASSPHRASE));
    envelope.kdf = "BCRYPT";
    await expect(decryptJson(JSON.stringify(envelope), PASSPHRASE))
      .rejects.toThrow(/not in a recognised format/i);
  });
});
