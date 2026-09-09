import { z } from "zod";
import { years } from "./albums";
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const uploadInput = z.object({
  year: z
    .number()
    .int()
    .refine((value) => years.includes(value as (typeof years)[number])),
  name: z
    .string()
    .min(1)
    .max(180)
    .refine((value) => !/[\x00-\x1f/\\]/.test(value)),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  contributor: z.string().trim().min(1).max(80),
  caption: z.string().trim().max(500).default(""),
});
const types: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  dng: "image/x-adobe-dng",
};
export function photoType(name: string): string | null {
  return types[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}
export function canPreview(type: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type);
}
export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
