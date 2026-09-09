import { describe, expect, it } from "vitest";
import { selectPhotos, uploadFailureMessage } from "@/lib/photo-selection";
import { MAX_FILE_BYTES } from "@/lib/uploads";

const photo = (name = "camp.jpg", size = 1000) => ({
  name,
  size,
  lastModified: 1,
});

describe("mobile photo selection", () => {
  it("keeps original objects and accepts the exact size limit", () => {
    const original = photo("large.HEIC", MAX_FILE_BYTES);
    const result = selectPhotos([], [original]);
    expect(result.files[0]).toBe(original);
    expect(result.notice).toBe("");
  });

  it("rejects an oversized photo while retaining valid neighbors", () => {
    const result = selectPhotos(
      [],
      [photo(), photo("large.jpg", MAX_FILE_BYTES + 1), photo("last.png")],
    );
    expect(result.files.map((file) => file.name)).toEqual([
      "camp.jpg",
      "last.png",
    ]);
    expect(result.notice).toContain(
      "large.jpg: this photo exceeds the 200 MB limit",
    );
  });

  it("explains how to recover an empty cloud-provider file", () => {
    expect(selectPhotos([], [photo("cloud.jpg", 0)])).toEqual({
      files: [],
      notice: expect.stringContaining("Choose it again"),
    });
  });

  it.each([
    "photo.svg",
    "photo",
    "../photo.jpg",
    "photo\n.jpg",
    `${"a".repeat(181)}.jpg`,
  ])("rejects unsupported or unsafe filename %s", (name) => {
    expect(selectPhotos([], [photo(name)]).files).toEqual([]);
  });

  it("skips duplicates in the same selection and existing queue", () => {
    expect(
      selectPhotos([photo()], [photo(), photo("next.jpg"), photo("next.jpg")])
        .files,
    ).toEqual([photo("next.jpg")]);
  });

  it("counts only unique valid overflow photos when filling a partial batch", () => {
    const existing = Array.from({ length: 49 }, (_, i) => photo(`${i}.jpg`));
    const result = selectPhotos(existing, [
      photo("49.jpg"),
      photo("50.jpg"),
      photo("50.jpg"),
      photo("empty.jpg", 0),
    ]);
    expect(result.files).toEqual([photo("49.jpg")]);
    expect(result.notice).toContain("1 additional photo was not added");
    expect(result.notice).toContain("choose those photos again");
  });

  it("leaves a full queue intact and bounds feedback for many invalid files", () => {
    const existing = Array.from({ length: 50 }, (_, i) => photo(`${i}.jpg`));
    const result = selectPhotos(existing, [
      photo("extra.jpg"),
      ...Array.from({ length: 100 }, (_, i) => photo(`${i}.svg`)),
    ]);
    expect(result.files).toEqual([]);
    expect(existing).toHaveLength(50);
    expect(result.notice).toContain("97 more photos could not be added");
    expect(result.notice).toContain("1 additional photo was not added");
    expect(result.notice).not.toContain("99.svg");
  });
});

describe("upload recovery guidance", () => {
  it.each(["NotReadableError", "NotFoundError"])(
    "suggests picker retry without assuming a cloud-only original for %s",
    (name) => {
      const error = new Error("Cannot read file");
      error.name = name;
      expect(uploadFailureMessage(error, false)).toContain(
        "Choose it again from your photo picker",
      );
    },
  );

  it("distinguishes confirmation failure from sending the file again", () => {
    expect(
      uploadFailureMessage(new Error("Service unavailable"), true),
    ).toContain("without sending the file again");
  });

  it("keeps the transfer error and adds recovery steps", () => {
    expect(
      uploadFailureMessage(new Error("Network unavailable"), false),
    ).toContain("Network unavailable");
    expect(uploadFailureMessage(undefined, false)).toContain(
      "Keep this page open and retry",
    );
  });
});
