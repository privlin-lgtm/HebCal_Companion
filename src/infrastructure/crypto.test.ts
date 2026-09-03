import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

const PASSPHRASE = "a-long-enough-passphrase";

describe("encryptJson / decryptJson", () => {
  it("round-trips a value with the correct passphrase", async () => {
    const records = [{ id: "1", name: "Rivka bat Avraham", type: "Yahrzeit" }];
    const sealed = await encryptJson(records, PASSPHRASE);
    await expect(decryptJson(sealed, PASSPHRASE)).resolves.toEqual(records);
  });

  it("leaves no plaintext in the envelope", async () => {
    const sealed = await encryptJson({ name: "Rivka bat Avraham" }, PASSPHRASE);
    expect(sealed).not.toContain("Rivka");
    expect(sealed).not.toContain(PASSPHRASE);
  });

  it("uses a fresh salt and IV on every call", async () => {
    const first = await encryptJson({ v: 1 }, PASSPHRASE);
    const second = await encryptJson({ v: 1 }, PASSPHRASE);
    expect(first).not.toEqual(second);
    expect(JSON.parse(first).salt).not.toEqual(JSON.parse(second).salt);
    expect(JSON.parse(first).iv).not.toEqual(JSON.parse(second).iv);
  });

  it("records its KDF parameters so they can be upgraded later", async () => {
    const envelope = JSON.parse(await encryptJson({}, PASSPHRASE));
    expect(envelope).toMatchObject({ v: 1, kdf: "PBKDF2-SHA256", iter: 210_000 });
    expect(typeof envelope.salt).toBe("string");
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.ct).toBe("string");
  });

  it("rejects a wrong passphrase", async () => {
    const sealed = await encryptJson({ secret: true }, "the-right-passphrase");
    await expect(decryptJson(sealed, "the-wrong-passphrase")).rejects.toThrow(/Could not decrypt/);
  });

  it("rejects tampered ciphertext", async () => {
    const envelope = JSON.parse(await encryptJson({ secret: true }, PASSPHRASE));
    const bytes = atob(envelope.ct).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff);
    envelope.ct = btoa(bytes.join(""));
    await expect(decryptJson(JSON.stringify(envelope), PASSPHRASE)).rejects.toThrow(/Could not decrypt/);
  });

  it("rejects payloads that are not envelopes", async () => {
    await expect(decryptJson("not json at all", PASSPHRASE)).rejects.toThrow(/not in a recognised format/);
    await expect(decryptJson(JSON.stringify({ hello: "world" }), PASSPHRASE)).rejects.toThrow(/not in a recognised format/);
  });

  it("refuses an envelope from a newer app version", async () => {
    const envelope = JSON.parse(await encryptJson({}, PASSPHRASE));
    envelope.v = 99;
    await expect(decryptJson(JSON.stringify(envelope), PASSPHRASE)).rejects.toThrow(/newer version/);
  });

  it("requires a passphrase in both directions", async () => {
    await expect(encryptJson({}, "")).rejects.toThrow(/passphrase is required/);
    await expect(decryptJson("{}", "")).rejects.toThrow(/passphrase is required/);
  });
});
