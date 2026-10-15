import { beforeEach, describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  encryptToken,
  decryptToken,
  digest,
} from "../apps/web/src/lib/security";
import { checkOrigin, sessionCookie } from "../apps/web/src/lib/auth";
import { parseCsv, importKey } from "../apps/web/src/lib/imports";
import { credentials, entry, date } from "../apps/web/src/lib/validation";
describe("security primitives", () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
    process.env.APP_ORIGIN = "http://localhost:3000";
  });
  it("uses salted password hashes and verifies without plaintext storage", async () => {
    const hash = await hashPassword("a strong password");
    expect(hash).not.toContain("a strong password");
    expect(await verifyPassword("a strong password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await hashPassword("a strong password")).not.toBe(hash);
  });
  it("encrypts tokens with authenticated random nonces and rejects tampering", () => {
    const a = encryptToken("sandbox-secret"),
      b = encryptToken("sandbox-secret");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("sandbox-secret");
    const bytes = Buffer.from(a, "base64");
    bytes[13] ^= 1;
    expect(() => decryptToken(bytes.toString("base64"))).toThrow();
  });
  it("fails closed when the key is not configured", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow();
  });
  it("requires the configured mutation origin", () => {
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() => checkOrigin(new Request("http://localhost:3000"))).toThrow();
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("uses secure HTTP-only expiring cookies by default", () => {
    delete process.env.COOKIE_SECURE;
    expect(sessionCookie("x")).toContain(
      "HttpOnly; SameSite=Lax; Max-Age=604800; Secure",
    );
    expect(sessionCookie("", true)).toContain("Max-Age=0");
    expect(digest("x")).toHaveLength(64);
  });
  it("rejects weak credentials, invalid dates, extra user IDs and excess precision", () => {
    expect(
      credentials.safeParse({ email: "a@b.com", password: "short" }).success,
    ).toBe(false);
    expect(date.safeParse("2026-02-30").success).toBe(false);
    expect(
      entry.safeParse({
        accountId: "f11c6e2a-5a01-419a-b111-111111111111",
        description: "x",
        amount: "-1.005",
        date: "2026-01-01",
        user_id: "victim",
      }).success,
    ).toBe(false);
  });
});
describe("CSV", () => {
  it("handles quoted commas and a final row without a trailing newline", () => {
    expect(
      parseCsv(
        'date,description,amount,external_id\n2026-01-01,"Cafe, bakery",-4.20,row1',
      )[0].description,
    ).toBe("Cafe, bakery");
  });
  it("rejects malformed, empty, oversized, wrong-header and invalid-date input", () => {
    for (const csv of [
      "",
      "date,description,amount\n2026-01-01,test,5",
      "date,description,amount,external_id\n2026-02-30,test,5,x",
      'date,description,amount,external_id\n"unterminated',
    ])
      expect(() => parseCsv(csv)).toThrow();
    expect(() => parseCsv("a".repeat(1_000_001))).toThrow();
  });
  it("scopes stable import keys to accounts", () => {
    expect(importKey("a", "1")).toBe(importKey("a", "1"));
    expect(importKey("a", "1")).not.toBe(importKey("b", "1"));
  });
});
