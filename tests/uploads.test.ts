import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  canPreview,
  photoType,
  uploadInput,
} from "@/lib/uploads";
const valid = {
  year: 2026,
  name: "Family.jpg",
  size: 12000,
  contributor: " Grandma ",
  caption: " Our hike ",
};
describe("original photo validation", () => {
  it("accepts all supplied camp years and trims attribution", () => {
    for (const year of [2026, 2025, 2024, 2010])
      expect(uploadInput.parse({ ...valid, year })).toMatchObject({
        year,
        contributor: "Grandma",
        caption: "Our hike",
      });
  });
  it.each([
    { year: 2027 },
    { size: 0 },
    { size: MAX_FILE_BYTES + 1 },
    { size: 1.5 },
    { name: "../photo.jpg" },
    { name: "photo\r\n.jpg" },
    { contributor: " " },
    { caption: "x".repeat(501) },
  ])("rejects invalid upload metadata %j", (patch) => {
    expect(uploadInput.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it("keeps high-quality phone and camera formats but excludes active content", () => {
    expect(photoType("IMG_123.HEIC")).toBe("image/heic");
    expect(photoType("camera.dng")).toBe("image/x-adobe-dng");
    expect(photoType("photo.jpg.svg")).toBeNull();
    expect(photoType("page.html")).toBeNull();
    expect(canPreview("image/heic")).toBe(false);
    expect(canPreview("image/jpeg")).toBe(true);
  });
});
