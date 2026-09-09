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
}));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  sameOrigin: () => true,
}));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
import { POST } from "@/app/api/uploads/route";
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
