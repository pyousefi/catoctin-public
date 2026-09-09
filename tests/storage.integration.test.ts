import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  session: vi.fn(),
  handleUpload: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  sameOrigin: () => true,
}));
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  head: mocks.head,
  put: mocks.put,
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
import { POST } from "@/app/api/uploads/route";
import { deletePhoto } from "@/lib/delete-photo";
import { completeUpload } from "@/lib/complete-upload";
let database: PGlite;
const sessionId = "9e067844-189c-415a-9868-b0de1987cc67";
const pathname = "photos/2026/44444444-4444-4444-8444-444444444444.jpg";
const input = {
  year: 2026,
  name: "camp.jpg",
  size: 100,
  contributor: "Grandma",
  caption: "A happy day",
};
let tokenOptions: Record<string, unknown>;
beforeAll(async () => {
  database = new PGlite();
  await database.exec(
    await readFile(new URL("../scripts/schema.sql", import.meta.url), "utf8"),
  );
}, 20000);
afterAll(async () => {
  await database.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  mocks.put.mockReset().mockResolvedValue(undefined);
  await database.exec(
    "TRUNCATE photos; UPDATE storage_budget SET reserved_bytes = 0;",
  );
  vi.stubEnv("MAX_STORAGE_BYTES", "150");
  mocks.session.mockResolvedValue({ role: "family", id: sessionId });
  mocks.sql.mockImplementation(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce(
        (query, part, index) => query + (index ? `$${index}` : "") + part,
        "",
      );
      return (await database.query(query, values)).rows;
    },
  );
  mocks.handleUpload.mockImplementation(
    async ({ body, onBeforeGenerateToken }) => {
      tokenOptions = await onBeforeGenerateToken(
        body.pathname,
        JSON.stringify(body.input),
      );
      return { ok: true };
    },
  );
});
async function reserve(path = pathname, details = input) {
  return POST(
    new Request("http://localhost/api/uploads", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pathname: path, input: details }),
    }),
  );
}
describe("Postgres upload reservation integration (in-memory PostgreSQL)", () => {
  it("reserves capacity atomically and creates a constrained upload token", async () => {
    expect((await reserve()).status).toBe(200);
    expect(tokenOptions).toMatchObject({
      maximumSizeInBytes: 100,
      allowedContentTypes: ["image/jpeg"],
      allowOverwrite: false,
      addRandomSuffix: false,
    });
    const rows = (
      await database.query(
        "SELECT size, year, status, contributor, session_id FROM photos",
      )
    ).rows;
    expect(rows).toEqual([
      {
        size: 100,
        year: 2026,
        status: "pending",
        contributor: "Grandma",
        session_id: sessionId,
      },
    ]);
    expect(
      (await database.query("SELECT reserved_bytes FROM storage_budget")).rows,
    ).toEqual([{ reserved_bytes: 100 }]);
  });
  it("refuses a second upload that exceeds the shared budget without creating a row", async () => {
    expect((await reserve()).status).toBe(200);
    expect(
      (await reserve("photos/2026/55555555-5555-4555-8555-555555555555.jpg"))
        .status,
    ).toBe(400);
    expect(
      (await database.query("SELECT count(*)::int AS count FROM photos")).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (await database.query("SELECT reserved_bytes FROM storage_budget")).rows,
    ).toEqual([{ reserved_bytes: 100 }]);
  });
  it("rolls back quota updates when a duplicate path violates the unique constraint", async () => {
    vi.stubEnv("MAX_STORAGE_BYTES", "1000");
    expect((await reserve()).status).toBe(200);
    expect((await reserve()).status).toBe(400);
    expect(
      (await database.query("SELECT reserved_bytes FROM storage_budget")).rows,
    ).toEqual([{ reserved_bytes: 100 }]);
  });
  it("publishes only an existing upload owned by the confirming session", async () => {
    await reserve();
    const id = (await database.query<{ id: string }>("SELECT id FROM photos"))
      .rows[0].id;
    mocks.head.mockResolvedValue({ size: 100, contentType: "image/jpeg" });
    expect(
      await completeUpload(id, "55555555-5555-4555-8555-555555555555"),
    ).toBe(false);
    expect((await database.query("SELECT status FROM photos")).rows).toEqual([
      { status: "pending" },
    ]);
    expect(await completeUpload(id, sessionId)).toBe(true);
    expect((await database.query("SELECT status FROM photos")).rows).toEqual([
      { status: "ready" },
    ]);
  });
  it("rejects mismatched destination years and photo formats before reserving capacity", async () => {
    expect((await reserve(pathname.replace("2026", "2025"))).status).toBe(400);
    expect((await reserve(pathname.replace(".jpg", ".png"))).status).toBe(400);
    expect(
      (await database.query("SELECT reserved_bytes FROM storage_budget")).rows,
    ).toEqual([{ reserved_bytes: 0 }]);
  });
});

describe("Postgres deletion accounting", () => {
  async function readyPhoto() {
    await reserve();
    await database.exec("UPDATE photos SET status = 'ready'");
    return (await database.query<{ id: string }>("SELECT id FROM photos"))
      .rows[0].id;
  }
  async function budget() {
    return (
      await database.query<{ reserved_bytes: number }>(
        "SELECT reserved_bytes FROM storage_budget",
      )
    ).rows[0].reserved_bytes;
  }
  it("releases only the deleted photo's capacity and tolerates repeated requests", async () => {
    vi.stubEnv("MAX_STORAGE_BYTES", "1000");
    const id = await readyPhoto();
    await reserve("photos/2026/55555555-5555-4555-8555-555555555555.jpg");
    await deletePhoto(id);
    await deletePhoto(id);
    expect(await budget()).toBe(100);
    expect((await database.query("SELECT status FROM photos")).rows).toEqual([
      { status: "pending" },
    ]);
    expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
      pathname,
      Buffer.alloc(0),
      expect.objectContaining({ allowOverwrite: true }),
    );
  });
  it("releases capacity exactly once when two delete requests overlap", async () => {
    const id = await readyPhoto();
    let release: () => void;
    const bothDeleting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    mocks.put.mockImplementation(async () => {
      if (++calls === 2) release();
      await bothDeleting;
    });
    expect(await Promise.all([deletePhoto(id), deletePhoto(id)])).toEqual([
      "deleted",
      "deleted",
    ]);
    expect(await budget()).toBe(0);
    expect((await database.query("SELECT id FROM photos")).rows).toEqual([]);
  });
  it("rolls metadata deletion back if the accounting update fails and permits retry", async () => {
    const id = await readyPhoto();
    await database.exec(
      "ALTER TABLE storage_budget ADD CONSTRAINT test_budget CHECK (reserved_bytes >= 50)",
    );
    try {
      await expect(deletePhoto(id)).rejects.toThrow();
      expect(await budget()).toBe(100);
      expect((await database.query("SELECT id FROM photos")).rows).toEqual([
        { id },
      ]);
    } finally {
      await database.exec(
        "ALTER TABLE storage_budget DROP CONSTRAINT test_budget",
      );
    }
    await deletePhoto(id);
    expect(await budget()).toBe(0);
    expect((await database.query("SELECT id FROM photos")).rows).toEqual([]);
  });
});
