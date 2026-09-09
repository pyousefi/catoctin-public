import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { migratePhotos } from "../scripts/migrate-photos-to-r2.mjs";

const photo = {
  id: "9e067844-189c-415a-9868-b0de1987cc67",
  pathname: "photos/2026/original.jpg",
  size: 8,
  content_type: "image/jpeg",
};
const targetKey = `r2/production/${photo.pathname}`;

function target(body = "original", contentType = "image/jpeg") {
  return {
    Body: Readable.from([Buffer.from(body)]),
    ContentLength: Buffer.byteLength(body),
    ContentType: contentType,
  };
}

function setup() {
  const events: string[] = [];
  const sql = vi
    .fn()
    .mockImplementation(async (query: TemplateStringsArray) => {
      if (query.join("").startsWith("UPDATE")) {
        events.push("update");
        return [{ id: photo.id }];
      }
      if (events.includes("select")) return [];
      events.push("select");
      return [photo];
    });
  const readBlob = vi.fn().mockImplementation(async () => ({
    statusCode: 200,
    blob: { size: photo.size, contentType: photo.content_type },
    stream: Readable.from([Buffer.from("original")]),
  }));
  let exists = false;
  const send = vi.fn().mockImplementation(async (command) => {
    if (command instanceof PutObjectCommand) {
      events.push("put");
      exists = true;
      return {};
    }
    if (!(command instanceof GetObjectCommand))
      throw new Error("Unexpected storage operation");
    events.push("get");
    if (!exists)
      throw Object.assign(new Error("absent"), { name: "NoSuchKey" });
    const result = target();
    result.Body.on("end", () => events.push("verified"));
    return result;
  });
  const report = vi.fn();
  return {
    sql,
    readBlob,
    s3: { send },
    bucket: "catoctin",
    prefix: "production",
    report,
    events,
  };
}

describe("private original migration to R2", () => {
  it("defaults to a metadata-only dry run with no writes or downloads", async () => {
    const deps = setup();
    expect(await migratePhotos(deps)).toEqual({
      inspected: 1,
      planned: 1,
      migrated: 0,
    });
    expect(
      deps.sql.mock.calls.every(([query]) =>
        query.join("").startsWith("SELECT"),
      ),
    ).toBe(true);
    expect(deps.readBlob).not.toHaveBeenCalled();
    expect(deps.s3.send).not.toHaveBeenCalled();
    expect(deps.report).toHaveBeenCalledWith({
      id: photo.id,
      action: "would-migrate",
    });
  });

  it("copies privately and verifies all target bytes before updating the database", async () => {
    const deps = setup();
    expect(await migratePhotos({ ...deps, apply: true })).toEqual({
      inspected: 1,
      planned: 0,
      migrated: 1,
    });
    expect(deps.events).toEqual([
      "select",
      "get",
      "put",
      "get",
      "verified",
      "update",
    ]);
    expect(deps.readBlob).toHaveBeenCalledWith(photo.pathname, {
      access: "private",
    });
    const put = deps.s3.send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )![0];
    expect(put.input).toEqual({
      Bucket: "catoctin",
      Key: targetKey,
      Body: Buffer.from("original"),
      ContentLength: 8,
      ContentType: "image/jpeg",
      IfNoneMatch: "*",
    });
    const update = deps.sql.mock.calls.find(([query]) =>
      query.join("").startsWith("UPDATE"),
    )!;
    expect(update[0].join("?")).toContain(
      "WHERE id = ? AND pathname = ? AND status = 'ready'",
    );
    expect(update.slice(1)).toEqual([targetKey, photo.id, photo.pathname]);
    expect(
      deps.s3.send.mock.calls.every(
        ([command]) =>
          command instanceof GetObjectCommand ||
          command instanceof PutObjectCommand,
      ),
    ).toBe(true);
  });

  it("verifies an identical existing target without overwriting it", async () => {
    const deps = setup();
    deps.s3.send.mockResolvedValue(target());
    await migratePhotos({ ...deps, apply: true });
    expect(deps.s3.send).toHaveBeenCalledTimes(1);
    expect(deps.s3.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(deps.events).toContain("update");
  });

  it.each([
    ["checksum", "modified", "image/jpeg"],
    ["size", "short", "image/jpeg"],
    ["MIME", "original", "image/png"],
  ])(
    "aborts on an existing target %s mismatch without changing either store",
    async (_name, body, mime) => {
      const deps = setup();
      deps.s3.send.mockResolvedValue(target(body, mime));
      await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
        /mismatch/,
      );
      expect(deps.s3.send).toHaveBeenCalledTimes(1);
      expect(deps.events).not.toContain("update");
    },
  );

  it("rejects a truncated target even when its metadata claims the right size", async () => {
    const deps = setup();
    deps.s3.send.mockResolvedValue({ ...target("short"), ContentLength: 8 });
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "size mismatch",
    );
    expect(deps.events).not.toContain("update");
  });

  it("aborts on a concurrent database change and retains the copied original", async () => {
    const deps = setup();
    deps.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { pathname: "r2/preview/photos/other.jpg", status: "ready" },
      ]);
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "concurrent database change",
    );
    expect(
      deps.s3.send.mock.calls.map(([command]) => command.constructor.name),
    ).toEqual(["GetObjectCommand", "PutObjectCommand", "GetObjectCommand"]);
    expect(deps.report).not.toHaveBeenCalled();
  });

  it.each([undefined, { pathname: photo.pathname, status: "archived" }])(
    "removes the R2 copy when concurrent deletion wins the database update: %s",
    async (current) => {
      const deps = setup();
      deps.sql
        .mockResolvedValueOnce([photo])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(current ? [current] : []);
      deps.s3.send
        .mockRejectedValueOnce(
          Object.assign(new Error("absent"), { name: "NoSuchKey" }),
        )
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(target())
        .mockResolvedValueOnce({});
      await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
        "R2 copy removed",
      );
      const cleanup = deps.s3.send.mock.calls[3][0];
      expect(cleanup).toBeInstanceOf(DeleteObjectCommand);
      expect(cleanup.input).toEqual({ Bucket: "catoctin", Key: targetKey });
      expect(deps.readBlob).toHaveBeenCalledTimes(1);
      expect(deps.report).not.toHaveBeenCalled();
    },
  );

  it("propagates cleanup access failures without reporting a successful deletion", async () => {
    const deps = setup();
    deps.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    deps.s3.send
      .mockResolvedValueOnce(target())
      .mockRejectedValueOnce(new Error("Cleanup access denied"));
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "Cleanup access denied",
    );
    expect(deps.s3.send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(deps.report).not.toHaveBeenCalled();
  });

  it("retains and reverifies a target referenced by a concurrent successful migration", async () => {
    const deps = setup();
    deps.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pathname: targetKey, status: "ready" }])
      .mockResolvedValueOnce([]);
    deps.s3.send.mockImplementation(async () => target());
    expect(await migratePhotos({ ...deps, apply: true })).toEqual({
      inspected: 1,
      planned: 0,
      migrated: 1,
    });
    expect(deps.s3.send).toHaveBeenCalledTimes(2);
    expect(
      deps.s3.send.mock.calls.every(
        ([command]) => command instanceof GetObjectCommand,
      ),
    ).toBe(true);
    expect(deps.report).toHaveBeenCalledWith({
      id: photo.id,
      action: "already-migrated",
    });
  });

  it("rejects a concurrently referenced target whose bytes changed without deleting it", async () => {
    const deps = setup();
    deps.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pathname: targetKey, status: "ready" }]);
    deps.s3.send
      .mockResolvedValueOnce(target())
      .mockResolvedValueOnce(target("modified"));
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "checksum mismatch",
    );
    expect(
      deps.s3.send.mock.calls.every(
        ([command]) => command instanceof GetObjectCommand,
      ),
    ).toBe(true);
    expect(deps.report).not.toHaveBeenCalled();
  });

  it("retains the target when another active state wins the database update", async () => {
    const deps = setup();
    deps.sql
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pathname: targetKey, status: "pending" }]);
    deps.s3.send.mockResolvedValueOnce(target());
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "source and R2 copy retained",
    );
    expect(deps.s3.send).toHaveBeenCalledTimes(1);
    expect(deps.s3.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("does not mistake target access errors for missing objects", async () => {
    const deps = setup();
    deps.s3.send.mockRejectedValue(new Error("Access denied"));
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "Access denied",
    );
    expect(deps.s3.send).toHaveBeenCalledTimes(1);
    expect(deps.events).not.toContain("update");
  });

  it("verifies a target created concurrently instead of replacing it", async () => {
    const deps = setup();
    deps.s3.send
      .mockRejectedValueOnce(
        Object.assign(new Error("absent"), { name: "NoSuchKey" }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("exists"), {
          $metadata: { httpStatusCode: 412 },
        }),
      )
      .mockResolvedValueOnce(target());
    await migratePhotos({ ...deps, apply: true });
    expect(deps.events).toContain("update");
    expect(deps.s3.send.mock.calls[1][0].input.IfNoneMatch).toBe("*");
  });

  it("aborts before uploading when the source bytes disagree with reserved size", async () => {
    const deps = setup();
    deps.readBlob.mockResolvedValue({
      statusCode: 200,
      blob: { size: 8, contentType: "image/jpeg" },
      stream: Readable.from([Buffer.from("truncated")]),
    });
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "size mismatch",
    );
    expect(deps.s3.send).not.toHaveBeenCalled();
    expect(deps.events).not.toContain("update");
  });

  it("aborts on interrupted source reads before uploading", async () => {
    const deps = setup();
    deps.readBlob.mockResolvedValue({
      statusCode: 200,
      blob: { size: 8, contentType: "image/jpeg" },
      stream: Readable.from(
        (async function* () {
          yield Buffer.from("ori");
          throw new Error("read failed");
        })(),
      ),
    });
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "read failed",
    );
    expect(deps.s3.send).not.toHaveBeenCalled();
  });

  it("does not update the database when a newly copied target fails verification", async () => {
    const deps = setup();
    deps.s3.send
      .mockRejectedValueOnce(
        Object.assign(new Error("absent"), { name: "NoSuchKey" }),
      )
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(target("modified"));
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "checksum mismatch",
    );
    expect(deps.events).not.toContain("update");
    expect(deps.s3.send).toHaveBeenCalledTimes(3);
  });

  it("rejects source metadata mismatches and cancels the download", async () => {
    const deps = setup();
    const cancel = vi.fn();
    deps.readBlob.mockResolvedValue({
      statusCode: 200,
      blob: { size: 8, contentType: "image/png" },
      stream: { cancel },
    });
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "source metadata mismatch",
    );
    expect(cancel).toHaveBeenCalled();
    expect(deps.s3.send).not.toHaveBeenCalled();
  });

  it("rejects originals exceeding the memory bound before downloading", async () => {
    const deps = setup();
    deps.sql.mockResolvedValueOnce([{ ...photo, size: 200 * 1024 * 1024 + 1 }]);
    await expect(migratePhotos({ ...deps, apply: true })).rejects.toThrow(
      "invalid source metadata",
    );
    expect(deps.readBlob).not.toHaveBeenCalled();
  });

  it("requires an explicit environment prefix before accessing external services", async () => {
    const deps = setup();
    await expect(migratePhotos({ ...deps, prefix: "" })).rejects.toThrow(
      "R2_PREFIX",
    );
    expect(deps.sql).not.toHaveBeenCalled();
  });

  it("skips database rows already pointing at R2", async () => {
    const deps = setup();
    deps.sql.mockResolvedValue([]);
    await migratePhotos({ ...deps, apply: true });
    expect(deps.sql.mock.calls[0][0].join("")).toContain(
      "pathname LIKE 'photos/%'",
    );
    expect(deps.readBlob).not.toHaveBeenCalled();
    expect(deps.s3.send).not.toHaveBeenCalled();
  });
});
