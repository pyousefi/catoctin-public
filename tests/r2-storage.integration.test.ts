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
  create: vi.fn(),
  abort: vi.fn(),
  head: vi.fn(),
  finish: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
}));
vi.mock("@/lib/r2", () => ({
  r2Config: () => ({ prefix: "preview" }),
  createR2Upload: mocks.create,
  abortR2: mocks.abort,
  headR2: mocks.head,
  finishR2Upload: mocks.finish,
  deleteR2: mocks.remove,
  isMissingObject: (e: Error) => e.name === "NotFound",
}));
import { startR2Upload, cancelR2Upload } from "@/lib/r2-uploads";
import { completeUpload } from "@/lib/complete-upload";
import { deletePhoto } from "@/lib/delete-photo";
let database: PGlite;
const sessionId = "9e067844-189c-415a-9868-b0de1987cc67";
const input = {
  year: 2026,
  name: "camp.jpg",
  size: 100,
  contributor: "Camper",
  caption: "",
};
function request(body = {}, origin = "https://camp.example") {
  return new Request("https://camp.example/api/uploads", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const reserve = () => startR2Upload(request(input), input);
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
  vi.resetAllMocks();
  await database.exec(
    "TRUNCATE photos; UPDATE storage_budget SET reserved_bytes = 0;",
  );
  vi.stubEnv("MAX_STORAGE_BYTES", "150");
  mocks.session.mockResolvedValue({ id: sessionId, role: "family" });
  mocks.create.mockResolvedValue({
    uploadId: "upload",
    urls: ["https://r2.example/part"],
    partBytes: 8388608,
  });
  mocks.head.mockRejectedValue(
    Object.assign(new Error(), { name: "NotFound" }),
  );
  mocks.sql.mockImplementation(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.reduce(
        (text, chunk, i) => text + (i ? `$${i}` : "") + chunk,
        "",
      );
      return (await database.query(query, values)).rows;
    },
  );
});
async function row() {
  return (await database.query("SELECT * FROM photos")).rows[0] as Record<
    string,
    string
  >;
}
async function budget() {
  return (
    await database.query(
      "SELECT reserved_bytes::int AS bytes FROM storage_budget",
    )
  ).rows[0];
}
describe("R2 reservation lifecycle in PostgreSQL", () => {
  it("reserves capacity and keeps completion authority on the server", async () => {
    const response = await reserve();
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("uploadId");
    expect(await row()).toMatchObject({
      r2_upload_id: "upload",
      status: "pending",
      session_id: sessionId,
    });
    expect(await budget()).toEqual({ bytes: 100 });
    expect((await reserve()).status).toBe(409);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("releases only its own reservation when storage cannot start an upload", async () => {
    mocks.create.mockRejectedValue(new Error("unavailable"));
    await expect(reserve()).rejects.toThrow("unavailable");
    expect(await row()).toBeUndefined();
    expect(await budget()).toEqual({ bytes: 0 });
  });
  it("rejects foreign origins and unauthenticated reservations before storage", async () => {
    expect(
      (await startR2Upload(request(input, "https://evil.example"), input))
        .status,
    ).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await reserve()).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("aborts pending parts before releasing capacity, only once", async () => {
    const { pathname } = await (await reserve()).json();
    expect((await cancelR2Upload(request({ pathname }))).status).toBe(200);
    expect((await cancelR2Upload(request({ pathname }))).status).toBe(200);
    expect(mocks.abort).toHaveBeenCalledExactlyOnceWith(pathname, "upload");
    expect(await row()).toMatchObject({ status: "archived" });
    expect(await budget()).toEqual({ bytes: 0 });
  });
  it("keeps capacity when completion wins a cancellation race", async () => {
    const { pathname } = await (await reserve()).json();
    mocks.head.mockResolvedValue({ size: 100, contentType: "image/jpeg" });
    expect((await cancelR2Upload(request({ pathname }))).status).toBe(503);
    expect(await row()).toMatchObject({ status: "pending" });
    expect(await budget()).toEqual({ bytes: 100 });
  });
  it("keeps capacity on storage authorization failure", async () => {
    const { pathname } = await (await reserve()).json();
    mocks.abort.mockRejectedValue(new Error("denied"));
    expect((await cancelR2Upload(request({ pathname }))).status).toBe(503);
    expect(await budget()).toEqual({ bytes: 100 });
  });
  it("cannot cancel or complete another session's upload", async () => {
    const { pathname } = await (await reserve()).json();
    const photo = await row();
    const other = "11111111-1111-4111-8111-111111111111";
    mocks.session.mockResolvedValue({ id: other, role: "family" });
    expect((await cancelR2Upload(request({ pathname }))).status).toBe(200);
    expect(await completeUpload(photo.id, other)).toBe(false);
    expect(mocks.abort).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(await budget()).toEqual({ bytes: 100 });
  });
  it("checks the completed original before marking it ready and deletes it without a replayable marker", async () => {
    await reserve();
    const photo = await row();
    mocks.head.mockResolvedValue({ size: 100, contentType: "image/jpeg" });
    expect(await completeUpload(photo.id, sessionId)).toBe(true);
    expect(mocks.finish).toHaveBeenCalledWith(
      photo.pathname,
      "upload",
      100,
      "image/jpeg",
    );
    expect(await row()).toMatchObject({ status: "ready" });
    expect(await deletePhoto(photo.id)).toBe("deleted");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(photo.pathname);
    expect(await budget()).toEqual({ bytes: 0 });
    expect(await completeUpload(photo.id, sessionId)).toBe(false);
  });
});
