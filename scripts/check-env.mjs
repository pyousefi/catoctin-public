import { pathToFileURL } from "node:url";
const required = [
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "FAMILY_PASSWORD_HASH",
  "ADMIN_PASSWORD_HASH",
  "SESSION_SECRET",
  "GOOGLE_ALBUM_2026_URL",
  "GOOGLE_ALBUM_2025_URL",
  "GOOGLE_ALBUM_2024_URL",
  "GOOGLE_ALBUM_2010_URL",
];
export function validateEnvironment(values, { allowRedacted = false } = {}) {
  const redacted = (value) => allowRedacted && value === "[SENSITIVE]";
  const missing = required.filter((name) => !values[name]);
  if (missing.length)
    throw new Error(`Missing configuration: ${missing.join(", ")}`);
  if (!redacted(values.SESSION_SECRET) && values.SESSION_SECRET.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  for (const name of ["FAMILY_PASSWORD_HASH", "ADMIN_PASSWORD_HASH"]) {
    if (
      !redacted(values[name]) &&
      !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(values[name])
    )
      throw new Error(`${name} must be generated with npm run password:hash`);
  }
  if (
    !redacted(values.FAMILY_PASSWORD_HASH) &&
    values.FAMILY_PASSWORD_HASH === values.ADMIN_PASSWORD_HASH
  )
    throw new Error("Use different family and admin passwords");
  const bytes = Number(values.MAX_STORAGE_BYTES ?? 53687091200);
  if (
    !redacted(values.MAX_STORAGE_BYTES) &&
    (!Number.isSafeInteger(bytes) || bytes < 1)
  )
    throw new Error("MAX_STORAGE_BYTES must be a positive integer");
  for (const year of [2026, 2025, 2024, 2010]) {
    if (redacted(values[`GOOGLE_ALBUM_${year}_URL`])) continue;
    const url = new URL(values[`GOOGLE_ALBUM_${year}_URL`]);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "photos.app.goo.gl" ||
      url.username ||
      url.password
    )
      throw new Error(`Invalid Google album URL for ${year}`);
  }
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const allowRedacted = process.argv.includes("--allow-redacted");
  validateEnvironment(process.env, { allowRedacted });
  console.log(
    allowRedacted
      ? "Required environment keys are present; sensitive values are validated at runtime."
      : "Required environment configuration is present and valid.",
  );
}
