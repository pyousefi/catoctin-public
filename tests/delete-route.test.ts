import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), deletePhoto: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  session: mocks.session,
  sameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
}));
vi.mock("@/lib/delete-photo", () => ({ deletePhoto: mocks.deletePhoto }));
import { DELETE } from "@/app/api/admin/photos/[id]/route";
const id = "9e067844-189c-415a-9868-b0de1987cc67";
function remove(origin: string | null = "https://camp.example", photoId = id) {
  return DELETE(
    new Request(`https://camp.example/api/admin/photos/${photoId}`, {
      method: "DELETE",
      headers: origin ? { origin } : {},
    }),
    { params: Promise.resolve({ id: photoId }) },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: "admin" });
});
describe("admin deletion boundary", () => {
  it.each([null, { role: "family" }])(
    "rejects unauthorized session %j",
    async (session) => {
      mocks.session.mockResolvedValue(session);
      expect((await remove()).status).toBe(403);
      expect(mocks.deletePhoto).not.toHaveBeenCalled();
    },
  );
  it.each([null, "null", "https://evil.example"])(
    "rejects origin %s",
    async (origin) => {
      expect((await remove(origin)).status).toBe(403);
      expect(mocks.deletePhoto).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed identifiers before storage access", async () => {
    expect((await remove("https://camp.example", "../other")).status).toBe(404);
    expect(mocks.deletePhoto).not.toHaveBeenCalled();
  });
  it("returns no content after successful or repeated deletion", async () => {
    mocks.deletePhoto.mockResolvedValue("deleted");
    expect((await remove()).status).toBe(204);
    expect(mocks.deletePhoto).toHaveBeenCalledExactlyOnceWith(id);
  });
  it("reports an unfinished upload without deleting it", async () => {
    mocks.deletePhoto.mockResolvedValue("not-ready");
    expect((await remove()).status).toBe(409);
  });
  it("reports a retryable failure without leaking service details", async () => {
    mocks.deletePhoto.mockRejectedValue(new Error("private service details"));
    const response = await remove();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("Please retry"),
    });
  });
});
