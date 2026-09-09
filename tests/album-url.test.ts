import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { albumUrl } from "@/lib/album-url";
afterEach(() => vi.unstubAllEnvs());
describe("private album configuration", () => {
  it("reads a server-configured shared album without a source-code fallback", () => {
    vi.stubEnv("GOOGLE_ALBUM_2026_URL", "https://photos.app.goo.gl/test2026");
    expect(albumUrl(2026)).toBe("https://photos.app.goo.gl/test2026");
  });
  it("fails closed when an album is missing", () => {
    vi.stubEnv("GOOGLE_ALBUM_2026_URL", "");
    expect(() => albumUrl(2026)).toThrow("Missing required configuration");
  });
  it.each([
    "http://photos.app.goo.gl/test",
    "https://example.com/album",
    "https://user:password@photos.app.goo.gl/test",
    "javascript:alert(1)",
  ])("rejects an invalid album destination %s", (value) => {
    vi.stubEnv("GOOGLE_ALBUM_2026_URL", value);
    expect(() => albumUrl(2026)).toThrow();
  });
});
