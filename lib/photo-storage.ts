import { get, head } from "@vercel/blob";
import { getR2, headR2 } from "./r2";

export async function getPhotoObject(
  pathname: string,
  options: { access: "private"; useCache: false },
) {
  return pathname.startsWith("r2/") ? getR2(pathname) : get(pathname, options);
}

export async function headPhotoObject(pathname: string) {
  return pathname.startsWith("r2/") ? headR2(pathname) : head(pathname);
}
