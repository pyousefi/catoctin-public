export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}
export function configured(): boolean {
  return [
    "FAMILY_PASSWORD_HASH",
    "ADMIN_PASSWORD_HASH",
    "SESSION_SECRET",
    "DATABASE_URL",
    "BLOB_READ_WRITE_TOKEN",
    "GOOGLE_ALBUM_2026_URL",
    "GOOGLE_ALBUM_2025_URL",
    "GOOGLE_ALBUM_2024_URL",
    "GOOGLE_ALBUM_2010_URL",
  ].every((key) => Boolean(process.env[key]));
}
