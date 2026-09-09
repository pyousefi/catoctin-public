import "server-only";
import { env } from "./config";
import type { CampYear } from "./albums";
export function albumUrl(year: CampYear): string {
  const value = env(`GOOGLE_ALBUM_${year}_URL`);
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "photos.app.goo.gl" ||
    url.username ||
    url.password
  ) {
    throw new Error(`Invalid Google album URL for ${year}`);
  }
  return value;
}
