import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const badgeStore = "1byoCJTICV9nhWmX";

/** @param {Record<string, string | undefined>} env */
export async function publishDeploymentBadge(env = process.env) {
  const environment = env.DEPLOYMENT_ENV;
  const version = env.NEXT_PUBLIC_APP_VERSION;
  const commit = env.NEXT_PUBLIC_APP_COMMIT;
  const token = env.DEPLOYMENT_BADGE_TOKEN;
  if (!["prod", "nonprod"].includes(environment))
    throw new Error("Unknown deployment environment");
  const validVersion =
    environment === "prod"
      ? /^v\d+\.\d+\.\d+$/.test(version ?? "")
      : version === "preview" || /^v\d+\.\d+\.\d+-rc\.\d+$/.test(version ?? "");
  if (!validVersion || !/^[a-f0-9]{40}$/.test(commit ?? ""))
    throw new Error("Missing or invalid deployment version/commit");
  if (!token?.startsWith(`vercel_blob_rw_${badgeStore}_`))
    throw new Error("A token for the dedicated badge store is required");
  const badge = {
    schemaVersion: 1,
    label: environment,
    message: `${version} · ${commit.slice(0, 7)}`,
    color: environment === "prod" ? "brightgreen" : "blue",
    cacheSeconds: 300,
  };
  const blob = await put(`${environment}.json`, JSON.stringify(badge), {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
  return { badge, url: blob.url };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await publishDeploymentBadge();
  console.log(`Updated ${result.badge.label} badge: ${result.badge.message}`);
}
