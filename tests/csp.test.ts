import { describe, expect, it } from "vitest";
import config from "@/next.config";
describe("direct photo upload network policy", () => {
  it("allows the Blob SDK control plane while blocking arbitrary third-party origins", async () => {
    const routes = await config.headers!();
    const policy = routes[0].headers.find(
      (header) => header.key === "Content-Security-Policy",
    )!.value;
    const connect = policy
      .split(";")
      .find((directive) => directive.trim().startsWith("connect-src"))!
      .trim()
      .split(/\s+/)
      .slice(1);
    expect(connect).toContain("https://vercel.com/api/blob/");
    expect(connect).toContain("https://*.blob.vercel-storage.com");
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("https:");
  });
});
