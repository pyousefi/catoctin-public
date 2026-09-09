import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../scripts/check-env.mjs";
const valid = {
  DATABASE_URL: "test-database",
  BLOB_READ_WRITE_TOKEN: "test-token",
  FAMILY_PASSWORD_HASH: `scrypt:${"a".repeat(32)}:${"a".repeat(128)}`,
  ADMIN_PASSWORD_HASH: `scrypt:${"b".repeat(32)}:${"b".repeat(128)}`,
  SESSION_SECRET: "s".repeat(32),
  MAX_STORAGE_BYTES: "1000",
  GOOGLE_ALBUM_2026_URL: "https://photos.app.goo.gl/test2026",
  GOOGLE_ALBUM_2025_URL: "https://photos.app.goo.gl/test2025",
  GOOGLE_ALBUM_2024_URL: "https://photos.app.goo.gl/test2024",
  GOOGLE_ALBUM_2010_URL: "https://photos.app.goo.gl/test2010",
};
describe("deployment environment validation", () => {
  it("accepts a complete local environment", () =>
    expect(() => validateEnvironment(valid)).not.toThrow());
  it("accepts Vercel sensitive placeholders only in the explicit CI mode", () => {
    const masked = {
      ...valid,
      FAMILY_PASSWORD_HASH: "[SENSITIVE]",
      ADMIN_PASSWORD_HASH: "[SENSITIVE]",
      SESSION_SECRET: "[SENSITIVE]",
      MAX_STORAGE_BYTES: "[SENSITIVE]",
      GOOGLE_ALBUM_2026_URL: "[SENSITIVE]",
    };
    expect(() => validateEnvironment(masked)).toThrow();
    expect(() =>
      validateEnvironment(masked, { allowRedacted: true }),
    ).not.toThrow();
  });
  it("rejects missing secrets even when Vercel redaction is allowed", () => {
    expect(() =>
      validateEnvironment(
        { ...valid, SESSION_SECRET: "" },
        { allowRedacted: true },
      ),
    ).toThrow("Missing configuration: SESSION_SECRET");
  });
  it.each([
    { SESSION_SECRET: "short" },
    { FAMILY_PASSWORD_HASH: "plaintext" },
    { ADMIN_PASSWORD_HASH: valid.FAMILY_PASSWORD_HASH },
    { MAX_STORAGE_BYTES: "-1" },
    { GOOGLE_ALBUM_2026_URL: "https://example.com" },
  ])("still validates unredacted values in CI: %j", (patch) => {
    expect(() =>
      validateEnvironment({ ...valid, ...patch }, { allowRedacted: true }),
    ).toThrow();
  });
});
