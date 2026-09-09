import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), sql: vi.fn() }));
vi.mock("@/lib/auth", () => ({ session: mocks.session }));
vi.mock("@/lib/db", () => ({ db: () => mocks.sql }));
import { GET } from "@/app/api/admin/photos/route";
const select = (query = "?year=2026") =>
  GET(new Request(`https://camp.example/api/admin/photos${query}`));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: "admin" });
});
describe("administrator Select all", () => {
  it.each([null, { role: "family" }])(
    "does not expose photo metadata to session %j",
    async (session) => {
      mocks.session.mockResolvedValue(session);
      expect((await select()).status).toBe(403);
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );
  it.each(["", "?year=2027", "?year=2026.5", "?year=invalid"])(
    "rejects unsupported filter %s",
    async (query) => {
      expect((await select(query)).status).toBe(400);
      expect(mocks.sql).not.toHaveBeenCalled();
    },
  );
  it("returns only selection metadata with numeric sizes and no shared caching", async () => {
    mocks.sql.mockResolvedValue([
      {
        id: "photo-id",
        name: "camp.jpg",
        size: "100",
        pathname: "private/path",
      },
    ]);
    const response = await select();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      photos: [{ id: "photo-id", name: "camp.jpg", size: 100 }],
    });
  });
  it("does not present a database failure as an empty selection", async () => {
    mocks.sql.mockRejectedValue(new Error("private database details"));
    const response = await select();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Couldn’t select all photos. Please retry.",
    });
  });
});
