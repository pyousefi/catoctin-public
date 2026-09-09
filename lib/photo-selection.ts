import { PhotoReadError } from "./read-photo";
import { MAX_FILE_BYTES, photoType } from "./uploads";

export const MAX_BATCH_PHOTOS = 50;
export const PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/tiff,image/x-adobe-dng,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.tif,.tiff,.dng";

type Photo = Pick<File, "name" | "size" | "lastModified">;

export function selectPhotos<T extends Photo>(existing: T[], incoming: T[]) {
  const files: T[] = [];
  const errors: string[] = [];
  const seen = new Set(existing.map(identity));
  let overflow = 0;
  for (const file of incoming) {
    if (seen.has(identity(file))) continue;
    seen.add(identity(file));
    if (!photoType(file.name)) {
      errors.push(
        `${file.name}: choose a JPG, PNG, HEIC, HEIF, WebP, AVIF, TIFF, or DNG photo.`,
      );
    } else if (file.size === 0) {
      errors.push(
        `${file.name}: this photo is empty. Choose it again from your photo picker.`,
      );
    } else if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: this photo exceeds the 200 MB limit.`);
    } else if (file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name)) {
      errors.push(
        `${file.name}: please give this photo a shorter, simpler filename.`,
      );
    } else if (existing.length + files.length >= MAX_BATCH_PHOTOS) {
      overflow++;
    } else {
      files.push(file);
    }
  }
  const messages = errors.slice(0, 3);
  if (errors.length > 3)
    messages.push(`${errors.length - 3} more photos could not be added.`);
  if (overflow) {
    messages.push(
      `Please share up to ${MAX_BATCH_PHOTOS} photos at a time. ${overflow} additional ${overflow === 1 ? "photo was" : "photos were"} not added. Share this batch, then choose those photos again.`,
    );
  }
  return { files, notice: messages.join(" ") };
}

function identity(file: Photo) {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}

export function uploadFailureMessage(error: unknown, uploaded: boolean) {
  if (error instanceof PhotoReadError) return error.message;
  if (uploaded) {
    return "The file uploaded, but we couldn’t confirm it was saved. Keep this page open and retry to confirm without sending the file again.";
  }
  if (
    error instanceof Error &&
    ["NotReadableError", "NotFoundError"].includes(error.name)
  ) {
    return new PhotoReadError().message;
  }
  return `${error instanceof Error ? error.message : "The upload failed."} Keep this page open and retry.`;
}
