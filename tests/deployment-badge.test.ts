import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
import { publishDeploymentBadge } from "@/scripts/publish-deployment-badge.mjs";
const env = {
  DEPLOYMENT_ENV: "prod",
  NEXT_PUBLIC_APP_VERSION: "v0.3.2",
  NEXT_PUBLIC_APP_COMMIT: "2ef50783962ffeb818b832e763e2c2510fe7d1c1",
  DEPLOYMENT_BADGE_TOKEN: "vercel_blob_rw_1byoCJTICV9nhWmX_test-only",
};
beforeEach(() => {
  mocks.put
    .mockReset()
    .mockResolvedValue({ url: "https://badge.example/prod.json" });
});
it.each([
  ["prod", "v0.3.2", "brightgreen"],
  ["nonprod", "preview", "blue"],
  ["nonprod", "v0.3.3-rc.1", "blue"],
])(
  "publishes only the %s environment’s verified version",
  async (environment, version, color) => {
    const result = await publishDeploymentBadge({
      ...env,
      DEPLOYMENT_ENV: environment,
      NEXT_PUBLIC_APP_VERSION: version,
    });
    expect(result.badge).toEqual({
      schemaVersion: 1,
      label: environment,
      message: `${version} · 2ef5078`,
      color,
      cacheSeconds: 300,
    });
    expect(mocks.put).toHaveBeenCalledWith(
      `${environment}.json`,
      JSON.stringify(result.badge),
      expect.objectContaining({
        access: "public",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
      }),
    );
    expect(JSON.stringify(result.badge)).not.toContain(
      env.DEPLOYMENT_BADGE_TOKEN,
    );
  },
);
it.each([
  { DEPLOYMENT_ENV: "unknown" },
  { NEXT_PUBLIC_APP_VERSION: "preview" },
  { NEXT_PUBLIC_APP_COMMIT: "" },
  { DEPLOYMENT_BADGE_TOKEN: "vercel_blob_rw_photo-store_wrong" },
])(
  "refuses invalid deployment metadata or a photo-store token",
  async (patch) => {
    await expect(
      publishDeploymentBadge({ ...env, ...patch }),
    ).rejects.toThrow();
    expect(mocks.put).not.toHaveBeenCalled();
  },
);
it("reports storage failure instead of claiming the badge was updated", async () => {
  mocks.put.mockRejectedValue(new Error("Storage unavailable"));
  await expect(publishDeploymentBadge(env)).rejects.toThrow(
    "Storage unavailable",
  );
});
