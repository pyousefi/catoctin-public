import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  sql: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  sameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));
import { POST } from "@/app/api/admin/download/route";
const id = "9e067844-189c-415a-9868-b0de1987cc67";
function request() {
  const form = new FormData();
  form.append("id", id);
  return new Request("http://localhost/api/admin/download", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: form,
  });
}
beforeEach(() => vi.resetAllMocks());
describe("original ZIP exports", () => {
  it("rejects family access before touching data", async () => {
    mocks.session.mockResolvedValue({ role: "family" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("stores the original bytes in a valid ZIP entry without compression", async () => {
    const bytes = new Uint8Array([255, 216, 255, 225, 7, 8, 9, 10, 255, 217]);
    mocks.session.mockResolvedValue({ role: "admin" });
    mocks.sql.mockResolvedValue([
      {
        id,
        year: 2026,
        size: bytes.length,
        pathname: "photos/2026/camp.jpg",
        name: "camp.jpg",
      },
    ]);
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    const response = await POST(request());
    const zip = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(8)).toBe(0);
    const nameLength = zip.readUInt16LE(26),
      extraLength = zip.readUInt16LE(28);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe(
      `2026/${id.slice(0, 8)}-camp.jpg`,
    );
    expect(
      new Uint8Array(
        zip.subarray(
          30 + nameLength + extraLength,
          30 + nameLength + extraLength + bytes.length,
        ),
      ),
    ).toEqual(bytes);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });
  it("rejects oversized batches before opening Blob streams", async () => {
    mocks.session.mockResolvedValue({ role: "admin" });
    mocks.sql.mockResolvedValue([{ id, size: 1024 * 1024 * 1024 + 1 }]);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
