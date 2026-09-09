import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";
import { issueSession, verifyPassword, verifySession } from "@/lib/session";
describe("family and administrator sessions", () => {
  beforeEach(() =>
    vi.stubEnv("SESSION_SECRET", "test-secret-that-is-at-least-32-characters"),
  );
  afterEach(() => vi.unstubAllEnvs());
  it("keeps the chosen role and rejects expired sessions", () => {
    const token = issueSession("family", 1000);
    expect(verifySession(token, 1001)?.role).toBe("family");
    expect(verifySession(token, 1000 + 7 * 24 * 60 * 60 * 1000)).toBeNull();
  });
  it("rejects role tampering, missing tokens and malformed signatures", () => {
    const token = issueSession("family");
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ role: "admin", expires: Date.now() + 60000 }),
    ).toString("base64url");
    for (const value of [
      undefined,
      "",
      `${forged}.${signature}`,
      `${token}.extra`,
      "garbage",
      "e30.AA",
    ])
      expect(verifySession(value)).toBeNull();
  });
  it("invalidates sessions when the signing secret changes", () => {
    const token = issueSession("admin");
    vi.stubEnv(
      "SESSION_SECRET",
      "a-different-secret-with-at-least-32-characters",
    );
    expect(verifySession(token)).toBeNull();
  });
  it("refuses an insecure signing configuration", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => issueSession("family")).toThrow("32 characters");
  });
  it("verifies password hashes and fails closed on malformed configuration", () => {
    const salt = "fixed-test-salt";
    const hash = `scrypt:${salt}:${scryptSync("a test password", salt, 64).toString("hex")}`;
    expect(verifyPassword("a test password", hash)).toBe(true);
    expect(verifyPassword("wrong password", hash)).toBe(false);
    expect(() => verifyPassword("password", "invalid")).toThrow(
      "Invalid password hash",
    );
  });
});
